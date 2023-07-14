require('@nomicfoundation/hardhat-toolbox');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('hardhat-deploy');
require('hardhat-gas-reporter');
const { hardhatConfig } = require('@api3/chains');
require('dotenv').config();

module.exports = {
  etherscan: hardhatConfig.etherscan(),
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    outputFile: 'gas_report',
    noColors: true,
  },
  mocha: {
    timeout: process.env.EXTENDED_TEST ? 3600000 : 20000,
  },
  networks: hardhatConfig.networks(),
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
