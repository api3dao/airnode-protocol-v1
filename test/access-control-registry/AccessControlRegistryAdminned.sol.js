const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('AccessControlRegistryAdminned', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
    };
    const expiringMetaTxForwarderFactory = await ethers.getContractFactory('ExpiringMetaTxForwarder', roles.deployer);
    const expiringMetaTxForwarder = await expiringMetaTxForwarderFactory.deploy();
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy(expiringMetaTxForwarder.address);
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
});
