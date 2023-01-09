const { ethers } = require('hardhat');

const PROTOCOL_IDS = {
  RRP: '1',
  PSP: '2',
  RELAYED_RRP: '3',
  RELAYED_PSP: '4',
  AIRSEEKER: '5',
  AIRKEEPER: '12345',
};

function deriveWalletPathFromSponsorAddress(sponsorAddress, protocol) {
  const sponsorAddressBN = ethers.BigNumber.from(sponsorAddress);
  const paths = [];
  for (let i = 0; i < 6; i++) {
    const shiftedSponsorAddressBN = sponsorAddressBN.shr(31 * i);
    paths.push(shiftedSponsorAddressBN.mask(31).toString());
  }
  return `${PROTOCOL_IDS[protocol]}/${paths.join('/')}`;
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
  deriveSponsorWalletAddress: (airnodeXpub, sponsorAddress, protocol) => {
    const hdNodeFromXpub = ethers.utils.HDNode.fromExtendedKey(airnodeXpub);
    const sponsorWalletHdNode = hdNodeFromXpub.derivePath(deriveWalletPathFromSponsorAddress(sponsorAddress, protocol));
    return sponsorWalletHdNode.address;
  },
  deriveSponsorWallet: (airnodeMnemonic, sponsorAddress, protocol) => {
    return ethers.Wallet.fromMnemonic(
      airnodeMnemonic,
      `m/44'/60'/0'/${deriveWalletPathFromSponsorAddress(sponsorAddress, protocol)}`
    ).connect(ethers.provider);
  },
  deriveSponsorshipId: (scheme, parameters) => {
    if (scheme === 'Requester') {
      return ethers.utils.keccak256(ethers.utils.solidityPack(['uint256', 'address'], [1, parameters.requester]));
    } else {
      throw new Error('Invalid sponsorship scheme');
    }
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
  expiringMetaTxDomain: async (expiringMetaTxForwarder) => {
    return {
      name: 'ExpiringMetaTxForwarder',
      version: '1.0.0',
      chainId: (await expiringMetaTxForwarder.provider.getNetwork()).chainId,
      verifyingContract: expiringMetaTxForwarder.address,
    };
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
};
