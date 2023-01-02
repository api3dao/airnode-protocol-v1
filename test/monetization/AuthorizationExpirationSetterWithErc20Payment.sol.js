const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('AuthorizationExpirationSetterWithErc20Payment', function () {
  let roles;
  let expiringMetaCallForwarder,
    accessControlRegistry,
    airnodeEndpointPriceRegistry,
    requesterAuthorizerRegistry,
    requesterAuthorizerWithManager,
    authorizationExpirationSetterWithErc20Payment,
    token;
  let authorizationExpirationSetterWithErc20PaymentAdminRoleDescription =
    'AuthorizationExpirationSetterWithErc20Payment admin';
  let tokenDecimals = 12;
  let tokenPrice = hre.ethers.BigNumber.from(`5${'0'.repeat(18)}`); // $5
  let priceCoefficient = hre.ethers.BigNumber.from(`2${'0'.repeat(tokenDecimals)}`); // 2x
  let chainId = 3;

  const AirnodeParticipationStatus = Object.freeze({ Inactive: 0, Active: 1, OptedOut: 2 });

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      proceedsDestination: accounts[2],
      maintainer: accounts[3],
      blocker: accounts[4],
      airnode: accounts[5],
      payer: accounts[6],
      randomPerson: accounts[9],
    };
    const expiringMetaCallForwarderFactory = await hre.ethers.getContractFactory(
      'ExpiringMetaCallForwarder',
      roles.deployer
    );
    expiringMetaCallForwarder = await expiringMetaCallForwarderFactory.deploy();
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    accessControlRegistry = await accessControlRegistryFactory.deploy(expiringMetaCallForwarder.address);
    const airnodeEndpointPriceRegistryFactory = await hre.ethers.getContractFactory(
      'AirnodeEndpointPriceRegistry',
      roles.deployer
    );
    airnodeEndpointPriceRegistry = await airnodeEndpointPriceRegistryFactory.deploy(
      accessControlRegistry.address,
      'AirnodeEndpointPriceRegistry admin',
      roles.manager.address
    );
    const requesterAuthorizerRegistryFactory = await hre.ethers.getContractFactory(
      'RequesterAuthorizerRegistry',
      roles.deployer
    );
    requesterAuthorizerRegistry = await requesterAuthorizerRegistryFactory.deploy(
      accessControlRegistry.address,
      'RequesterAuthorizerRegistry admin',
      roles.manager.address
    );
    const requesterAuthorizerWithManagerFactory = await hre.ethers.getContractFactory(
      'RequesterAuthorizerWithManager',
      roles.deployer
    );
    requesterAuthorizerWithManager = await requesterAuthorizerWithManagerFactory.deploy(
      accessControlRegistry.address,
      'RequesterAuthorizerWithManager admin',
      roles.manager.address,
      expiringMetaCallForwarder.address
    );
    await requesterAuthorizerRegistry
      .connect(roles.manager)
      .registerChainRequesterAuthorizer(chainId, requesterAuthorizerWithManager.address);
    const tokenFactory = await hre.ethers.getContractFactory('MockERC20', roles.deployer);
    token = await tokenFactory.deploy(tokenDecimals);
    const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
      'AuthorizationExpirationSetterWithErc20Payment',
      roles.deployer
    );
    authorizationExpirationSetterWithErc20Payment = await authorizationExpirationSetterWithErc20PaymentFactory.deploy(
      accessControlRegistry.address,
      authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
      roles.manager.address,
      airnodeEndpointPriceRegistry.address,
      requesterAuthorizerRegistry.address,
      token.address,
      tokenPrice,
      priceCoefficient,
      roles.proceedsDestination.address
    );

    const managerRootRole = await accessControlRegistry.deriveRootRole(roles.manager.address);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, await requesterAuthorizerWithManager.adminRoleDescription());
    const authorizationExpirationSetterRole = await requesterAuthorizerWithManager.authorizationExpirationSetterRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        await requesterAuthorizerWithManager.adminRole(),
        await requesterAuthorizerWithManager.AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(authorizationExpirationSetterRole, authorizationExpirationSetterWithErc20Payment.address);

    const adminRole = await authorizationExpirationSetterWithErc20Payment.adminRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        managerRootRole,
        authorizationExpirationSetterWithErc20PaymentAdminRoleDescription
      );
    const maintainerRole = await authorizationExpirationSetterWithErc20Payment.maintainerRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        adminRole,
        await authorizationExpirationSetterWithErc20Payment.MAINTAINER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry.connect(roles.manager).grantRole(maintainerRole, roles.maintainer.address);
    const blockerRole = await authorizationExpirationSetterWithErc20Payment.blockerRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        adminRole,
        await authorizationExpirationSetterWithErc20Payment.BLOCKER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry.connect(roles.manager).grantRole(blockerRole, roles.blocker.address);
    await token.connect(roles.deployer).transfer(roles.payer.address, hre.ethers.utils.parseEther('1'));
  });

  describe('constructor', function () {
    context('Token address is not zero', function () {
      context('Token price is not zero', function () {
        context('Price coefficient is not zero', function () {
          context('Proceeds destination is not zero', function () {
            context('Price denomination matches with the registry', function () {
              context('Price decimals matches with the registry', function () {
                context('Pricing interval matches with the registry', function () {
                  it('constructs', async function () {
                    const adminRole = await authorizationExpirationSetterWithErc20Payment.adminRole();
                    expect(await authorizationExpirationSetterWithErc20Payment.MAINTAINER_ROLE_DESCRIPTION()).to.equal(
                      'Maintainer'
                    );
                    expect(await authorizationExpirationSetterWithErc20Payment.maintainerRole()).to.equal(
                      hre.ethers.utils.keccak256(
                        hre.ethers.utils.solidityPack(
                          ['bytes32', 'bytes32'],
                          [
                            adminRole,
                            hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['string'], ['Maintainer'])),
                          ]
                        )
                      )
                    );
                    expect(await authorizationExpirationSetterWithErc20Payment.BLOCKER_ROLE_DESCRIPTION()).to.equal(
                      'Blocker'
                    );
                    expect(await authorizationExpirationSetterWithErc20Payment.blockerRole()).to.equal(
                      hre.ethers.utils.keccak256(
                        hre.ethers.utils.solidityPack(
                          ['bytes32', 'bytes32'],
                          [
                            adminRole,
                            hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['string'], ['Blocker'])),
                          ]
                        )
                      )
                    );
                    expect(await authorizationExpirationSetterWithErc20Payment.token()).to.equal(token.address);
                    expect(await authorizationExpirationSetterWithErc20Payment.tokenPrice()).to.equal(tokenPrice);
                    expect(await authorizationExpirationSetterWithErc20Payment.priceCoefficient()).to.equal(
                      priceCoefficient
                    );
                    expect(await authorizationExpirationSetterWithErc20Payment.proceedsDestination()).to.equal(
                      roles.proceedsDestination.address
                    );
                    expect(
                      await authorizationExpirationSetterWithErc20Payment.minimumAuthorizationExpiraitonExtension()
                    ).to.equal(24 * 60 * 60);
                    expect(
                      await authorizationExpirationSetterWithErc20Payment.maximumAuthorizationExpiration()
                    ).to.equal(365 * 24 * 60 * 60);
                  });
                });
                context('Pricing interval matches with the registry', function () {
                  it('reverts', async function () {
                    const mockAirnodeEndpointPriceRegistryFactory = await hre.ethers.getContractFactory(
                      'MockAirnodeEndpointPriceRegistry',
                      roles.deployer
                    );
                    const mockAirnodeEndpointPriceRegistry = await mockAirnodeEndpointPriceRegistryFactory.deploy(
                      'USD',
                      18,
                      12 * 30 * 24 * 60 * 60
                    );
                    const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
                      'AuthorizationExpirationSetterWithErc20Payment',
                      roles.deployer
                    );
                    await expect(
                      authorizationExpirationSetterWithErc20PaymentFactory.deploy(
                        accessControlRegistry.address,
                        authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
                        roles.manager.address,
                        mockAirnodeEndpointPriceRegistry.address,
                        requesterAuthorizerRegistry.address,
                        token.address,
                        tokenPrice,
                        priceCoefficient,
                        roles.proceedsDestination.address
                      )
                    ).to.be.revertedWith('Pricing interval mismatch');
                  });
                });
              });
              context('Price decimals does not match with the registry', function () {
                it('reverts', async function () {
                  const mockAirnodeEndpointPriceRegistryFactory = await hre.ethers.getContractFactory(
                    'MockAirnodeEndpointPriceRegistry',
                    roles.deployer
                  );
                  const mockAirnodeEndpointPriceRegistry = await mockAirnodeEndpointPriceRegistryFactory.deploy(
                    'USD',
                    12,
                    30 * 24 * 60 * 60
                  );
                  const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
                    'AuthorizationExpirationSetterWithErc20Payment',
                    roles.deployer
                  );
                  await expect(
                    authorizationExpirationSetterWithErc20PaymentFactory.deploy(
                      accessControlRegistry.address,
                      authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
                      roles.manager.address,
                      mockAirnodeEndpointPriceRegistry.address,
                      requesterAuthorizerRegistry.address,
                      token.address,
                      tokenPrice,
                      priceCoefficient,
                      roles.proceedsDestination.address
                    )
                  ).to.be.revertedWith('Price decimals mismatch');
                });
              });
            });
            context('Price denomination does not match with the registry', function () {
              it('reverts', async function () {
                const mockAirnodeEndpointPriceRegistryFactory = await hre.ethers.getContractFactory(
                  'MockAirnodeEndpointPriceRegistry',
                  roles.deployer
                );
                const mockAirnodeEndpointPriceRegistry = await mockAirnodeEndpointPriceRegistryFactory.deploy(
                  'EUR',
                  18,
                  30 * 24 * 60 * 60
                );
                const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
                  'AuthorizationExpirationSetterWithErc20Payment',
                  roles.deployer
                );
                await expect(
                  authorizationExpirationSetterWithErc20PaymentFactory.deploy(
                    accessControlRegistry.address,
                    authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
                    roles.manager.address,
                    mockAirnodeEndpointPriceRegistry.address,
                    requesterAuthorizerRegistry.address,
                    token.address,
                    tokenPrice,
                    priceCoefficient,
                    roles.proceedsDestination.address
                  )
                ).to.be.revertedWith('Price denomination mismatch');
              });
            });
          });
          context('Proceeds destination is zero', function () {
            it('reverts', async function () {
              const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
                'AuthorizationExpirationSetterWithErc20Payment',
                roles.deployer
              );
              await expect(
                authorizationExpirationSetterWithErc20PaymentFactory.deploy(
                  accessControlRegistry.address,
                  authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
                  roles.manager.address,
                  airnodeEndpointPriceRegistry.address,
                  requesterAuthorizerRegistry.address,
                  token.address,
                  tokenPrice,
                  priceCoefficient,
                  hre.ethers.constants.AddressZero
                )
              ).to.be.revertedWith('Proceeds destination zero');
            });
          });
        });
        context('Price coefficient is zero', function () {
          it('reverts', async function () {
            const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
              'AuthorizationExpirationSetterWithErc20Payment',
              roles.deployer
            );
            await expect(
              authorizationExpirationSetterWithErc20PaymentFactory.deploy(
                accessControlRegistry.address,
                authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
                roles.manager.address,
                airnodeEndpointPriceRegistry.address,
                requesterAuthorizerRegistry.address,
                token.address,
                tokenPrice,
                0,
                roles.proceedsDestination.address
              )
            ).to.be.revertedWith('Price coefficient zero');
          });
        });
      });
      context('Token price is zero', function () {
        it('reverts', async function () {
          const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
            'AuthorizationExpirationSetterWithErc20Payment',
            roles.deployer
          );
          await expect(
            authorizationExpirationSetterWithErc20PaymentFactory.deploy(
              accessControlRegistry.address,
              authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
              roles.manager.address,
              airnodeEndpointPriceRegistry.address,
              requesterAuthorizerRegistry.address,
              token.address,
              0,
              priceCoefficient,
              roles.proceedsDestination.address
            )
          ).to.be.revertedWith('Token price zero');
        });
      });
    });
    context('Token address is zero', function () {
      it('reverts', async function () {
        const authorizationExpirationSetterWithErc20PaymentFactory = await hre.ethers.getContractFactory(
          'AuthorizationExpirationSetterWithErc20Payment',
          roles.deployer
        );
        await expect(
          authorizationExpirationSetterWithErc20PaymentFactory.deploy(
            accessControlRegistry.address,
            authorizationExpirationSetterWithErc20PaymentAdminRoleDescription,
            roles.manager.address,
            airnodeEndpointPriceRegistry.address,
            requesterAuthorizerRegistry.address,
            hre.ethers.constants.AddressZero,
            tokenPrice,
            priceCoefficient,
            roles.proceedsDestination.address
          )
        ).to.be.revertedWith('Token address zero');
      });
    });
  });

  describe('setTokenPrice', function () {
    context('Sender is maintainer', function () {
      context('Token price is not zero', function () {
        it('sets token price', async function () {
          await expect(authorizationExpirationSetterWithErc20Payment.connect(roles.maintainer).setTokenPrice(123))
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetTokenPrice')
            .withArgs(123, roles.maintainer.address);
          expect(await authorizationExpirationSetterWithErc20Payment.tokenPrice()).to.equal(123);
        });
      });
      context('Token price is zero', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment.connect(roles.maintainer).setTokenPrice(0)
          ).to.be.revertedWith('Token price zero');
        });
      });
    });
    context('Sender is manager', function () {
      context('Token price is not zero', function () {
        it('sets token price', async function () {
          await expect(authorizationExpirationSetterWithErc20Payment.connect(roles.manager).setTokenPrice(123))
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetTokenPrice')
            .withArgs(123, roles.manager.address);
          expect(await authorizationExpirationSetterWithErc20Payment.tokenPrice()).to.equal(123);
        });
      });
      context('Token price is zero', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment.connect(roles.manager).setTokenPrice(0)
          ).to.be.revertedWith('Token price zero');
        });
      });
    });
    context('Sender is not maintainer and manager', function () {
      it('reverts', async function () {
        await expect(
          authorizationExpirationSetterWithErc20Payment.connect(roles.randomPerson).setTokenPrice(123)
        ).to.be.revertedWith('Sender cannot maintain');
      });
    });
  });

  describe('setPriceCoefficient', function () {
    context('Sender is maintainer', function () {
      context('Price coefficient is not zero', function () {
        it('sets price coefficient', async function () {
          await expect(authorizationExpirationSetterWithErc20Payment.connect(roles.maintainer).setPriceCoefficient(123))
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetPriceCoefficient')
            .withArgs(123, roles.maintainer.address);
          expect(await authorizationExpirationSetterWithErc20Payment.priceCoefficient()).to.equal(123);
        });
      });
      context('Price coefficient is zero', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment.connect(roles.maintainer).setPriceCoefficient(0)
          ).to.be.revertedWith('Price coefficient zero');
        });
      });
    });
    context('Sender is manager', function () {
      context('Price coefficient is not zero', function () {
        it('sets price coefficient', async function () {
          await expect(authorizationExpirationSetterWithErc20Payment.connect(roles.manager).setPriceCoefficient(123))
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetPriceCoefficient')
            .withArgs(123, roles.manager.address);
          expect(await authorizationExpirationSetterWithErc20Payment.priceCoefficient()).to.equal(123);
        });
      });
      context('Price coefficient is zero', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment.connect(roles.manager).setPriceCoefficient(0)
          ).to.be.revertedWith('Price coefficient zero');
        });
      });
    });
    context('Sender is not maintainer and manager', function () {
      it('reverts', async function () {
        await expect(
          authorizationExpirationSetterWithErc20Payment.connect(roles.randomPerson).setPriceCoefficient(123)
        ).to.be.revertedWith('Sender cannot maintain');
      });
    });
  });

  describe('setAirnodeParticipationStatus', function () {
    context('Airnode address is not zero', function () {
      context('Sender is Airnode', function () {
        context('Status is not Active', function () {
          it('sets Airnode participation status', async function () {
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut)
            )
              .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetAirnodeParticipationStatus')
              .withArgs(roles.airnode.address, AirnodeParticipationStatus.OptedOut, roles.airnode.address);
            expect(
              await authorizationExpirationSetterWithErc20Payment.airnodeToParticipationStatus(roles.airnode.address)
            ).to.equal(AirnodeParticipationStatus.OptedOut);
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
            )
              .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetAirnodeParticipationStatus')
              .withArgs(roles.airnode.address, AirnodeParticipationStatus.Inactive, roles.airnode.address);
            expect(
              await authorizationExpirationSetterWithErc20Payment.airnodeToParticipationStatus(roles.airnode.address)
            ).to.equal(AirnodeParticipationStatus.Inactive);
          });
        });
        context('Status is Active', function () {
          it('reverts', async function () {
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
            ).to.be.revertedWith('Airnode cannot activate itself');
          });
        });
      });
      context('Sender is maintainer', function () {
        context('Status is not OptedOut', function () {
          context('Airnode has not opted out', function () {
            it('sets Airnode participation status', async function () {
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              )
                .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Active, roles.maintainer.address);
              expect(
                await authorizationExpirationSetterWithErc20Payment.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Active);
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              )
                .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Inactive, roles.maintainer.address);
              expect(
                await authorizationExpirationSetterWithErc20Payment.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Inactive);
            });
          });
          context('Airnode has opted out', function () {
            it('reverts', async function () {
              await authorizationExpirationSetterWithErc20Payment
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut);
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              ).to.be.revertedWith('Airnode opted out');
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              ).to.be.revertedWith('Airnode opted out');
            });
          });
        });
        context('Status is OptedOut', function () {
          it('reverts', async function () {
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.maintainer)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut)
            ).to.be.revertedWith('Only Airnode can opt out');
          });
        });
      });
      context('Sender is manager', function () {
        context('Status is not OptedOut', function () {
          context('Airnode has not opted out', function () {
            it('sets Airnode participation status', async function () {
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              )
                .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Active, roles.manager.address);
              expect(
                await authorizationExpirationSetterWithErc20Payment.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Active);
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              )
                .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Inactive, roles.manager.address);
              expect(
                await authorizationExpirationSetterWithErc20Payment.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Inactive);
            });
          });
          context('Airnode has opted out', function () {
            it('reverts', async function () {
              await authorizationExpirationSetterWithErc20Payment
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut);
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              ).to.be.revertedWith('Airnode opted out');
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              ).to.be.revertedWith('Airnode opted out');
            });
          });
        });
        context('Status is OptedOut', function () {
          it('reverts', async function () {
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.manager)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut)
            ).to.be.revertedWith('Only Airnode can opt out');
          });
        });
      });
      context('Sender is not maintainer and manager', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.randomPerson)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
          ).to.be.revertedWith('Sender cannot maintain');
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.randomPerson)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
          ).to.be.revertedWith('Sender cannot maintain');
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.randomPerson)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut)
          ).to.be.revertedWith('Sender cannot maintain');
        });
      });
    });
    context('Airnode address is zero', function () {
      it('reverts', async function () {
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(hre.ethers.constants.AddressZero, AirnodeParticipationStatus.Inactive)
        ).to.be.revertedWith('Airnode address zero');
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(hre.ethers.constants.AddressZero, AirnodeParticipationStatus.Active)
        ).to.be.revertedWith('Airnode address zero');
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(hre.ethers.constants.AddressZero, AirnodeParticipationStatus.OptedOut)
        ).to.be.revertedWith('Airnode address zero');
      });
    });
  });

  describe('setProceedsDestination', function () {
    context('Sender is manager', function () {
      context('Proceeds destination is not zero', function () {
        it('sets proceeds destination', async function () {
          const proceedsDestination = testUtils.generateRandomAddress();
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setProceedsDestination(proceedsDestination)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetProceedsDestination')
            .withArgs(proceedsDestination);
          expect(await authorizationExpirationSetterWithErc20Payment.proceedsDestination()).to.equal(
            proceedsDestination
          );
        });
      });
      context('Proceeds destination is zero', function () {
        it('reverts', async function () {
          const proceedsDestination = hre.ethers.constants.AddressZero;
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setProceedsDestination(proceedsDestination)
          ).to.be.revertedWith('Proceeds destination zero');
        });
      });
    });
    context('Sender is not manager', function () {
      it('reverts', async function () {
        const proceedsDestination = testUtils.generateRandomAddress();
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .setProceedsDestination(proceedsDestination)
        ).to.be.revertedWith('Sender not manager');
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.maintainer)
            .setProceedsDestination(proceedsDestination)
        ).to.be.revertedWith('Sender not manager');
      });
    });
  });

  describe('setRequesterBlockStatus', function () {
    context('Sender is blocker', function () {
      context('Requester address is not zero', function () {
        it('sets requester block status', async function () {
          const requester = testUtils.generateRandomAddress();
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.blocker)
              .setRequesterBlockStatus(requester, true)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatus')
            .withArgs(requester, true, roles.blocker.address);
          expect(await authorizationExpirationSetterWithErc20Payment.requesterToBlockStatus(requester)).to.equal(true);
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.blocker)
              .setRequesterBlockStatus(requester, false)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatus')
            .withArgs(requester, false, roles.blocker.address);
          expect(await authorizationExpirationSetterWithErc20Payment.requesterToBlockStatus(requester)).to.equal(false);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const requester = hre.ethers.constants.AddressZero;
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.blocker)
              .setRequesterBlockStatus(requester, true)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is manager', function () {
      context('Requester address is not zero', function () {
        it('sets requester block status', async function () {
          const requester = testUtils.generateRandomAddress();
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setRequesterBlockStatus(requester, true)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatus')
            .withArgs(requester, true, roles.manager.address);
          expect(await authorizationExpirationSetterWithErc20Payment.requesterToBlockStatus(requester)).to.equal(true);
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setRequesterBlockStatus(requester, false)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatus')
            .withArgs(requester, false, roles.manager.address);
          expect(await authorizationExpirationSetterWithErc20Payment.requesterToBlockStatus(requester)).to.equal(false);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const requester = hre.ethers.constants.AddressZero;
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setRequesterBlockStatus(requester, true)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is not maintainer and blocker', function () {
      it('reverts', async function () {
        const requester = testUtils.generateRandomAddress();
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .setRequesterBlockStatus(requester, true)
        ).to.be.revertedWith('Sender cannot block');
      });
    });
  });

  describe('setRequesterBlockStatusForAirnode', function () {
    context('Sender is blocker', function () {
      context('Airnode address is not zero', function () {
        context('Requester address is not zero', function () {
          it('sets requester block status', async function () {
            const requester = testUtils.generateRandomAddress();
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.blocker)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true)
            )
              .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, true, roles.blocker.address);
            expect(
              await authorizationExpirationSetterWithErc20Payment.airnodeToRequesterToBlockStatus(
                roles.airnode.address,
                requester
              )
            ).to.equal(true);
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.blocker)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, false)
            )
              .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, false, roles.blocker.address);
            expect(
              await authorizationExpirationSetterWithErc20Payment.airnodeToRequesterToBlockStatus(
                roles.airnode.address,
                requester
              )
            ).to.equal(false);
          });
        });
        context('Requester address is zero', function () {
          it('reverts', async function () {
            const requester = hre.ethers.constants.AddressZero;
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.blocker)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Airnode address is zero', function () {
        it('reverts', async function () {
          const requester = testUtils.generateRandomAddress();
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.blocker)
              .setRequesterBlockStatusForAirnode(hre.ethers.constants.AddressZero, requester, true)
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Sender is manager', function () {
      context('Airnode address is not zero', function () {
        context('Requester address is not zero', function () {
          it('sets requester block status', async function () {
            const requester = testUtils.generateRandomAddress();
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.manager)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true)
            )
              .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, true, roles.manager.address);
            expect(
              await authorizationExpirationSetterWithErc20Payment.airnodeToRequesterToBlockStatus(
                roles.airnode.address,
                requester
              )
            ).to.equal(true);
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.manager)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, false)
            )
              .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, false, roles.manager.address);
            expect(
              await authorizationExpirationSetterWithErc20Payment.airnodeToRequesterToBlockStatus(
                roles.airnode.address,
                requester
              )
            ).to.equal(false);
          });
        });
        context('Requester address is zero', function () {
          it('reverts', async function () {
            const requester = hre.ethers.constants.AddressZero;
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.manager)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Airnode address is zero', function () {
        it('reverts', async function () {
          const requester = testUtils.generateRandomAddress();
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.blocker)
              .setRequesterBlockStatusForAirnode(hre.ethers.constants.AddressZero, requester, true)
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Sender is not maintainer and blocker', function () {
      it('reverts', async function () {
        const requester = testUtils.generateRandomAddress();
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true)
        ).to.be.revertedWith('Sender cannot block');
      });
    });
  });

  describe('getTokenAmount', function () {
    context('Price registry returns a value', function () {
      it('gets token amount', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
        await airnodeEndpointPriceRegistry
          .connect(roles.manager)
          .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
        // $100 times 2 divided by $5 = 40 tokens with 12 decimals (because the token was defined to have 12 decimals)
        const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
        expect(
          await authorizationExpirationSetterWithErc20Payment.getTokenAmount(roles.airnode.address, chainId, endpointId)
        ).to.equal(expectedTokenAmount);
      });
    });
    context('Price registry reverts', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        await expect(
          authorizationExpirationSetterWithErc20Payment.getTokenAmount(roles.airnode.address, chainId, endpointId)
        ).to.be.revertedWith('No default price set');
      });
    });
  });

  describe('setMinimumAuthorizationExpirationExtension', function () {
    context('Sender is maintainer', function () {
      context('Minimum authorization expiration extension is valid', function () {
        it('sets minimum authorization expiration extension', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.maintainer)
              .setMinimumAuthorizationExpirationExtension(123)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetMinimumAuthorizationExpirationExtension')
            .withArgs(123, roles.maintainer.address);
          expect(
            await authorizationExpirationSetterWithErc20Payment.minimumAuthorizationExpiraitonExtension()
          ).to.equal(123);
        });
      });
      context('Minimum authorization expiration extension is not valid', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.maintainer)
              .setMinimumAuthorizationExpirationExtension(0)
          ).to.be.revertedWith('Invalid minimum duration');
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.maintainer)
              .setMinimumAuthorizationExpirationExtension(
                (await authorizationExpirationSetterWithErc20Payment.maximumAuthorizationExpiration()).add(1)
              )
          ).to.be.revertedWith('Invalid minimum duration');
        });
      });
    });
    context('Sender is manager', function () {
      context('Minimum authorization expiration extension is valid', function () {
        it('sets minimum authorization expiration extension', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setMinimumAuthorizationExpirationExtension(123)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetMinimumAuthorizationExpirationExtension')
            .withArgs(123, roles.manager.address);
          expect(
            await authorizationExpirationSetterWithErc20Payment.minimumAuthorizationExpiraitonExtension()
          ).to.equal(123);
        });
      });
      context('Minimum authorization expiration extension is not valid', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setMinimumAuthorizationExpirationExtension(0)
          ).to.be.revertedWith('Invalid minimum duration');
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setMinimumAuthorizationExpirationExtension(
                (await authorizationExpirationSetterWithErc20Payment.maximumAuthorizationExpiration()).add(1)
              )
          ).to.be.revertedWith('Invalid minimum duration');
        });
      });
    });
    context('Sender is not maintainer and manager', function () {
      it('reverts', async function () {
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .setMinimumAuthorizationExpirationExtension(123)
        ).to.be.revertedWith('Sender cannot maintain');
      });
    });
  });

  describe('setMaximumAuthorizationExpiration', function () {
    context('Sender is maintainer', function () {
      context('Minimum authorization expiration extension is valid', function () {
        it('sets minimum authorization expiration extension', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.maintainer)
              .setMaximumAuthorizationExpiration(123456)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetMaximumAuthorizationExpiration')
            .withArgs(123456, roles.maintainer.address);
          expect(await authorizationExpirationSetterWithErc20Payment.maximumAuthorizationExpiration()).to.equal(123456);
        });
      });
      context('Minimum authorization expiration extension is not valid', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.maintainer)
              .setMaximumAuthorizationExpiration(
                (await authorizationExpirationSetterWithErc20Payment.minimumAuthorizationExpiraitonExtension()).sub(1)
              )
          ).to.be.revertedWith('Invalid maximum duration');
        });
      });
    });
    context('Sender is manager', function () {
      context('Minimum authorization expiration extension is valid', function () {
        it('sets minimum authorization expiration extension', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setMaximumAuthorizationExpiration(123456)
          )
            .to.emit(authorizationExpirationSetterWithErc20Payment, 'SetMaximumAuthorizationExpiration')
            .withArgs(123456, roles.manager.address);
          expect(await authorizationExpirationSetterWithErc20Payment.maximumAuthorizationExpiration()).to.equal(123456);
        });
      });
      context('Minimum authorization expiration extension is not valid', function () {
        it('reverts', async function () {
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.manager)
              .setMaximumAuthorizationExpiration(
                (await authorizationExpirationSetterWithErc20Payment.minimumAuthorizationExpiraitonExtension()).sub(1)
              )
          ).to.be.revertedWith('Invalid maximum duration');
        });
      });
    });
    context('Sender is not maintainer and manager', function () {
      it('reverts', async function () {
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .setMaximumAuthorizationExpiration(123)
        ).to.be.revertedWith('Sender cannot maintain');
      });
    });
  });

  describe('payTokens', function () {
    context('Airnode is active', function () {
      context('Chain ID is not zero', function () {
        context('Requester address is not zero', function () {
          context('Requester is not blocked globally or for the Airnode', function () {
            context('Authorization expiration extension is not smaller than minimum', function () {
              context('Token transfer is successful', function () {
                context('RequesterAuthorizer for the chain is set', function () {
                  context('Resulting authorization expiration is not larger than maximum', function () {
                    it('sets authorization expiration', async function () {
                      const endpointId = testUtils.generateRandomBytes32();
                      const requester = testUtils.generateRandomAddress();
                      const authorizationExpirationExtension = 7 * 24 * 60 * 60;
                      const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                      const expectedTokenAmount = price
                        .mul(priceCoefficient)
                        .div(tokenPrice)
                        .mul(authorizationExpirationExtension)
                        .div(30 * 24 * 60 * 60);
                      await airnodeEndpointPriceRegistry
                        .connect(roles.manager)
                        .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                      await authorizationExpirationSetterWithErc20Payment
                        .connect(roles.maintainer)
                        .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                      await token
                        .connect(roles.payer)
                        .approve(
                          authorizationExpirationSetterWithErc20Payment.address,
                          hre.ethers.utils.parseEther('1')
                        );
                      let authorizationStatus =
                        await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                          roles.airnode.address,
                          endpointId,
                          requester
                        );
                      expect(authorizationStatus.expirationTimestamp).to.equal(0);
                      expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                      const nextTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                      await hre.ethers.provider.send('evm_setNextBlockTimestamp', [nextTimestamp]);
                      await expect(
                        authorizationExpirationSetterWithErc20Payment
                          .connect(roles.payer)
                          .payTokens(
                            roles.airnode.address,
                            chainId,
                            endpointId,
                            requester,
                            authorizationExpirationExtension
                          )
                      )
                        .to.emit(authorizationExpirationSetterWithErc20Payment, 'PaidTokens')
                        .withArgs(
                          roles.airnode.address,
                          chainId,
                          endpointId,
                          requester,
                          authorizationExpirationExtension,
                          roles.payer.address,
                          nextTimestamp + authorizationExpirationExtension
                        );
                      expect(await token.balanceOf(roles.proceedsDestination.address)).to.equal(expectedTokenAmount);
                      expect(await token.balanceOf(roles.payer.address)).to.equal(
                        hre.ethers.utils.parseEther('1').sub(expectedTokenAmount)
                      );
                      authorizationStatus =
                        await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                          roles.airnode.address,
                          endpointId,
                          requester
                        );
                      expect(authorizationStatus.expirationTimestamp).to.equal(
                        nextTimestamp + authorizationExpirationExtension
                      );
                      expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                    });
                  });
                  context('Resulting authorization expiration is larger than maximum', function () {
                    it('reverts', async function () {
                      const endpointId = testUtils.generateRandomBytes32();
                      const requester = testUtils.generateRandomAddress();
                      const authorizationExpirationExtension = 365 * 24 * 60 * 60 + 1;
                      const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                      await airnodeEndpointPriceRegistry
                        .connect(roles.manager)
                        .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                      await authorizationExpirationSetterWithErc20Payment
                        .connect(roles.maintainer)
                        .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                      await token
                        .connect(roles.payer)
                        .approve(
                          authorizationExpirationSetterWithErc20Payment.address,
                          hre.ethers.utils.parseEther('1')
                        );
                      await expect(
                        authorizationExpirationSetterWithErc20Payment
                          .connect(roles.payer)
                          .payTokens(
                            roles.airnode.address,
                            chainId,
                            endpointId,
                            requester,
                            authorizationExpirationExtension
                          )
                      ).to.be.revertedWith('Exceeds maximum duration');
                    });
                  });
                });
                context('RequesterAuthorizer for the chain is not set', function () {
                  it('reverts', async function () {
                    const anotherChainId = chainId + 1;
                    const endpointId = testUtils.generateRandomBytes32();
                    const requester = testUtils.generateRandomAddress();
                    const authorizationExpirationExtension = 7 * 24 * 60 * 60;
                    const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                    await airnodeEndpointPriceRegistry
                      .connect(roles.manager)
                      .registerAirnodeChainEndpointPrice(roles.airnode.address, anotherChainId, endpointId, price);
                    await authorizationExpirationSetterWithErc20Payment
                      .connect(roles.maintainer)
                      .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                    await token
                      .connect(roles.payer)
                      .approve(authorizationExpirationSetterWithErc20Payment.address, hre.ethers.utils.parseEther('1'));
                    await expect(
                      authorizationExpirationSetterWithErc20Payment
                        .connect(roles.payer)
                        .payTokens(
                          roles.airnode.address,
                          anotherChainId,
                          endpointId,
                          requester,
                          authorizationExpirationExtension
                        )
                    ).to.be.revertedWith('No Authorizer set for chain');
                  });
                });
              });
              context('Token transfer is not successful', function () {
                it('reverts', async function () {
                  const endpointId = testUtils.generateRandomBytes32();
                  const requester = testUtils.generateRandomAddress();
                  const authorizationExpirationExtension = 7 * 24 * 60 * 60;
                  const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                  await airnodeEndpointPriceRegistry
                    .connect(roles.manager)
                    .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                  await authorizationExpirationSetterWithErc20Payment
                    .connect(roles.maintainer)
                    .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                  await expect(
                    authorizationExpirationSetterWithErc20Payment
                      .connect(roles.payer)
                      .payTokens(
                        roles.airnode.address,
                        chainId,
                        endpointId,
                        requester,
                        authorizationExpirationExtension
                      )
                  ).to.be.revertedWith('ERC20: insufficient allowance');
                });
              });
            });
            context('Authorization expiration extension is smaller than minimum', function () {
              it('reverts', async function () {
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const authorizationExpirationExtension = 123;
                await authorizationExpirationSetterWithErc20Payment
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await expect(
                  authorizationExpirationSetterWithErc20Payment
                    .connect(roles.payer)
                    .payTokens(roles.airnode.address, chainId, endpointId, requester, authorizationExpirationExtension)
                ).to.be.revertedWith('Extension below minimum');
              });
            });
          });
          context('Requester is blocked globally', function () {
            it('reverts', async function () {
              const endpointId = testUtils.generateRandomBytes32();
              const requester = testUtils.generateRandomAddress();
              const authorizationExpirationExtension = 7 * 24 * 60 * 60;
              await authorizationExpirationSetterWithErc20Payment
                .connect(roles.maintainer)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
              await authorizationExpirationSetterWithErc20Payment
                .connect(roles.blocker)
                .setRequesterBlockStatus(requester, true);
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.payer)
                  .payTokens(roles.airnode.address, chainId, endpointId, requester, authorizationExpirationExtension)
              ).to.be.revertedWith('Requester blocked');
            });
          });
          context('Requester is blocked for Airnode', function () {
            it('reverts', async function () {
              const endpointId = testUtils.generateRandomBytes32();
              const requester = testUtils.generateRandomAddress();
              const authorizationExpirationExtension = 7 * 24 * 60 * 60;
              await authorizationExpirationSetterWithErc20Payment
                .connect(roles.maintainer)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
              await authorizationExpirationSetterWithErc20Payment
                .connect(roles.blocker)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true);
              await expect(
                authorizationExpirationSetterWithErc20Payment
                  .connect(roles.payer)
                  .payTokens(roles.airnode.address, chainId, endpointId, requester, authorizationExpirationExtension)
              ).to.be.revertedWith('Requester blocked');
            });
          });
        });
        context('Requester address is zero', function () {
          it('reverts', async function () {
            const endpointId = testUtils.generateRandomBytes32();
            const requester = hre.ethers.constants.AddressZero;
            const authorizationExpirationExtension = 7 * 24 * 60 * 60;
            await authorizationExpirationSetterWithErc20Payment
              .connect(roles.maintainer)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
            await expect(
              authorizationExpirationSetterWithErc20Payment
                .connect(roles.payer)
                .payTokens(roles.airnode.address, chainId, endpointId, requester, authorizationExpirationExtension)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Chain ID is zero', function () {
        it('reverts', async function () {
          const endpointId = testUtils.generateRandomBytes32();
          const requester = testUtils.generateRandomAddress();
          const authorizationExpirationExtension = 7 * 24 * 60 * 60;
          await authorizationExpirationSetterWithErc20Payment
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
          await expect(
            authorizationExpirationSetterWithErc20Payment
              .connect(roles.payer)
              .payTokens(roles.airnode.address, 0, endpointId, requester, authorizationExpirationExtension)
          ).to.be.revertedWith('Chain ID zero');
        });
      });
    });
    context('Airnode is not active', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        const authorizationExpirationExtension = 7 * 24 * 60 * 60;
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.payer)
            .payTokens(roles.airnode.address, chainId, endpointId, requester, authorizationExpirationExtension)
        ).to.be.revertedWith('Airnode not active');
      });
    });
  });

  describe('resetAuthorizationExpirationOfBlockedRequester', function () {
    context('Requester is blocked globally', function () {
      it('resets authorization expiration of blocked requester', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        const authorizationExpirationExtension = 7 * 24 * 60 * 60;
        const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
        await airnodeEndpointPriceRegistry
          .connect(roles.manager)
          .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
        await authorizationExpirationSetterWithErc20Payment
          .connect(roles.maintainer)
          .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
        await token
          .connect(roles.payer)
          .approve(authorizationExpirationSetterWithErc20Payment.address, hre.ethers.utils.parseEther('1'));
        const nextTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        await hre.ethers.provider.send('evm_setNextBlockTimestamp', [nextTimestamp]);
        await authorizationExpirationSetterWithErc20Payment
          .connect(roles.payer)
          .payTokens(roles.airnode.address, chainId, endpointId, requester, authorizationExpirationExtension);
        await authorizationExpirationSetterWithErc20Payment
          .connect(roles.blocker)
          .setRequesterBlockStatus(requester, true);
        let authorizationStatus =
          await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
            roles.airnode.address,
            endpointId,
            requester
          );
        expect(authorizationStatus.expirationTimestamp).to.equal(nextTimestamp + authorizationExpirationExtension);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .resetAuthorizationExpirationOfBlockedRequester(roles.airnode.address, chainId, endpointId, requester)
        )
          .to.emit(authorizationExpirationSetterWithErc20Payment, 'ResetAuthorizationExpirationOfBlockedRequester')
          .withArgs(roles.airnode.address, chainId, endpointId, requester, roles.randomPerson.address);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
          roles.airnode.address,
          endpointId,
          requester
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
      });
    });
    context('Requester is blocked for Airnode', function () {
      it('resets authorization expiration of blocked requester', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        const authorizationExpirationExtension = 7 * 24 * 60 * 60;
        const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
        await airnodeEndpointPriceRegistry
          .connect(roles.manager)
          .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
        await authorizationExpirationSetterWithErc20Payment
          .connect(roles.maintainer)
          .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
        await token
          .connect(roles.payer)
          .approve(authorizationExpirationSetterWithErc20Payment.address, hre.ethers.utils.parseEther('1'));
        const nextTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        await hre.ethers.provider.send('evm_setNextBlockTimestamp', [nextTimestamp]);
        await authorizationExpirationSetterWithErc20Payment
          .connect(roles.payer)
          .payTokens(roles.airnode.address, chainId, endpointId, requester, authorizationExpirationExtension);
        await authorizationExpirationSetterWithErc20Payment
          .connect(roles.blocker)
          .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true);
        let authorizationStatus =
          await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
            roles.airnode.address,
            endpointId,
            requester
          );
        expect(authorizationStatus.expirationTimestamp).to.equal(nextTimestamp + authorizationExpirationExtension);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .resetAuthorizationExpirationOfBlockedRequester(roles.airnode.address, chainId, endpointId, requester)
        )
          .to.emit(authorizationExpirationSetterWithErc20Payment, 'ResetAuthorizationExpirationOfBlockedRequester')
          .withArgs(roles.airnode.address, chainId, endpointId, requester, roles.randomPerson.address);
        authorizationStatus = await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
          roles.airnode.address,
          endpointId,
          requester
        );
        expect(authorizationStatus.expirationTimestamp).to.equal(0);
        expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
      });
    });
    context('Requester is not blocked globally or for the Airnode', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        await expect(
          authorizationExpirationSetterWithErc20Payment
            .connect(roles.randomPerson)
            .resetAuthorizationExpirationOfBlockedRequester(roles.airnode.address, chainId, endpointId, requester)
        ).to.be.revertedWith('Requester not blocked');
      });
    });
  });

  describe('getTokenPaymentAmount', function () {
    context('Price registry returns a value', function () {
      it('gets token payment amount', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const authorizationExpirationExtension = 7 * 24 * 60 * 60;
        const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
        await airnodeEndpointPriceRegistry
          .connect(roles.manager)
          .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
        // $100 times 2 divided by $5 divided by 4 = ~10 tokens with 12 decimals (because the token was defined to have 12 decimals)
        const expectedTokenAmount = price
          .mul(priceCoefficient)
          .div(tokenPrice)
          .mul(authorizationExpirationExtension)
          .div(30 * 24 * 60 * 60);
        expect(
          await authorizationExpirationSetterWithErc20Payment.getTokenPaymentAmount(
            roles.airnode.address,
            chainId,
            endpointId,
            authorizationExpirationExtension
          )
        ).to.equal(expectedTokenAmount);
      });
    });
    context('Price registry reverts', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const authorizationExpirationExtension = 7 * 24 * 60 * 60;
        await expect(
          authorizationExpirationSetterWithErc20Payment.getTokenPaymentAmount(
            roles.airnode.address,
            chainId,
            endpointId,
            authorizationExpirationExtension
          )
        ).to.be.revertedWith('No default price set');
      });
    });
  });
});
