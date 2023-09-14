const { deployments, ethers } = require('hardhat');

function deriveBeaconId(airnodeAddress, templateId) {
  return ethers.utils.solidityKeccak256(['address', 'bytes32'], [airnodeAddress, templateId]);
}

async function createRandomBeaconUpdateCalldata(airnodeWallet, templateId, api3ServerV1Interface) {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = ethers.utils.defaultAbiCoder.encode(['int256'], [Math.floor(Math.random() * 1000)]);
  const signature = await airnodeWallet.signMessage(
    ethers.utils.arrayify(
      ethers.utils.solidityKeccak256(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, data])
    )
  );
  return api3ServerV1Interface.encodeFunctionData('updateBeaconWithSignedData', [
    airnodeWallet.address,
    templateId,
    timestamp,
    data,
    signature,
  ]);
}

function createBeaconSetUpdateCalldata(airnodeAddress, templateIds, api3ServerV1Interface) {
  return api3ServerV1Interface.encodeFunctionData('updateBeaconSetWithBeacons', [
    templateIds.map((templateId) => deriveBeaconId(airnodeAddress, templateId)),
  ]);
}

async function main() {
  const beaconCount = process.env.BEACON_COUNT ? process.env.BEACON_COUNT : 7;
  console.log(`Updating a Beacon set of ${beaconCount} Beacons`);
  const Api3ServerV1 = await deployments.get('Api3ServerV1');
  const api3ServerV1 = new ethers.Contract(Api3ServerV1.address, Api3ServerV1.abi, (await ethers.getSigners())[0]);
  // This wallet is not meant to keep any funds, do not use the mnemonic anywhere else
  const airnodeMnemonic = 'cook blossom morning catalog demand insane initial ask globe table kiss doctor';
  const airnodeWallet = ethers.Wallet.fromMnemonic(airnodeMnemonic);
  const templateIds = Array(beaconCount)
    .fill()
    .map((_, ind) => ethers.utils.hexZeroPad(ethers.utils.hexlify(ind + 1), 32));
  const beaconSetId = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['bytes32[]'],
      [templateIds.map((templateId) => deriveBeaconId(airnodeWallet.address, templateId))]
    )
  );

  const dataFeedReads = await api3ServerV1.callStatic.tryMulticall(
    [...templateIds.map((templateId) => deriveBeaconId(airnodeWallet.address, templateId)), beaconSetId].map(
      (dataFeedId) => api3ServerV1.interface.encodeFunctionData('readDataFeedWithId', [dataFeedId])
    )
  );
  const dataFeedInitializationCalldata = await Promise.all(
    dataFeedReads.successes.reduce((acc, dataFeedReadSuccess, ind) => {
      if (!dataFeedReadSuccess) {
        if (ind === dataFeedReads.successes.length - 1) {
          acc.push(createBeaconSetUpdateCalldata(airnodeWallet.address, templateIds, api3ServerV1.interface));
        } else {
          acc.push(createRandomBeaconUpdateCalldata(airnodeWallet, templateIds[ind], api3ServerV1.interface));
        }
      }
      return acc;
    }, [])
  );
  if (dataFeedInitializationCalldata.length > 0) {
    console.log(`Initializing ${dataFeedInitializationCalldata.length} data feeds`);
    const beaconUpdateReceipt = await api3ServerV1.tryMulticall(dataFeedInitializationCalldata);
    await new Promise((resolve) =>
      ethers.provider.once(beaconUpdateReceipt.hash, () => {
        resolve();
      })
    );
    console.log(`Initialized data feeds`);
  }
  const beaconSetUpdateCalldata = [
    ...(await Promise.all(
      templateIds.map((templateId) =>
        createRandomBeaconUpdateCalldata(airnodeWallet, templateId, api3ServerV1.interface)
      )
    )),
    createBeaconSetUpdateCalldata(airnodeWallet.address, templateIds, api3ServerV1.interface),
  ];
  const beaconSetUpdateReceipt = await api3ServerV1.tryMulticall(beaconSetUpdateCalldata);
  console.log(`Sent transaction with hash ${beaconSetUpdateReceipt.hash} to update the Beacons and Beacon set`);
  await new Promise((resolve) =>
    ethers.provider.once(beaconSetUpdateReceipt.hash, () => {
      resolve();
    })
  );
  console.log(`Beacon set updated`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
