const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('ProxyFactory', function () {
  let roles;
  let proxyFactory, dapiServer;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let beaconId, beaconValue, beaconTimestamp;
  const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      randomPerson: accounts[9],
    };
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const airnodeProtocolFactory = await hre.ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const dapiServerFactory = await hre.ethers.getContractFactory('DapiServer', roles.deployer);
    dapiServer = await dapiServerFactory.deploy(
      accessControlRegistry.address,
      dapiServerAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );
    const airnodeData = testUtils.generateRandomAirnodeWallet();
    const airnodeAddress = airnodeData.airnodeAddress;
    const airnodeWallet = hre.ethers.Wallet.fromMnemonic(airnodeData.airnodeMnemonic, "m/44'/60'/0'/0/0");
    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['bytes32', 'bytes'], [endpointId, templateParameters])
    );
    beaconId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeAddress, templateId])
    );
    await dapiServer.connect(roles.manager).setDapiName(dapiName, beaconId);
    beaconValue = 123;
    beaconTimestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
    const data = hre.ethers.utils.defaultAbiCoder.encode(['int256'], [beaconValue]);
    const signature = await airnodeWallet.signMessage(
      hre.ethers.utils.arrayify(
        hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [templateId, beaconTimestamp, data])
        )
      )
    );
    await hre.ethers.provider.send('evm_setNextBlockTimestamp', [beaconTimestamp + 1]);
    await dapiServer.updateBeaconWithSignedData(airnodeAddress, templateId, beaconTimestamp, data, signature);

    const proxyFactoryFactory = await hre.ethers.getContractFactory('ProxyFactory', roles.deployer);
    proxyFactory = await proxyFactoryFactory.deploy(dapiServer.address);
  });

  describe('deploy', function () {
    it('deploys', async function () {
      // Precompute the proxy address
      const DataFeedProxy = await hre.artifacts.readArtifact('DataFeedProxy');
      const initcode = hre.ethers.utils.solidityPack(
        ['bytes', 'bytes'],
        [
          DataFeedProxy.bytecode,
          hre.ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [dapiServer.address, beaconId]),
        ]
      );
      // metadata includes information like policy hash, commission recipient, etc.
      const metadata = testUtils.generateRandomBytes();
      const proxyAddress = hre.ethers.utils.getCreate2Address(
        proxyFactory.address,
        hre.ethers.utils.keccak256(metadata),
        hre.ethers.utils.keccak256(initcode)
      );

      // Can only deploy once
      await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata))
        .to.emit(proxyFactory, 'DeployedDataFeedProxy')
        .withArgs(proxyAddress, beaconId, metadata);
      // Subsequent deployments will revert
      await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata)).to.be.revertedWith('Proxy already deployed');

      // Confirm that the bytecode is the same
      const dataFeedProxyFactory = await hre.ethers.getContractFactory('DataFeedProxy', roles.deployer);
      const eoaDeployedDataFeedProxy = await dataFeedProxyFactory.deploy(dapiServer.address, beaconId);
      expect(await hre.ethers.provider.getCode(proxyAddress)).to.equal(
        await hre.ethers.provider.getCode(eoaDeployedDataFeedProxy.address)
      );

      // Test the deployed contract
      const dataFeedProxy = new hre.ethers.Contract(proxyAddress, DataFeedProxy.abi, hre.ethers.provider);
      expect(await dataFeedProxy.dapiServer()).to.equal(dapiServer.address);
      expect(await dataFeedProxy.dataFeedId()).to.equal(beaconId);
      const beacon = await dataFeedProxy.read();
      expect(beacon.value).to.equal(beaconValue);
      expect(beacon.timestamp).to.equal(beaconTimestamp);
    });
  });
});
