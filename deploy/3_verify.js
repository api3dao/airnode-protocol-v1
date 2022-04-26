const hre = require('hardhat');

module.exports = async ({ deployments }) => {
  const AirnodeProtocol = await deployments.get('AirnodeProtocol');
  await hre.run('verify:verify', {
    address: AirnodeProtocol.address,
    constructorArguments: [],
  });
};
module.exports.tags = ['verify'];
