const hre = require('hardhat');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const accounts = await getUnnamedAccounts();

  const AccessControlRegistry = await deployments.get('AccessControlRegistry');
  await hre.run('verify:verify', {
    address: AccessControlRegistry.address,
  });

  const OwnableCallForwarder = await deployments.get('OwnableCallForwarder');
  await hre.run('verify:verify', {
    address: OwnableCallForwarder.address,
    constructorArguments: [accounts[0]],
  });

  const Api3ServerV1 = await deployments.get('Api3ServerV1');
  await hre.run('verify:verify', {
    address: Api3ServerV1.address,
    constructorArguments: [AccessControlRegistry.address, 'Api3ServerV1 admin', OwnableCallForwarder.address],
  });

  const ProxyFactory = await deployments.get('ProxyFactory');
  await hre.run('verify:verify', {
    address: ProxyFactory.address,
    constructorArguments: [Api3ServerV1.address],
  });

  if (hre.network.name === 'ethereum') {
    const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const PrepaymentDepository = await deployments.get('PrepaymentDepository');
    await hre.run('verify:verify', {
      address: PrepaymentDepository.address,
      constructorArguments: [
        AccessControlRegistry.address,
        'PrepaymentDepository admin (OEV Relay)',
        OwnableCallForwarder.address,
        usdcAddress,
      ],
    });
  }

  if (hre.network.name === 'ethereum' || hre.network.name === 'ethereum-goerli-testnet') {
    const RequesterAuthorizerWithErc721 = await deployments.get('RequesterAuthorizerWithErc721');
    await hre.run('verify:verify', {
      address: RequesterAuthorizerWithErc721.address,
      constructorArguments: [AccessControlRegistry.address, 'RequesterAuthorizerWithErc721 admin'],
    });
  }
};
module.exports.tags = ['verify'];
