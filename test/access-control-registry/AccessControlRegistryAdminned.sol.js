const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('AccessControlRegistryAdminned', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      randomPerson: accounts[9],
    };
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const adminRoleDescription = 'Admin role description';
    const accessControlRegistryAdminnedFactory = await ethers.getContractFactory(
      'AccessControlRegistryAdminned',
      roles.deployer
    );
    const accessControlRegistryAdminned = await accessControlRegistryAdminnedFactory.deploy(
      accessControlRegistry.address,
      adminRoleDescription
    );
    return {
      roles,
      accessControlRegistry,
      adminRoleDescription,
      accessControlRegistryAdminned,
    };
  }

  describe('constructor', function () {
    context('AccessControlRegistry address is not zero', function () {
      context('Admin role description is not empty', function () {
        it('constructs', async function () {
          const { accessControlRegistry, adminRoleDescription, accessControlRegistryAdminned } =
            await helpers.loadFixture(deploy);
          expect(await accessControlRegistryAdminned.accessControlRegistry()).to.be.equal(
            accessControlRegistry.address
          );
          expect(await accessControlRegistryAdminned.adminRoleDescription()).to.be.equal(adminRoleDescription);
        });
      });
      context('Admin role description is not empty', function () {
        it('reverts', async function () {
          const { roles, accessControlRegistry } = await helpers.loadFixture(deploy);
          const accessControlRegistryAdminnedFactory = await ethers.getContractFactory(
            'AccessControlRegistryAdminned',
            roles.deployer
          );
          await expect(
            accessControlRegistryAdminnedFactory.deploy(accessControlRegistry.address, '')
          ).to.be.revertedWith('Admin role description empty');
        });
      });
    });
    context('AccessControlRegistry address is zero', function () {
      it('reverts', async function () {
        const { roles, adminRoleDescription } = await helpers.loadFixture(deploy);
        const accessControlRegistryAdminnedFactory = await ethers.getContractFactory(
          'AccessControlRegistryAdminned',
          roles.deployer
        );
        await expect(
          accessControlRegistryAdminnedFactory.deploy(ethers.constants.AddressZero, adminRoleDescription)
        ).to.be.revertedWith('ACR address zero');
      });
    });
  });

  describe('multicall', function () {
    it('multicalls', async function () {
      const { accessControlRegistry, adminRoleDescription, accessControlRegistryAdminned } = await helpers.loadFixture(
        deploy
      );
      const data = [
        accessControlRegistryAdminned.interface.encodeFunctionData('accessControlRegistry', []),
        accessControlRegistryAdminned.interface.encodeFunctionData('adminRoleDescription', []),
      ];
      const returndata = await accessControlRegistryAdminned.callStatic.multicall(data);
      expect(returndata).to.deep.equal([
        ethers.utils.defaultAbiCoder.encode(['address'], [accessControlRegistry.address]),
        ethers.utils.defaultAbiCoder.encode(['string'], [adminRoleDescription]),
      ]);
    });
  });

  describe('tryMulticall', function () {
    it('tries to multicall', async function () {
      const { accessControlRegistry, adminRoleDescription, accessControlRegistryAdminned } = await helpers.loadFixture(
        deploy
      );
      const data = [
        accessControlRegistryAdminned.interface.encodeFunctionData('accessControlRegistry', []),
        '0x',
        accessControlRegistryAdminned.interface.encodeFunctionData('adminRoleDescription', []),
      ];
      const { successes, returndata } = await accessControlRegistryAdminned.callStatic.tryMulticall(data);
      expect(successes).to.deep.equal([true, false, true]);
      expect(returndata).to.deep.equal([
        ethers.utils.defaultAbiCoder.encode(['address'], [accessControlRegistry.address]),
        '0x',
        ethers.utils.defaultAbiCoder.encode(['string'], [adminRoleDescription]),
      ]);
    });
  });

  describe('Meta-tx', function () {
    it('executes', async function () {
      const { roles, accessControlRegistry, accessControlRegistryAdminned } = await helpers.loadFixture(deploy);
      const expiringMetaTxDomain = await testUtils.expiringMetaTxDomain(accessControlRegistry);
      const expiringMetaTxTypes = testUtils.expiringMetaTxTypes();
      const latestTimestamp = await helpers.time.latest();
      const nextTimestamp = latestTimestamp + 1;
      await helpers.time.setNextBlockTimestamp(nextTimestamp);
      const expiringMetaTxValue = {
        from: roles.randomPerson.address,
        to: accessControlRegistryAdminned.address,
        data: accessControlRegistryAdminned.interface.encodeFunctionData('accessControlRegistry', []),
        expirationTimestamp: nextTimestamp + 60 * 60,
      };
      const signature = await roles.randomPerson._signTypedData(
        expiringMetaTxDomain,
        expiringMetaTxTypes,
        expiringMetaTxValue
      );
      const returndata = await accessControlRegistry
        .connect(roles.randomPerson)
        .callStatic.execute(expiringMetaTxValue, signature);
      expect(returndata).to.equal(ethers.utils.defaultAbiCoder.encode(['address'], [accessControlRegistry.address]));
    });
  });
});
