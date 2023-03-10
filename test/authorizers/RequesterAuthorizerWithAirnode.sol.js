const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('RequesterAuthorizerWithAirnode', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      airnode: accounts[1],
      authorizationExpirationExtender: accounts[2],
      authorizationExpirationSetter: accounts[3],
      indefiniteAuthorizer: accounts[4],
      anotherIndefiniteAuthorizer: accounts[5],
      requester: accounts[6],
      randomPerson: accounts[9],
    };
    const adminRoleDescription = 'RequesterAuthorizerWithAirnode admin';
    const authorizationExpirationExtenderRoleDescription = 'Authorization expiration extender';
    const authorizationExpirationSetterRoleDescription = 'Authorization expiration setter';
    const indefiniteAuthorizerRoleDescription = 'Indefinite authorizer';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const requesterAuthorizerWithAirnodeFactory = await ethers.getContractFactory(
      'RequesterAuthorizerWithAirnode',
      roles.deployer
    );
    const requesterAuthorizerWithAirnode = await requesterAuthorizerWithAirnodeFactory.deploy(
      accessControlRegistry.address,
      adminRoleDescription
    );
    const rootRole = testUtils.deriveRootRole(roles.airnode.address);
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
    await accessControlRegistry.connect(roles.airnode).initializeRoleAndGrantToSender(rootRole, adminRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .initializeRoleAndGrantToSender(adminRole, authorizationExpirationExtenderRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .initializeRoleAndGrantToSender(adminRole, authorizationExpirationSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .initializeRoleAndGrantToSender(adminRole, indefiniteAuthorizerRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .grantRole(authorizationExpirationExtenderRole, roles.authorizationExpirationExtender.address);
    await accessControlRegistry
      .connect(roles.airnode)
      .grantRole(authorizationExpirationSetterRole, roles.authorizationExpirationSetter.address);
    await accessControlRegistry
      .connect(roles.airnode)
      .grantRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address);
    await accessControlRegistry
      .connect(roles.airnode)
      .grantRole(indefiniteAuthorizerRole, roles.anotherIndefiniteAuthorizer.address);
    await accessControlRegistry.connect(roles.airnode).renounceRole(adminRole, roles.airnode.address);
    await accessControlRegistry
      .connect(roles.airnode)
      .renounceRole(authorizationExpirationExtenderRole, roles.airnode.address);
    await accessControlRegistry
      .connect(roles.airnode)
      .renounceRole(authorizationExpirationSetterRole, roles.airnode.address);
    await accessControlRegistry.connect(roles.airnode).renounceRole(indefiniteAuthorizerRole, roles.airnode.address);
    return {
      roles,
      accessControlRegistry,
      requesterAuthorizerWithAirnode,
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
        it('constructs', async function () {
          const { accessControlRegistry, requesterAuthorizerWithAirnode, adminRoleDescription } =
            await helpers.loadFixture(deploy);
          expect(await requesterAuthorizerWithAirnode.accessControlRegistry()).to.equal(accessControlRegistry.address);
          expect(await requesterAuthorizerWithAirnode.adminRoleDescription()).to.equal(adminRoleDescription);
        });
      });
      context('Admin role description string is empty', function () {
        it('reverts', async function () {
          const { roles, accessControlRegistry } = await helpers.loadFixture(deploy);
          const requesterAuthorizerWithAirnodeFactory = await ethers.getContractFactory(
            'RequesterAuthorizerWithAirnode',
            roles.deployer
          );
          await expect(
            requesterAuthorizerWithAirnodeFactory.deploy(accessControlRegistry.address, '')
          ).to.be.revertedWith('Admin role description empty');
        });
      });
    });
    context('AccessControlRegistry address is zero', function () {
      it('reverts', async function () {
        const { roles, adminRoleDescription } = await helpers.loadFixture(deploy);
        const requesterAuthorizerWithAirnodeFactory = await ethers.getContractFactory(
          'RequesterAuthorizerWithAirnode',
          roles.deployer
        );
        await expect(
          requesterAuthorizerWithAirnodeFactory.deploy(ethers.constants.AddressZero, adminRoleDescription)
        ).to.be.revertedWithoutReason;
      });
    });
  });

  describe('extendAuthorizerExpiration', function () {
    context('Sender has authorization expiration extender role', function () {
      context('Requester address is not zero', function () {
        context('Timestamp extends authorization expiration', function () {
          it('extends authorization expiration', async function () {
            const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
            const authorizationStatusBefore =
              await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
                roles.airnode.address,
                roles.requester.address
              );
            expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
            expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
            const expirationTimestamp = 1000;
            await expect(
              requesterAuthorizerWithAirnode
                .connect(roles.authorizationExpirationExtender)
                .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp)
            )
              .to.emit(requesterAuthorizerWithAirnode, 'ExtendedAuthorizationExpiration')
              .withArgs(
                roles.airnode.address,
                roles.requester.address,
                expirationTimestamp,
                roles.authorizationExpirationExtender.address
              );
            const authorizationStatusAfter =
              await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
                roles.airnode.address,
                roles.requester.address
              );
            expect(authorizationStatusAfter.expirationTimestamp).to.equal(1000);
            expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
          });
        });
        context('Timestamp does not extend authorization expiration', function () {
          it('reverts', async function () {
            const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
            await expect(
              requesterAuthorizerWithAirnode
                .connect(roles.authorizationExpirationExtender)
                .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 0)
            ).to.be.revertedWith('Does not extend expiration');
          });
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationExtender)
              .extendAuthorizerExpiration(roles.airnode.address, ethers.constants.AddressZero, expirationTimestamp)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the Airnode address', function () {
      context('Timestamp extends authorization expiration', function () {
        it('extends authorization expiration', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          const authorizationStatusBefore =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.airnode)
              .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp, {
                gasLimit: 1000000,
              })
          )
            .to.emit(requesterAuthorizerWithAirnode, 'ExtendedAuthorizationExpiration')
            .withArgs(roles.airnode.address, roles.requester.address, expirationTimestamp, roles.airnode.address);
          const authorizationStatusAfter = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
          expect(authorizationStatusAfter.expirationTimestamp).to.equal(1000);
          expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
        });
      });
      context('Timestamp does not extend authorization expiration', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.airnode)
              .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 0, { gasLimit: 1000000 })
          ).to.be.revertedWith('Does not extend expiration');
        });
      });
    });
    // Let us demonstrate meta-txes as a proof of concept
    context('Sender using a meta-tx signed by the Airnode address', function () {
      context('Timestamp extends authorization expiration', function () {
        it('extends authorization expiration', async function () {
          const { roles, accessControlRegistry, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          const authorizationStatusBefore =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          const expirationTimestamp = 1000;

          const from = roles.airnode.address;
          const to = requesterAuthorizerWithAirnode.address;
          const data = requesterAuthorizerWithAirnode.interface.encodeFunctionData('extendAuthorizerExpiration', [
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
          const signature = await roles.airnode._signTypedData(domain, types, value);

          await expect(accessControlRegistry.connect(roles.randomPerson).execute(value, signature))
            .to.emit(requesterAuthorizerWithAirnode, 'ExtendedAuthorizationExpiration')
            .withArgs(roles.airnode.address, roles.requester.address, expirationTimestamp, roles.airnode.address);

          const authorizationStatusAfter = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
          expect(authorizationStatusAfter.expirationTimestamp).to.equal(1000);
          expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
        });
      });
      context('Timestamp does not extend authorization expiration', function () {
        it('reverts', async function () {
          const { roles, accessControlRegistry, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);

          const from = roles.airnode.address;
          const to = requesterAuthorizerWithAirnode.address;
          const data = requesterAuthorizerWithAirnode.interface.encodeFunctionData('extendAuthorizerExpiration', [
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
          const signature = await roles.airnode._signTypedData(domain, types, value);

          await expect(accessControlRegistry.connect(roles.randomPerson).execute(value, signature)).to.be.revertedWith(
            'Does not extend expiration'
          );
        });
      });
    });
    context(
      'Sender does not have the authorization expiration extender role and is not the Airnode address',
      function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);

          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.randomPerson)
              .extendAuthorizerExpiration(roles.airnode.address, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
        });
      }
    );
  });

  describe('setAuthorizationExpiration', function () {
    context('Sender has authorization expiration setter role', function () {
      context('Requester address is not zero', function () {
        it('sets authorization expiration', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
            .withArgs(
              roles.airnode.address,
              roles.requester.address,
              expirationTimestamp,
              roles.authorizationExpirationSetter.address
            );
          const authorizationStatusBefore =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(expirationTimestamp);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
            .withArgs(roles.airnode.address, roles.requester.address, 0, roles.authorizationExpirationSetter.address);
          const authorizationStatusAfter = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
          expect(authorizationStatusAfter.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(roles.airnode.address, ethers.constants.AddressZero, 0)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the Airnode address', function () {
      it('sets authorization expiration', async function () {
        const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
        const expirationTimestamp = 1000;
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.airnode)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, expirationTimestamp, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
          .withArgs(roles.airnode.address, roles.requester.address, expirationTimestamp, roles.airnode.address);
        const authorizationStatusBefore = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          roles.airnode.address,
          roles.requester.address
        );
        expect(authorizationStatusBefore.expirationTimestamp).to.equal(expirationTimestamp);
        expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.airnode)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0, { gasLimit: 1000000 })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
          .withArgs(roles.airnode.address, roles.requester.address, 0, roles.airnode.address);
        const authorizationStatusAfter = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          roles.airnode.address,
          roles.requester.address
        );
        expect(authorizationStatusAfter.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfter.indefiniteAuthorizationCount).to.equal(0);
      });
    });
    context(
      'Sender does not have the authorization expiration setter role and is not the Airnode address',
      function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationExtender)
              .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.randomPerson)
              .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
        });
      }
    );
  });

  describe('setIndefiniteAuthorizationStatus', function () {
    context('Sender has indefinite authorizer role', function () {
      context('Requester address is not zero', function () {
        it('sets indefinite authorization status', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          const authorizationStatusBefore =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
          expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
          // Authorize indefinitely
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep1 =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep1.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep1.indefiniteAuthorizationCount).to.equal(1);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(true);
          // Authorizing indefinitely again should have no effect
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep2 =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep2.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep2.indefiniteAuthorizationCount).to.equal(1);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(true);
          // Revoke indefinite authorization
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep3 =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep3.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep3.indefiniteAuthorizationCount).to.equal(0);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(false);
          // Revoking indefinite authorization again should have no effect
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.indefiniteAuthorizer.address);
          const authorizationStatusAfterStep4 =
            await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address
            );
          expect(authorizationStatusAfterStep4.expirationTimestamp).to.equal(0);
          expect(authorizationStatusAfterStep4.indefiniteAuthorizationCount).to.equal(0);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              roles.airnode.address,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(false);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(roles.airnode.address, ethers.constants.AddressZero, true)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the Airnode address', function () {
      it('sets indefinite authorization status', async function () {
        const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
        const authorizationStatusBefore = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          roles.airnode.address,
          roles.requester.address
        );
        expect(authorizationStatusBefore.expirationTimestamp).to.equal(0);
        expect(authorizationStatusBefore.indefiniteAuthorizationCount).to.equal(0);
        // Authorize indefinitely
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.airnode)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.airnode.address);
        const authorizationStatusAfterStep1 =
          await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep1.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep1.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.airnode.address
          )
        ).to.equal(true);
        // Authorizing indefinitely again should have no effect
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.airnode)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, true, 1, roles.airnode.address);
        const authorizationStatusAfterStep2 =
          await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep2.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep2.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.airnode.address
          )
        ).to.equal(true);
        // Revoke indefinite authorization
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.airnode)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.airnode.address);
        const authorizationStatusAfterStep3 =
          await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep3.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep3.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.airnode.address
          )
        ).to.equal(false);
        // Revoking indefinite authorization again should have no effect
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.airnode)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, false, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(roles.airnode.address, roles.requester.address, false, 0, roles.airnode.address);
        const authorizationStatusAfterStep4 =
          await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address
          );
        expect(authorizationStatusAfterStep4.expirationTimestamp).to.equal(0);
        expect(authorizationStatusAfterStep4.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            roles.airnode.address,
            roles.requester.address,
            roles.airnode.address
          )
        ).to.equal(false);
      });
    });
    context('Sender does not have the indefinite authorizer role and is not the Airnode address', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationExtender)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationSetter)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.randomPerson)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
      });
    });
  });

  describe('revokeIndefiniteAuthorizationStatus', function () {
    context('setter does not have the indefinite authorizer role', function () {
      context('setter is not the Airnode address', function () {
        context('Airnode address is not zero', function () {
          context('Requester address is not zero', function () {
            context('Setter address is not zero', function () {
              it('revokes indefinite authorization status', async function () {
                const {
                  roles,
                  accessControlRegistry,
                  requesterAuthorizerWithAirnode,
                  adminRole,
                  indefiniteAuthorizerRole,
                } = await helpers.loadFixture(deploy);
                // Grant indefinite authorization status
                await requesterAuthorizerWithAirnode
                  .connect(roles.indefiniteAuthorizer)
                  .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true);
                // Revoke the indefinite authorizer role
                await accessControlRegistry.connect(roles.airnode).grantRole(adminRole, roles.airnode.address);
                await accessControlRegistry
                  .connect(roles.airnode)
                  .revokeRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address, { gasLimit: 1000000 });
                // Revoke the indefinite authorization status
                await expect(
                  requesterAuthorizerWithAirnode
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
                      roles.airnode.address,
                      roles.requester.address,
                      roles.indefiniteAuthorizer.address
                    )
                )
                  .to.emit(requesterAuthorizerWithAirnode, 'RevokedIndefiniteAuthorizationStatus')
                  .withArgs(
                    roles.airnode.address,
                    roles.requester.address,
                    roles.indefiniteAuthorizer.address,
                    0,
                    roles.randomPerson.address
                  );
                const authorizationStatus =
                  await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    roles.requester.address
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                // Revoking twice should not emit an event
                await expect(
                  requesterAuthorizerWithAirnode
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
                      roles.airnode.address,
                      roles.requester.address,
                      roles.indefiniteAuthorizer.address
                    )
                ).to.not.emit(requesterAuthorizerWithAirnode, 'RevokedIndefiniteAuthorizationStatus');
              });
            });
            context('Setter address is zero', function () {
              it('reverts', async function () {
                const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
                await expect(
                  requesterAuthorizerWithAirnode
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
              const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
              await expect(
                requesterAuthorizerWithAirnode
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
            const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
            await expect(
              requesterAuthorizerWithAirnode
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
      context('setter is the Airnode address', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.randomPerson)
              .revokeIndefiniteAuthorizationStatus(
                roles.airnode.address,
                roles.requester.address,
                roles.airnode.address
              )
          ).to.be.revertedWith('setter can set indefinite status');
        });
      });
    });
    context('setter has the indefinite authorizer role', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
        await expect(
          requesterAuthorizerWithAirnode
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

  describe('deriveAdminRole', function () {
    it('derives admin role for the Airnode', async function () {
      const { roles, requesterAuthorizerWithAirnode, adminRole } = await helpers.loadFixture(deploy);
      expect(await requesterAuthorizerWithAirnode.deriveAdminRole(roles.airnode.address)).to.equal(adminRole);
    });
  });

  describe('deriveAuthorizationExpirationExtenderRole', function () {
    it('derives authorization expiration extender role for the Airnode', async function () {
      const { roles, requesterAuthorizerWithAirnode, authorizationExpirationExtenderRole } = await helpers.loadFixture(
        deploy
      );
      expect(
        await requesterAuthorizerWithAirnode.deriveAuthorizationExpirationExtenderRole(roles.airnode.address)
      ).to.equal(authorizationExpirationExtenderRole);
    });
  });

  describe('deriveAuthorizationExpirationSetterRole', function () {
    it('derives authorization expiration setter role for the Airnode', async function () {
      const { roles, requesterAuthorizerWithAirnode, authorizationExpirationSetterRole } = await helpers.loadFixture(
        deploy
      );
      expect(
        await requesterAuthorizerWithAirnode.deriveAuthorizationExpirationSetterRole(roles.airnode.address)
      ).to.equal(authorizationExpirationSetterRole);
    });
  });

  describe('deriveIndefiniteAuthorizerRole', function () {
    it('derives indefinite authorizer role for the Airnode', async function () {
      const { roles, requesterAuthorizerWithAirnode, indefiniteAuthorizerRole } = await helpers.loadFixture(deploy);
      expect(await requesterAuthorizerWithAirnode.deriveIndefiniteAuthorizerRole(roles.airnode.address)).to.equal(
        indefiniteAuthorizerRole
      );
    });
  });

  describe('isAuthorized', function () {
    context('Requester is authorized indefinitely', function () {
      context('Requester is authorized temporarily', function () {
        it('returns true', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await requesterAuthorizerWithAirnode
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true);
          await requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 2000000000);
          expect(
            await requesterAuthorizerWithAirnode.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(true);
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns true', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await requesterAuthorizerWithAirnode
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(roles.airnode.address, roles.requester.address, true);
          expect(
            await requesterAuthorizerWithAirnode.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(true);
        });
      });
    });
    context('Requester is not authorized indefinitely', function () {
      context('Requester is authorized temporarily', function () {
        it('returns true', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          await requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(roles.airnode.address, roles.requester.address, 2000000000);
          expect(
            await requesterAuthorizerWithAirnode.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(true);
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns false', async function () {
          const { roles, requesterAuthorizerWithAirnode } = await helpers.loadFixture(deploy);
          expect(
            await requesterAuthorizerWithAirnode.isAuthorized(roles.airnode.address, roles.requester.address)
          ).to.equal(false);
        });
      });
    });
  });
});
