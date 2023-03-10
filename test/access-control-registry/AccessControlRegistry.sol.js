const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('AccessControlRegistry', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      account: accounts[2],
      randomPerson: accounts[9],
    };
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const managerRootRole = ethers.utils.keccak256(ethers.utils.solidityPack(['address'], [roles.manager.address]));
    const roleDescription = 'Role description unique to admin role';
    const role = testUtils.deriveRole(managerRootRole, roleDescription);
    return {
      roles,
      accessControlRegistry,
      managerRootRole,
      roleDescription,
      role,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { accessControlRegistry } = await helpers.loadFixture(deploy);
      expect(await accessControlRegistry.isTrustedForwarder(accessControlRegistry.address)).to.equal(true);
    });
  });

  describe('initializeManager', function () {
    context('Manager address is not zero', function () {
      context('Manager is not initialized', function () {
        it('initializes manager', async function () {
          const { roles, accessControlRegistry, managerRootRole } = await helpers.loadFixture(deploy);
          expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(false);
          await expect(accessControlRegistry.connect(roles.randomPerson).initializeManager(roles.manager.address))
            .to.emit(accessControlRegistry, 'InitializedManager')
            .withArgs(managerRootRole, roles.manager.address, roles.randomPerson.address);
          expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(true);
        });
      });
      context('Manager is initialized', function () {
        it('does nothing', async function () {
          const { roles, accessControlRegistry, managerRootRole } = await helpers.loadFixture(deploy);
          await accessControlRegistry.connect(roles.randomPerson).initializeManager(roles.manager.address);
          expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(true);
          await expect(
            accessControlRegistry.connect(roles.randomPerson).initializeManager(roles.manager.address)
          ).to.not.emit(accessControlRegistry, 'InitializedManager');
          expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(true);
        });
      });
    });
    context('Manager address is zero', function () {
      it('reverts', async function () {
        const { roles, accessControlRegistry } = await helpers.loadFixture(deploy);
        await expect(
          accessControlRegistry.connect(roles.randomPerson).initializeManager(ethers.constants.AddressZero)
        ).to.be.revertedWith('Manager address zero');
      });
    });
  });

  // Not testing the full OpenZeppelin implementation
  describe('renounceRole', function () {
    context('role is not the root role of account', function () {
      context('Sender is account', function () {
        context('account has role', function () {
          it('renounces role', async function () {
            const { roles, accessControlRegistry, managerRootRole, roleDescription, role } = await helpers.loadFixture(
              deploy
            );
            await accessControlRegistry
              .connect(roles.manager)
              .initializeRoleAndGrantToSender(managerRootRole, roleDescription);
            await accessControlRegistry.connect(roles.manager).grantRole(role, roles.account.address);
            expect(await accessControlRegistry.hasRole(role, roles.account.address)).to.equal(true);
            await expect(accessControlRegistry.connect(roles.account).renounceRole(role, roles.account.address))
              .to.emit(accessControlRegistry, 'RoleRevoked')
              .withArgs(role, roles.account.address, roles.account.address);
            expect(await accessControlRegistry.hasRole(role, roles.account.address)).to.equal(false);
          });
        });
        context('account does not have role', function () {
          it('does nothing', async function () {
            const { roles, accessControlRegistry, role } = await helpers.loadFixture(deploy);
            await expect(
              accessControlRegistry.connect(roles.account).renounceRole(role, roles.account.address)
            ).to.not.emit(accessControlRegistry, 'RoleRevoked');
          });
        });
      });
      context('Sender is not account', function () {
        it('reverts', async function () {
          const { roles, accessControlRegistry, role } = await helpers.loadFixture(deploy);
          await expect(
            accessControlRegistry.connect(roles.randomPerson).renounceRole(role, roles.account.address)
          ).to.be.revertedWith('AccessControl: can only renounce roles for self');
        });
      });
    });
    context('role is the root role of account', function () {
      it('reverts', async function () {
        const { roles, accessControlRegistry, managerRootRole } = await helpers.loadFixture(deploy);
        await expect(
          accessControlRegistry.connect(roles.manager).renounceRole(managerRootRole, roles.manager.address)
        ).to.be.revertedWith('role is root role of account');
      });
    });
  });

  describe('initializeRoleAndGrantToSender', function () {
    context('description is not empty', function () {
      context('Role is not initialized', function () {
        context('adminRole is the root role of the sender', function () {
          context('Sender manager is initialized', function () {
            it('initializes role and grants it to the sender', async function () {
              const { roles, accessControlRegistry, managerRootRole, roleDescription, role } =
                await helpers.loadFixture(deploy);
              await accessControlRegistry.connect(roles.randomPerson).initializeManager(roles.manager.address);
              expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(ethers.constants.HashZero);
              expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(false);
              await expect(
                accessControlRegistry
                  .connect(roles.manager)
                  .initializeRoleAndGrantToSender(managerRootRole, roleDescription)
              )
                .to.emit(accessControlRegistry, 'InitializedRole')
                .withArgs(role, managerRootRole, roleDescription, roles.manager.address);
              expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(managerRootRole);
              expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(true);
            });
          });
          context('Sender manager is not initialized', function () {
            it('initializes sender manager, role and grants it to the sender', async function () {
              const { roles, accessControlRegistry, managerRootRole, roleDescription, role } =
                await helpers.loadFixture(deploy);
              expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(false);
              expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(ethers.constants.HashZero);
              expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(false);
              await expect(
                accessControlRegistry
                  .connect(roles.manager)
                  .initializeRoleAndGrantToSender(managerRootRole, roleDescription)
              )
                .to.emit(accessControlRegistry, 'InitializedRole')
                .withArgs(role, managerRootRole, roleDescription, roles.manager.address);
              expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(true);
              expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(managerRootRole);
              expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(true);
            });
          });
        });
        context('adminRole is not the root role of the sender', function () {
          context('Sender has adminRole', function () {
            it('initializes role and grants it to the sender', async function () {
              const { roles, accessControlRegistry, managerRootRole, roleDescription } = await helpers.loadFixture(
                deploy
              );
              const role1 = testUtils.deriveRole(managerRootRole, roleDescription);
              const role2 = testUtils.deriveRole(role1, roleDescription);
              await accessControlRegistry
                .connect(roles.manager)
                .initializeRoleAndGrantToSender(managerRootRole, roleDescription);
              await accessControlRegistry.connect(roles.manager).grantRole(role1, roles.account.address);
              expect(await accessControlRegistry.getRoleAdmin(role2)).to.equal(ethers.constants.HashZero);
              expect(await accessControlRegistry.hasRole(role2, roles.manager.address)).to.equal(false);
              expect(await accessControlRegistry.hasRole(role2, roles.account.address)).to.equal(false);
              await expect(
                accessControlRegistry.connect(roles.account).initializeRoleAndGrantToSender(role1, roleDescription)
              )
                .to.emit(accessControlRegistry, 'InitializedRole')
                .withArgs(role2, role1, roleDescription, roles.account.address);
              expect(await accessControlRegistry.getRoleAdmin(role2)).to.equal(role1);
              expect(await accessControlRegistry.hasRole(role2, roles.account.address)).to.equal(true);
              // The role didn't propagate to the manager
              expect(await accessControlRegistry.hasRole(role2, roles.manager.address)).to.equal(false);
            });
          });
          context('Sender does not have adminRole', function () {
            it('reverts', async function () {
              const { roles, accessControlRegistry, managerRootRole, roleDescription } = await helpers.loadFixture(
                deploy
              );
              await expect(
                accessControlRegistry
                  .connect(roles.randomPerson)
                  .initializeRoleAndGrantToSender(managerRootRole, roleDescription)
              ).to.be.revertedWith(
                `AccessControl: account ${roles.randomPerson.address.toLowerCase()} is missing role ${managerRootRole.toLowerCase()}`
              );
            });
          });
        });
      });
      context('Role is initialized', function () {
        context('Sender has adminRole', function () {
          it('grants role to sender', async function () {
            const { roles, accessControlRegistry, managerRootRole, roleDescription, role } = await helpers.loadFixture(
              deploy
            );
            await accessControlRegistry
              .connect(roles.manager)
              .initializeRoleAndGrantToSender(managerRootRole, roleDescription);
            await accessControlRegistry.connect(roles.manager).renounceRole(role, roles.manager.address);
            expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(managerRootRole);
            expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(false);
            await expect(
              accessControlRegistry
                .connect(roles.manager)
                .initializeRoleAndGrantToSender(managerRootRole, roleDescription)
            )
              .to.emit(accessControlRegistry, 'RoleGranted')
              .withArgs(role, roles.manager.address, roles.manager.address);
            await expect(
              accessControlRegistry
                .connect(roles.manager)
                .initializeRoleAndGrantToSender(managerRootRole, roleDescription)
            ).to.not.emit(accessControlRegistry, 'InitializedRole');
            expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(managerRootRole);
            expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(true);
          });
        });
        context('Sender does not have adminRole', function () {
          it('reverts', async function () {
            const { roles, accessControlRegistry, managerRootRole, roleDescription } = await helpers.loadFixture(
              deploy
            );
            await expect(
              accessControlRegistry
                .connect(roles.randomPerson)
                .initializeRoleAndGrantToSender(managerRootRole, roleDescription)
            ).to.be.revertedWith(
              `AccessControl: account ${roles.randomPerson.address.toLowerCase()} is missing role ${managerRootRole.toLowerCase()}`
            );
          });
        });
      });
    });
    context('description is empty', function () {
      it('reverts', async function () {
        const { roles, accessControlRegistry, managerRootRole } = await helpers.loadFixture(deploy);
        await expect(
          accessControlRegistry.connect(roles.manager).initializeRoleAndGrantToSender(managerRootRole, '')
        ).to.be.revertedWith('Role description empty');
      });
    });
  });

  describe('multicall', function () {
    it('multicalls', async function () {
      // Root role ---> role1 ---> role11
      //                       \
      //                        -> role12
      const { roles, accessControlRegistry, managerRootRole } = await helpers.loadFixture(deploy);
      const description1 = Math.random().toString();
      const role1 = testUtils.deriveRole(managerRootRole, description1);
      const account1 = testUtils.generateRandomAddress();
      const description11 = Math.random().toString();
      const role11 = testUtils.deriveRole(role1, description11);
      const account11 = testUtils.generateRandomAddress();
      const description12 = Math.random().toString();
      const role12 = testUtils.deriveRole(role1, description12);
      const account12 = testUtils.generateRandomAddress();
      expect(await accessControlRegistry.getRoleAdmin(role1)).to.equal(ethers.constants.HashZero);
      expect(await accessControlRegistry.hasRole(role1, roles.manager.address)).to.equal(false);
      expect(await accessControlRegistry.hasRole(role1, account1)).to.equal(false);
      expect(await accessControlRegistry.getRoleAdmin(role11)).to.equal(ethers.constants.HashZero);
      expect(await accessControlRegistry.hasRole(role11, roles.manager.address)).to.equal(false);
      expect(await accessControlRegistry.hasRole(role11, account11)).to.equal(false);
      expect(await accessControlRegistry.getRoleAdmin(role12)).to.equal(ethers.constants.HashZero);
      expect(await accessControlRegistry.hasRole(role12, roles.manager.address)).to.equal(false);
      expect(await accessControlRegistry.hasRole(role12, account12)).to.equal(false);
      const calldatas = [
        accessControlRegistry.interface.encodeFunctionData('initializeRoleAndGrantToSender', [
          managerRootRole,
          description1,
        ]),
        accessControlRegistry.interface.encodeFunctionData('grantRole', [role1, account1]),
        accessControlRegistry.interface.encodeFunctionData('initializeRoleAndGrantToSender', [role1, description11]),
        accessControlRegistry.interface.encodeFunctionData('grantRole', [role11, account11]),
        accessControlRegistry.interface.encodeFunctionData('initializeRoleAndGrantToSender', [role1, description12]),
        accessControlRegistry.interface.encodeFunctionData('grantRole', [role12, account12]),
      ];
      await accessControlRegistry.connect(roles.manager).multicall(calldatas);
      expect(await accessControlRegistry.getRoleAdmin(role1)).to.equal(managerRootRole);
      expect(await accessControlRegistry.hasRole(role1, roles.manager.address)).to.equal(true);
      expect(await accessControlRegistry.hasRole(role1, account1)).to.equal(true);
      expect(await accessControlRegistry.getRoleAdmin(role11)).to.equal(role1);
      expect(await accessControlRegistry.hasRole(role11, roles.manager.address)).to.equal(true);
      expect(await accessControlRegistry.hasRole(role11, account11)).to.equal(true);
      expect(await accessControlRegistry.getRoleAdmin(role12)).to.equal(role1);
      expect(await accessControlRegistry.hasRole(role12, roles.manager.address)).to.equal(true);
      expect(await accessControlRegistry.hasRole(role12, account12)).to.equal(true);
    });
  });

  describe('tryMulticall', function () {
    it('tries to multicall', async function () {
      // Root role ---> role1 ---> role11
      //                       \
      //                        -> role12
      const { roles, accessControlRegistry, managerRootRole } = await helpers.loadFixture(deploy);
      const description1 = Math.random().toString();
      const role1 = testUtils.deriveRole(managerRootRole, description1);
      const account1 = testUtils.generateRandomAddress();
      const description11 = Math.random().toString();
      const role11 = testUtils.deriveRole(role1, description11);
      const account11 = testUtils.generateRandomAddress();
      const description12 = Math.random().toString();
      const role12 = testUtils.deriveRole(role1, description12);
      const account12 = testUtils.generateRandomAddress();
      expect(await accessControlRegistry.getRoleAdmin(role1)).to.equal(ethers.constants.HashZero);
      expect(await accessControlRegistry.hasRole(role1, roles.manager.address)).to.equal(false);
      expect(await accessControlRegistry.hasRole(role1, account1)).to.equal(false);
      expect(await accessControlRegistry.getRoleAdmin(role11)).to.equal(ethers.constants.HashZero);
      expect(await accessControlRegistry.hasRole(role11, roles.manager.address)).to.equal(false);
      expect(await accessControlRegistry.hasRole(role11, account11)).to.equal(false);
      expect(await accessControlRegistry.getRoleAdmin(role12)).to.equal(ethers.constants.HashZero);
      expect(await accessControlRegistry.hasRole(role12, roles.manager.address)).to.equal(false);
      expect(await accessControlRegistry.hasRole(role12, account12)).to.equal(false);
      const calldatas = [
        accessControlRegistry.interface.encodeFunctionData('initializeRoleAndGrantToSender', [
          managerRootRole,
          description1,
        ]),
        accessControlRegistry.interface.encodeFunctionData('grantRole', [role1, account1]),
        accessControlRegistry.interface.encodeFunctionData('initializeRoleAndGrantToSender', [role1, description11]),
        '0x', // This one will fail
        accessControlRegistry.interface.encodeFunctionData('grantRole', [role11, account11]),
        accessControlRegistry.interface.encodeFunctionData('initializeRoleAndGrantToSender', [role1, description12]),
        accessControlRegistry.interface.encodeFunctionData('grantRole', [role12, account12]),
      ];
      const { successes, returndata } = await accessControlRegistry
        .connect(roles.manager)
        .callStatic.tryMulticall(calldatas);
      expect(successes).to.deep.equal([true, true, true, false, true, true, true]);
      expect(returndata).to.deep.equal([role1, '0x', role11, '0x', '0x', role12, '0x']);
      await accessControlRegistry.connect(roles.manager).tryMulticall(calldatas);
      expect(await accessControlRegistry.getRoleAdmin(role1)).to.equal(managerRootRole);
      expect(await accessControlRegistry.hasRole(role1, roles.manager.address)).to.equal(true);
      expect(await accessControlRegistry.hasRole(role1, account1)).to.equal(true);
      expect(await accessControlRegistry.getRoleAdmin(role11)).to.equal(role1);
      expect(await accessControlRegistry.hasRole(role11, roles.manager.address)).to.equal(true);
      expect(await accessControlRegistry.hasRole(role11, account11)).to.equal(true);
      expect(await accessControlRegistry.getRoleAdmin(role12)).to.equal(role1);
      expect(await accessControlRegistry.hasRole(role12, roles.manager.address)).to.equal(true);
      expect(await accessControlRegistry.hasRole(role12, account12)).to.equal(true);
    });
  });

  describe('Meta-tx', function () {
    it('executes', async function () {
      const { roles, accessControlRegistry, managerRootRole, roleDescription, role } = await helpers.loadFixture(
        deploy
      );
      const expiringMetaTxDomain = await testUtils.expiringMetaTxDomain(accessControlRegistry);
      const expiringMetaTxTypes = testUtils.expiringMetaTxTypes();
      const latestTimestamp = await helpers.time.latest();
      const nextTimestamp = latestTimestamp + 1;
      await helpers.time.setNextBlockTimestamp(nextTimestamp);
      const expiringMetaTxValue = {
        from: roles.manager.address,
        to: accessControlRegistry.address,
        data: accessControlRegistry.interface.encodeFunctionData('initializeRoleAndGrantToSender', [
          managerRootRole,
          roleDescription,
        ]),
        expirationTimestamp: nextTimestamp + 60 * 60,
      };
      const signature = await roles.manager._signTypedData(
        expiringMetaTxDomain,
        expiringMetaTxTypes,
        expiringMetaTxValue
      );
      expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(false);
      expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(ethers.constants.HashZero);
      expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(false);
      await expect(accessControlRegistry.connect(roles.randomPerson).execute(expiringMetaTxValue, signature))
        .to.emit(accessControlRegistry, 'InitializedRole')
        .withArgs(role, managerRootRole, roleDescription, roles.manager.address);
      expect(await accessControlRegistry.hasRole(managerRootRole, roles.manager.address)).to.equal(true);
      expect(await accessControlRegistry.getRoleAdmin(role)).to.equal(managerRootRole);
      expect(await accessControlRegistry.hasRole(role, roles.manager.address)).to.equal(true);
    });
  });
});
