const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('DapiProxy', function () {
  let roles;
  let dapiServer, dapiProxy;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let beaconId, beaconValue, beaconTimestamp;
  const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
  const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      dapiNameSetter: accounts[2],
      airnode: accounts[3],
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
    const dapiProxyFactory = await hre.ethers.getContractFactory('DapiProxy', roles.deployer);
    dapiProxy = await dapiProxyFactory.deploy(dapiServer.address, dapiName);
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
  });

  describe('constructor', function () {
    it('constructs', async function () {
      expect(await dapiProxy.dapiServer()).to.equal(dapiServer.address);
      expect(await dapiProxy.dapiNameHash()).to.equal(dapiNameHash);
    });
  });

  describe('read', function () {
    context('dAPI name is set', function () {
      context('dAPI is initialized', function () {
        it('reads', async function () {
          const dataFeed = await dapiProxy.read();
          expect(dataFeed.value).to.equal(beaconValue);
          expect(dataFeed.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('dAPI is not initialized', function () {
        it('reverts', async function () {
          const dapiName = hre.ethers.utils.formatBytes32String('My uninitialized dAPI');
          await dapiServer.connect(roles.manager).setDapiName(dapiName, testUtils.generateRandomBytes32());
          const dapiProxyFactory = await hre.ethers.getContractFactory('DapiProxy', roles.deployer);
          dapiProxy = await dapiProxyFactory.deploy(dapiServer.address, dapiName);
          await expect(dapiProxy.read()).to.be.revertedWith('dAPI not initialized');
        });
      });
    });
    context('dAPI name is not set', function () {
      it('reverts', async function () {
        const unsetDapiName = hre.ethers.utils.formatBytes32String('My unset dAPI');
        const dapiProxyFactory = await hre.ethers.getContractFactory('DapiProxy', roles.deployer);
        dapiProxy = await dapiProxyFactory.deploy(dapiServer.address, unsetDapiName);
        await expect(dapiProxy.read()).to.be.revertedWith('dAPI name not set');
      });
    });
  });
});
