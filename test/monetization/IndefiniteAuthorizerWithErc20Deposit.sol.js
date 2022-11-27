const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('IndefiniteAuthorizerWithErc20Deposit', function () {
  let roles;
  let expiringMetaCallForwarder,
    accessControlRegistry,
    airnodeEndpointPriceRegistry,
    requesterAuthorizerRegistry,
    requesterAuthorizerWithManager,
    indefiniteAuthorizerWithErc20Deposit,
    token;
  let indefiniteAuthorizerWithErc20DepositAdminRoleDescription = 'IndefiniteAuthorizerWithErc20Deposit admin';
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
      depositor: accounts[6],
      anotherDepositor: accounts[7],
      randomPerson: accounts[9],
    };
    const expiringMetaCallForwarderFactory = await hre.ethers.getContractFactory(
      'ExpiringMetaCallForwarder',
      roles.deployer
    );
    expiringMetaCallForwarder = await expiringMetaCallForwarderFactory.deploy();
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    accessControlRegistry = await accessControlRegistryFactory.deploy();
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
    const indefiniteAuthorizerWithErc20DepositFactory = await hre.ethers.getContractFactory(
      'IndefiniteAuthorizerWithErc20Deposit',
      roles.deployer
    );
    indefiniteAuthorizerWithErc20Deposit = await indefiniteAuthorizerWithErc20DepositFactory.deploy(
      accessControlRegistry.address,
      indefiniteAuthorizerWithErc20DepositAdminRoleDescription,
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
    const indefiniteAuthorizerRole = await requesterAuthorizerWithManager.indefiniteAuthorizerRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        await requesterAuthorizerWithManager.adminRole(),
        await requesterAuthorizerWithManager.INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(indefiniteAuthorizerRole, indefiniteAuthorizerWithErc20Deposit.address);

    const adminRole = await indefiniteAuthorizerWithErc20Deposit.adminRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, indefiniteAuthorizerWithErc20DepositAdminRoleDescription);
    const maintainerRole = await indefiniteAuthorizerWithErc20Deposit.maintainerRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(
        adminRole,
        await indefiniteAuthorizerWithErc20Deposit.MAINTAINER_ROLE_DESCRIPTION()
      );
    await accessControlRegistry.connect(roles.manager).grantRole(maintainerRole, roles.maintainer.address);
    const blockerRole = await indefiniteAuthorizerWithErc20Deposit.blockerRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, await indefiniteAuthorizerWithErc20Deposit.BLOCKER_ROLE_DESCRIPTION());
    await accessControlRegistry.connect(roles.manager).grantRole(blockerRole, roles.blocker.address);
    await token.connect(roles.deployer).transfer(roles.depositor.address, hre.ethers.utils.parseEther('1'));
    await token.connect(roles.deployer).transfer(roles.anotherDepositor.address, hre.ethers.utils.parseEther('1'));
  });

  describe('constructor', function () {
    context('Token address is not zero', function () {
      context('Token price is not zero', function () {
        context('Price coefficient is not zero', function () {
          context('Proceeds destination is not zero', function () {
            context('Price denomination matches with the registry', function () {
              context('Price decimals matches with the registry', function () {
                it('constructs', async function () {
                  const adminRole = await indefiniteAuthorizerWithErc20Deposit.adminRole();
                  expect(await indefiniteAuthorizerWithErc20Deposit.MAINTAINER_ROLE_DESCRIPTION()).to.equal(
                    'Maintainer'
                  );
                  expect(await indefiniteAuthorizerWithErc20Deposit.maintainerRole()).to.equal(
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
                  expect(await indefiniteAuthorizerWithErc20Deposit.BLOCKER_ROLE_DESCRIPTION()).to.equal('Blocker');
                  expect(await indefiniteAuthorizerWithErc20Deposit.blockerRole()).to.equal(
                    hre.ethers.utils.keccak256(
                      hre.ethers.utils.solidityPack(
                        ['bytes32', 'bytes32'],
                        [adminRole, hre.ethers.utils.keccak256(hre.ethers.utils.solidityPack(['string'], ['Blocker']))]
                      )
                    )
                  );
                  expect(await indefiniteAuthorizerWithErc20Deposit.token()).to.equal(token.address);
                  expect(await indefiniteAuthorizerWithErc20Deposit.tokenPrice()).to.equal(tokenPrice);
                  expect(await indefiniteAuthorizerWithErc20Deposit.priceCoefficient()).to.equal(priceCoefficient);
                  expect(await indefiniteAuthorizerWithErc20Deposit.proceedsDestination()).to.equal(
                    roles.proceedsDestination.address
                  );
                  expect(await indefiniteAuthorizerWithErc20Deposit.withdrawalLeadTime()).to.equal(0);
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
                  const indefiniteAuthorizerWithErc20DepositFactory = await hre.ethers.getContractFactory(
                    'IndefiniteAuthorizerWithErc20Deposit',
                    roles.deployer
                  );
                  await expect(
                    indefiniteAuthorizerWithErc20DepositFactory.deploy(
                      accessControlRegistry.address,
                      indefiniteAuthorizerWithErc20DepositAdminRoleDescription,
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
                const indefiniteAuthorizerWithErc20DepositFactory = await hre.ethers.getContractFactory(
                  'IndefiniteAuthorizerWithErc20Deposit',
                  roles.deployer
                );
                await expect(
                  indefiniteAuthorizerWithErc20DepositFactory.deploy(
                    accessControlRegistry.address,
                    indefiniteAuthorizerWithErc20DepositAdminRoleDescription,
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
              const indefiniteAuthorizerWithErc20DepositFactory = await hre.ethers.getContractFactory(
                'IndefiniteAuthorizerWithErc20Deposit',
                roles.deployer
              );
              await expect(
                indefiniteAuthorizerWithErc20DepositFactory.deploy(
                  accessControlRegistry.address,
                  indefiniteAuthorizerWithErc20DepositAdminRoleDescription,
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
            const indefiniteAuthorizerWithErc20DepositFactory = await hre.ethers.getContractFactory(
              'IndefiniteAuthorizerWithErc20Deposit',
              roles.deployer
            );
            await expect(
              indefiniteAuthorizerWithErc20DepositFactory.deploy(
                accessControlRegistry.address,
                indefiniteAuthorizerWithErc20DepositAdminRoleDescription,
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
          const indefiniteAuthorizerWithErc20DepositFactory = await hre.ethers.getContractFactory(
            'IndefiniteAuthorizerWithErc20Deposit',
            roles.deployer
          );
          await expect(
            indefiniteAuthorizerWithErc20DepositFactory.deploy(
              accessControlRegistry.address,
              indefiniteAuthorizerWithErc20DepositAdminRoleDescription,
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
        const indefiniteAuthorizerWithErc20DepositFactory = await hre.ethers.getContractFactory(
          'IndefiniteAuthorizerWithErc20Deposit',
          roles.deployer
        );
        await expect(
          indefiniteAuthorizerWithErc20DepositFactory.deploy(
            accessControlRegistry.address,
            indefiniteAuthorizerWithErc20DepositAdminRoleDescription,
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
          await expect(indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setTokenPrice(123))
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetTokenPrice')
            .withArgs(123, roles.maintainer.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.tokenPrice()).to.equal(123);
        });
      });
      context('Token price is zero', function () {
        it('reverts', async function () {
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setTokenPrice(0)
          ).to.be.revertedWith('Token price zero');
        });
      });
    });
    context('Sender is manager', function () {
      context('Token price is not zero', function () {
        it('sets token price', async function () {
          await expect(indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setTokenPrice(123))
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetTokenPrice')
            .withArgs(123, roles.manager.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.tokenPrice()).to.equal(123);
        });
      });
      context('Token price is zero', function () {
        it('reverts', async function () {
          await expect(indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setTokenPrice(0)).to.be.revertedWith(
            'Token price zero'
          );
        });
      });
    });
    context('Sender is not maintainer and manager', function () {
      it('reverts', async function () {
        await expect(
          indefiniteAuthorizerWithErc20Deposit.connect(roles.randomPerson).setTokenPrice(123)
        ).to.be.revertedWith('Sender cannot maintain');
      });
    });
  });

  describe('setPriceCoefficient', function () {
    context('Sender is maintainer', function () {
      context('Price coefficient is not zero', function () {
        it('sets price coefficient', async function () {
          await expect(indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setPriceCoefficient(123))
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetPriceCoefficient')
            .withArgs(123, roles.maintainer.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.priceCoefficient()).to.equal(123);
        });
      });
      context('Price coefficient is zero', function () {
        it('reverts', async function () {
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setPriceCoefficient(0)
          ).to.be.revertedWith('Price coefficient zero');
        });
      });
    });
    context('Sender is manager', function () {
      context('Price coefficient is not zero', function () {
        it('sets price coefficient', async function () {
          await expect(indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setPriceCoefficient(123))
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetPriceCoefficient')
            .withArgs(123, roles.manager.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.priceCoefficient()).to.equal(123);
        });
      });
      context('Price coefficient is zero', function () {
        it('reverts', async function () {
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setPriceCoefficient(0)
          ).to.be.revertedWith('Price coefficient zero');
        });
      });
    });
    context('Sender is not maintainer and manager', function () {
      it('reverts', async function () {
        await expect(
          indefiniteAuthorizerWithErc20Deposit.connect(roles.randomPerson).setPriceCoefficient(123)
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
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut)
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetAirnodeParticipationStatus')
              .withArgs(roles.airnode.address, AirnodeParticipationStatus.OptedOut, roles.airnode.address);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToParticipationStatus(roles.airnode.address)
            ).to.equal(AirnodeParticipationStatus.OptedOut);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetAirnodeParticipationStatus')
              .withArgs(roles.airnode.address, AirnodeParticipationStatus.Inactive, roles.airnode.address);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToParticipationStatus(roles.airnode.address)
            ).to.equal(AirnodeParticipationStatus.Inactive);
          });
        });
        context('Status is Active', function () {
          it('reverts', async function () {
            await expect(
              indefiniteAuthorizerWithErc20Deposit
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
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              )
                .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Active, roles.maintainer.address);
              expect(
                await indefiniteAuthorizerWithErc20Deposit.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Active);
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              )
                .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Inactive, roles.maintainer.address);
              expect(
                await indefiniteAuthorizerWithErc20Deposit.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Inactive);
            });
          });
          context('Airnode has opted out', function () {
            it('reverts', async function () {
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut);
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              ).to.be.revertedWith('Airnode opted out');
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              ).to.be.revertedWith('Airnode opted out');
            });
          });
        });
        context('Status is OptedOut', function () {
          it('reverts', async function () {
            await expect(
              indefiniteAuthorizerWithErc20Deposit
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
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              )
                .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Active, roles.manager.address);
              expect(
                await indefiniteAuthorizerWithErc20Deposit.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Active);
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              )
                .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetAirnodeParticipationStatus')
                .withArgs(roles.airnode.address, AirnodeParticipationStatus.Inactive, roles.manager.address);
              expect(
                await indefiniteAuthorizerWithErc20Deposit.airnodeToParticipationStatus(roles.airnode.address)
              ).to.equal(AirnodeParticipationStatus.Inactive);
            });
          });
          context('Airnode has opted out', function () {
            it('reverts', async function () {
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.airnode)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut);
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
              ).to.be.revertedWith('Airnode opted out');
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.manager)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
              ).to.be.revertedWith('Airnode opted out');
            });
          });
        });
        context('Status is OptedOut', function () {
          it('reverts', async function () {
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.manager)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut)
            ).to.be.revertedWith('Only Airnode can opt out');
          });
        });
      });
      context('Sender is not maintainer and manager', function () {
        it('reverts', async function () {
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.randomPerson)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Inactive)
          ).to.be.revertedWith('Sender cannot maintain');
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.randomPerson)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active)
          ).to.be.revertedWith('Sender cannot maintain');
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.randomPerson)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.OptedOut)
          ).to.be.revertedWith('Sender cannot maintain');
        });
      });
    });
    context('Airnode address is zero', function () {
      it('reverts', async function () {
        await expect(
          indefiniteAuthorizerWithErc20Deposit
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(hre.ethers.constants.AddressZero, AirnodeParticipationStatus.Inactive)
        ).to.be.revertedWith('Airnode address zero');
        await expect(
          indefiniteAuthorizerWithErc20Deposit
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(hre.ethers.constants.AddressZero, AirnodeParticipationStatus.Active)
        ).to.be.revertedWith('Airnode address zero');
        await expect(
          indefiniteAuthorizerWithErc20Deposit
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
            indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setProceedsDestination(proceedsDestination)
          )
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetProceedsDestination')
            .withArgs(proceedsDestination);
          expect(await indefiniteAuthorizerWithErc20Deposit.proceedsDestination()).to.equal(proceedsDestination);
        });
      });
      context('Proceeds destination is zero', function () {
        it('reverts', async function () {
          const proceedsDestination = hre.ethers.constants.AddressZero;
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setProceedsDestination(proceedsDestination)
          ).to.be.revertedWith('Proceeds destination zero');
        });
      });
    });
    context('Sender is not manager', function () {
      it('reverts', async function () {
        const proceedsDestination = testUtils.generateRandomAddress();
        await expect(
          indefiniteAuthorizerWithErc20Deposit.connect(roles.randomPerson).setProceedsDestination(proceedsDestination)
        ).to.be.revertedWith('Sender not manager');
        await expect(
          indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setProceedsDestination(proceedsDestination)
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
            indefiniteAuthorizerWithErc20Deposit.connect(roles.blocker).setRequesterBlockStatus(requester, true)
          )
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatus')
            .withArgs(requester, true, roles.blocker.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.requesterToBlockStatus(requester)).to.equal(true);
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.blocker).setRequesterBlockStatus(requester, false)
          )
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatus')
            .withArgs(requester, false, roles.blocker.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.requesterToBlockStatus(requester)).to.equal(false);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const requester = hre.ethers.constants.AddressZero;
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.blocker).setRequesterBlockStatus(requester, true)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is manager', function () {
      context('Requester address is not zero', function () {
        it('sets requester block status', async function () {
          const requester = testUtils.generateRandomAddress();
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setRequesterBlockStatus(requester, true)
          )
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatus')
            .withArgs(requester, true, roles.manager.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.requesterToBlockStatus(requester)).to.equal(true);
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setRequesterBlockStatus(requester, false)
          )
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatus')
            .withArgs(requester, false, roles.manager.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.requesterToBlockStatus(requester)).to.equal(false);
        });
      });
      context('Requester address is zero', function () {
        it('reverts', async function () {
          const requester = hre.ethers.constants.AddressZero;
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setRequesterBlockStatus(requester, true)
          ).to.be.revertedWith('Requester address zero');
        });
      });
    });
    context('Sender is not maintainer and blocker', function () {
      it('reverts', async function () {
        const requester = testUtils.generateRandomAddress();
        await expect(
          indefiniteAuthorizerWithErc20Deposit.connect(roles.randomPerson).setRequesterBlockStatus(requester, true)
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
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.blocker)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true)
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, true, roles.blocker.address);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToRequesterToBlockStatus(
                roles.airnode.address,
                requester
              )
            ).to.equal(true);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.blocker)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, false)
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, false, roles.blocker.address);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToRequesterToBlockStatus(
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
              indefiniteAuthorizerWithErc20Deposit
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
            indefiniteAuthorizerWithErc20Deposit
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
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.manager)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true)
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, true, roles.manager.address);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToRequesterToBlockStatus(
                roles.airnode.address,
                requester
              )
            ).to.equal(true);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.manager)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, false)
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetRequesterBlockStatusForAirnode')
              .withArgs(roles.airnode.address, requester, false, roles.manager.address);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToRequesterToBlockStatus(
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
              indefiniteAuthorizerWithErc20Deposit
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
            indefiniteAuthorizerWithErc20Deposit
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
          indefiniteAuthorizerWithErc20Deposit
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
          await indefiniteAuthorizerWithErc20Deposit.getTokenAmount(roles.airnode.address, chainId, endpointId)
        ).to.equal(expectedTokenAmount);
      });
    });
    context('Price registry reverts', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        await expect(
          indefiniteAuthorizerWithErc20Deposit.getTokenAmount(roles.airnode.address, chainId, endpointId)
        ).to.be.revertedWith('No default price set');
      });
    });
  });

  describe('setWithdrawalLeadTime', function () {
    context('Sender is maintainer', function () {
      context('Withdrawal lead time is not too long', function () {
        it('sets withdrawal lead time', async function () {
          const oneMonth = 30 * 24 * 60 * 60;
          await expect(indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneMonth))
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetWithdrawalLeadTime')
            .withArgs(oneMonth, roles.maintainer.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.withdrawalLeadTime()).to.equal(oneMonth);
        });
      });
      context('Withdrawal lead time is too long', function () {
        it('reverts', async function () {
          const oneMonthAndOneSecond = 30 * 24 * 60 * 60 + 1;
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneMonthAndOneSecond)
          ).to.be.revertedWith('Withdrawal lead time too long');
        });
      });
    });
    context('Sender is manager', function () {
      context('Withdrawal lead time is not too long', function () {
        it('sets withdrawal lead time', async function () {
          const oneMonth = 30 * 24 * 60 * 60;
          await expect(indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setWithdrawalLeadTime(oneMonth))
            .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SetWithdrawalLeadTime')
            .withArgs(oneMonth, roles.manager.address);
          expect(await indefiniteAuthorizerWithErc20Deposit.withdrawalLeadTime()).to.equal(oneMonth);
        });
      });
      context('Withdrawal lead time is too long', function () {
        it('reverts', async function () {
          const oneMonthAndOneSecond = 30 * 24 * 60 * 60 + 1;
          await expect(
            indefiniteAuthorizerWithErc20Deposit.connect(roles.manager).setWithdrawalLeadTime(oneMonthAndOneSecond)
          ).to.be.revertedWith('Withdrawal lead time too long');
        });
      });
    });
    context('Sender is not maintainer and manager', function () {
      it('reverts', async function () {
        await expect(
          indefiniteAuthorizerWithErc20Deposit.connect(roles.randomPerson).setWithdrawalLeadTime(123)
        ).to.be.revertedWith('Sender cannot maintain');
      });
    });
  });

  describe('depositTokens', function () {
    context('Airnode is active', function () {
      context('Chain ID is not zero', function () {
        context('Requester address is not zero', function () {
          context('Requester is not blocked globally or for the Airnode', function () {
            context('Sender has not already deposited tokens', function () {
              context('Token transfer is successful', function () {
                context('Tokens were not deposited for the requester-endpoint pair before', function () {
                  context('RequesterAuthorizer for the chain is set', function () {
                    it('indefinitely authorizes the requester for the endpoint, increments the number of times tokens were deposited for the requester-endpoint pair and deposits tokens', async function () {
                      const endpointId = testUtils.generateRandomBytes32();
                      const requester = testUtils.generateRandomAddress();
                      const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                      const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
                      await airnodeEndpointPriceRegistry
                        .connect(roles.manager)
                        .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                      await indefiniteAuthorizerWithErc20Deposit
                        .connect(roles.maintainer)
                        .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                      await token
                        .connect(roles.depositor)
                        .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                      let authorizationStatus =
                        await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                          roles.airnode.address,
                          endpointId,
                          requester
                        );
                      expect(authorizationStatus.expirationTimestamp).to.equal(0);
                      expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                      await expect(
                        indefiniteAuthorizerWithErc20Deposit
                          .connect(roles.depositor)
                          .depositTokens(roles.airnode.address, chainId, endpointId, requester)
                      )
                        .to.emit(indefiniteAuthorizerWithErc20Deposit, 'DepositedTokens')
                        .withArgs(
                          roles.airnode.address,
                          chainId,
                          endpointId,
                          requester,
                          roles.depositor.address,
                          1,
                          expectedTokenAmount
                        );
                      expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(
                        expectedTokenAmount
                      );
                      expect(await token.balanceOf(roles.depositor.address)).to.equal(
                        hre.ethers.utils.parseEther('1').sub(expectedTokenAmount)
                      );
                      expect(
                        await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                          roles.airnode.address,
                          chainId,
                          endpointId,
                          requester
                        )
                      ).to.equal(1);
                      expect(
                        await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                          roles.airnode.address,
                          chainId,
                          endpointId,
                          requester,
                          roles.depositor.address
                        )
                      ).to.equal(expectedTokenAmount);
                      authorizationStatus =
                        await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                          roles.airnode.address,
                          endpointId,
                          requester
                        );
                      expect(authorizationStatus.expirationTimestamp).to.equal(0);
                      expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
                    });
                  });
                  context('RequesterAuthorizer for the chain is not set', function () {
                    it('reverts', async function () {
                      const anotherChainId = chainId + 1;
                      const endpointId = testUtils.generateRandomBytes32();
                      const requester = testUtils.generateRandomAddress();
                      const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                      await airnodeEndpointPriceRegistry
                        .connect(roles.manager)
                        .registerAirnodeChainEndpointPrice(roles.airnode.address, anotherChainId, endpointId, price);
                      await indefiniteAuthorizerWithErc20Deposit
                        .connect(roles.maintainer)
                        .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                      await token
                        .connect(roles.depositor)
                        .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                      await expect(
                        indefiniteAuthorizerWithErc20Deposit
                          .connect(roles.depositor)
                          .depositTokens(roles.airnode.address, anotherChainId, endpointId, requester)
                      ).to.be.revertedWith('No Authorizer set for chain');
                    });
                  });
                });
                context('Tokens were deposited for the requester-endpoint pair before', function () {
                  it('increments the number of times tokens were deposited for the requester-endpoint pair and deposits tokens', async function () {
                    const endpointId = testUtils.generateRandomBytes32();
                    const requester = testUtils.generateRandomAddress();
                    const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                    const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
                    await airnodeEndpointPriceRegistry
                      .connect(roles.manager)
                      .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                    await indefiniteAuthorizerWithErc20Deposit
                      .connect(roles.maintainer)
                      .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                    await token
                      .connect(roles.anotherDepositor)
                      .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                    await indefiniteAuthorizerWithErc20Deposit
                      .connect(roles.anotherDepositor)
                      .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                    let authorizationStatus =
                      await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                        roles.airnode.address,
                        endpointId,
                        requester
                      );
                    expect(authorizationStatus.expirationTimestamp).to.equal(0);
                    expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
                    expect(
                      await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                        roles.airnode.address,
                        chainId,
                        endpointId,
                        requester
                      )
                    ).to.equal(1);
                    await token
                      .connect(roles.depositor)
                      .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                    await expect(
                      indefiniteAuthorizerWithErc20Deposit
                        .connect(roles.depositor)
                        .depositTokens(roles.airnode.address, chainId, endpointId, requester)
                    )
                      .to.emit(indefiniteAuthorizerWithErc20Deposit, 'DepositedTokens')
                      .withArgs(
                        roles.airnode.address,
                        chainId,
                        endpointId,
                        requester,
                        roles.depositor.address,
                        2,
                        expectedTokenAmount
                      );
                    expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(
                      expectedTokenAmount.mul(2)
                    );
                    expect(await token.balanceOf(roles.depositor.address)).to.equal(
                      hre.ethers.utils.parseEther('1').sub(expectedTokenAmount)
                    );
                    expect(
                      await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                        roles.airnode.address,
                        chainId,
                        endpointId,
                        requester
                      )
                    ).to.equal(2);
                    expect(
                      await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                        roles.airnode.address,
                        chainId,
                        endpointId,
                        requester,
                        roles.depositor.address
                      )
                    ).to.equal(expectedTokenAmount);
                    authorizationStatus =
                      await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                        roles.airnode.address,
                        endpointId,
                        requester
                      );
                    expect(authorizationStatus.expirationTimestamp).to.equal(0);
                    expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
                  });
                });
              });
              context('Token transfer is not successful', function () {
                it('reverts', async function () {
                  const endpointId = testUtils.generateRandomBytes32();
                  const requester = testUtils.generateRandomAddress();
                  const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                  await airnodeEndpointPriceRegistry
                    .connect(roles.manager)
                    .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                  await indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.maintainer)
                    .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                  await expect(
                    indefiniteAuthorizerWithErc20Deposit
                      .connect(roles.depositor)
                      .depositTokens(roles.airnode.address, chainId, endpointId, requester)
                  ).to.be.revertedWith('ERC20: insufficient allowance');
                });
              });
            });
            context('Sender has already deposited tokens', function () {
              it('reverts', async function () {
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                await airnodeEndpointPriceRegistry
                  .connect(roles.manager)
                  .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await token
                  .connect(roles.depositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                await expect(
                  indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.depositor)
                    .depositTokens(roles.airnode.address, chainId, endpointId, requester)
                ).to.be.revertedWith('Sender already deposited tokens');
              });
            });
          });
          context('Requester is blocked globally', function () {
            it('reverts', async function () {
              const endpointId = testUtils.generateRandomBytes32();
              const requester = testUtils.generateRandomAddress();
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.maintainer)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.blocker)
                .setRequesterBlockStatus(requester, true);
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester)
              ).to.be.revertedWith('Requester blocked');
            });
          });
          context('Requester is blocked for Airnode', function () {
            it('reverts', async function () {
              const endpointId = testUtils.generateRandomBytes32();
              const requester = testUtils.generateRandomAddress();
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.maintainer)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.blocker)
                .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true);
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester)
              ).to.be.revertedWith('Requester blocked');
            });
          });
        });
        context('Requester address is zero', function () {
          it('reverts', async function () {
            const endpointId = testUtils.generateRandomBytes32();
            const requester = hre.ethers.constants.AddressZero;
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.maintainer)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.depositor)
                .depositTokens(roles.airnode.address, chainId, endpointId, requester)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Chain ID is zero', function () {
        it('reverts', async function () {
          const endpointId = testUtils.generateRandomBytes32();
          const requester = testUtils.generateRandomAddress();
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .depositTokens(roles.airnode.address, 0, endpointId, requester)
          ).to.be.revertedWith('Chain ID zero');
        });
      });
    });
    context('Airnode is not active', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        await expect(
          indefiniteAuthorizerWithErc20Deposit
            .connect(roles.depositor)
            .depositTokens(roles.airnode.address, chainId, endpointId, requester)
        ).to.be.revertedWith('Airnode not active');
      });
    });
  });

  describe('signalWithdrawalIntent', function () {
    context('Sender has deposited tokens', function () {
      context('Sender has not signaled an unfulfilled withdrawal intent', function () {
        context('Signaling intent to withdraw the last deposit for the requester-endpoint pair', function () {
          it('removes the indefinite authorization of the requester for the endpoint, decrements the number of times tokens were deposited for the requester-endpoint pair and signals intent', async function () {
            const oneWeek = 7 * 24 * 60 * 60;
            await indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneWeek);
            const endpointId = testUtils.generateRandomBytes32();
            const requester = testUtils.generateRandomAddress();
            const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
            const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
            await airnodeEndpointPriceRegistry
              .connect(roles.manager)
              .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.maintainer)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
            await token
              .connect(roles.depositor)
              .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .depositTokens(roles.airnode.address, chainId, endpointId, requester);
            let authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            const now = (await hre.ethers.provider.getBlock(await hre.ethers.provider.getBlockNumber())).timestamp;
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [now + 1]);
            const earliestWithdrawalTime = now + 1 + oneWeek;
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.depositor)
                .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester)
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SignaledWithdrawalIntent')
              .withArgs(roles.airnode.address, chainId, endpointId, requester, roles.depositor.address, 0);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester
              )
            ).to.equal(0);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
            ).to.equal(expectedTokenAmount);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToEarliestWithdrawalTime(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
            ).to.equal(earliestWithdrawalTime);
            authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          });
        });
        context(
          'Signaling intent to withdraw a deposit that is not the last for the requester-endpoint pair',
          function () {
            it('decrements the number of times tokens were deposited for the requester-endpoint pair and signals intent', async function () {
              const oneWeek = 7 * 24 * 60 * 60;
              await indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneWeek);
              const endpointId = testUtils.generateRandomBytes32();
              const requester = testUtils.generateRandomAddress();
              const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
              const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
              await airnodeEndpointPriceRegistry
                .connect(roles.manager)
                .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.maintainer)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
              await token
                .connect(roles.depositor)
                .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.depositor)
                .depositTokens(roles.airnode.address, chainId, endpointId, requester);
              await token
                .connect(roles.anotherDepositor)
                .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.anotherDepositor)
                .depositTokens(roles.airnode.address, chainId, endpointId, requester);
              let authorizationStatus =
                await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                  roles.airnode.address,
                  endpointId,
                  requester
                );
              expect(authorizationStatus.expirationTimestamp).to.equal(0);
              expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
              const now = (await hre.ethers.provider.getBlock(await hre.ethers.provider.getBlockNumber())).timestamp;
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [now + 1]);
              const earliestWithdrawalTime = now + 1 + oneWeek;
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester)
              )
                .to.emit(indefiniteAuthorizerWithErc20Deposit, 'SignaledWithdrawalIntent')
                .withArgs(roles.airnode.address, chainId, endpointId, requester, roles.depositor.address, 1);
              expect(
                await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                  roles.airnode.address,
                  chainId,
                  endpointId,
                  requester
                )
              ).to.equal(1);
              expect(
                await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                  roles.airnode.address,
                  chainId,
                  endpointId,
                  requester,
                  roles.depositor.address
                )
              ).to.equal(expectedTokenAmount);
              expect(
                await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToEarliestWithdrawalTime(
                  roles.airnode.address,
                  chainId,
                  endpointId,
                  requester,
                  roles.depositor.address
                )
              ).to.equal(earliestWithdrawalTime);
              authorizationStatus =
                await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                  roles.airnode.address,
                  endpointId,
                  requester
                );
              expect(authorizationStatus.expirationTimestamp).to.equal(0);
              expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            });
          }
        );
      });
      context('Sender has signaled an unfulfilled withdrawal intent', function () {
        it('reverts', async function () {
          const endpointId = testUtils.generateRandomBytes32();
          const requester = testUtils.generateRandomAddress();
          const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
          await airnodeEndpointPriceRegistry
            .connect(roles.manager)
            .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
          await token
            .connect(roles.depositor)
            .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.depositor)
            .depositTokens(roles.airnode.address, chainId, endpointId, requester);
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.depositor)
            .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester);
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester)
          ).to.be.revertedWith('Intent already signaled');
        });
      });
    });
    context('Sender has not deposited tokens', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
        await airnodeEndpointPriceRegistry
          .connect(roles.manager)
          .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
        await indefiniteAuthorizerWithErc20Deposit
          .connect(roles.maintainer)
          .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
        await expect(
          indefiniteAuthorizerWithErc20Deposit
            .connect(roles.depositor)
            .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester)
        ).to.be.revertedWith('Sender has not deposited tokens');
      });
    });
  });

  describe('withdrawTokens', function () {
    context('Requester is not blocked globally or for the Airnode', function () {
      context('Sender has deposited tokens', function () {
        context('Withdrawal lead time is zero', function () {
          context('Sender has signaled intent', function () {
            context('It is not before the earliest withdrawal time', function () {
              it('withdraws tokens', async function () {
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
                await airnodeEndpointPriceRegistry
                  .connect(roles.manager)
                  .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await token
                  .connect(roles.depositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester);
                let authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                await expect(
                  indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.depositor)
                    .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
                )
                  .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokens')
                  .withArgs(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address,
                    0,
                    expectedTokenAmount
                  );
                expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(0);
                expect(await token.balanceOf(roles.depositor.address)).to.equal(hre.ethers.utils.parseEther('1'));
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester
                  )
                ).to.equal(0);
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address
                  )
                ).to.equal(0);
                authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
              });
            });
            context('It is before the earliest withdrawal time', function () {
              it('withdraws tokens', async function () {
                const oneWeek = 7 * 24 * 60 * 60;
                await indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneWeek);
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
                await airnodeEndpointPriceRegistry
                  .connect(roles.manager)
                  .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await token
                  .connect(roles.depositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester);
                await indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(0);
                let authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                await expect(
                  indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.depositor)
                    .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
                )
                  .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokens')
                  .withArgs(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address,
                    0,
                    expectedTokenAmount
                  );
                expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(0);
                expect(await token.balanceOf(roles.depositor.address)).to.equal(hre.ethers.utils.parseEther('1'));
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester
                  )
                ).to.equal(0);
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address
                  )
                ).to.equal(0);
                authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
              });
            });
          });
          context('Sender has not signaled intent', function () {
            context('Withdrawn deposit was the last one for the requester-endpoint pair', function () {
              it('removes the indefinite authorization of the requester for the endpoint, decrements the number of times tokens were deposited for the requester-endpoint pair and withdraws tokens', async function () {
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
                await airnodeEndpointPriceRegistry
                  .connect(roles.manager)
                  .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await token
                  .connect(roles.depositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                let authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
                await expect(
                  indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.depositor)
                    .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
                )
                  .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokens')
                  .withArgs(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address,
                    0,
                    expectedTokenAmount
                  );
                expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(0);
                expect(await token.balanceOf(roles.depositor.address)).to.equal(hre.ethers.utils.parseEther('1'));
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester
                  )
                ).to.equal(0);
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address
                  )
                ).to.equal(0);
                authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
              });
            });
            context('Withdrawn deposit was not the last one for the requester-endpoint pair', function () {
              it('decrements the number of times tokens were deposited for the requester-endpoint pair and withdraws tokens', async function () {
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
                await airnodeEndpointPriceRegistry
                  .connect(roles.manager)
                  .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await token
                  .connect(roles.depositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                await token
                  .connect(roles.anotherDepositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.anotherDepositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                let authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
                await expect(
                  indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.depositor)
                    .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
                )
                  .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokens')
                  .withArgs(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address,
                    1,
                    expectedTokenAmount
                  );
                expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(
                  expectedTokenAmount
                );
                expect(await token.balanceOf(roles.depositor.address)).to.equal(hre.ethers.utils.parseEther('1'));
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester
                  )
                ).to.equal(1);
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address
                  )
                ).to.equal(0);
                authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
              });
            });
          });
        });
        context('Withdrawal lead time is not zero', function () {
          context('Sender has signaled intent', function () {
            context('It is not before the earliest withdrawal time', function () {
              it('withdraws tokens', async function () {
                const oneWeek = 7 * 24 * 60 * 60;
                await indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneWeek);
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
                await airnodeEndpointPriceRegistry
                  .connect(roles.manager)
                  .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await token
                  .connect(roles.depositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester);
                const now = (await hre.ethers.provider.getBlock(await hre.ethers.provider.getBlockNumber())).timestamp;
                await hre.ethers.provider.send('evm_setNextBlockTimestamp', [now + oneWeek]);
                let authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
                await expect(
                  indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.depositor)
                    .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
                )
                  .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokens')
                  .withArgs(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address,
                    0,
                    expectedTokenAmount
                  );
                expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(0);
                expect(await token.balanceOf(roles.depositor.address)).to.equal(hre.ethers.utils.parseEther('1'));
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester
                  )
                ).to.equal(0);
                expect(
                  await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                    roles.airnode.address,
                    chainId,
                    endpointId,
                    requester,
                    roles.depositor.address
                  )
                ).to.equal(0);
                authorizationStatus =
                  await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                    roles.airnode.address,
                    endpointId,
                    requester
                  );
                expect(authorizationStatus.expirationTimestamp).to.equal(0);
                expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
              });
            });
            context('It is before the earliest withdrawal time', function () {
              it('reverts', async function () {
                const oneWeek = 7 * 24 * 60 * 60;
                await indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneWeek);
                const endpointId = testUtils.generateRandomBytes32();
                const requester = testUtils.generateRandomAddress();
                const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
                await airnodeEndpointPriceRegistry
                  .connect(roles.manager)
                  .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.maintainer)
                  .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
                await token
                  .connect(roles.depositor)
                  .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .depositTokens(roles.airnode.address, chainId, endpointId, requester);
                await indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .signalWithdrawalIntent(roles.airnode.address, chainId, endpointId, requester);
                await expect(
                  indefiniteAuthorizerWithErc20Deposit
                    .connect(roles.depositor)
                    .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
                ).to.be.revertedWith('Not withdrawal time yet');
              });
            });
          });
          context('Sender has not signaled intent', function () {
            it('reverts', async function () {
              const oneWeek = 7 * 24 * 60 * 60;
              await indefiniteAuthorizerWithErc20Deposit.connect(roles.maintainer).setWithdrawalLeadTime(oneWeek);
              const endpointId = testUtils.generateRandomBytes32();
              const requester = testUtils.generateRandomAddress();
              const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
              await airnodeEndpointPriceRegistry
                .connect(roles.manager)
                .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.maintainer)
                .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
              await token
                .connect(roles.depositor)
                .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
              await indefiniteAuthorizerWithErc20Deposit
                .connect(roles.depositor)
                .depositTokens(roles.airnode.address, chainId, endpointId, requester);
              await expect(
                indefiniteAuthorizerWithErc20Deposit
                  .connect(roles.depositor)
                  .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
              ).to.be.revertedWith('Withdrawal intent not signaled');
            });
          });
        });
      });
      context('Sender has not deposited tokens', function () {
        it('reverts', async function () {
          const endpointId = testUtils.generateRandomBytes32();
          const requester = testUtils.generateRandomAddress();
          const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
          await airnodeEndpointPriceRegistry
            .connect(roles.manager)
            .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
          ).to.be.revertedWith('Sender has not deposited tokens');
        });
      });
    });
    context('Requester is blocked globally', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        await indefiniteAuthorizerWithErc20Deposit
          .connect(roles.maintainer)
          .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
        await indefiniteAuthorizerWithErc20Deposit.connect(roles.blocker).setRequesterBlockStatus(requester, true);
        await expect(
          indefiniteAuthorizerWithErc20Deposit
            .connect(roles.depositor)
            .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
        ).to.be.revertedWith('Requester blocked');
      });
    });
    context('Requester is blocked for Airnode', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        await indefiniteAuthorizerWithErc20Deposit
          .connect(roles.maintainer)
          .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
        await indefiniteAuthorizerWithErc20Deposit
          .connect(roles.blocker)
          .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true);
        await expect(
          indefiniteAuthorizerWithErc20Deposit
            .connect(roles.depositor)
            .withdrawTokens(roles.airnode.address, chainId, endpointId, requester)
        ).to.be.revertedWith('Requester blocked');
      });
    });
  });

  describe('withdrawFundsDepositedForBlockedRequester', function () {
    context('Requester is blocked globally', function () {
      context('depositor has deposited tokens', function () {
        context('Withdrawn deposit was the last one for the requester-endpoint pair', function () {
          it('removes the indefinite authorization of the requester for the endpoint, decrements the number of times tokens were deposited for the requester-endpoint pair and withdraws tokens to the proceeds destination', async function () {
            const endpointId = testUtils.generateRandomBytes32();
            const requester = testUtils.generateRandomAddress();
            const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
            const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
            await airnodeEndpointPriceRegistry
              .connect(roles.manager)
              .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.maintainer)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
            await token
              .connect(roles.depositor)
              .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .depositTokens(roles.airnode.address, chainId, endpointId, requester);
            await indefiniteAuthorizerWithErc20Deposit.connect(roles.blocker).setRequesterBlockStatus(requester, true);
            let authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.randomPerson)
                .withdrawFundsDepositedForBlockedRequester(
                  roles.airnode.address,
                  chainId,
                  endpointId,
                  requester,
                  roles.depositor.address
                )
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokensDepositedForBlockedRequester')
              .withArgs(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address,
                0,
                expectedTokenAmount
              );
            expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(0);
            expect(await token.balanceOf(roles.depositor.address)).to.equal(
              hre.ethers.utils.parseEther('1').sub(expectedTokenAmount)
            );
            expect(await token.balanceOf(roles.proceedsDestination.address)).to.equal(expectedTokenAmount);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester
              )
            ).to.equal(0);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
            ).to.equal(0);
            authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          });
        });
        context('Withdrawn deposit was not the last one for the requester-endpoint pair', function () {
          it('decrements the number of times tokens were deposited for the requester-endpoint pair and withdraws tokens to the proceeds destination', async function () {
            const endpointId = testUtils.generateRandomBytes32();
            const requester = testUtils.generateRandomAddress();
            const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
            const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
            await airnodeEndpointPriceRegistry
              .connect(roles.manager)
              .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.maintainer)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
            await token
              .connect(roles.depositor)
              .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .depositTokens(roles.airnode.address, chainId, endpointId, requester);
            await token
              .connect(roles.anotherDepositor)
              .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.anotherDepositor)
              .depositTokens(roles.airnode.address, chainId, endpointId, requester);
            await indefiniteAuthorizerWithErc20Deposit.connect(roles.blocker).setRequesterBlockStatus(requester, true);
            let authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.randomPerson)
                .withdrawFundsDepositedForBlockedRequester(
                  roles.airnode.address,
                  chainId,
                  endpointId,
                  requester,
                  roles.depositor.address
                )
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokensDepositedForBlockedRequester')
              .withArgs(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address,
                1,
                expectedTokenAmount
              );
            expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(expectedTokenAmount);
            expect(await token.balanceOf(roles.depositor.address)).to.equal(
              hre.ethers.utils.parseEther('1').sub(expectedTokenAmount)
            );
            expect(await token.balanceOf(roles.proceedsDestination.address)).to.equal(expectedTokenAmount);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester
              )
            ).to.equal(1);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
            ).to.equal(0);
            authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
          });
        });
      });
      context('depositor has not deposited tokens', function () {
        it('reverts', async function () {
          const endpointId = testUtils.generateRandomBytes32();
          const requester = testUtils.generateRandomAddress();
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
          await indefiniteAuthorizerWithErc20Deposit.connect(roles.blocker).setRequesterBlockStatus(requester, true);
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.randomPerson)
              .withdrawFundsDepositedForBlockedRequester(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
          ).to.be.revertedWith('Depositor has not deposited');
        });
      });
    });
    context('Requester is blocked for Airnode', function () {
      context('depositor has deposited tokens', function () {
        context('Withdrawn deposit was the last one for the requester-endpoint pair', function () {
          it('removes the indefinite authorization of the requester for the endpoint, decrements the number of times tokens were deposited for the requester-endpoint pair and withdraws tokens to the proceeds destination', async function () {
            const endpointId = testUtils.generateRandomBytes32();
            const requester = testUtils.generateRandomAddress();
            const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
            const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
            await airnodeEndpointPriceRegistry
              .connect(roles.manager)
              .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.maintainer)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
            await token
              .connect(roles.depositor)
              .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .depositTokens(roles.airnode.address, chainId, endpointId, requester);
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.blocker)
              .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true);
            let authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.randomPerson)
                .withdrawFundsDepositedForBlockedRequester(
                  roles.airnode.address,
                  chainId,
                  endpointId,
                  requester,
                  roles.depositor.address
                )
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokensDepositedForBlockedRequester')
              .withArgs(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address,
                0,
                expectedTokenAmount
              );
            expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(0);
            expect(await token.balanceOf(roles.depositor.address)).to.equal(
              hre.ethers.utils.parseEther('1').sub(expectedTokenAmount)
            );
            expect(await token.balanceOf(roles.proceedsDestination.address)).to.equal(expectedTokenAmount);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester
              )
            ).to.equal(0);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
            ).to.equal(0);
            authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(0);
          });
        });
        context('Withdrawn deposit was not the last one for the requester-endpoint pair', function () {
          it('decrements the number of times tokens were deposited for the requester-endpoint pair and withdraws tokens to the proceeds destination', async function () {
            const endpointId = testUtils.generateRandomBytes32();
            const requester = testUtils.generateRandomAddress();
            const price = hre.ethers.BigNumber.from(`100${'0'.repeat(18)}`); // $100
            const expectedTokenAmount = price.mul(priceCoefficient).div(tokenPrice);
            await airnodeEndpointPriceRegistry
              .connect(roles.manager)
              .registerAirnodeChainEndpointPrice(roles.airnode.address, chainId, endpointId, price);
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.maintainer)
              .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
            await token
              .connect(roles.depositor)
              .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.depositor)
              .depositTokens(roles.airnode.address, chainId, endpointId, requester);
            await token
              .connect(roles.anotherDepositor)
              .approve(indefiniteAuthorizerWithErc20Deposit.address, hre.ethers.utils.parseEther('1'));
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.anotherDepositor)
              .depositTokens(roles.airnode.address, chainId, endpointId, requester);
            await indefiniteAuthorizerWithErc20Deposit
              .connect(roles.blocker)
              .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true);
            let authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
            await expect(
              indefiniteAuthorizerWithErc20Deposit
                .connect(roles.randomPerson)
                .withdrawFundsDepositedForBlockedRequester(
                  roles.airnode.address,
                  chainId,
                  endpointId,
                  requester,
                  roles.depositor.address
                )
            )
              .to.emit(indefiniteAuthorizerWithErc20Deposit, 'WithdrewTokensDepositedForBlockedRequester')
              .withArgs(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address,
                1,
                expectedTokenAmount
              );
            expect(await token.balanceOf(indefiniteAuthorizerWithErc20Deposit.address)).to.equal(expectedTokenAmount);
            expect(await token.balanceOf(roles.depositor.address)).to.equal(
              hre.ethers.utils.parseEther('1').sub(expectedTokenAmount)
            );
            expect(await token.balanceOf(roles.proceedsDestination.address)).to.equal(expectedTokenAmount);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester
              )
            ).to.equal(1);
            expect(
              await indefiniteAuthorizerWithErc20Deposit.airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
            ).to.equal(0);
            authorizationStatus =
              await requesterAuthorizerWithManager.airnodeToEndpointIdToRequesterToAuthorizationStatus(
                roles.airnode.address,
                endpointId,
                requester
              );
            expect(authorizationStatus.expirationTimestamp).to.equal(0);
            expect(authorizationStatus.indefiniteAuthorizationCount).to.equal(1);
          });
        });
      });
      context('depositor has not deposited tokens', function () {
        it('reverts', async function () {
          const endpointId = testUtils.generateRandomBytes32();
          const requester = testUtils.generateRandomAddress();
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.maintainer)
            .setAirnodeParticipationStatus(roles.airnode.address, AirnodeParticipationStatus.Active);
          await indefiniteAuthorizerWithErc20Deposit
            .connect(roles.blocker)
            .setRequesterBlockStatusForAirnode(roles.airnode.address, requester, true);
          await expect(
            indefiniteAuthorizerWithErc20Deposit
              .connect(roles.randomPerson)
              .withdrawFundsDepositedForBlockedRequester(
                roles.airnode.address,
                chainId,
                endpointId,
                requester,
                roles.depositor.address
              )
          ).to.be.revertedWith('Depositor has not deposited');
        });
      });
    });
    context('Requester is not blocked globally or for the Airnode', function () {
      it('reverts', async function () {
        const endpointId = testUtils.generateRandomBytes32();
        const requester = testUtils.generateRandomAddress();
        await expect(
          indefiniteAuthorizerWithErc20Deposit
            .connect(roles.randomPerson)
            .withdrawFundsDepositedForBlockedRequester(
              roles.airnode.address,
              chainId,
              endpointId,
              requester,
              roles.depositor.address
            )
        ).to.be.revertedWith('Requester not blocked');
      });
    });
  });
});
