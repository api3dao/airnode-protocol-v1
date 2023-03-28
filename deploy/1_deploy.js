const hre = require('hardhat');
const managerMultisigAddresses = require('../deployments/manager-multisig.json');

module.exports = async ({ getUnnamedAccounts, deployments }) => {
  const zk = require('zksync-web3');
  const { Deployer } = require('@matterlabs/hardhat-zksync-deploy');
  const zkWallet = zk.Wallet.fromMnemonic(hre.config.networks[hre.network.name].accounts.mnemonic);
  const deployer = new Deployer(hre, zkWallet);

  const { log } = deployments;
  const accounts = await getUnnamedAccounts();

  const AccessControlRegistry = await deployer.loadArtifact('AccessControlRegistry');
  const accessControlRegistry = await deployer.deploy(AccessControlRegistry, []);
  log(`Deployed AccessControlRegistry at ${accessControlRegistry.address}`);

  const OwnableCallForwarder = await deployer.loadArtifact('OwnableCallForwarder');
  const { address: ownableCallForwarderAddress } = await deployer.deploy(OwnableCallForwarder, [accounts[0]]);
  log(`Deployed OwnableCallForwarder at ${ownableCallForwarderAddress}`);

  const ownableCallForwarder = new hre.ethers.Contract(
    ownableCallForwarderAddress,
    OwnableCallForwarder.abi,
    (await hre.ethers.getSigners())[0]
  );
  if ((await ownableCallForwarder.owner()) === accounts[0]) {
    const receipt = await ownableCallForwarder.transferOwnership(managerMultisigAddresses[hre.network.name]);
    await new Promise((resolve) =>
      hre.ethers.provider.once(receipt.hash, () => {
        resolve();
      })
    );
    log(`Transferred OwnableCallForwarder ownership to ${managerMultisigAddresses[hre.network.name]}`);
  }

  const Api3ServerV1 = await deployer.loadArtifact('Api3ServerV1');
  const api3ServerV1 = await deployer.deploy(Api3ServerV1, [
    accessControlRegistry.address,
    'Api3ServerV1 admin',
    ownableCallForwarder.address,
  ]);
  log(`Deployed Api3ServerV1 at ${api3ServerV1.address}`);

  const ProxyFactory = await deployer.loadArtifact('ProxyFactory');
  const proxyFactory = await deployer.deploy(ProxyFactory, [api3ServerV1.address]);
  log(`Deployed ProxyFactory at ${proxyFactory.address}`);
};
module.exports.tags = ['deploy'];
