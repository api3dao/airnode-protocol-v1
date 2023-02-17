const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('DapiProxy', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      dapiNameSetter: accounts[2],
      airnode: accounts[3],
    };
    const dapiServerAdminRoleDescription = 'DapiServer admin';
    const dapiName = ethers.utils.formatBytes32String('My dAPI');
    const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);

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
    const dapiProxyFactory = await ethers.getContractFactory('DapiProxy', roles.deployer);
    const dapiProxy = await dapiProxyFactory.deploy(dapiServer.address, dapiNameHash);

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['bytes32', 'bytes'], [endpointId, templateParameters])
    );
    const beaconId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['address', 'bytes32'], [roles.airnode.address, templateId])
    );
    await dapiServer.connect(roles.manager).setDapiName(dapiName, beaconId);

    const beaconValue = 123;
    const beaconTimestamp = await helpers.time.latest();
    const data = ethers.utils.defaultAbiCoder.encode(['int256'], [beaconValue]);
    const signature = await testUtils.signData(roles.airnode, templateId, beaconTimestamp, data);
    const signedData = ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
      [roles.airnode.address, templateId, beaconTimestamp, data, signature]
    );
    await dapiServer.updateDataFeedWithSignedData(signedData);

    return {
      roles,
      dapiServer,
      dapiProxy,
      dapiNameHash,
      beaconValue,
      beaconTimestamp,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { dapiServer, dapiProxy, dapiNameHash } = await helpers.loadFixture(deploy);
      expect(await dapiProxy.dapiServer()).to.equal(dapiServer.address);
      expect(await dapiProxy.dapiNameHash()).to.equal(dapiNameHash);
    });
  });

  describe('read', function () {
    context('dAPI name is set', function () {
      context('Data feed is initialized', function () {
        it('reads', async function () {
          const { dapiProxy, beaconValue, beaconTimestamp } = await helpers.loadFixture(deploy);
          const dataFeed = await dapiProxy.read();
          expect(dataFeed.value).to.equal(beaconValue);
          expect(dataFeed.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dapiServer } = await helpers.loadFixture(deploy);
          const uninitializedDapiName = ethers.utils.formatBytes32String('My uninitialized dAPI');
          const uninitializedDapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [uninitializedDapiName]);
          await dapiServer.connect(roles.manager).setDapiName(uninitializedDapiName, testUtils.generateRandomBytes32());
          const dapiProxyFactory = await ethers.getContractFactory('DapiProxy', roles.deployer);
          const dapiProxy = await dapiProxyFactory.deploy(dapiServer.address, uninitializedDapiNameHash);
          await expect(dapiProxy.read()).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name is not set', function () {
      it('reverts', async function () {
        const { roles, dapiServer } = await helpers.loadFixture(deploy);
        const unsetDapiName = ethers.utils.formatBytes32String('My unset dAPI');
        const unsetDapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [unsetDapiName]);
        const dapiProxyFactory = await ethers.getContractFactory('DapiProxy', roles.deployer);
        const dapiProxy = await dapiProxyFactory.deploy(dapiServer.address, unsetDapiNameHash);
        await expect(dapiProxy.read()).to.be.revertedWith('dAPI name not set');
      });
    });
  });
});
