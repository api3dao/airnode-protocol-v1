const { ethers } = require('hardhat');

const PROTOCOL_IDS = {
  RRP: '1',
  PSP: '2',
  RELAYED_RRP: '3',
  RELAYED_PSP: '4',
  AIRSEEKER: '5',
  AIRKEEPER: '12345',
};

function deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId) {
  const sponsorAddressBN = ethers.BigNumber.from(sponsorAddress);
  const paths = [];
  for (let i = 0; i < 6; i++) {
    const shiftedSponsorAddressBN = sponsorAddressBN.shr(31 * i);
    paths.push(shiftedSponsorAddressBN.mask(31).toString());
  }
  return `${protocolId}/${paths.join('/')}`;
}

module.exports = {
  generateRandomAirnodeWallet: () => {
    const airnodeWallet = ethers.Wallet.createRandom();
    const airnodeMnemonic = airnodeWallet.mnemonic.phrase;
    const hdNode = ethers.utils.HDNode.fromMnemonic(airnodeMnemonic).derivePath("m/44'/60'/0'");
    const airnodeXpub = hdNode.neuter().extendedKey;
    return { airnodeAddress: airnodeWallet.address, airnodeMnemonic, airnodeXpub };
  },
  generateRandomAddress: () => {
    return ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)));
  },
  generateRandomBytes32: () => {
    return ethers.utils.hexlify(ethers.utils.randomBytes(32));
  },
  generateRandomBytes: () => {
    return ethers.utils.hexlify(ethers.utils.randomBytes(256));
  },
  deriveSponsorWalletAddress: (airnodeXpub, sponsorAddress, protocolId) => {
    const hdNodeFromXpub = ethers.utils.HDNode.fromExtendedKey(airnodeXpub);
    const sponsorWalletHdNode = hdNodeFromXpub.derivePath(
      deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId)
    );
    return sponsorWalletHdNode.address;
  },
  deriveSponsorWallet: (airnodeMnemonic, sponsorAddress, protocolId) => {
    return ethers.Wallet.fromMnemonic(
      airnodeMnemonic,
      `m/44'/60'/0'/${deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId)}`
    ).connect(ethers.provider);
  },
  getCurrentTimestamp: async (provider) => {
    return (await provider.getBlock()).timestamp;
  },
  decodeRevertString: (callData) => {
    // Refer to https://ethereum.stackexchange.com/a/83577
    try {
      // Skip the signature, only get the revert string
      return ethers.utils.defaultAbiCoder.decode(['string'], `0x${callData.substring(2 + 4 * 2)}`)[0];
    } catch {
      return 'No revert string';
    }
  },
  deriveRootRole: (managerAddress) => {
    return ethers.utils.solidityKeccak256(['address'], [managerAddress]);
  },
  deriveRole: (adminRole, roleDescription) => {
    return ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes32'],
      [adminRole, ethers.utils.solidityKeccak256(['string'], [roleDescription])]
    );
  },
  buildEIP712Domain: (name, chainId, verifyingContract) => {
    return {
      name,
      version: '1.0.0',
      chainId,
      verifyingContract,
    };
  },
  expiringMetaTxDomain: async (expiringMetaTxForwarder) => {
    const chainId = (await expiringMetaTxForwarder.provider.getNetwork()).chainId;
    return module.exports.buildEIP712Domain('ExpiringMetaTxForwarder', chainId, expiringMetaTxForwarder.address);
  },
  expiringMetaTxTypes: () => {
    return {
      ExpiringMetaTx: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'data', type: 'bytes' },
        { name: 'expirationTimestamp', type: 'uint256' },
      ],
    };
  },
  PROTOCOL_IDS,
  deriveRequestId: async (
    airnodeProtocol,
    airnodeRequesterAddress,
    airnodeAddress,
    endpointOrTemplateId,
    requestParameters,
    sponsorAddress,
    fulfillFunctionId
  ) => {
    return ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'bytes4'],
      [
        (await airnodeProtocol.provider.getNetwork()).chainId,
        airnodeProtocol.address,
        airnodeRequesterAddress,
        (await airnodeProtocol.requesterToRequestCount(airnodeRequesterAddress)).add(1),
        airnodeAddress,
        endpointOrTemplateId,
        requestParameters,
        sponsorAddress,
        fulfillFunctionId,
      ]
    );
  },
  deriveRelayedRequestId: async (
    airnodeProtocol,
    airnodeRequesterAddress,
    airnodeAddress,
    endpointOrTemplateId,
    requestParameters,
    relayerAddress,
    sponsorAddress,
    fulfillFunctionId
  ) => {
    return ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'address', 'bytes4'],
      [
        (await airnodeProtocol.provider.getNetwork()).chainId,
        airnodeProtocol.address,
        airnodeRequesterAddress,
        (await airnodeProtocol.requesterToRequestCount(airnodeRequesterAddress)).add(1),
        airnodeAddress,
        endpointOrTemplateId,
        requestParameters,
        relayerAddress,
        sponsorAddress,
        fulfillFunctionId,
      ]
    );
  },
  signRrpFulfillment: async (airnode, requestId, timestamp, airnodeSponsorWalletAddress) => {
    return await airnode.signMessage(
      ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ['bytes32', 'uint256', 'address'],
          [requestId, timestamp, airnodeSponsorWalletAddress]
        )
      )
    );
  },
  signRrpRelayedFulfillment: async (airnode, requestId, timestamp, relayerSponsorWalletAddress, fulfillData) => {
    return await airnode.signMessage(
      ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ['bytes32', 'uint256', 'address', 'bytes'],
          [requestId, timestamp, relayerSponsorWalletAddress, fulfillData]
        )
      )
    );
  },
  signRrpRelayedFailure: async (relayer, requestId, timestamp, relayerSponsorWalletAddress) => {
    return await relayer.signMessage(
      ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ['bytes32', 'uint256', 'address'],
          [requestId, timestamp, relayerSponsorWalletAddress]
        )
      )
    );
  },
  signPspFulfillment: async (airnode, subscriptionId, timestamp, airnodeSponsorWalletAddress) => {
    return await airnode.signMessage(
      ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ['bytes32', 'uint256', 'address'],
          [subscriptionId, timestamp, airnodeSponsorWalletAddress]
        )
      )
    );
  },
  signPspRelayedFulfillment: async (airnode, subscriptionId, timestamp, relayerSponsorWalletAddress, fulfillData) => {
    return await airnode.signMessage(
      ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ['bytes32', 'uint256', 'address', 'bytes'],
          [subscriptionId, timestamp, relayerSponsorWalletAddress, fulfillData]
        )
      )
    );
  },
  signData: async (airnode, templateId, timestamp, data) => {
    return await airnode.signMessage(
      ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, data])
      )
    );
  },
  signOevData: async (
    dapiServer,
    oevProxyAddress,
    dataFeedId,
    updateId,
    timestamp,
    data,
    searcherAddress,
    bidAmount,
    airnode,
    templateId
  ) => {
    const oevUpdateHash = ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'address', 'bytes32', 'bytes32', 'uint256', 'bytes', 'address', 'uint256'],
      [
        (await dapiServer.provider.getNetwork()).chainId,
        dapiServer.address,
        oevProxyAddress,
        dataFeedId,
        updateId,
        timestamp,
        data,
        searcherAddress,
        bidAmount,
      ]
    );
    return await airnode.signMessage(
      ethers.utils.arrayify(ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [oevUpdateHash, templateId]))
    );
  },
};
