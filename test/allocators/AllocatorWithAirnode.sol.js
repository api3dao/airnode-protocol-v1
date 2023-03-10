const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('AllocatorWithAirnode', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      airnode: accounts[1],
      slotSetter: accounts[2],
      anotherSlotSetter: accounts[3],
      randomPerson: accounts[9],
    };
    const allocatorWithAirnodeAdminRoleDescription = 'AllocatorWithAirnode admin';
    const slotSetterRoleDescription = 'Slot setter';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const allocatorWithAirnodeFactory = await ethers.getContractFactory('AllocatorWithAirnode', roles.deployer);
    const allocatorWithAirnode = await allocatorWithAirnodeFactory.deploy(
      accessControlRegistry.address,
      allocatorWithAirnodeAdminRoleDescription
    );
    const airnodeRootRole = testUtils.deriveRootRole(roles.airnode.address);
    const airnodeAdminRole = testUtils.deriveRole(airnodeRootRole, allocatorWithAirnodeAdminRoleDescription);
    const airnodeSlotSetterRole = testUtils.deriveRole(airnodeAdminRole, slotSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .initializeRoleAndGrantToSender(airnodeRootRole, allocatorWithAirnodeAdminRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .initializeRoleAndGrantToSender(airnodeAdminRole, slotSetterRoleDescription);
    await accessControlRegistry.connect(roles.airnode).grantRole(airnodeSlotSetterRole, roles.slotSetter.address);
    await accessControlRegistry
      .connect(roles.airnode)
      .grantRole(airnodeSlotSetterRole, roles.anotherSlotSetter.address);
    const slotIndex = Math.floor(Math.random() * 1000);
    const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
    const subscriptionId = testUtils.generateRandomBytes32();
    const anotherSubscriptionId = testUtils.generateRandomBytes32();
    return {
      roles,
      accessControlRegistry,
      allocatorWithAirnode,
      slotSetterRoleDescription,
      airnodeAdminRole,
      airnodeSlotSetterRole,
      slotIndex,
      expirationTimestamp,
      subscriptionId,
      anotherSubscriptionId,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { accessControlRegistry, allocatorWithAirnode, slotSetterRoleDescription } = await helpers.loadFixture(
        deploy
      );
      expect(await allocatorWithAirnode.SLOT_SETTER_ROLE_DESCRIPTION()).to.equal(slotSetterRoleDescription);
      expect(await allocatorWithAirnode.isTrustedForwarder(accessControlRegistry.address)).to.equal(true);
    });
  });

  describe('setSlot', function () {
    context('Sender has slot setter role', function () {
      context('Expiration is in the future', function () {
        context('Slot has not been set before', function () {
          it('sets slot', async function () {
            const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            const slotBefore = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slotBefore.subscriptionId).to.equal(ethers.constants.HashZero);
            expect(slotBefore.setter).to.equal(ethers.constants.AddressZero);
            expect(slotBefore.expirationTimestamp).to.equal(0);
            await expect(
              allocatorWithAirnode
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
            )
              .to.emit(allocatorWithAirnode, 'SetSlot')
              .withArgs(
                roles.airnode.address,
                slotIndex,
                subscriptionId,
                expirationTimestamp,
                roles.slotSetter.address
              );
            const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
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
                allocatorWithAirnode,
                slotIndex,
                expirationTimestamp,
                subscriptionId,
                anotherSubscriptionId,
              } = await helpers.loadFixture(deploy);
              await allocatorWithAirnode
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await expect(
                allocatorWithAirnode
                  .connect(roles.slotSetter)
                  .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
              )
                .to.emit(allocatorWithAirnode, 'SetSlot')
                .withArgs(
                  roles.airnode.address,
                  slotIndex,
                  subscriptionId,
                  expirationTimestamp,
                  roles.slotSetter.address
                );
              const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
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
                  allocatorWithAirnode,
                  slotIndex,
                  expirationTimestamp,
                  subscriptionId,
                  anotherSubscriptionId,
                } = await helpers.loadFixture(deploy);
                const currentTimestamp = await helpers.time.latest();
                const firstSlotSetExpiresAt = currentTimestamp + 60;
                const secondSlotIsSetAt = firstSlotSetExpiresAt + 60;
                await allocatorWithAirnode
                  .connect(roles.anotherSlotSetter)
                  .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, firstSlotSetExpiresAt);
                await helpers.time.setNextBlockTimestamp(secondSlotIsSetAt);
                await expect(
                  allocatorWithAirnode
                    .connect(roles.slotSetter)
                    .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                )
                  .to.emit(allocatorWithAirnode, 'SetSlot')
                  .withArgs(
                    roles.airnode.address,
                    slotIndex,
                    subscriptionId,
                    expirationTimestamp,
                    roles.slotSetter.address
                  );
                const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
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
                    allocatorWithAirnode,
                    airnodeSlotSetterRole,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithAirnode
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await accessControlRegistry
                    .connect(roles.airnode)
                    .revokeRole(airnodeSlotSetterRole, roles.anotherSlotSetter.address);
                  await expect(
                    allocatorWithAirnode
                      .connect(roles.slotSetter)
                      .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                  )
                    .to.emit(allocatorWithAirnode, 'SetSlot')
                    .withArgs(
                      roles.airnode.address,
                      slotIndex,
                      subscriptionId,
                      expirationTimestamp,
                      roles.slotSetter.address
                    );
                  const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
                  expect(slot.subscriptionId).to.equal(subscriptionId);
                  expect(slot.setter).to.equal(roles.slotSetter.address);
                  expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
                });
              });
              context('Previous slot setter can still set slots', function () {
                it('reverts', async function () {
                  const {
                    roles,
                    allocatorWithAirnode,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithAirnode
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await expect(
                    allocatorWithAirnode
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
          const { roles, allocatorWithAirnode, slotIndex, subscriptionId } = await helpers.loadFixture(deploy);
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          await expect(
            allocatorWithAirnode
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, nextTimestamp)
          ).to.be.revertedWith('Expiration not in future');
        });
      });
    });
    context('Sender is the Airnode address', function () {
      context('Expiration is not in the past', function () {
        context('Slot has not been set before', function () {
          it('sets slot', async function () {
            const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            const slotBefore = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slotBefore.subscriptionId).to.equal(ethers.constants.HashZero);
            expect(slotBefore.setter).to.equal(ethers.constants.AddressZero);
            expect(slotBefore.expirationTimestamp).to.equal(0);
            await expect(
              allocatorWithAirnode
                .connect(roles.airnode)
                .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
            )
              .to.emit(allocatorWithAirnode, 'SetSlot')
              .withArgs(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp, roles.airnode.address);
            const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
            expect(slot.subscriptionId).to.equal(subscriptionId);
            expect(slot.setter).to.equal(roles.airnode.address);
            expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
          });
        });
        context('Slot has been set before', function () {
          context('Previous slot setter is the sender', function () {
            it('sets slot', async function () {
              const {
                roles,
                allocatorWithAirnode,
                slotIndex,
                expirationTimestamp,
                subscriptionId,
                anotherSubscriptionId,
              } = await helpers.loadFixture(deploy);
              await allocatorWithAirnode
                .connect(roles.airnode)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await expect(
                allocatorWithAirnode
                  .connect(roles.airnode)
                  .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
              )
                .to.emit(allocatorWithAirnode, 'SetSlot')
                .withArgs(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp, roles.airnode.address);
              const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
              expect(slot.subscriptionId).to.equal(subscriptionId);
              expect(slot.setter).to.equal(roles.airnode.address);
              expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
            });
          });
          context('Previous slot setter is not the sender', function () {
            context('Previous slot has expired', function () {
              it('sets slot', async function () {
                const {
                  roles,
                  allocatorWithAirnode,
                  slotIndex,
                  expirationTimestamp,
                  subscriptionId,
                  anotherSubscriptionId,
                } = await helpers.loadFixture(deploy);
                const currentTimestamp = await helpers.time.latest();
                const firstSlotSetExpiresAt = currentTimestamp + 60;
                const secondSlotIsSetAt = firstSlotSetExpiresAt + 60;
                await allocatorWithAirnode
                  .connect(roles.anotherSlotSetter)
                  .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, firstSlotSetExpiresAt);
                await helpers.time.setNextBlockTimestamp(secondSlotIsSetAt);
                await expect(
                  allocatorWithAirnode
                    .connect(roles.airnode)
                    .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                )
                  .to.emit(allocatorWithAirnode, 'SetSlot')
                  .withArgs(
                    roles.airnode.address,
                    slotIndex,
                    subscriptionId,
                    expirationTimestamp,
                    roles.airnode.address
                  );
                const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
                expect(slot.subscriptionId).to.equal(subscriptionId);
                expect(slot.setter).to.equal(roles.airnode.address);
                expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
              });
            });
            context('Previous slot has not expired', function () {
              context('Previous slot setter can no longer set slots', function () {
                it('sets slot', async function () {
                  const {
                    roles,
                    accessControlRegistry,
                    allocatorWithAirnode,
                    airnodeSlotSetterRole,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithAirnode
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await accessControlRegistry
                    .connect(roles.airnode)
                    .revokeRole(airnodeSlotSetterRole, roles.anotherSlotSetter.address);
                  await expect(
                    allocatorWithAirnode
                      .connect(roles.airnode)
                      .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp)
                  )
                    .to.emit(allocatorWithAirnode, 'SetSlot')
                    .withArgs(
                      roles.airnode.address,
                      slotIndex,
                      subscriptionId,
                      expirationTimestamp,
                      roles.airnode.address
                    );
                  const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
                  expect(slot.subscriptionId).to.equal(subscriptionId);
                  expect(slot.setter).to.equal(roles.airnode.address);
                  expect(slot.expirationTimestamp).to.equal(expirationTimestamp);
                });
              });
              context('Previous slot setter can still set slots', function () {
                it('reverts', async function () {
                  const {
                    roles,
                    allocatorWithAirnode,
                    slotIndex,
                    expirationTimestamp,
                    subscriptionId,
                    anotherSubscriptionId,
                  } = await helpers.loadFixture(deploy);
                  await allocatorWithAirnode
                    .connect(roles.anotherSlotSetter)
                    .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
                  await expect(
                    allocatorWithAirnode
                      .connect(roles.airnode)
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
          const { roles, allocatorWithAirnode, slotIndex, subscriptionId } = await helpers.loadFixture(deploy);
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          await expect(
            allocatorWithAirnode
              .connect(roles.airnode)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, nextTimestamp)
          ).to.be.revertedWith('Expiration not in future');
        });
      });
    });
    context('Sender does not have the slot setter role and is not the Airnode address', function () {
      it('reverts', async function () {
        const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
          await helpers.loadFixture(deploy);
        await expect(
          allocatorWithAirnode
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
          const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
            await helpers.loadFixture(deploy);
          await allocatorWithAirnode
            .connect(roles.slotSetter)
            .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
          await expect(allocatorWithAirnode.connect(roles.slotSetter).resetSlot(roles.airnode.address, slotIndex))
            .to.emit(allocatorWithAirnode, 'ResetSlot')
            .withArgs(roles.airnode.address, slotIndex, roles.slotSetter.address);
          const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
          expect(slot.subscriptionId).to.equal(ethers.constants.HashZero);
          expect(slot.setter).to.equal(ethers.constants.AddressZero);
          expect(slot.expirationTimestamp).to.equal(0);
        });
      });
      context('Previous slot setter is not the sender', function () {
        context('Previous slot has expired', function () {
          it('sets slot', async function () {
            const { roles, allocatorWithAirnode, slotIndex, subscriptionId } = await helpers.loadFixture(deploy);
            const currentTimestamp = await helpers.time.latest();
            const firstSlotSetExpiresAt = currentTimestamp + 60;
            await allocatorWithAirnode
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, firstSlotSetExpiresAt);
            await helpers.time.setNextBlockTimestamp(firstSlotSetExpiresAt);
            await expect(allocatorWithAirnode.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex))
              .to.emit(allocatorWithAirnode, 'ResetSlot')
              .withArgs(roles.airnode.address, slotIndex, roles.randomPerson.address);
            const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
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
                allocatorWithAirnode,
                airnodeSlotSetterRole,
                slotIndex,
                expirationTimestamp,
                anotherSubscriptionId,
              } = await helpers.loadFixture(deploy);
              await allocatorWithAirnode
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await accessControlRegistry
                .connect(roles.airnode)
                .revokeRole(airnodeSlotSetterRole, roles.slotSetter.address);
              await expect(allocatorWithAirnode.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex))
                .to.emit(allocatorWithAirnode, 'ResetSlot')
                .withArgs(roles.airnode.address, slotIndex, roles.randomPerson.address);
              const slot = await allocatorWithAirnode.airnodeToSlotIndexToSlot(roles.airnode.address, slotIndex);
              expect(slot.subscriptionId).to.equal(ethers.constants.HashZero);
              expect(slot.setter).to.equal(ethers.constants.AddressZero);
              expect(slot.expirationTimestamp).to.equal(0);
            });
          });
          context('Previous slot setter can still set slots', function () {
            it('reverts', async function () {
              const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, anotherSubscriptionId } =
                await helpers.loadFixture(deploy);
              await allocatorWithAirnode
                .connect(roles.slotSetter)
                .setSlot(roles.airnode.address, slotIndex, anotherSubscriptionId, expirationTimestamp);
              await expect(
                allocatorWithAirnode.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex)
              ).to.be.revertedWith('Cannot reset slot');
            });
          });
        });
      });
    });
    context('Slot has not been set before', function () {
      it('does nothing', async function () {
        const { roles, allocatorWithAirnode, slotIndex } = await helpers.loadFixture(deploy);
        await expect(
          allocatorWithAirnode.connect(roles.randomPerson).resetSlot(roles.airnode.address, slotIndex)
        ).to.not.emit(allocatorWithAirnode, 'ResetSlot');
      });
    });
  });

  describe('slotCanBeResetByAccount', function () {
    context('Slot is set by the account', function () {
      it('returns true', async function () {
        const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
          await helpers.loadFixture(deploy);
        await allocatorWithAirnode
          .connect(roles.slotSetter)
          .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
        expect(
          await allocatorWithAirnode.slotCanBeResetByAccount(roles.airnode.address, slotIndex, roles.slotSetter.address)
        ).to.equal(true);
      });
    });
    context('Slot is not set by the account', function () {
      context('Slot has not expired', function () {
        context('Setter of the slot is the Airnode address', function () {
          it('returns false', async function () {
            const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            await allocatorWithAirnode
              .connect(roles.airnode)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
            expect(
              await allocatorWithAirnode.slotCanBeResetByAccount(
                roles.airnode.address,
                slotIndex,
                roles.randomPerson.address
              )
            ).to.equal(false);
          });
        });
        context('Setter of the slot is still a slot setter', function () {
          it('returns false', async function () {
            const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
              await helpers.loadFixture(deploy);
            await allocatorWithAirnode
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
            expect(
              await allocatorWithAirnode.slotCanBeResetByAccount(
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
              allocatorWithAirnode,
              airnodeSlotSetterRole,
              slotIndex,
              expirationTimestamp,
              subscriptionId,
            } = await helpers.loadFixture(deploy);
            await allocatorWithAirnode
              .connect(roles.slotSetter)
              .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
            await accessControlRegistry
              .connect(roles.airnode)
              .revokeRole(airnodeSlotSetterRole, roles.slotSetter.address);
            expect(
              await allocatorWithAirnode.slotCanBeResetByAccount(
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
          const { roles, allocatorWithAirnode, slotIndex, expirationTimestamp, subscriptionId } =
            await helpers.loadFixture(deploy);
          await allocatorWithAirnode
            .connect(roles.slotSetter)
            .setSlot(roles.airnode.address, slotIndex, subscriptionId, expirationTimestamp);
          await helpers.time.increaseTo(expirationTimestamp);
          expect(
            await allocatorWithAirnode.slotCanBeResetByAccount(
              roles.airnode.address,
              slotIndex,
              roles.randomPerson.address
            )
          ).to.equal(true);
        });
      });
    });
  });

  describe('hasSlotSetterRoleOrIsAirnode', function () {
    context('Has slot setter role', function () {
      it('returns true', async function () {
        const { roles, allocatorWithAirnode } = await helpers.loadFixture(deploy);
        expect(
          await allocatorWithAirnode.hasSlotSetterRoleOrIsAirnode(roles.airnode.address, roles.slotSetter.address)
        ).to.equal(true);
      });
    });
    context('Is the Airnode address', function () {
      it('returns true', async function () {
        const { roles, allocatorWithAirnode } = await helpers.loadFixture(deploy);
        expect(
          await allocatorWithAirnode.hasSlotSetterRoleOrIsAirnode(roles.airnode.address, roles.airnode.address)
        ).to.equal(true);
      });
    });
    context('Does not have the slot setter role or is the Airnode address', function () {
      it('returns false', async function () {
        const { roles, allocatorWithAirnode } = await helpers.loadFixture(deploy);
        expect(
          await allocatorWithAirnode.hasSlotSetterRoleOrIsAirnode(roles.airnode.address, roles.randomPerson.address)
        ).to.equal(false);
      });
    });
  });

  describe('deriveAdminRole', function () {
    it('derives admin role', async function () {
      const { roles, allocatorWithAirnode, airnodeAdminRole } = await helpers.loadFixture(deploy);
      expect(await allocatorWithAirnode.deriveAdminRole(roles.airnode.address)).to.equal(airnodeAdminRole);
    });
  });

  describe('deriveSlotSetterRole', function () {
    it('derives slot setter role', async function () {
      const { roles, allocatorWithAirnode, airnodeSlotSetterRole } = await helpers.loadFixture(deploy);
      expect(await allocatorWithAirnode.deriveSlotSetterRole(roles.airnode.address)).to.equal(airnodeSlotSetterRole);
    });
  });
});
