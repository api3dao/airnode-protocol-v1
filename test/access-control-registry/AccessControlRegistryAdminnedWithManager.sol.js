const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('AccessControlRegistryAdminnedWithManager', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
    };
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const adminRoleDescription = 'Admin role description';
    const accessControlRegistryAdminnedWithManagerFactory = await ethers.getContractFactory(
      'AccessControlRegistryAdminnedWithManager',
      roles.deployer
    );
    const accessControlRegistryAdminnedWithManager = await accessControlRegistryAdminnedWithManagerFactory.deploy(
      accessControlRegistry.address,
      adminRoleDescription,
      roles.manager.address
    );
    return {
      roles,
      accessControlRegistry,
      adminRoleDescription,
      accessControlRegistryAdminnedWithManager,
    };
  }

  describe('constructor', function () {
    context('Manager address is not zero', function () {
      it('constructs', async function () {
        const { roles, adminRoleDescription, accessControlRegistryAdminnedWithManager } = await helpers.loadFixture(
          deploy
        );
        expect(await accessControlRegistryAdminnedWithManager.manager()).to.be.equal(roles.manager.address);
        const managerRootRole = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [roles.manager.address]));
        const adminRoleDescriptionHash = ethers.utils.keccak256(
          ethers.utils.solidityPack(['string'], [adminRoleDescription])
        );
        const adminRole = ethers.utils.keccak256(
          ethers.utils.solidityPack(['bytes32', 'bytes32'], [managerRootRole, adminRoleDescriptionHash])
        );
        expect(await accessControlRegistryAdminnedWithManager.adminRole()).to.equal(adminRole);
      });
    });
    context('Manager address is zero', function () {
      it('reverts', async function () {
        const { roles, adminRoleDescription, accessControlRegistry } = await helpers.loadFixture(deploy);
        const accessControlRegistryAdminnedWithManagerFactory = await ethers.getContractFactory(
          'AccessControlRegistryAdminnedWithManager',
          roles.deployer
        );
        await expect(
          accessControlRegistryAdminnedWithManagerFactory.deploy(
            accessControlRegistry.address,
            adminRoleDescription,
            ethers.constants.AddressZero
          )
        ).to.be.revertedWith('Manager address zero');
      });
    });
  });
});
