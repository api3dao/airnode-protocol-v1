const hre = require('hardhat');
const { network } = require('hardhat');
const {
  chainsSupportedByApi3Market,
  chainsSupportedByChainApi,
  chainsSupportedByDapis,
  chainsSupportedByOevRelay,
} = require('../src/supported-chains');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const accounts = await getUnnamedAccounts();

  if (chainsSupportedByDapis.includes(network.name) || chainsSupportedByChainApi.includes(network.name)) {
    const AccessControlRegistry = await deployments.get('AccessControlRegistry');
    await hre.run('verify:verify', {
      address: AccessControlRegistry.address,
    });

    if (chainsSupportedByDapis.includes(network.name)) {
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

      if (chainsSupportedByOevRelay.includes(network.name)) {
        const usdcAddress = { ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' };
        const PrepaymentDepository = await deployments.get('PrepaymentDepository');
        await hre.run('verify:verify', {
          address: PrepaymentDepository.address,
          constructorArguments: [
            AccessControlRegistry.address,
            'PrepaymentDepository admin (OEV Relay)',
            OwnableCallForwarder.address,
            usdcAddress[hre.network.name],
          ],
        });
      }

      if (chainsSupportedByApi3Market.includes(network.name)) {
        const OrderPayable = await deployments.get('OrderPayable');
        await hre.run('verify:verify', {
          address: OrderPayable.address,
          constructorArguments: [
            AccessControlRegistry.address,
            'OrderPayable admin (API3 Market)',
            OwnableCallForwarder.address,
          ],
        });
      }
    }
    if (chainsSupportedByChainApi.includes(network.name) || network.name === 'ethereum-sepolia-testnet') {
      const RequesterAuthorizerWithErc721 = await deployments.get('RequesterAuthorizerWithErc721');
      await hre.run('verify:verify', {
        address: RequesterAuthorizerWithErc721.address,
        constructorArguments: [AccessControlRegistry.address, 'RequesterAuthorizerWithErc721 admin'],
      });
    }
  } else {
    throw new Error(`${network.name} is not supported`);
  }
};
module.exports.tags = ['verify'];
