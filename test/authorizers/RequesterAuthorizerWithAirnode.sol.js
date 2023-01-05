const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('RequesterAuthorizerWithAirnode', function () {
  let roles;
  let accessControlRegistry, requesterAuthorizerWithAirnode;
  let requesterAuthorizerWithAirnodeAdminRoleDescription = 'RequesterAuthorizerWithAirnode admin';
  let adminRole, authorizationExpirationExtenderRole, authorizationExpirationSetterRole, indefiniteAuthorizerRole;
  let airnodeAddress, airnodeMnemonic, airnodeWallet;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      authorizationExpirationExtender: accounts[1],
      authorizationExpirationSetter: accounts[2],
      indefiniteAuthorizer: accounts[3],
      anotherIndefiniteAuthorizer: accounts[4],
      requester: accounts[5],
      randomPerson: accounts[9],
    };
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    accessControlRegistry = await accessControlRegistryFactory.deploy();
    const requesterAuthorizerWithAirnodeFactory = await hre.ethers.getContractFactory(
      'RequesterAuthorizerWithAirnode',
      roles.deployer
    );
    requesterAuthorizerWithAirnode = await requesterAuthorizerWithAirnodeFactory.deploy(
      accessControlRegistry.address,
      requesterAuthorizerWithAirnodeAdminRoleDescription
    );
    ({ airnodeAddress: airnodeAddress, airnodeMnemonic: airnodeMnemonic } = testUtils.generateRandomAirnodeWallet());
    await roles.deployer.sendTransaction({
      to: airnodeAddress,
      value: hre.ethers.utils.parseEther('1'),
    });
    airnodeWallet = hre.ethers.Wallet.fromMnemonic(airnodeMnemonic).connect(hre.ethers.provider);
    const airnodeRootRole = testUtils.deriveRootRole(airnodeAddress);
    // Initialize the roles and grant them to respective accounts
    adminRole = await requesterAuthorizerWithAirnode.deriveAdminRole(airnodeAddress);
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(airnodeRootRole, requesterAuthorizerWithAirnodeAdminRoleDescription, {
        gasLimit: 1000000,
      });
    authorizationExpirationExtenderRole =
      await requesterAuthorizerWithAirnode.deriveAuthorizationExpirationExtenderRole(airnodeAddress);
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(
        adminRole,
        await requesterAuthorizerWithAirnode.AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION(),
        { gasLimit: 1000000 }
      );
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(authorizationExpirationExtenderRole, roles.authorizationExpirationExtender.address, {
        gasLimit: 1000000,
      });
    authorizationExpirationSetterRole = await requesterAuthorizerWithAirnode.deriveAuthorizationExpirationSetterRole(
      airnodeAddress
    );
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(
        adminRole,
        await requesterAuthorizerWithAirnode.AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION(),
        { gasLimit: 1000000 }
      );
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(authorizationExpirationSetterRole, roles.authorizationExpirationSetter.address, { gasLimit: 1000000 });
    indefiniteAuthorizerRole = await requesterAuthorizerWithAirnode.deriveIndefiniteAuthorizerRole(airnodeAddress);
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(
        adminRole,
        await requesterAuthorizerWithAirnode.INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION(),
        { gasLimit: 1000000 }
      );
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address, { gasLimit: 1000000 });
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(indefiniteAuthorizerRole, roles.anotherIndefiniteAuthorizer.address, { gasLimit: 1000000 });
    // Grant `roles.randomPerson` some invalid roles
    const randomRoleDescription = Math.random().toString();
    const randomRole = testUtils.deriveRole(airnodeRootRole, randomRoleDescription);
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(airnodeRootRole, randomRoleDescription, { gasLimit: 1000000 });
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(randomRole, roles.randomPerson.address, { gasLimit: 1000000 });
    const invalidAuthorizationExpirationExtenderRole = testUtils.deriveRole(
      airnodeRootRole,
      await requesterAuthorizerWithAirnode.AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION()
    );
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(
        airnodeRootRole,
        await requesterAuthorizerWithAirnode.AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION(),
        { gasLimit: 1000000 }
      );
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(invalidAuthorizationExpirationExtenderRole, roles.randomPerson.address, { gasLimit: 1000000 });
    const invalidAuthorizationExpirationSetterRole = testUtils.deriveRole(
      airnodeRootRole,
      await requesterAuthorizerWithAirnode.AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION()
    );
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(
        airnodeRootRole,
        await requesterAuthorizerWithAirnode.AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION(),
        { gasLimit: 1000000 }
      );
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(invalidAuthorizationExpirationSetterRole, roles.randomPerson.address, { gasLimit: 1000000 });
    const invalidIndefiniteAuthorizerRole = testUtils.deriveRole(
      airnodeRootRole,
      await requesterAuthorizerWithAirnode.INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION()
    );
    await accessControlRegistry
      .connect(airnodeWallet)
      .initializeRoleAndGrantToSender(
        airnodeRootRole,
        await requesterAuthorizerWithAirnode.INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION(),
        { gasLimit: 1000000 }
      );
    await accessControlRegistry
      .connect(airnodeWallet)
      .grantRole(invalidIndefiniteAuthorizerRole, roles.randomPerson.address, { gasLimit: 1000000 });
  });

  describe('constructor', function () {
    context('AccessControlRegistry address is not zero', function () {
      context('Admin role description string is not empty', function () {
        it('constructs', async function () {
          const requesterAuthorizerWithAirnodeFactory = await hre.ethers.getContractFactory(
            'RequesterAuthorizerWithAirnode',
            roles.deployer
          );
          requesterAuthorizerWithAirnode = await requesterAuthorizerWithAirnodeFactory.deploy(
            accessControlRegistry.address,
            requesterAuthorizerWithAirnodeAdminRoleDescription
          );
          expect(await requesterAuthorizerWithAirnode.accessControlRegistry()).to.equal(accessControlRegistry.address);
          expect(await requesterAuthorizerWithAirnode.adminRoleDescription()).to.equal(
            requesterAuthorizerWithAirnodeAdminRoleDescription
          );
        });
      });
      context('Admin role description string is empty', function () {
        it('reverts', async function () {
          const requesterAuthorizerWithAirnodeFactory = await hre.ethers.getContractFactory(
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
        const requesterAuthorizerWithAirnodeFactory = await hre.ethers.getContractFactory(
          'RequesterAuthorizerWithAirnode',
          roles.deployer
        );
        await expect(
          requesterAuthorizerWithAirnodeFactory.deploy(
            hre.ethers.constants.AddressZero,
            requesterAuthorizerWithAirnodeAdminRoleDescription
          )
        ).to.be.revertedWithoutReason;
      });
    });
  });

  describe('extendAuthorizerExpiration', function () {
    context('Sender has authorization expiration extender role', function () {
      context('Requester address not zero', function () {
        context('Timestamp extends authorization expiration', function () {
          it('extends authorization expiration', async function () {
            let authorizationStatus;
            authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
              airnodeAddress,
              roles.requester.address
            );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
            const expirationTimestamp = 1000;
            await expect(
              requesterAuthorizerWithAirnode
                .connect(roles.authorizationExpirationExtender)
                .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, expirationTimestamp)
            )
              .to.emit(requesterAuthorizerWithAirnode, 'ExtendedAuthorizationExpiration')
              .withArgs(
                airnodeAddress,
                roles.requester.address,
                roles.authorizationExpirationExtender.address,
                expirationTimestamp
              );
            authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
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
              requesterAuthorizerWithAirnode
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
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationExtender)
              .extendAuthorizerExpiration(airnodeAddress, hre.ethers.constants.AddressZero, expirationTimestamp)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the Airnode address', function () {
      context('Timestamp extends authorization expiration', function () {
        it('extends authorization expiration', async function () {
          await accessControlRegistry
            .connect(airnodeWallet)
            .renounceRole(authorizationExpirationExtenderRole, airnodeAddress, { gasLimit: 1000000 });
          let authorizationStatus;
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,
            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(0);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithAirnode
              .connect(airnodeWallet)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, expirationTimestamp, {
                gasLimit: 1000000,
              })
          )
            .to.emit(requesterAuthorizerWithAirnode, 'ExtendedAuthorizationExpiration')
            .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, expirationTimestamp);
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
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
            .connect(airnodeWallet)
            .renounceRole(authorizationExpirationExtenderRole, airnodeAddress, { gasLimit: 1000000 });
          await expect(
            requesterAuthorizerWithAirnode
              .connect(airnodeWallet)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 0, { gasLimit: 1000000 })
          ).to.be.revertedWith('Does not extend expiration');
        });
      });
    });
    // Let us demonstrate meta-txes as a proof of concept
    context('Sender using a meta-tx signed by the Airnode address', function () {
      context('Timestamp extends authorization expiration', function () {
        it('extends authorization expiration', async function () {
          await accessControlRegistry
            .connect(airnodeWallet)
            .renounceRole(authorizationExpirationExtenderRole, airnodeAddress, { gasLimit: 1000000 });
          let authorizationStatus;
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,
            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(0);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          const expirationTimestamp = 1000;

          const from = airnodeAddress;
          const to = requesterAuthorizerWithAirnode.address;
          const data = requesterAuthorizerWithAirnode.interface.encodeFunctionData('extendAuthorizerExpiration', [
            airnodeAddress,
            roles.requester.address,
            expirationTimestamp,
          ]);
          const metaTxExpirationTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 3600;

          const domainName = 'ExpiringMetaTxForwarder';
          const domainVersion = '1.0.0';
          const domainChainId = (await hre.ethers.provider.getNetwork()).chainId;
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
          const signature = await airnodeWallet._signTypedData(domain, types, value);

          await expect(accessControlRegistry.connect(roles.randomPerson).execute(value, signature))
            .to.emit(requesterAuthorizerWithAirnode, 'ExtendedAuthorizationExpiration')
            .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, expirationTimestamp);

          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
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
            .connect(airnodeWallet)
            .renounceRole(authorizationExpirationExtenderRole, airnodeAddress, { gasLimit: 1000000 });

          const from = airnodeAddress;
          const to = requesterAuthorizerWithAirnode.address;
          const data = requesterAuthorizerWithAirnode.interface.encodeFunctionData('extendAuthorizerExpiration', [
            airnodeAddress,
            roles.requester.address,
            0,
          ]);
          const metaTxExpirationTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 3600;

          const domainName = 'ExpiringMetaTxForwarder';
          const domainVersion = '1.0.0';
          const domainChainId = (await hre.ethers.provider.getNetwork()).chainId;
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
          const signature = await airnodeWallet._signTypedData(domain, types, value);

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
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.randomPerson)
              .extendAuthorizerExpiration(airnodeAddress, roles.requester.address, 1000)
          ).to.be.revertedWith('Cannot extend expiration');
        });
      }
    );
  });

  describe('setAuthorizationExpiration', function () {
    context('Sender has authorization expiration setter role', function () {
      context('Requester address not zero', function () {
        it('sets authorization expiration', async function () {
          let authorizationStatus;
          const expirationTimestamp = 1000;
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, expirationTimestamp)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
            .withArgs(
              airnodeAddress,
              roles.requester.address,
              roles.authorizationExpirationSetter.address,
              expirationTimestamp
            );
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,
            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(expirationTimestamp);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
            .withArgs(airnodeAddress, roles.requester.address, roles.authorizationExpirationSetter.address, 0);
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
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
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationSetter)
              .setAuthorizationExpiration(airnodeAddress, hre.ethers.constants.AddressZero, 0)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the Airnode address', function () {
      it('sets authorization expiration', async function () {
        await accessControlRegistry
          .connect(airnodeWallet)
          .renounceRole(authorizationExpirationSetterRole, airnodeAddress, { gasLimit: 1000000 });
        let authorizationStatus;
        const expirationTimestamp = 1000;
        await expect(
          requesterAuthorizerWithAirnode
            .connect(airnodeWallet)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, expirationTimestamp, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
          .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, expirationTimestamp);
        authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,
          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(expirationTimestamp);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        await expect(
          requesterAuthorizerWithAirnode
            .connect(airnodeWallet)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0, { gasLimit: 1000000 })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetAuthorizationExpiration')
          .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, 0);
        authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,
          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
      });
    });
    context(
      'Sender does not have the authorization expiration setter role and is not the Airnode address',
      function () {
        it('reverts', async function () {
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.authorizationExpirationExtender)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.randomPerson)
              .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 0)
          ).to.be.revertedWith('Cannot set expiration');
        });
      }
    );
  });

  describe('setIndefiniteAuthorizationStatus', function () {
    context('Sender has indefinite authorizer role', function () {
      context('Requester address not zero', function () {
        it('sets indefinite authorization status', async function () {
          let authorizationStatus;
          // Authorize indefinitely
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(airnodeAddress, roles.requester.address, roles.indefiniteAuthorizer.address, true, 1);
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,
            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(0);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              airnodeAddress,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(true);
          // Authorizing indefinitely again should have no effect
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(airnodeAddress, roles.requester.address, roles.indefiniteAuthorizer.address, true, 1);
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,
            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(0);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              airnodeAddress,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(true);
          // Revoke indefinite authorization
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(airnodeAddress, roles.requester.address, roles.indefiniteAuthorizer.address, false, 0);
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,
            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(0);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
              airnodeAddress,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
          ).to.equal(false);
          // Revoking indefinite authorization again should have no effect
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false)
          )
            .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
            .withArgs(airnodeAddress, roles.requester.address, roles.indefiniteAuthorizer.address, false, 0);
          authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
            airnodeAddress,
            roles.requester.address
          );
          expect(authorizationStatus.expirationTimestamp).to.equal(0);
          expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          expect(
            await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
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
            requesterAuthorizerWithAirnode
              .connect(roles.indefiniteAuthorizer)
              .setIndefiniteAuthorizationStatus(airnodeAddress, hre.ethers.constants.AddressZero, true)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is the Airnode address', function () {
      it('sets indefinite authorization status', async function () {
        await accessControlRegistry
          .connect(airnodeWallet)
          .renounceRole(indefiniteAuthorizerRole, airnodeAddress, { gasLimit: 1000000 });
        let authorizationStatus;
        // Authorize indefinitely
        await expect(
          requesterAuthorizerWithAirnode
            .connect(airnodeWallet)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, true, 1);
        authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,
          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,
            roles.requester.address,
            airnodeAddress
          )
        ).to.equal(true);
        // Authorizing indefinitely again should have no effect
        await expect(
          requesterAuthorizerWithAirnode
            .connect(airnodeWallet)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, true, 1);
        authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,
          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,
            roles.requester.address,
            airnodeAddress
          )
        ).to.equal(true);
        // Revoke indefinite authorization
        await expect(
          requesterAuthorizerWithAirnode
            .connect(airnodeWallet)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, false, 0);
        authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,
          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,
            roles.requester.address,
            airnodeAddress
          )
        ).to.equal(false);
        // Revoking indefinite authorization again should have no effect
        await expect(
          requesterAuthorizerWithAirnode
            .connect(airnodeWallet)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, false, {
              gasLimit: 1000000,
            })
        )
          .to.emit(requesterAuthorizerWithAirnode, 'SetIndefiniteAuthorizationStatus')
          .withArgs(airnodeAddress, roles.requester.address, airnodeAddress, false, 0);
        authorizationStatus = await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
          airnodeAddress,
          roles.requester.address
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        expect(
          await requesterAuthorizerWithAirnode.airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
            airnodeAddress,
            roles.requester.address,
            airnodeAddress
          )
        ).to.equal(false);
      });
    });
    context('Sender does not have the indefinite authorizer role and is not the Airnode address', function () {
      it('reverts', async function () {
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationExtender)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationSetter)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.randomPerson)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true)
        ).to.be.revertedWith('Cannot set indefinite status');
      });
    });
  });

  describe('revokeIndefiniteAuthorizationStatus', function () {
    context('setter does not have the indefinite authorizer role', function () {
      context('setter is not the Airnode address', function () {
        context('Airnode address not zero', function () {
          context('Requester address not zero', function () {
            context('Setter address not zero', function () {
              it('revokes indefinite authorization status', async function () {
                // Grant indefinite authorization status
                await requesterAuthorizerWithAirnode
                  .connect(roles.indefiniteAuthorizer)
                  .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true);
                // Revoke the indefinite authorizer role
                await accessControlRegistry
                  .connect(airnodeWallet)
                  .revokeRole(indefiniteAuthorizerRole, roles.indefiniteAuthorizer.address, { gasLimit: 1000000 });
                // Revoke the indefinite authorization status
                await expect(
                  requesterAuthorizerWithAirnode
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
                      airnodeAddress,
                      roles.requester.address,
                      roles.indefiniteAuthorizer.address
                    )
                )
                  .to.emit(requesterAuthorizerWithAirnode, 'RevokedIndefiniteAuthorizationStatus')
                  .withArgs(
                    airnodeAddress,
                    roles.requester.address,
                    roles.indefiniteAuthorizer.address,
                    roles.randomPerson.address,
                    0
                  );
                const authorizationStatus =
                  await requesterAuthorizerWithAirnode.airnodeToRequesterToAuthorizationStatus(
                    airnodeAddress,
                    roles.requester.address
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                // Revoking twice should not emit an event
                await expect(
                  requesterAuthorizerWithAirnode
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
                      airnodeAddress,
                      roles.requester.address,
                      roles.indefiniteAuthorizer.address
                    )
                ).to.not.emit(requesterAuthorizerWithAirnode, 'RevokedIndefiniteAuthorizationStatus');
              });
            });
            context('Setter address zero', function () {
              it('reverts', async function () {
                await expect(
                  requesterAuthorizerWithAirnode
                    .connect(roles.randomPerson)
                    .revokeIndefiniteAuthorizationStatus(
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
                requesterAuthorizerWithAirnode
                  .connect(roles.randomPerson)
                  .revokeIndefiniteAuthorizationStatus(
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
              requesterAuthorizerWithAirnode
                .connect(roles.randomPerson)
                .revokeIndefiniteAuthorizationStatus(
                  hre.ethers.constants.AddressZero,
                  roles.requester.address,
                  roles.randomPerson.address
                )
            ).to.be.revertedWith('Airnode address zero');
          });
        });
      });
      context('setter is the Airnode address', function () {
        it('reverts', async function () {
          await accessControlRegistry
            .connect(airnodeWallet)
            .renounceRole(indefiniteAuthorizerRole, airnodeAddress, { gasLimit: 1000000 });
          await expect(
            requesterAuthorizerWithAirnode
              .connect(roles.randomPerson)
              .revokeIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, airnodeAddress)
          ).to.be.revertedWith('setter can set indefinite status');
        });
      });
    });
    context('setter has the indefinite authorizer role', function () {
      it('reverts', async function () {
        await expect(
          requesterAuthorizerWithAirnode
            .connect(roles.randomPerson)
            .revokeIndefiniteAuthorizationStatus(
              airnodeAddress,
              roles.requester.address,
              roles.indefiniteAuthorizer.address
            )
        ).to.be.revertedWith('setter can set indefinite status');
      });
    });
  });

  describe('deriveAdminRole', function () {
    it('derives admin role for the Airnode', async function () {
      expect(await requesterAuthorizerWithAirnode.deriveAdminRole(airnodeAddress)).to.equal(adminRole);
    });
  });

  describe('deriveAuthorizationExpirationExtenderRole', function () {
    it('derives authorization expiration extender role for the Airnode', async function () {
      expect(await requesterAuthorizerWithAirnode.deriveAuthorizationExpirationExtenderRole(airnodeAddress)).to.equal(
        authorizationExpirationExtenderRole
      );
    });
  });

  describe('deriveAuthorizationExpirationSetterRole', function () {
    it('derives authorization expiration setter role for the Airnode', async function () {
      expect(await requesterAuthorizerWithAirnode.deriveAuthorizationExpirationSetterRole(airnodeAddress)).to.equal(
        authorizationExpirationSetterRole
      );
    });
  });

  describe('deriveIndefiniteAuthorizerRole', function () {
    it('derives indefinite authorizer role for the Airnode', async function () {
      expect(await requesterAuthorizerWithAirnode.deriveIndefiniteAuthorizerRole(airnodeAddress)).to.equal(
        indefiniteAuthorizerRole
      );
    });
  });

  describe('isAuthorized', function () {
    context('Requester is authorized indefinitely', function () {
      context('Requester is authorized temporarily', function () {
        it('returns true', async function () {
          await requesterAuthorizerWithAirnode
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true);
          await requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 2000000000);
          expect(await requesterAuthorizerWithAirnode.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            true
          );
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns true', async function () {
          await requesterAuthorizerWithAirnode
            .connect(roles.indefiniteAuthorizer)
            .setIndefiniteAuthorizationStatus(airnodeAddress, roles.requester.address, true);
          expect(await requesterAuthorizerWithAirnode.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            true
          );
        });
      });
    });
    context('Requester is not authorized indefinitely', function () {
      context('Requester is authorized temporarily', function () {
        it('returns true', async function () {
          await requesterAuthorizerWithAirnode
            .connect(roles.authorizationExpirationSetter)
            .setAuthorizationExpiration(airnodeAddress, roles.requester.address, 2000000000);
          expect(await requesterAuthorizerWithAirnode.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            true
          );
        });
      });
      context('Requester is not authorized temporarily', function () {
        it('returns false', async function () {
          expect(await requesterAuthorizerWithAirnode.isAuthorized(airnodeAddress, roles.requester.address)).to.equal(
            false
          );
        });
      });
    });
  });
});
