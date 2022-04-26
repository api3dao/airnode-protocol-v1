const hre = require('hardhat');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const accounts = await getUnnamedAccounts();

  const airnodeProtocol = await deploy('AirnodeProtocol', {
    from: accounts[0],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? hre.ethers.constants.HashZero : undefined,
  });
  log(`Deployed AirnodeProtocol at ${airnodeProtocol.address}`);
};
module.exports.tags = ['deploy'];
