const hre = require('hardhat');
const { network } = require('hardhat');
const {
  chainsSupportedByApi3Market,
  chainsSupportedByChainApi,
  chainsSupportedByDapis,
} = require('../src/supported-chains');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const accounts = await getUnnamedAccounts();

  if ([...chainsSupportedByDapis, ...chainsSupportedByChainApi].includes(network.name)) {
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

      const proxyFactory = new hre.ethers.Contract(
        ProxyFactory.address,
        ProxyFactory.abi,
        (await hre.ethers.getSigners())[0]
      );
      const nodaryEthUsdDataFeedId = '0x4385954e058fbe6b6a744f32a4f89d67aad099f8fb8b23e7ea8dd366ae88151d';
      const expectedDataFeedProxyAddress = await proxyFactory.computeDataFeedProxyAddress(nodaryEthUsdDataFeedId, '0x');
      await hre.run('verify:verify', {
        address: expectedDataFeedProxyAddress,
        constructorArguments: [Api3ServerV1.address, nodaryEthUsdDataFeedId],
      });
      const ethUsdDapiName = hre.ethers.utils.formatBytes32String('ETH/USD');
      const expectedDapiProxyAddress = await proxyFactory.computeDapiProxyAddress(ethUsdDapiName, '0x');
      await hre.run('verify:verify', {
        address: expectedDapiProxyAddress,
        constructorArguments: [Api3ServerV1.address, hre.ethers.utils.keccak256(ethUsdDapiName)],
      });
      const testOevBeneficiaryAddress = (await hre.ethers.getSigners())[0].address;
      const expectedDataFeedProxyWithOevAddress = await proxyFactory.computeDataFeedProxyWithOevAddress(
        nodaryEthUsdDataFeedId,
        testOevBeneficiaryAddress,
        '0x'
      );
      await hre.run('verify:verify', {
        address: expectedDataFeedProxyWithOevAddress,
        constructorArguments: [Api3ServerV1.address, nodaryEthUsdDataFeedId, testOevBeneficiaryAddress],
      });
      const expectedDapiProxyWithOevAddress = await proxyFactory.computeDapiProxyWithOevAddress(
        ethUsdDapiName,
        testOevBeneficiaryAddress,
        '0x'
      );
      await hre.run('verify:verify', {
        address: expectedDapiProxyWithOevAddress,
        constructorArguments: [
          Api3ServerV1.address,
          hre.ethers.utils.keccak256(ethUsdDapiName),
          testOevBeneficiaryAddress,
        ],
      });

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

    if (chainsSupportedByChainApi.includes(network.name)) {
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
