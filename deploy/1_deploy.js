const { ethers, network } = require('hardhat');
const managerMultisigAddresses = require('../deployments/manager-multisig.json');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const accounts = await getUnnamedAccounts();

  const accessControlRegistry = await deploy('AccessControlRegistry', {
    from: accounts[0],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
  });
  log(`Deployed AccessControlRegistry at ${accessControlRegistry.address}`);

  const { address: ownableCallForwarderAddress, abi: ownableCallForwarderAbi } = await deploy('OwnableCallForwarder', {
    from: accounts[0],
    args: [accounts[0]],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
  });
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

  const proxyFactory = await deploy('ProxyFactory', {
    from: accounts[0],
    args: [api3ServerV1.address],
    log: true,
    deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
  });
  log(`Deployed ProxyFactory at ${proxyFactory.address}`);

  if (network.name === 'ethereum') {
    const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const prepaymentDepository = await deploy('PrepaymentDepository', {
      from: accounts[0],
      args: [
        accessControlRegistry.address,
        'PrepaymentDepository admin (OEV Relay)',
        ownableCallForwarder.address,
        usdcAddress,
      ],
      log: true,
      deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
    });
    log(`Deployed PrepaymentDepository (OEV Relay) at ${prepaymentDepository.address}`);
  }

  if (network.name === 'ethereum' || network.name === 'ethereum-goerli-testnet') {
    const requesterAuthorizerWithErc721 = await deploy('RequesterAuthorizerWithErc721', {
      from: accounts[0],
      args: [accessControlRegistry.address, 'RequesterAuthorizerWithErc721 admin'],
      log: true,
      deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
    });
    log(`Deployed RequesterAuthorizerWithErc721 at ${requesterAuthorizerWithErc721.address}`);
  }
};
module.exports.tags = ['deploy'];
