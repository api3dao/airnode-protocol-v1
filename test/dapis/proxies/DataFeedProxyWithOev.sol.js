const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('DataFeedProxyWithOev', function () {
  let roles;
  let dapiServer, dataFeedProxyWithOev;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let airnodeAddress, airnodeWallet;
  let templateId;
  let beaconId, beaconValue, beaconTimestamp;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      oevBeneficiary: accounts[2],
      searcher: accounts[3],
    };
    const expiringMetaCallForwarderFactory = await hre.ethers.getContractFactory(
      'ExpiringMetaCallForwarder',
      roles.deployer
    );
    const expiringMetaCallForwarder = await expiringMetaCallForwarderFactory.deploy();
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy(expiringMetaCallForwarder.address);
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
    airnodeAddress = airnodeData.airnodeAddress;
    airnodeWallet = hre.ethers.Wallet.fromMnemonic(airnodeData.airnodeMnemonic, "m/44'/60'/0'/0/0");
    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    templateId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['bytes32', 'bytes'], [endpointId, templateParameters])
    );
    beaconId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeAddress, templateId])
    );
    const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
    dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
      dapiServer.address,
      beaconId,
      roles.oevBeneficiary.address
    );
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
    await dapiServer.updateDataFeedWithSignedData([
      hre.ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
        [airnodeAddress, templateId, beaconTimestamp, data, signature]
      ),
    ]);
  });

  describe('constructor', function () {
    it('constructs', async function () {
      expect(await dataFeedProxyWithOev.dapiServer()).to.equal(dapiServer.address);
      expect(await dataFeedProxyWithOev.dataFeedId()).to.equal(beaconId);
      expect(await dataFeedProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
    });
  });

  describe('read', function () {
    context('Data feed is initialized', function () {
      it('reads', async function () {
        const dataFeed = await dataFeedProxyWithOev.read();
        expect(dataFeed.value).to.equal(beaconValue);
        expect(dataFeed.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
        dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
          dapiServer.address,
          testUtils.generateRandomBytes32(),
          roles.oevBeneficiary.address
        );
        await expect(dataFeedProxyWithOev.read()).to.be.revertedWith('Data feed not initialized');
      });
    });
  });
});
