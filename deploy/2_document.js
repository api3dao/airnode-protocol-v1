const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const {
  chainsSupportedByApi3Market,
  chainsSupportedByChainApi,
  chainsSupportedByDapis,
} = require('../src/supported-chains');

module.exports = async () => {
  const references = {};
  references.chainNames = {};
  for (const network of [...chainsSupportedByApi3Market, ...chainsSupportedByChainApi, ...chainsSupportedByDapis]) {
    references.chainNames[hre.config.networks[network].chainId] = network;
  }
  const deploymentBlockNumbers = { chainNames: references.chainNames };

  for (const contractName of ['AccessControlRegistry']) {
    references[contractName] = {};
    deploymentBlockNumbers[contractName] = {};
    for (const network of [...chainsSupportedByDapis, ...chainsSupportedByChainApi]) {
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName][hre.config.networks[network].chainId] = deployment.address;
      if (deployment.receipt) {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = deployment.receipt.blockNumber;
      } else {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = 'MISSING';
      }
    }
  }

  for (const contractName of ['OwnableCallForwarder', 'Api3ServerV1', 'ProxyFactory']) {
    references[contractName] = {};
    deploymentBlockNumbers[contractName] = {};
    for (const network of chainsSupportedByDapis) {
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName][hre.config.networks[network].chainId] = deployment.address;
      if (deployment.receipt) {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = deployment.receipt.blockNumber;
      } else {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = 'MISSING';
      }
    }
  }

  for (const contractName of ['OrderPayable']) {
    references[contractName] = {};
    deploymentBlockNumbers[contractName] = {};
    for (const network of chainsSupportedByApi3Market) {
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName][hre.config.networks[network].chainId] = deployment.address;
      if (deployment.receipt) {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = deployment.receipt.blockNumber;
      } else {
        deploymentBlockNumbers[contractName][hre.config.networks[network].chainId] = 'MISSING';
      }
    }
  }

  for (const contractName of ['RequesterAuthorizerWithErc721']) {
    references[contractName] = {};
    deploymentBlockNumbers[contractName] = {};
    for (const network of chainsSupportedByChainApi) {
      const deployment = JSON.parse(fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8'));
      references[contractName][hre.config.networks[network].chainId] = deployment.address;
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
