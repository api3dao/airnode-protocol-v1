const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const {
  chainsSupportedByApi3Market,
  chainsSupportedByChainApi,
  chainsSupportedByOevRelay,
} = require('../src/supported-chains');

module.exports = async () => {
  const networks = fs
    .readdirSync('deployments', { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);
  const contractNames = [
    'AccessControlRegistry',
    'OwnableCallForwarder',
    'Api3ServerV1',
    'ProxyFactory',
    'PrepaymentDepository',
    'RequesterAuthorizerWithErc721',
    'OrderPayable',
  ];
  const references = {};
  references.chainNames = {};
  for (const network of networks) {
    references.chainNames[hre.config.networks[network].chainId] = network;
  }
  for (const contractName of contractNames) {
    references[contractName] = {};
    for (const network of networks) {
      if (contractName === 'PrepaymentDepository' && !chainsSupportedByOevRelay.includes(network)) {
        continue;
      }
      if (contractName === 'RequesterAuthorizerWithErc721' && !chainsSupportedByChainApi.includes(network)) {
        continue;
      }
      if (contractName === 'OrderPayable' && !chainsSupportedByApi3Market.includes(network)) {
        continue;
      }
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName][hre.config.networks[network].chainId] = deployment.address;
    }
  }
  const deploymentBlockNumbers = { chainNames: references.chainNames };
  for (const contractName of contractNames) {
    deploymentBlockNumbers[contractName] = {};
    for (const network of networks) {
      if (contractName === 'PrepaymentDepository' && !chainsSupportedByOevRelay.includes(network)) {
        continue;
      }
      if (contractName === 'RequesterAuthorizerWithErc721' && !chainsSupportedByChainApi.includes(network)) {
        continue;
      }
      if (contractName === 'OrderPayable' && !chainsSupportedByApi3Market.includes(network)) {
        continue;
      }
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      if (deployment.receipt) {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = deployment.receipt.blockNumber;
      } else {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = 'MISSING';
      }
    }
  }

  fs.writeFileSync(path.join('deployments', 'references.json'), JSON.stringify(references, null, 2));
  fs.writeFileSync(
    path.join('deployments', 'deployment-block-numbers.json'),
    JSON.stringify(deploymentBlockNumbers, null, 2)
  );
};
module.exports.tags = ['document'];
