const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('RequesterAuthorizerWithManager', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      authorizationExpirationExtender: accounts[2],
      authorizationExpirationSetter: accounts[3],
      indefiniteAuthorizer: accounts[4],
      anotherIndefiniteAuthorizer: accounts[5],
      airnode: accounts[6],
      requester: accounts[7],
      randomPerson: accounts[9],
    };
    const adminRoleDescription = 'RequesterAuthorizerWithManager admin';
    const authorizationExpirationExtenderRoleDescription = 'Authorization expiration extender';
    const authorizationExpirationSetterRoleDescription = 'Authorization expiration setter';
    const indefiniteAuthorizerRoleDescription = 'Indefinite authorizer';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const requesterAuthorizerWithManagerFactory = await ethers.getContractFactory(
      'RequesterAuthorizerWithManager',
      roles.deployer
    );
    const requesterAuthorizerWithManager = await requesterAuthorizerWithManagerFactory.deploy(
      accessControlRegistry.address,
      adminRoleDescription,
      roles.manager.address
    );
    const rootRole = testUtils.deriveRootRole(roles.manager.address);
    const adminRole = testUtils.deriveRole(rootRole, adminRoleDescription);
    const authorizationExpirationExtenderRole = testUtils.deriveRole(
      adminRole,
      authorizationExpirationExtenderRoleDescription
    );
    const authorizationExpirationSetterRole = testUtils.deriveRole(
      adminRole,
      authorizationExpirationSetterRoleDescription
    );
    const indefiniteAuthorizerRole = testUtils.deriveRole(adminRole, indefiniteAuthorizerRoleDescription);
    await accessControlRegistry.connect(roles.manager).initializeRoleAndGrantToSender(rootRole, adminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, authorizationExpirationExtenderRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, authorizationExpirationSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, indefiniteAuthorizerRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(authorizationExpirationExtenderRole, roles.authorizationExpirationExtender.address);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(authorizationExpirationSetterRole, roles.authorizationExpirationSetter.address);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(indefiniteAuthorizerRole, roles.anotherIndefiniteAuthorizer.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(adminRole, roles.manager.address);
    await accessControlRegistry
      .connect(roles.manager)
      .renounceRole(authorizationExpirationExtenderRole, roles.manager.address);
    await accessControlRegistry
      .connect(roles.manager)
      .renounceRole(authorizationExpirationSetterRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(indefiniteAuthorizerRole, roles.manager.address);
    return {
      roles,
      accessControlRegistry,
      requesterAuthorizerWithManager,
      adminRoleDescription,
      adminRole,
      authorizationExpirationExtenderRole,
      authorizationExpirationSetterRole,
      indefiniteAuthorizerRole,
    };
  }

  describe('constructor', function () {
    context('AccessControlRegistry address is not zero', function () {
      context('Admin role description string is not empty', function () {
        context('Manager address is not zero', function () {
          it('constructs', async function () {
            const { roles, accessControlRegistry, requesterAuthorizerWithManager, adminRoleDescription } =
              await helpers.loadFixture(deploy);
            expect(await requesterAuthorizerWithManager.accessControlRegistry()).to.equal(
              accessControlRegistry.address
            );
            expect(await requesterAuthorizerWithManager.adminRoleDescription()).to.equal(adminRoleDescription);
            expect(await requesterAuthorizerWithManager.manager()).to.equal(roles.manager.address);
          });
        });
        context('Manager address is zero', function () {
          it('reverts', async function () {
            const { roles, accessControlRegistry, adminRoleDescription } = await helpers.loadFixture(deploy);
            const requesterAuthorizerWithManagerFactory = await ethers.getContractFactory(
              'RequesterAuthorizerWithManager',
              roles.deployer
            );
            await expect(
              requesterAuthorizerWithManagerFactory.deploy(
                accessControlRegistry.address,
                adminRoleDescription,
                ethers.constants.AddressZero
              )
            ).to.be.revertedWith('Manager address zero');
          });
        });
      });
      context('Admin role description string is empty', function () {
        it('reverts', async function () {
          const { roles, accessControlRegistry } = await helpers.loadFixture(deploy);
          const requesterAuthorizerWithManagerFactory = await ethers.getContractFactory(
            'RequesterAuthorizerWithManager',
            roles.deployer
          );
          await expect(
            requesterAuthorizerWithManagerFactory.deploy(accessControlRegistry.address, '', roles.manager.address)
          ).to.be.revertedWith('Admin role description empty');
        });
      });
    });
    context('AccessControlRegistry address is zero', function () {
      it('reverts', async function () {
        const { roles, adminRoleDescription } = await helpers.loadFixture(deploy);
        const requesterAuthorizerWithManagerFactory = await ethers.getContractFactory(
          'RequesterAuthorizerWithManager',
          roles.deployer
        );
        await expect(
          requesterAuthorizerWithManagerFactory.deploy(
            ethers.constants.AddressZero,
            adminRoleDescription,
            roles.manager.address
          )
        ).to.be.revertedWithoutReason;
      });
    });
  });

  describe('extendAuthorizerExpiration', function () {
    context('Sender has authorization expiration extender role', function () {
      context('Requester address is not zero', function () {
        context('Timestamp extends authorization expiration', function () {
          it('extends authorization expiration', async function () {
            const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
            const authorizationStatusBefore =
              await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
                roles.airnode.address,
                roles.requester.address
              );
            expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
            expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
            const expirationTimestamp = 1000;
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.authorizationExpirationExtender)
                .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp)
            )
              .to.emit(requesterAuthorizerWithManager, 'ExtendedAuthorizationExpiration')
              .withArgs(
                roles.airnode.address,
                roles.requester.address,
                expirationTimestamp,
                roles.authorizationExpirationExtender.address
              );
            const authorizationStatusAfter =
              await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
                roles.airnode.address,
                roles.requester.address
              );
            expect(authorizationStatusAfter.expirationTimestamp).to.equal(1000);
            expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
          });
        });
        context('Timestamp does not extend authorization expiration', function () {
          it('reverts', async function () {
            const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.authorizationExpirationExtender)
                .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 0)
            ).to.be.revertedWith('Does not extend expiration');
          });
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.authorizationExpirationExtender)
              .extendAuthorizerExpiration(roles.airnode.address, ethers.constants.AddressZero, expirationTimestamp)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the manager', function () {
      context('Timestamp extends authorization expiration', function () {
        it('extends authorization expiration', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          const authorizationStatusBefore =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.manager)
              .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp, {
                gasLimit: 1000000,
              })
          )
            .to.emit(requesterAuthorizerWithManager, 'ExtendedAuthorizationExpiration')
            .withArgs(roles.airnode.address, roles.requester.address, expirationTimestamp, roles.manager.address);
          const authorizationStatusAfter = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
          expect(authorizationStatusAfter.expirationTimestamp).to.equal(1000);
          expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
        });
      });
      context('Timestamp does not extend authorization expiration', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.manager)
              .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 0, { gasLimit: 1000000 })
          ).to.be.revertedWith('Does not extend expiration');
        });
      });
    });
    // Let us demonstrate meta-txes as a proof of concept
    context('Sender using a meta-tx signed by the manager', function () {
      context('Timestamp extends authorization expiration', function () {
        it('extends authorization expiration', async function () {
          const { roles, accessControlRegistry, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          const authorizationStatusBefore =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          const expirationTimestamp = 1000;

          const from = roles.manager.address;
          const to = requesterAuthorizerWithManager.address;
          const data = requesterAuthorizerWithManager.interface.encodeFunctionData('extendAuthorizerExpiration', [
            roles.airnode.address,
            roles.requester.address,
            expirationTimestamp,
          ]);
          const metaTxExpirationTimestamp = (await testUtils.getCurrentTimestamp(ethers.provider)) + 3600;

          const domainName = 'ExpiringMetaTxForwarder';
          const domainVersion = '1.0.0';
          const domainChainId = (await ethers.provider.getNetwork()).chainId;
          const domainAddress = accessControlRegistry.address;

          const domain = {
            name: domainName,
            version: domainVersion,
            chainId: domainChainId,
            verifyingContract: domainAddress,
          };
          const types = {
            ExpiringMetaTx: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'data', type: 'bytes' },
              { name: 'expirationTimestamp', type: 'uint256' },
            ],
          };
          const value = {
            from,
            to,
            data,
            expirationTimestamp: metaTxExpirationTimestamp,
          };
          const signature = await roles.manager._signTypedData(domain, types, value);

          await expect(accessControlRegistry.connect(roles.randomPerson).execute(value, signature))
            .to.emit(requesterAuthorizerWithManager, 'ExtendedAuthorizationExpiration')
            .withArgs(roles.airnode.address, roles.requester.address, expirationTimestamp, roles.manager.address);

          const authorizationStatusAfter = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
          expect(authorizationStatusAfter.expirationTimestamp).to.equal(1000);
          expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
        });
      });
      context('Timestamp does not extend authorization expiration', function () {
        it('reverts', async function () {
          const { roles, accessControlRegistry, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);

          const from = roles.manager.address;
          const to = requesterAuthorizerWithManager.address;
          const data = requesterAuthorizerWithManager.interface.encodeFunctionData('extendAuthorizerExpiration', [
            roles.airnode.address,
            roles.requester.address,
            0,
          ]);
          const metaTxExpirationTimestamp = (await testUtils.getCurrentTimestamp(ethers.provider)) + 3600;

          const domainName = 'ExpiringMetaTxForwarder';
          const domainVersion = '1.0.0';
          const domainChainId = (await ethers.provider.getNetwork()).chainId;
          const domainAddress = accessControlRegistry.address;

          const domain = {
            name: domainName,
            version: domainVersion,
            chainId: domainChainId,
            verifyingContract: domainAddress,
          };
          const types = {
            ExpiringMetaTx: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'data', type: 'bytes' },
              { name: 'expirationTimestamp', type: 'uint256' },
            ],
          };
          const value = {
            from,
            to,
            data,
            expirationTimestamp: metaTxExpirationTimestamp,
          };
          const signature = await roles.manager._signTypedData(domain, types, value);

          await expect(accessControlRegistry.connect(roles.randomPerson).execute(value, signature)).to.be.revertedWith(
            'Does not extend expiration'
          );
        });
      });
    });
    context('Sender does not have the authorization expiration extender role and is not the manager', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);

        await expect(
          requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationSetter)
            .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 1000)
        ).to.be.revertedWith('Cannot extend expiration');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.indefiniteAuthorizer)
            .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 1000)
        ).to.be.revertedWith('Cannot extend expiration');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.randomPerson)
            .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 1000)
        ).to.be.revertedWith('Cannot extend expiration');
      });
    });
  });

  describe('setAuthorizationExpiration', function () {
    context('Sender has authorization expiration setter role', function () {
      context('Requester address is not zero', function () {
        it('sets authorization expiration', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp)
          )
            .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
            .withArgs(
              roles.airnode.address,
              roles.requester.address,
              expirationTimestamp,
              roles.authorizationExpirationSetter.address
            );
          const authorizationStatusBefore =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(expirationTimestamp);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
          )
            .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
            .withArgs(roles.airnode.address, roles.requester.address, 0, roles.authorizationExpirationSetter.address);
          const authorizationStatusAfter = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
          expect(authorizationStatusAfter.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(roles.airnode.address, ethers.constants.AddressZero, 0)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the manager', function () {
      it('sets authorization expiration', async function () {
        const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
        const expirationTimestamp = 1000;
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
          .withArgs(roles.airnode.address, roles.requester.address, expirationTimestamp, roles.manager.address);
        const authorizationStatusBefore = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          roles.airnode.address,
          roles.requester.address
        );
        expect(authorizationStatusBefore.expirationTimestamp).to.equal(expirationTimestamp);
        expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0, { gasLimit: 1000000 })
        )
          .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
          .withArgs(roles.airnode.address, roles.requester.address, 0, roles.manager.address);
        const authorizationStatusAfter = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          roles.airnode.address,
          roles.requester.address
        );
        expect(authorizationStatusAfter.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
      });
    });
    context('Sender does not have the authorization expiration setter role and is not the manager', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationExtender)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
        ).to.be.revertedWith('Cannot set expiration');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.indefiniteAuthorizer)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
        ).to.be.revertedWith('Cannot set expiration');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.randomPerson)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
        ).to.be.revertedWith('Cannot set expiration');
      });
    });
  });

  describe('setIndefiniteAuthorizationStatus', function () {
    context('Sender has indefinite authorizer role', function () {
      context('Requester address is not zero', function () {
        it('sets indefinite authorization status', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          const authorizationStatusBefore =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          // Authorize indefinitely
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
          )
            .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep1 =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep1.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep1.indefiniteAuthorizationCount).to.equal(1);
          expect(
            await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(true);
          // Authorizing indefinitely again should have no effect
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
          )
            .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep2 =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep2.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep2.indefiniteAuthorizationCount).to.equal(1);
          expect(
            await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(true);
          // Revoke indefinite authorization
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false)
          )
            .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep3 =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep3.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep3.indefiniteAuthorizationCount).to.equal(0);
          expect(
            await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(false);
          // Revoking indefinite authorization again should have no effect
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false)
          )
            .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep4 =
            await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep4.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep4.indefiniteAuthorizationCount).to.equal(0);
          expect(
            await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(false);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, ethers.constants.AddressZero, true)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the manager', function () {
      it('sets indefinite authorization status', async function () {
        const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
        const authorizationStatusBefore = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          roles.airnode.address,
          roles.requester.address
        );
        expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
        expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
        // Authorize indefinitely
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.manager.address);
        const authorizationStatusAfterStep1 =
          await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep1.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep1.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(true);
        // Authorizing indefinitely again should have no effect
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.manager.address);
        const authorizationStatusAfterStep2 =
          await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep2.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep2.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(true);
        // Revoke indefinite authorization
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.manager.address);
        const authorizationStatusAfterStep3 =
          await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep3.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep3.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(false);
        // Revoking indefinite authorization again should have no effect
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.manager.address);
        const authorizationStatusAfterStep4 =
          await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep4.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep4.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(false);
      });
    });
    context('Sender does not have the indefinite authorizer role and is not the manager', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationExtender)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationSetter)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.randomPerson)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
      });
    });
  });

  describe('revokeIndefiniteAuthorizationStatus', function () {
    context('setter does not have the indefinite authorizer role', function () {
      context('setter is not the manager', function () {
        context('Airnode address is not zero', function () {
          context('Requester address is not zero', function () {
            context('Setter address is not zero', function () {
              it('revokes indefinite authorization status', async function () {
                const {
                  roles,
                  accessControlRegistry,
                  requesterAuthorizerWithManager,
                  adminRole,
                  indefiniteAuthorizerRole,
                } = await helpers.loadFixture(deploy);
                // Grant indefinite authorization status
                await requesterAuthorizerWithManager
                  .connect(roles.indefiniteAuthorizer)
                  .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true);
                // Revoke the indefinite authorizer role
                await accessControlRegistry.connect(roles.manager).grantRole(adminRole, roles.manager.address);
                await accessControlRegistry
                  .connect(roles.manager)
                  .revokeRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address, { gasLimit: 1000000 });
                // Revoke the indefinite authorization status
                await expect(
                  requesterAuthorizerWithManager
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
                      roles.airnode.address,
                      roles.requester.address,
                      roles.indefiniteAuthorizer.address
                    )
                )
                  .to.emit(requesterAuthorizerWithManager, 'RevokedIndefiniteAuthorizationStatus')
                  .withArgs(
                    roles.airnode.address,
                    roles.requester.address,
                    roles.indefiniteAuthorizer.address,
                    0,
                    roles.randomPerson.address
                  );
                const authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    roles.requester.address
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                // Revoking twice should not emit an event
                await expect(
                  requesterAuthorizerWithManager
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
                      roles.airnode.address,
                      roles.requester.address,
                      roles.indefiniteAuthorizer.address
                    )
                ).to.not.emit(requesterAuthorizerWithManager, 'RevokedIndefiniteAuthorizationStatus');
              });
            });
            context('Setter address is zero', function () {
              it('reverts', async function () {
                const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
                await expect(
                  requesterAuthorizerWithManager
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
                      roles.airnode.address,
                      roles.requester.address,
                      ethers.constants.AddressZero
                    )
                ).to.be.revertedWith('Setter address zero');
              });
            });
          });
          context('Requester address is zero', function () {
            it('reverts', async function () {
              const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
              await expect(
                requesterAuthorizerWithManager
                  .connect(roles.randomPerson)
                  .revokeIndefiniteAuthorizationStatus(
                    roles.airnode.address,
                    ethers.constants.AddressZero,
                    roles.randomPerson.address
                  )
              ).to.be.revertedWith('Requester address zero');
            });
          });
        });
        context('Airnode address is zero', function () {
          it('reverts', async function () {
            const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.randomPerson)
                .revokeIndefiniteAuthorizationStatus(
                  ethers.constants.AddressZero,
                  roles.requester.address,
                  roles.randomPerson.address
                )
            ).to.be.revertedWith('Airnode address zero');
          });
        });
      });
      context('setter is the manager', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.randomPerson)
              .revokeIndefiniteAuthorizationStatus(
                roles.airnode.address,
                roles.requester.address,
                roles.manager.address
              )
          ).to.be.revertedWith('setter can set indefinite status');
        });
      });
    });
    context('setter has the indefinite authorizer role', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.randomPerson)
            .revokeIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
        ).to.be.revertedWith('setter can set indefinite status');
      });
    });
  });

  describe('isAuthorized', function () {
    context('Requester is authorized indefinitely', function () {
      context('Requester is authorized temporarily', function () {
        it('returns true', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          await requesterAuthorizerWithManager
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true);
          await requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 2000000000);
          expect(
            await requesterAuthorizerWithManager.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(true);
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns true', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          await requesterAuthorizerWithManager
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true);
          expect(
            await requesterAuthorizerWithManager.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(true);
        });
      });
    });
    context('Requester is not authorized indefinitely', function () {
      context('Requester is authorized temporarily', function () {
        it('returns true', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          await requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 2000000000);
          expect(
            await requesterAuthorizerWithManager.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(true);
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns false', async function () {
          const { roles, requesterAuthorizerWithManager } = await helpers.loadFixture(deploy);
          expect(
            await requesterAuthorizerWithManager.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(false);
        });
      });
    });
  });
});
