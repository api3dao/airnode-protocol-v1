const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('AllocatorWithManager', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      airnode: accounts[2],
      slotSetter: accounts[3],
      anotherSlotSetter: accounts[4],
      randomPerson: accounts[9],
    };
    const allocatorWithManagerAdminRoleDescription = 'AllocatorWithManager admin';
    const slotSetterRoleDescription = 'Slot setter';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const allocatorWithManagerFactory = await ethers.getContractFactory('AllocatorWithManager', roles.deployer);
    const allocatorWithManager = await allocatorWithManagerFactory.deploy(
      accessControlRegistry.address,
      allocatorWithManagerAdminRoleDescription,
      roles.manager.address
    );
    const managerRootRole = testUtils.deriveRootRole(roles.manager.address);
    const adminRole = testUtils.deriveRole(managerRootRole, allocatorWithManagerAdminRoleDescription);
    const slotSetterRole = testUtils.deriveRole(adminRole, slotSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, allocatorWithManagerAdminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, slotSetterRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(slotSetterRole, roles.slotSetter.address);
    await accessControlRegistry.connect(roles.manager).grantRole(slotSetterRole, roles.anotherSlotSetter.address);
    const slotIndex = Math.floor(Math.random() * 1000);
    const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
    const subscriptionId = testUtils.generateRandomBytes32();
    const anotherSubscriptionId = testUtils.generateRandomBytes32();
    return {
      roles,
      accessControlRegistry,
      allocatorWithManager,
      slotSetterRoleDescription,
      adminRole,
      slotSetterRole,
      slotIndex,
      expirationTimestamp,
      subscriptionId,
      anotherSubscriptionId,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { accessControlRegistry, allocatorWithManager, slotSetterRoleDescription, slotSetterRole } =
        await helpers.loadFixture(deploy);
      expect(await allocatorWithManager.SLOT_SETTER_ROLE_DESCRIPTION()).to.equal(slotSetterRoleDescription);
      expect(await allocatorWithManager.slotSetterRole()).to.equal(slotSetterRole);
      expect(await allocatorWithManager.isTrustedForwarder(accessControlRegistry.address)).to.equal(true);
    });
  });

  describe('setSlot', function () {
    context('Sender has slot setter role', function () {
      context('Expiration is in the future', function () {
        context('Slot has not been set before', function () {
          it('sets slot', async function () {
            const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            const slotBefore = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slotBefore.subscriptionId).to.equal(ethers.constants.HashZero);
            expect(slotBefore.setter).to.equal(ethers.constants.AddressZero);
            expect(slotBefore.expirationTimestamp).to.equal(0);
            await expect(
              allocatorWithManager
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
            )
              .to.emit(allocatorWithManager, 'SetSlot')
              .withArgs(
                roles.airnode.address,
                slotIndex,
                subscriptionId,
                expirationTimestamp,
                roles.slotSetter.address
              );
            const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slot.subscriptionId).to.equal(subscriptionId);
            expect(slot.setter).to.equal(roles.slotSetter.address);
            expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
          });
        });
        context('Slot has been set before', function () {
          context('Previous slot setter is the sender', function () {
            it('sets slot', async function () {
              const {
                roles,
                allocatorWithManager,
                slotIndex,
                expirationTimestamp,
                subscriptionId,
                anotherSubscriptionId,
              } = await helpers.loadFixture(deploy);
              await allocatorWithManager
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await expect(
                allocatorWithManager
                  .connect(roles.slotSetter)
                  .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
              )
                .to.emit(allocatorWithManager, 'SetSlot')
                .withArgs(
                  roles.airnode.address,
                  slotIndex,
                  subscriptionId,
                  expirationTimestamp,
                  roles.slotSetter.address
                );
              const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
              expect(slot.subscriptionId).to.equal(subscriptionId);
              expect(slot.setter).to.equal(roles.slotSetter.address);
              expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
            });
          });
          context('Previous slot setter is not the sender', function () {
            context('Previous slot setting has expired', function () {
              it('sets slot', async function () {
                const {
                  roles,
                  allocatorWithManager,
                  slotIndex,
                  expirationTimestamp,
                  subscriptionId,
                  anotherSubscriptionId,
                } = await helpers.loadFixture(deploy);
                const currentTimestamp = await helpers.time.latest();
                const firstSlotSetExpiresAt = currentTimestamp + 60;
                const secondSlotIsSetAt = firstSlotSetExpiresAt + 60;
                await allocatorWithManager
                  .connect(roles.anotherSlotSetter)
                  .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, firstSlotSetExpiresAt);
                await helpers.time.setNextBlockTimestamp(secondSlotIsSetAt);
                await expect(
                  allocatorWithManager
                    .connect(roles.slotSetter)
                    .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                )
                  .to.emit(allocatorWithManager, 'SetSlot')
                  .withArgs(
                    roles.airnode.address,
                    slotIndex,
                    subscriptionId,
                    expirationTimestamp,
                    roles.slotSetter.address
                  );
                const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
                expect(slot.subscriptionId).to.equal(subscriptionId);
                expect(slot.setter).to.equal(roles.slotSetter.address);
                expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
              });
            });
            context('Previous slot setting has not expired', function () {
              context('Previous slot setter can no longer set slots', function () {
                it('sets slot', async function () {
                  const {
                    roles,
                    accessControlRegistry,
                    allocatorWithManager,
                    slotSetterRole,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithManager
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await accessControlRegistry
                    .connect(roles.manager)
                    .revokeRole(slotSetterRole, roles.anotherSlotSetter.address);
                  await expect(
                    allocatorWithManager
                      .connect(roles.slotSetter)
                      .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                  )
                    .to.emit(allocatorWithManager, 'SetSlot')
                    .withArgs(
                      roles.airnode.address,
                      slotIndex,
                      subscriptionId,
                      expirationTimestamp,
                      roles.slotSetter.address
                    );
                  const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
                  expect(slot.subscriptionId).to.equal(subscriptionId);
                  expect(slot.setter).to.equal(roles.slotSetter.address);
                  expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
                });
              });
              context('Previous slot setter can still set slots', function () {
                it('reverts', async function () {
                  const {
                    roles,
                    allocatorWithManager,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithManager
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await expect(
                    allocatorWithManager
                      .connect(roles.slotSetter)
                      .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                  ).to.be.revertedWith('Cannot reset slot');
                });
              });
            });
          });
        });
      });
      context('Expiration is not in the future', function () {
        it('reverts', async function () {
          const { roles, allocatorWithManager, slotIndex, subscriptionId } = await helpers.loadFixture(deploy);
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          await expect(
            allocatorWithManager
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, nextTimestamp)
          ).to.be.revertedWith('Expiration not in future');
        });
      });
    });
    context('Sender is the manager', function () {
      context('Expiration is not in the past', function () {
        context('Slot has not been set before', function () {
          it('sets slot', async function () {
            const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            const slotBefore = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slotBefore.subscriptionId).to.equal(ethers.constants.HashZero);
            expect(slotBefore.setter).to.equal(ethers.constants.AddressZero);
            expect(slotBefore.expirationTimestamp).to.equal(0);
            await expect(
              allocatorWithManager
                .connect(roles.manager)
                .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
            )
              .to.emit(allocatorWithManager, 'SetSlot')
              .withArgs(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp, roles.manager.address);
            const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slot.subscriptionId).to.equal(subscriptionId);
            expect(slot.setter).to.equal(roles.manager.address);
            expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
          });
        });
        context('Slot has been set before', function () {
          context('Previous slot setter is the sender', function () {
            it('sets slot', async function () {
              const {
                roles,
                allocatorWithManager,
                slotIndex,
                expirationTimestamp,
                subscriptionId,
                anotherSubscriptionId,
              } = await helpers.loadFixture(deploy);
              await allocatorWithManager
                .connect(roles.manager)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await expect(
                allocatorWithManager
                  .connect(roles.manager)
                  .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
              )
                .to.emit(allocatorWithManager, 'SetSlot')
                .withArgs(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp, roles.manager.address);
              const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
              expect(slot.subscriptionId).to.equal(subscriptionId);
              expect(slot.setter).to.equal(roles.manager.address);
              expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
            });
          });
          context('Previous slot setter is not the sender', function () {
            context('Previous slot has expired', function () {
              it('sets slot', async function () {
                const {
                  roles,
                  allocatorWithManager,
                  slotIndex,
                  expirationTimestamp,
                  subscriptionId,
                  anotherSubscriptionId,
                } = await helpers.loadFixture(deploy);
                const currentTimestamp = await helpers.time.latest();
                const firstSlotSetExpiresAt = currentTimestamp + 60;
                const secondSlotIsSetAt = firstSlotSetExpiresAt + 60;
                await allocatorWithManager
                  .connect(roles.anotherSlotSetter)
                  .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, firstSlotSetExpiresAt);
                await helpers.time.setNextBlockTimestamp(secondSlotIsSetAt);
                await expect(
                  allocatorWithManager
                    .connect(roles.manager)
                    .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                )
                  .to.emit(allocatorWithManager, 'SetSlot')
                  .withArgs(
                    roles.airnode.address,
                    slotIndex,
                    subscriptionId,
                    expirationTimestamp,
                    roles.manager.address
                  );
                const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
                expect(slot.subscriptionId).to.equal(subscriptionId);
                expect(slot.setter).to.equal(roles.manager.address);
                expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
              });
            });
            context('Previous slot has not expired', function () {
              context('Previous slot setter can no longer set slots', function () {
                it('sets slot', async function () {
                  const {
                    roles,
                    accessControlRegistry,
                    allocatorWithManager,
                    slotSetterRole,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithManager
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await accessControlRegistry
                    .connect(roles.manager)
                    .revokeRole(slotSetterRole, roles.anotherSlotSetter.address);
                  await expect(
                    allocatorWithManager
                      .connect(roles.manager)
                      .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                  )
                    .to.emit(allocatorWithManager, 'SetSlot')
                    .withArgs(
                      roles.airnode.address,
                      slotIndex,
                      subscriptionId,
                      expirationTimestamp,
                      roles.manager.address
                    );
                  const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
                  expect(slot.subscriptionId).to.equal(subscriptionId);
                  expect(slot.setter).to.equal(roles.manager.address);
                  expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
                });
              });
              context('Previous slot setter can still set slots', function () {
                it('reverts', async function () {
                  const {
                    roles,
                    allocatorWithManager,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithManager
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await expect(
                    allocatorWithManager
                      .connect(roles.manager)
                      .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                  ).to.be.revertedWith('Cannot reset slot');
                });
              });
            });
          });
        });
      });
      context('Expiration is not in the future', function () {
        it('reverts', async function () {
          const { roles, allocatorWithManager, slotIndex, subscriptionId } = await helpers.loadFixture(deploy);
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          await expect(
            allocatorWithManager
              .connect(roles.manager)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, nextTimestamp)
          ).to.be.revertedWith('Expiration not in future');
        });
      });
    });
    context('Sender does not have the slot setter role and is not the manager', function () {
      it('reverts', async function () {
        const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
          await helpers.loadFixture(deploy);
        await expect(
          allocatorWithManager
            .connect(roles.randomPerson)
            .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
        ).to.be.revertedWith('Sender cannot set slot');
      });
    });
  });

  describe('resetSlot', function () {
    context('Slot has been set before', function () {
      context('Previous slot setter is the sender', function () {
        it('resets slot', async function () {
          const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
            await helpers.loadFixture(deploy);
          await allocatorWithManager
            .connect(roles.slotSetter)
            .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
          await expect(allocatorWithManager.connect(roles.slotSetter).resetSlot(roles.airnode.address, slotIndex))
            .to.emit(allocatorWithManager, 'ResetSlot')
            .withArgs(roles.airnode.address, slotIndex, roles.slotSetter.address);
          const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
          expect(slot.subscriptionId).to.equal(ethers.constants.HashZero);
          expect(slot.setter).to.equal(ethers.constants.AddressZero);
          expect(slot.expirationTimestamp).to.equal(0);
        });
      });
      context('Previous slot setter is not the sender', function () {
        context('Previous slot has expired', function () {
          it('sets slot', async function () {
            const { roles, allocatorWithManager, slotIndex, subscriptionId } = await helpers.loadFixture(deploy);
            const currentTimestamp = await helpers.time.latest();
            const firstSlotSetExpiresAt = currentTimestamp + 60;
            await allocatorWithManager
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, firstSlotSetExpiresAt);
            await helpers.time.setNextBlockTimestamp(firstSlotSetExpiresAt);
            await expect(allocatorWithManager.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex))
              .to.emit(allocatorWithManager, 'ResetSlot')
              .withArgs(roles.airnode.address, slotIndex, roles.randomPerson.address);
            const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slot.subscriptionId).to.equal(ethers.constants.HashZero);
            expect(slot.setter).to.equal(ethers.constants.AddressZero);
            expect(slot.expirationTimestamp).to.equal(0);
          });
        });
        context('Previous slot has not expired', function () {
          context('Previous slot setter can no longer set slots', function () {
            it('resets slot', async function () {
              const {
                roles,
                accessControlRegistry,
                allocatorWithManager,
                slotSetterRole,
                slotIndex,
                expirationTimestamp,
                anotherSubscriptionId,
              } = await helpers.loadFixture(deploy);
              await allocatorWithManager
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await accessControlRegistry.connect(roles.manager).revokeRole(slotSetterRole, roles.slotSetter.address);
              await expect(allocatorWithManager.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex))
                .to.emit(allocatorWithManager, 'ResetSlot')
                .withArgs(roles.airnode.address, slotIndex, roles.randomPerson.address);
              const slot = await allocatorWithManager.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
              expect(slot.subscriptionId).to.equal(ethers.constants.HashZero);
              expect(slot.setter).to.equal(ethers.constants.AddressZero);
              expect(slot.expirationTimestamp).to.equal(0);
            });
          });
          context('Previous slot setter can still set slots', function () {
            it('reverts', async function () {
              const { roles, allocatorWithManager, slotIndex, expirationTimestamp, anotherSubscriptionId } =
                await helpers.loadFixture(deploy);
              await allocatorWithManager
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await expect(
                allocatorWithManager.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex)
              ).to.be.revertedWith('Cannot reset slot');
            });
          });
        });
      });
    });
    context('Slot has not been set before', function () {
      it('does nothing', async function () {
        const { roles, allocatorWithManager, slotIndex } = await helpers.loadFixture(deploy);
        await expect(
          allocatorWithManager.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex)
        ).to.not.emit(allocatorWithManager, 'ResetSlot');
      });
    });
  });

  describe('slotCanBeResetByAccount', function () {
    context('Slot is set by the account', function () {
      it('returns true', async function () {
        const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
          await helpers.loadFixture(deploy);
        await allocatorWithManager
          .connect(roles.slotSetter)
          .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
        expect(
          await allocatorWithManager.slotCanBeResetByAccount(roles.airnode.address, slotIndex, roles.slotSetter.address)
        ).to.equal(true);
      });
    });
    context('Slot is not set by the account', function () {
      context('Slot has not expired', function () {
        context('Setter of the slot is the manager', function () {
          it('returns false', async function () {
            const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            await allocatorWithManager
              .connect(roles.manager)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
            expect(
              await allocatorWithManager.slotCanBeResetByAccount(
                roles.airnode.address,
                slotIndex,
                roles.randomPerson.address
              )
            ).to.equal(false);
          });
        });
        context('Setter of the slot is still a slot setter', function () {
          it('returns false', async function () {
            const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            await allocatorWithManager
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
            expect(
              await allocatorWithManager.slotCanBeResetByAccount(
                roles.airnode.address,
                slotIndex,
                roles.randomPerson.address
              )
            ).to.equal(false);
          });
        });
        context('Setter of the slot is no longer a slot setter', function () {
          it('returns true', async function () {
            const {
              roles,
              accessControlRegistry,
              allocatorWithManager,
              slotSetterRole,
              slotIndex,
              expirationTimestamp,
              subscriptionId,
            } = await helpers.loadFixture(deploy);
            await allocatorWithManager
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
            await accessControlRegistry.connect(roles.manager).revokeRole(slotSetterRole, roles.slotSetter.address);
            expect(
              await allocatorWithManager.slotCanBeResetByAccount(
                roles.airnode.address,
                slotIndex,
                roles.randomPerson.address
              )
            ).to.equal(true);
          });
        });
      });
      context('Slot has expired', function () {
        it('returns true', async function () {
          const { roles, allocatorWithManager, slotIndex, expirationTimestamp, subscriptionId } =
            await helpers.loadFixture(deploy);
          await allocatorWithManager
            .connect(roles.slotSetter)
            .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
          await helpers.time.increaseTo(expirationTimestamp);
          expect(
            await allocatorWithManager.slotCanBeResetByAccount(
              roles.airnode.address,
              slotIndex,
              roles.randomPerson.address
            )
          ).to.equal(true);
        });
      });
    });
  });

  describe('hasSlotSetterRoleOrIsManager', function () {
    context('Has slot setter role', function () {
      it('returns true', async function () {
        const { roles, allocatorWithManager } = await helpers.loadFixture(deploy);
        expect(await allocatorWithManager.hasSlotSetterRoleOrIsManager(roles.slotSetter.address)).to.equal(true);
      });
    });
    context('Is the manager address', function () {
      it('returns true', async function () {
        const { roles, allocatorWithManager } = await helpers.loadFixture(deploy);
        expect(await allocatorWithManager.hasSlotSetterRoleOrIsManager(roles.manager.address)).to.equal(true);
      });
    });
    context('Does not have the slot setter role or is the manager address', function () {
      it('returns false', async function () {
        const { roles, allocatorWithManager } = await helpers.loadFixture(deploy);
        expect(await allocatorWithManager.hasSlotSetterRoleOrIsManager(roles.randomPerson.address)).to.equal(false);
      });
    });
  });
});
