const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const accounts = await getUnnamedAccounts();

  const accessControlRegistry = await deploy('AccessControlRegistry', {
    from: accounts[0],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? hre.ethers.constants.HashZero : undefined,
  });
  log(`Deployed AccessControlRegistry at ${accessControlRegistry.address}`);

  const airnodeProtocol = await deploy('AirnodeProtocol', {
    from: accounts[0],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? hre.ethers.constants.HashZero : undefined,
  });
  log(`Deployed AirnodeProtocol at ${airnodeProtocol.address}`);

  const adminRoleDescription = 'DapiServer admin';
  const managerAddress = JSON.parse(fs.readFileSync(path.join('manager-multisig', 'deployments', 'references.json')))[
    hre.network.name
  ].manager;
  const dapiServer = await deploy('DapiServer', {
    from: accounts[0],
    args: [accessControlRegistry.address, adminRoleDescription, managerAddress, airnodeProtocol.address],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? hre.ethers.constants.HashZero : undefined,
  });
  log(`Deployed DapiServer at ${dapiServer.address}`);

  const proxyFactory = await deploy('ProxyFactory', {
    from: accounts[0],
    args: [dapiServer.address],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? hre.ethers.constants.HashZero : undefined,
  });
  log(`Deployed ProxyFactory at ${proxyFactory.address}`);
};
module.exports.tags = ['deploy'];
