require('@nomicfoundation/hardhat-toolbox');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('hardhat-deploy');
require('hardhat-gas-reporter');
const api3Chains = require('@api3/chains');
require('dotenv').config();

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
