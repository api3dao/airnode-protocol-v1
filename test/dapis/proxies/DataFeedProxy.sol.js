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
    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      accessControlRegistry.address,
      api3ServerV1AdminRoleDescription,
      roles.manager.address
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
    await api3ServerV1.updateBeaconWithSignedData(roles.airnode.address, templateId, beaconTimestamp, data, signature);

    const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
    const dataFeedProxy = await dataFeedProxyFactory.deploy(api3ServerV1.address, beaconId);

    return {
      roles,
      api3ServerV1,
      dataFeedProxy,
      beaconId,
      beaconValue,
      beaconTimestamp,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { api3ServerV1, dataFeedProxy, beaconId } = await helpers.loadFixture(deploy);
      expect(await dataFeedProxy.api3ServerV1()).to.equal(api3ServerV1.address);
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
        const { roles, api3ServerV1 } = await helpers.loadFixture(deploy);
        const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
        const dataFeedProxy = await dataFeedProxyFactory.deploy(
          api3ServerV1.address,
          testUtils.generateRandomBytes32()
        );
        await expect(dataFeedProxy.read()).to.be.revertedWith('Data feed not initialized');
      });
    });
  });
});
