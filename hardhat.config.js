require('@nomicfoundation/hardhat-toolbox');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('hardhat-deploy');
require('hardhat-gas-reporter');
const api3Chains = require('@api3/chains');
require('dotenv').config();
require('@matterlabs/hardhat-zksync-solc');
require('@matterlabs/hardhat-zksync-deploy');
require('@matterlabs/hardhat-zksync-verify');

const { apiKey: etherscanApiKey, customChains: etherscanCustomChains } = api3Chains.hardhatEtherscan();
const etherscan = {
  apiKey: Object.entries(etherscanApiKey).reduce((populatedApiKey, etherscanApiKeyEntry) => {
    const hardhatEtherscanChainAlias = etherscanApiKeyEntry[0];
    const chainAlias = etherscanApiKeyEntry[1];
    if (chainAlias !== 'DUMMY_VALUE') {
      const envVariableName = `ETHERSCAN_API_KEY_${chainAlias}`;
      populatedApiKey[hardhatEtherscanChainAlias] = process.env[envVariableName] ? process.env[envVariableName] : '';
    } else {
      populatedApiKey[hardhatEtherscanChainAlias] = 'DUMMY_VALUE';
    }
    return populatedApiKey;
  }, {}),
  customChains: etherscanCustomChains,
};

const networks = Object.entries(api3Chains.hardhatConfigNetworks()).reduce((networksWithMnemonic, networkEntry) => {
  const chainAlias = networkEntry[0];
  const network = networkEntry[1];
  networksWithMnemonic[chainAlias] = {
    ...network,
    accounts: { mnemonic: process.env.MNEMONIC ? process.env.MNEMONIC : '' },
  };
  return networksWithMnemonic;
}, {});

networks['zksync-goerli-testnet'] = {
  ...networks['zksync-goerli-testnet'],
  ethNetwork: 'ethereum-goerli-testnet',
  zksync: true,
  verifyURL: 'https://zksync2-testnet-explorer.zksync.dev/contract_verification',
};
networks['zksync'] = {
  ...networks['zksync'],
  ethNetwork: 'ethereum',
  zksync: true,
  verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification',
};

module.exports = {
  etherscan,
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    outputFile: 'gas_report',
    noColors: true,
  },
  mocha: {
    timeout: process.env.EXTENDED_TEST ? 3600000 : 20000,
  },
  networks,
  paths: {
    tests: process.env.EXTENDED_TEST ? './extended-test' : './test',
  },
  zksolc: {
    version: '1.3.1',
    compilerSource: 'binary',
  },
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
};
