const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('DataFeedProxy', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      dapiNameSetter: accounts[2],
      airnode: accounts[3],
    };
    const dapiServerAdminRoleDescription = 'DapiServer admin';

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const airnodeProtocolFactory = await ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const dapiServerFactory = await ethers.getContractFactory('DapiServer', roles.deployer);
    const dapiServer = await dapiServerFactory.deploy(
      accessControlRegistry.address,
      dapiServerAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['bytes32', 'bytes'], [endpointId, templateParameters])
    );
    const beaconId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['address', 'bytes32'], [roles.airnode.address, templateId])
    );

    const beaconValue = 123;
    const beaconTimestamp = await helpers.time.latest();
    const data = ethers.utils.defaultAbiCoder.encode(['int256'], [beaconValue]);
    const signature = await testUtils.signData(roles.airnode, templateId, beaconTimestamp, data);
    const signedData = ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
      [roles.airnode.address, templateId, beaconTimestamp, data, signature]
    );
    await dapiServer.updateDataFeedWithSignedData([signedData]);

    const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
    const dataFeedProxy = await dataFeedProxyFactory.deploy(dapiServer.address, beaconId);

    return {
      roles,
      dapiServer,
      dataFeedProxy,
      beaconId,
      beaconValue,
      beaconTimestamp,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { dapiServer, dataFeedProxy, beaconId } = await helpers.loadFixture(deploy);
      expect(await dataFeedProxy.dapiServer()).to.equal(dapiServer.address);
      expect(await dataFeedProxy.dataFeedId()).to.equal(beaconId);
    });
  });

  describe('read', function () {
    context('Data feed is initialized', function () {
      it('reads', async function () {
        const { dataFeedProxy, beaconValue, beaconTimestamp } = await helpers.loadFixture(deploy);
        const dataFeed = await dataFeedProxy.read();
        expect(dataFeed.value).to.equal(beaconValue);
        expect(dataFeed.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, dapiServer } = await helpers.loadFixture(deploy);
        const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
        const dataFeedProxy = await dataFeedProxyFactory.deploy(dapiServer.address, testUtils.generateRandomBytes32());
        await expect(dataFeedProxy.read()).to.be.revertedWith('Data feed not initialized');
      });
    });
  });
});
