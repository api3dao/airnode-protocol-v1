const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('RequesterAuthorizerWithManager', function () {
  let roles;
  let expiringMetaTxForwarder, accessControlRegistry, requesterAuthorizerWithManager;
  let requesterAuthorizerWithManagerAdminRoleDescription = 'RequesterAuthorizerWithManager admin';
  let adminRole, authorizationExpirationExtenderRole, authorizationExpirationSetterRole, indefiniteAuthorizerRole;
  let airnodeAddress = testUtils.generateRandomAddress();

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      authorizationExpirationExtender: accounts[2],
      authorizationExpirationSetter: accounts[3],
      indefiniteAuthorizer: accounts[4],
      anotherIndefiniteAuthorizer: accounts[5],
      requester: accounts[5],
      randomPerson: accounts[9],
    };
    const expiringMetaTxForwarderFactory = await hre.ethers.getContractFactory(
      'ExpiringMetaTxForwarder',
      roles.deployer
    );
    expiringMetaTxForwarder = await expiringMetaTxForwarderFactory.deploy();
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    accessControlRegistry = await accessControlRegistryFactory.deploy(expiringMetaTxForwarder.address);
    const requesterAuthorizerWithManagerFactory = await hre.ethers.getContractFactory(
      'RequesterAuthorizerWithManager',
      roles.deployer
    );
    requesterAuthorizerWithManager = await requesterAuthorizerWithManagerFactory.deploy(
      accessControlRegistry.address,
      requesterAuthorizerWithManagerAdminRoleDescription,
      roles.manager.address
    );
    const managerRootRole = testUtils.deriveRootRole(roles.manager.address);
    // Initialize the roles and grant them to respective accounts
    adminRole = await requesterAuthorizerWithManager.adminRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, requesterAuthorizerWithManagerAdminRoleDescription);
    authorizationExpirationExtenderRole = await requesterAuthorizerWithManager.authorizationExpirationExtenderRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        adminRole,
        await requesterAuthorizerWithManager.AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(authorizationExpirationExtenderRole, roles.authorizationExpirationExtender.address);
    authorizationExpirationSetterRole = await requesterAuthorizerWithManager.authorizationExpirationSetterRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        adminRole,
        await requesterAuthorizerWithManager.AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(authorizationExpirationSetterRole, roles.authorizationExpirationSetter.address);
    indefiniteAuthorizerRole = await requesterAuthorizerWithManager.indefiniteAuthorizerRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        adminRole,
        await requesterAuthorizerWithManager.INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(indefiniteAuthorizerRole, roles.anotherIndefiniteAuthorizer.address);
    // Grant `roles.randomPerson` some invalid roles
    const randomRoleDescription = Math.random().toString();
    const randomRole = testUtils.deriveRole(managerRootRole, randomRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, randomRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(randomRole, roles.randomPerson.address);
    const invalidAuthorizationExpirationExtenderRole = testUtils.deriveRole(
      managerRootRole,
      await requesterAuthorizerWithManager.AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION()
    );
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        managerRootRole,
        await requesterAuthorizerWithManager.AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(invalidAuthorizationExpirationExtenderRole, roles.randomPerson.address);
    const invalidAuthorizationExpirationSetterRole = testUtils.deriveRole(
      managerRootRole,
      await requesterAuthorizerWithManager.AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION()
    );
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        managerRootRole,
        await requesterAuthorizerWithManager.AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(invalidAuthorizationExpirationSetterRole, roles.randomPerson.address);
    const invalidIndefiniteAuthorizerRole = testUtils.deriveRole(
      managerRootRole,
      await requesterAuthorizerWithManager.INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION()
    );
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        managerRootRole,
        await requesterAuthorizerWithManager.INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(invalidIndefiniteAuthorizerRole, roles.randomPerson.address);
  });

  describe('constructor', function () {
    context('AccessControlRegistry address is not zero', function () {
      context('Admin role description string is not empty', function () {
        context('Manager address is not zero', function () {
          it('constructs', async function () {
            const requesterAuthorizerWithManagerFactory = await hre.ethers.getContractFactory(
              'RequesterAuthorizerWithManager',
              roles.deployer
            );
            requesterAuthorizerWithManager = await requesterAuthorizerWithManagerFactory.deploy(
              accessControlRegistry.address,
              requesterAuthorizerWithManagerAdminRoleDescription,
              roles.manager.address
            );
            expect(await requesterAuthorizerWithManager.accessControlRegistry()).to.equal(
              accessControlRegistry.address
            );
            expect(await requesterAuthorizerWithManager.adminRoleDescription()).to.equal(
              requesterAuthorizerWithManagerAdminRoleDescription
            );
            expect(await requesterAuthorizerWithManager.manager()).to.equal(roles.manager.address);
          });
        });
        context('Manager address is zero', function () {
          it('reverts', async function () {
            const requesterAuthorizerWithManagerFactory = await hre.ethers.getContractFactory(
              'RequesterAuthorizerWithManager',
              roles.deployer
            );
            await expect(
              requesterAuthorizerWithManagerFactory.deploy(
                accessControlRegistry.address,
                requesterAuthorizerWithManagerAdminRoleDescription,
                hre.ethers.constants.AddressZero
              )
            ).to.be.revertedWith('Manager address zero');
          });
        });
      });
      context('Admin role description string is empty', function () {
        it('reverts', async function () {
          const requesterAuthorizerWithManagerFactory = await hre.ethers.getContractFactory(
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
        const requesterAuthorizerWithManagerFactory = await hre.ethers.getContractFactory(
          'RequesterAuthorizerWithManager',
          roles.deployer
        );
        await expect(
          requesterAuthorizerWithManagerFactory.deploy(
            hre.ethers.constants.AddressZero,
            requesterAuthorizerWithManagerAdminRoleDescription,
            roles.manager.address
          )
        ).to.be.revertedWithoutReason;
      });
    });
  });

  describe('extendAuthorizerExpiration', function () {
    context('Sender has authorization expiration extender role', function () {
      context('Airnode address not zero', function () {
        context('Requester address not zero', function () {
          context('Timestamp extends authorization expiration', function () {
            it('extends authorization expiration', async function () {
              let authorizationStatus;
              authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
                airnodeAddress,
                roles.requester.address
              );
              expect(authorizationStatus.expirationTimestamp).to.equal(0);
              expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
              const expirationTimestamp = 1000;
              await expect(
                requesterAuthorizerWithManager
                  .connect(roles.authorizationExpirationExtender)
                  .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, expirationTimestamp)
              )
                .to.emit(requesterAuthorizerWithManager, 'ExtendedAuthorizationExpiration')
                .withArgs(
                  airnodeAddress,
                  roles.requester.address,
                  roles.authorizationExpirationExtender.address,
                  expirationTimestamp
                );
              authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
                airnodeAddress,

                roles.requester.address
              );
              expect(authorizationStatus.expirationTimestamp).to.equal(1000);
              expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
            });
          });
          context('Timestamp does not extend authorization expiration', function () {
            it('reverts', async function () {
              await expect(
                requesterAuthorizerWithManager
                  .connect(roles.authorizationExpirationExtender)
                  .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 0)
              ).to.be.revertedWith('Does not extend expiration');
            });
          });
        });
        context('Requester address zero', function () {
          it('reverts', async function () {
            const expirationTimestamp = 1000;
            await expect(
              requesterAuthorizerWithManager.connect(roles.authorizationExpirationExtender).extendAuthorizerExpiration(
                airnodeAddress,

                hre.ethers.constants.AddressZero,
                expirationTimestamp
              )
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Airnode address zero', function () {
        it('reverts', async function () {
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithManager.connect(roles.authorizationExpirationExtender).extendAuthorizerExpiration(
              hre.ethers.constants.AddressZero,

              roles.requester.address,
              expirationTimestamp
            )
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Sender is the manager address', function () {
      context('Timestamp extends authorization expiration', function () {
        it('extends authorization expiration', async function () {
          await accessControlRegistry
            .connect(roles.manager)
            .renounceRole(authorizationExpirationExtenderRole, roles.manager.address);
          let authorizationStatus;
          authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,

            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(0);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.manager)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, expirationTimestamp)
          )
            .to.emit(requesterAuthorizerWithManager, 'ExtendedAuthorizationExpiration')
            .withArgs(airnodeAddress, roles.requester.address, roles.manager.address, expirationTimestamp);
          authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,

            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(1000);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        });
      });
      context('Timestamp does not extend authorization expiration', function () {
        it('reverts', async function () {
          await accessControlRegistry
            .connect(roles.manager)
            .renounceRole(authorizationExpirationExtenderRole, roles.manager.address);
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.manager)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 0)
          ).to.be.revertedWith('Does not extend expiration');
        });
      });
    });
    context(
      'Sender does not have the authorization expiration extender role and is not the manager address',
      function () {
        it('reverts', async function () {
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.authorizationExpirationSetter)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.indefiniteAuthorizer)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.randomPerson)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
        });
      }
    );
  });

  describe('setAuthorizationExpiration', function () {
    context('Sender has authorization expiration setter role', function () {
      context('Airnode address not zero', function () {
        context('Requester address not zero', function () {
          it('sets authorization expiration', async function () {
            let authorizationStatus;
            const expirationTimestamp = 1000;
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.authorizationExpirationSetter)
                .setAuthorizationExpiration(airnodeAddress, roles.requester.address, expirationTimestamp)
            )
              .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
              .withArgs(
                airnodeAddress,

                roles.requester.address,
                roles.authorizationExpirationSetter.address,
                expirationTimestamp
              );
            authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              airnodeAddress,

              roles.requester.address
            );
            expect(authorizationStatus.expirationTimestamp).to.equal(expirationTimestamp);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.authorizationExpirationSetter)
                .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
            )
              .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
              .withArgs(
                airnodeAddress,

                roles.requester.address,
                roles.authorizationExpirationSetter.address,
                0
              );
            authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              airnodeAddress,

              roles.requester.address
            );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          });
        });
        context('Requester address zero', function () {
          it('reverts', async function () {
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.authorizationExpirationSetter)
                .setAuthorizationExpiration(airnodeAddress, hre.ethers.constants.AddressZero, 0)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Airnode address zero', function () {
        it('reverts', async function () {
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(hre.ethers.constants.AddressZero, roles.requester.address, 0)
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Sender is tha manager address', function () {
      it('sets authorization expiration', async function () {
        await accessControlRegistry
          .connect(roles.manager)
          .renounceRole(authorizationExpirationSetterRole, roles.manager.address);
        let authorizationStatus;
        const expirationTimestamp = 1000;
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, expirationTimestamp)
        )
          .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
          .withArgs(airnodeAddress, roles.requester.address, roles.manager.address, expirationTimestamp);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,

          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(expirationTimestamp);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
        )
          .to.emit(requesterAuthorizerWithManager, 'SetAuthorizationExpiration')
          .withArgs(airnodeAddress, roles.requester.address, roles.manager.address, 0);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,

          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
      });
    });
    context(
      'Sender does not have the authorization expiration setter role and is not the manager address',
      function () {
        it('reverts', async function () {
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.authorizationExpirationExtender)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.indefiniteAuthorizer)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
          await expect(
            requesterAuthorizerWithManager
              .connect(roles.randomPerson)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
        });
      }
    );
  });

  describe('setIndefiniteAuthorizationStatus', function () {
    context('Sender has indefinite authorizer role', function () {
      context('Airnode address not zero', function () {
        context('Requester address not zero', function () {
          it('sets indefinite authorization status', async function () {
            let authorizationStatus;
            // Authorize indefinitely
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.indefiniteAuthorizer)
                .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
            )
              .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
              .withArgs(
                airnodeAddress,

                roles.requester.address,
                roles.indefiniteAuthorizer.address,
                true,
                1
              );
            authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              airnodeAddress,

              roles.requester.address
            );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            expect(
              await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
                airnodeAddress,
                roles.requester.address,
                roles.indefiniteAuthorizer.address
              )
            ).to.equal(true);
            // Authorizing indefinitely again should have no effect
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.indefiniteAuthorizer)
                .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
            )
              .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
              .withArgs(
                airnodeAddress,

                roles.requester.address,
                roles.indefiniteAuthorizer.address,
                true,
                1
              );
            authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              airnodeAddress,

              roles.requester.address
            );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            expect(
              await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
                airnodeAddress,

                roles.requester.address,
                roles.indefiniteAuthorizer.address
              )
            ).to.equal(true);
            // Revoke indefinite authorization
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.indefiniteAuthorizer)
                .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false)
            )
              .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
              .withArgs(
                airnodeAddress,

                roles.requester.address,
                roles.indefiniteAuthorizer.address,
                false,
                0
              );
            authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              airnodeAddress,

              roles.requester.address
            );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
            expect(
              await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
                airnodeAddress,

                roles.requester.address,
                roles.indefiniteAuthorizer.address
              )
            ).to.equal(false);
            // Revoking indefinite authorization again should have no effect
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.indefiniteAuthorizer)
                .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false)
            )
              .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
              .withArgs(
                airnodeAddress,

                roles.requester.address,
                roles.indefiniteAuthorizer.address,
                false,
                0
              );
            authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
              airnodeAddress,

              roles.requester.address
            );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
            expect(
              await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
                airnodeAddress,

                roles.requester.address,
                roles.indefiniteAuthorizer.address
              )
            ).to.equal(false);
          });
        });
        context('Requester address zero', function () {
          it('reverts', async function () {
            await expect(
              requesterAuthorizerWithManager
                .connect(roles.indefiniteAuthorizer)
                .setIndefiniteAuthorizationStatus(airnodeAddress, hre.ethers.constants.AddressZero, true)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Airnode address zero', function () {
        it('reverts', async function () {
          await expect(
            requesterAuthorizerWithManager.connect(roles.indefiniteAuthorizer).setIndefiniteAuthorizationStatus(
              hre.ethers.constants.AddressZero,

              roles.requester.address,
              true
            )
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Sender is the manager address', function () {
      it('sets indefinite authorization status', async function () {
        await accessControlRegistry
          .connect(roles.manager)
          .renounceRole(indefiniteAuthorizerRole, roles.manager.address);
        let authorizationStatus;
        // Authorize indefinitely
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, roles.manager.address, true, 1);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,

          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,

            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(true);
        // Authorizing indefinitely again should have no effect
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, roles.manager.address, true, 1);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,

          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,

            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(true);
        // Revoke indefinite authorization
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false)
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, roles.manager.address, false, 0);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,

          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,

            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(false);
        // Revoking indefinite authorization again should have no effect
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.manager)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false)
        )
          .to.emit(requesterAuthorizerWithManager, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, roles.manager.address, false, 0);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,

          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithManager.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,

            roles.requester.address,
            roles.manager.address
          )
        ).to.equal(false);
      });
    });
    context('Sender does not have the indefinite authorizer role and is not the manager address', function () {
      it('reverts', async function () {
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationExtender)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationSetter)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithManager
            .connect(roles.randomPerson)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
      });
    });
  });

  describe('revokeIndefiniteAuthorizationStatus', function () {
    context('setter does not have the indefinite authorizer role', function () {
      context('setter is not the manager address', function () {
        context('Airnode address not zero', function () {
          context('Requester address not zero', function () {
            context('Setter address not zero', function () {
              it('revokes indefinite authorization status', async function () {
                // Grant indefinite authorization status
                await requesterAuthorizerWithManager
                  .connect(roles.indefiniteAuthorizer)
                  .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true);
                // Revoke the indefinite authorizer role
                await accessControlRegistry
                  .connect(roles.manager)
                  .revokeRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address);
                // Revoke the indefinite authorization status
                await expect(
                  requesterAuthorizerWithManager.connect(roles.randomPerson).revokeIndefiniteAuthorizationStatus(
                    airnodeAddress,

                    roles.requester.address,
                    roles.indefiniteAuthorizer.address
                  )
                )
                  .to.emit(requesterAuthorizerWithManager, 'RevokedIndefiniteAuthorizationStatus')
                  .withArgs(
                    airnodeAddress,

                    roles.requester.address,
                    roles.indefiniteAuthorizer.address,
                    roles.randomPerson.address,
                    0
                  );
                const authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToRequesterToAuthorizationStatus(
                    airnodeAddress,

                    roles.requester.address
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                // Revoking twice should not emit an event
                await expect(
                  requesterAuthorizerWithManager.connect(roles.randomPerson).revokeIndefiniteAuthorizationStatus(
                    airnodeAddress,

                    roles.requester.address,
                    roles.indefiniteAuthorizer.address
                  )
                ).to.not.emit(requesterAuthorizerWithManager, 'RevokedIndefiniteAuthorizationStatus');
              });
            });
            context('Setter address zero', function () {
              it('reverts', async function () {
                await expect(
                  requesterAuthorizerWithManager.connect(roles.randomPerson).revokeIndefiniteAuthorizationStatus(
                    airnodeAddress,

                    roles.requester.address,
                    hre.ethers.constants.AddressZero
                  )
                ).to.be.revertedWith('Setter address zero');
              });
            });
          });
          context('Requester address zero', function () {
            it('reverts', async function () {
              await expect(
                requesterAuthorizerWithManager.connect(roles.randomPerson).revokeIndefiniteAuthorizationStatus(
                  airnodeAddress,

                  hre.ethers.constants.AddressZero,
                  roles.randomPerson.address
                )
              ).to.be.revertedWith('Requester address zero');
            });
          });
        });
        context('Airnode address zero', function () {
          it('reverts', async function () {
            await expect(
              requesterAuthorizerWithManager.connect(roles.randomPerson).revokeIndefiniteAuthorizationStatus(
                hre.ethers.constants.AddressZero,

                roles.requester.address,
                roles.randomPerson.address
              )
            ).to.be.revertedWith('Airnode address zero');
          });
        });
      });
      context('setter is the manager address', function () {
        it('reverts', async function () {
          await accessControlRegistry
            .connect(roles.manager)
            .renounceRole(indefiniteAuthorizerRole, roles.manager.address);
          await expect(
            requesterAuthorizerWithManager.connect(roles.randomPerson).revokeIndefiniteAuthorizationStatus(
              airnodeAddress,

              roles.requester.address,
              roles.manager.address
            )
          ).to.be.revertedWith('setter can set indefinite status');
        });
      });
    });
    context('setter has the indefinite authorizer role', function () {
      it('reverts', async function () {
        await expect(
          requesterAuthorizerWithManager.connect(roles.randomPerson).revokeIndefiniteAuthorizationStatus(
            airnodeAddress,

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
          await requesterAuthorizerWithManager
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true);
          await requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 2000000000);
          expect(await requesterAuthorizerWithManager.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            true
          );
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns true', async function () {
          await requesterAuthorizerWithManager
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true);
          expect(await requesterAuthorizerWithManager.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            true
          );
        });
      });
    });
    context('Requester is not authorized indefinitely', function () {
      context('Requester is authorized temporarily', function () {
        it('returns true', async function () {
          await requesterAuthorizerWithManager
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 2000000000);
          expect(await requesterAuthorizerWithManager.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            true
          );
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns false', async function () {
          expect(await requesterAuthorizerWithManager.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            false
          );
        });
      });
    });
  });
});
