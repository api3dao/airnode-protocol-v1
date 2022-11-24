const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('DapiReader', function () {
  let roles;
  let dapiServer1, dapiServer2, dapiReader;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let beaconId, beaconValue, beaconTimestamp;
  const dapiName = hre.ethers.utils.formatBytes32String('My beacon');

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
    dapiServer1 = await dapiServerFactory.deploy(
      accessControlRegistry.address,
      dapiServerAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );
    dapiServer2 = await dapiServerFactory.deploy(
      accessControlRegistry.address,
      dapiServerAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );
    const dapiReaderFactory = await hre.ethers.getContractFactory('MockDapiReader', roles.deployer);
    dapiReader = await dapiReaderFactory.deploy(dapiServer1.address);
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
    await dapiServer1.connect(roles.manager).setDapiName(dapiName, beaconId);
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
    await dapiServer1.updateBeaconWithSignedData(airnodeAddress, templateId, beaconTimestamp, data, signature);
  });

  describe('constructor', function () {
    it('constructs', async function () {
      expect(await dapiReader.dapiServer()).to.equal(dapiServer1.address);
    });
  });

  describe('setDapiServer', function () {
    context('DapiServer address is not zero', function () {
      it('sets DapiServer address', async function () {
        await dapiReader.exposedSetDapiServer(dapiServer2.address);
        expect(await dapiReader.dapiServer()).to.equal(dapiServer2.address);
      });
    });
    context('DapiServer address is zero', function () {
      it('reverts', async function () {
        await expect(dapiReader.exposedSetDapiServer(hre.ethers.constants.AddressZero)).to.be.revertedWith(
          'dAPI server address zero'
        );
      });
    });
  });

  describe('readDataFeedWithId', function () {
    it('reads with data feed ID', async function () {
      const dataFeed = await dapiReader.exposedReadWithDataFeedId(beaconId);
      expect(dataFeed.value).to.equal(beaconValue);
      expect(dataFeed.timestamp).to.equal(beaconTimestamp);
    });
  });

  describe('readDataFeedWithDapiName', function () {
    it('reads with dAPI name', async function () {
      const dataFeed = await dapiReader.exposedReadWithDapiName(dapiName);
      expect(dataFeed.value).to.equal(beaconValue);
      expect(dataFeed.timestamp).to.equal(beaconTimestamp);
    });
  });
});
