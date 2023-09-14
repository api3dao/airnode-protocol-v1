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

  const beaconReads = await api3ServerV1.callStatic.tryMulticall(
    templateIds.map((templateId) =>
      api3ServerV1.interface.encodeFunctionData('readDataFeedWithId', [
        deriveBeaconId(airnodeWallet.address, templateId),
      ])
    )
  );
  const beaconInitializationCalldata = await Promise.all(
    beaconReads.successes.reduce((acc, beaconReadSuccess, ind) => {
      if (!beaconReadSuccess) {
        acc.push(createRandomBeaconUpdateCalldata(airnodeWallet, templateIds[ind], api3ServerV1.interface));
      }
      return acc;
    }, [])
  );
  if (beaconInitializationCalldata.length > 0) {
    console.log(`Initializing ${beaconInitializationCalldata.length} Beacons`);
    const beaconUpdateReceipt = await api3ServerV1.tryMulticall(beaconInitializationCalldata);
    await new Promise((resolve) =>
      ethers.provider.once(beaconUpdateReceipt.hash, () => {
        resolve();
      })
    );
    console.log(`Initialized Beacons`);
  }
  const beaconSetUpdateCalldata = [
    ...(await Promise.all(
      templateIds.map((templateId) =>
        createRandomBeaconUpdateCalldata(airnodeWallet, templateId, api3ServerV1.interface)
      )
    )),
    api3ServerV1.interface.encodeFunctionData('updateBeaconSetWithBeacons', [
      templateIds.map((templateId) => deriveBeaconId(airnodeWallet.address, templateId)),
    ]),
  ];
  const beaconSetUpdateReceipt = await api3ServerV1.tryMulticall(beaconSetUpdateCalldata);
  console.log(`Sent transaction with hash ${beaconSetUpdateReceipt.hash} to update the Beacon set`);
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
