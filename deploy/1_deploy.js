const { ethers, network } = require('hardhat');
const managerMultisigAddresses = require('../deployments/manager-multisig.json');
const {
  chainsSupportedByApi3Market,
  chainsSupportedByChainApi,
  chainsSupportedByDapis,
  chainsSupportedByOevRelay,
} = require('../src/supported-chains');
const tokenAddresses = require('../src/token-addresses');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const accounts = await getUnnamedAccounts();

  if (
    [
      ...chainsSupportedByDapis,
      ...chainsSupportedByChainApi,
      'ethereum-goerli-testnet',
      'ethereum-sepolia-testnet',
    ].includes(network.name)
  ) {
    const accessControlRegistry = await deploy('AccessControlRegistry', {
      from: accounts[0],
      log: true,
      deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
    });
    log(`Deployed AccessControlRegistry at ${accessControlRegistry.address}`);

    if ([...chainsSupportedByDapis, 'ethereum-goerli-testnet', 'ethereum-sepolia-testnet'].includes(network.name)) {
      const { address: ownableCallForwarderAddress, abi: ownableCallForwarderAbi } = await deploy(
        'OwnableCallForwarder',
        {
          from: accounts[0],
          args: [accounts[0]],
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
        }
      );
      log(`Deployed OwnableCallForwarder at ${ownableCallForwarderAddress}`);

      const ownableCallForwarder = new ethers.Contract(
        ownableCallForwarderAddress,
        ownableCallForwarderAbi,
        (await ethers.getSigners())[0]
      );
      if ((await ownableCallForwarder.owner()) === accounts[0]) {
        const receipt = await ownableCallForwarder.transferOwnership(managerMultisigAddresses[network.name]);
        await new Promise((resolve) =>
          ethers.provider.once(receipt.hash, () => {
            resolve();
          })
        );
        log(`Transferred OwnableCallForwarder ownership to ${managerMultisigAddresses[network.name]}`);
      }

      const api3ServerV1 = await deploy('Api3ServerV1', {
        from: accounts[0],
        args: [accessControlRegistry.address, 'Api3ServerV1 admin', ownableCallForwarder.address],
        log: true,
        deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
      });
      log(`Deployed Api3ServerV1 at ${api3ServerV1.address}`);

      const { address: proxyFactoryAddress, abi: proxyFactoryAbi } = await deploy('ProxyFactory', {
        from: accounts[0],
        args: [api3ServerV1.address],
        log: true,
        deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
      });
      log(`Deployed ProxyFactory at ${proxyFactoryAddress}`);

      const proxyFactory = new ethers.Contract(proxyFactoryAddress, proxyFactoryAbi, (await ethers.getSigners())[0]);
      const nodaryEthUsdDataFeedId = '0x4385954e058fbe6b6a744f32a4f89d67aad099f8fb8b23e7ea8dd366ae88151d';
      const expectedDataFeedProxyAddress = await proxyFactory.computeDataFeedProxyAddress(nodaryEthUsdDataFeedId, '0x');
      if ((await ethers.provider.getCode(expectedDataFeedProxyAddress)) === '0x') {
        await proxyFactory.deployDataFeedProxy(nodaryEthUsdDataFeedId, '0x');
        log(`Deployed example DataFeedProxy at ${expectedDataFeedProxyAddress}`);
      }
      const ethUsdDapiName = ethers.utils.formatBytes32String('ETH/USD');
      const expectedDapiProxyAddress = await proxyFactory.computeDapiProxyAddress(ethUsdDapiName, '0x');
      if ((await ethers.provider.getCode(expectedDapiProxyAddress)) === '0x') {
        await proxyFactory.deployDapiProxy(ethUsdDapiName, '0x');
        log(`Deployed example DapiProxy at ${expectedDapiProxyAddress}`);
      }
      const exampleOevBeneficiaryAddress = (await ethers.getSigners())[0].address;
      const expectedDataFeedProxyWithOevAddress = await proxyFactory.computeDataFeedProxyWithOevAddress(
        nodaryEthUsdDataFeedId,
        exampleOevBeneficiaryAddress,
        '0x'
      );
      if ((await ethers.provider.getCode(expectedDataFeedProxyWithOevAddress)) === '0x') {
        await proxyFactory.deployDataFeedProxyWithOev(nodaryEthUsdDataFeedId, exampleOevBeneficiaryAddress, '0x');
        log(`Deployed example DataFeedProxyWithOev at ${expectedDataFeedProxyWithOevAddress}`);
      }
      const expectedDapiProxyWithOevAddress = await proxyFactory.computeDapiProxyWithOevAddress(
        ethUsdDapiName,
        exampleOevBeneficiaryAddress,
        '0x'
      );
      if ((await ethers.provider.getCode(expectedDapiProxyWithOevAddress)) === '0x') {
        await proxyFactory.deployDapiProxyWithOev(ethUsdDapiName, exampleOevBeneficiaryAddress, '0x');
        log(`Deployed example DapiProxyWithOev at ${expectedDapiProxyWithOevAddress}`);
      }

      if ([...chainsSupportedByOevRelay].includes(network.name)) {
        let tokenAddress = tokenAddresses.usdc[network.name];
        if (!tokenAddress) {
          const mockErc20PermitToken = await deploy('MockErc20PermitToken', {
            from: accounts[0],
            args: [accounts[0]],
            log: true,
            deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
          });
          log(`Deployed MockErc20PermitToken at ${mockErc20PermitToken.address}`);
          tokenAddress = mockErc20PermitToken.address;
        }

        const prepaymentDepository = await deploy('PrepaymentDepository', {
          from: accounts[0],
          args: [
            accessControlRegistry.address,
            'PrepaymentDepository admin (OEV Relay)',
            ownableCallForwarder.address,
            tokenAddress,
          ],
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
        });
        log(`Deployed PrepaymentDepository (OEV Relay) at ${prepaymentDepository.address}`);
      }

      if (
        [...chainsSupportedByApi3Market, 'ethereum-goerli-testnet', 'ethereum-sepolia-testnet'].includes(network.name)
      ) {
        const orderPayable = await deploy('OrderPayable', {
          from: accounts[0],
          args: [accessControlRegistry.address, 'OrderPayable admin (API3 Market)', ownableCallForwarder.address],
          log: true,
          deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
        });
        log(`Deployed OrderPayable (API3 Market) at ${orderPayable.address}`);
      }
    }

    if ([...chainsSupportedByChainApi, 'ethereum-goerli-testnet', 'ethereum-sepolia-testnet'].includes(network.name)) {
      const requesterAuthorizerWithErc721 = await deploy('RequesterAuthorizerWithErc721', {
        from: accounts[0],
        args: [accessControlRegistry.address, 'RequesterAuthorizerWithErc721 admin'],
        log: true,
        deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
      });
      log(`Deployed RequesterAuthorizerWithErc721 at ${requesterAuthorizerWithErc721.address}`);
    }
  } else {
    throw new Error(`${network.name} is not supported`);
  }
};
module.exports.tags = ['deploy'];
