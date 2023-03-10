const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('StorageUtils', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      airnode: accounts[1],
      relayer: accounts[2],
      sponsor: accounts[3],
      requester: accounts[4],
      randomPerson: accounts[9],
    };

    const airnodeProtocolFactory = await ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const airnodeRequesterFactory = await ethers.getContractFactory('MockAirnodeRequester', roles.deployer);
    const airnodeRequester = await airnodeRequesterFactory.deploy(airnodeProtocol.address);

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointId, templateParameters]);
    const chainId = 123;
    const subscriptionParameters = testUtils.generateRandomBytes();
    const subscriptionConditions = testUtils.generateRandomBytes();
    const fulfillFunctionId = '0x12345678';
    const subscriptionId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'bytes32', 'bytes', 'bytes', 'address', 'address', 'address', 'bytes4'],
        [
          chainId,
          roles.airnode.address,
          templateId,
          subscriptionParameters,
          subscriptionConditions,
          roles.relayer.address,
          roles.sponsor.address,
          roles.requester.address,
          fulfillFunctionId,
        ]
      )
    );

    return {
      roles,
      airnodeProtocol,
      airnodeRequester,
      endpointId,
      templateParameters,
      templateId,
      chainId,
      subscriptionParameters,
      subscriptionConditions,
      fulfillFunctionId,
      subscriptionId,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { airnodeProtocol } = await helpers.loadFixture(deploy);
      expect(await airnodeProtocol.MAXIMUM_PARAMETER_LENGTH()).to.equal(4096);
    });
  });

  describe('storeTemplate', function () {
    context('Template parameters are not too long', function () {
      it('stores template', async function () {
        const { roles, airnodeProtocol, endpointId, templateParameters, templateId } = await helpers.loadFixture(
          deploy
        );
        await expect(airnodeProtocol.connect(roles.randomPerson).storeTemplate(endpointId, templateParameters))
          .to.emit(airnodeProtocol, 'StoredTemplate')
          .withArgs(templateId, endpointId, templateParameters);
        const template = await airnodeProtocol.templates(templateId);
        expect(template.endpointId).to.equal(endpointId);
        expect(template.parameters).to.equal(templateParameters);
      });
    });
    context('Template parameters are too long', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, endpointId } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol.connect(roles.randomPerson).storeTemplate(endpointId, `0x${'12'.repeat(4096 + 1)}`)
        ).to.be.revertedWith('Parameters too long');
      });
    });
  });

  describe('storeSubscription', function () {
    context('Chain ID is not zero', function () {
      context('Airnode address is not zero', function () {
        context('Subscription parameters are not too long', function () {
          context('Subscription conditions are not too long', function () {
            context('Relayer address is not zero', function () {
              context('Sponsor address is not zero', function () {
                context('Requester address is not zero', function () {
                  context('Fulfill function ID is not zero', function () {
                    it('announces subscription but does not store it', async function () {
                      const {
                        roles,
                        airnodeProtocol,
                        templateId,
                        chainId,
                        subscriptionParameters,
                        subscriptionConditions,
                        fulfillFunctionId,
                        subscriptionId,
                      } = await helpers.loadFixture(deploy);
                      await expect(
                        airnodeProtocol
                          .connect(roles.randomPerson)
                          .storeSubscription(
                            chainId,
                            roles.airnode.address,
                            templateId,
                            subscriptionParameters,
                            subscriptionConditions,
                            roles.relayer.address,
                            roles.sponsor.address,
                            roles.requester.address,
                            fulfillFunctionId
                          )
                      )
                        .to.emit(airnodeProtocol, 'StoredSubscription')
                        .withArgs(
                          subscriptionId,
                          chainId,
                          roles.airnode.address,
                          templateId,
                          subscriptionParameters,
                          subscriptionConditions,
                          roles.relayer.address,
                          roles.sponsor.address,
                          roles.requester.address,
                          fulfillFunctionId
                        );
                      const subscription = await airnodeProtocol.subscriptions(subscriptionId);
                      expect(subscription.chainId).to.equal(chainId);
                      expect(subscription.airnode).to.equal(roles.airnode.address);
                      expect(subscription.endpointOrTemplateId).to.equal(templateId);
                      expect(subscription.parameters).to.equal(subscriptionParameters);
                      expect(subscription.conditions).to.equal(subscriptionConditions);
                      expect(subscription.relayer).to.equal(roles.relayer.address);
                      expect(subscription.sponsor).to.equal(roles.sponsor.address);
                      expect(subscription.requester).to.equal(roles.requester.address);
                      expect(subscription.fulfillFunctionId).to.equal(fulfillFunctionId);
                    });
                  });
                  context('Fulfill function ID is zero', function () {
                    it('reverts', async function () {
                      const {
                        roles,
                        airnodeProtocol,
                        templateId,
                        chainId,
                        subscriptionParameters,
                        subscriptionConditions,
                      } = await helpers.loadFixture(deploy);
                      await expect(
                        airnodeProtocol
                          .connect(roles.randomPerson)
                          .storeSubscription(
                            chainId,
                            roles.airnode.address,
                            templateId,
                            subscriptionParameters,
                            subscriptionConditions,
                            roles.relayer.address,
                            roles.sponsor.address,
                            roles.requester.address,
                            '0x00000000'
                          )
                      ).to.be.revertedWith('Fulfill function ID zero');
                    });
                  });
                });
                context('Requester address is zero', function () {
                  it('reverts', async function () {
                    const {
                      roles,
                      airnodeProtocol,
                      templateId,
                      chainId,
                      subscriptionParameters,
                      subscriptionConditions,
                      fulfillFunctionId,
                    } = await helpers.loadFixture(deploy);
                    await expect(
                      airnodeProtocol
                        .connect(roles.randomPerson)
                        .storeSubscription(
                          chainId,
                          roles.airnode.address,
                          templateId,
                          subscriptionParameters,
                          subscriptionConditions,
                          roles.relayer.address,
                          roles.sponsor.address,
                          ethers.constants.AddressZero,
                          fulfillFunctionId
                        )
                    ).to.be.revertedWith('Requester address zero');
                  });
                });
              });
              context('Sponsor address is zero', function () {
                it('reverts', async function () {
                  const {
                    roles,
                    airnodeProtocol,
                    templateId,
                    chainId,
                    subscriptionParameters,
                    subscriptionConditions,
                    fulfillFunctionId,
                  } = await helpers.loadFixture(deploy);
                  await expect(
                    airnodeProtocol
                      .connect(roles.randomPerson)
                      .storeSubscription(
                        chainId,
                        roles.airnode.address,
                        templateId,
                        subscriptionParameters,
                        subscriptionConditions,
                        roles.relayer.address,
                        ethers.constants.AddressZero,
                        roles.requester.address,
                        fulfillFunctionId
                      )
                  ).to.be.revertedWith('Sponsor address zero');
                });
              });
            });
            context('Relayer address is zero', function () {
              it('reverts', async function () {
                const {
                  roles,
                  airnodeProtocol,
                  templateId,
                  chainId,
                  subscriptionParameters,
                  subscriptionConditions,
                  fulfillFunctionId,
                } = await helpers.loadFixture(deploy);
                await expect(
                  airnodeProtocol
                    .connect(roles.randomPerson)
                    .storeSubscription(
                      chainId,
                      roles.airnode.address,
                      templateId,
                      subscriptionParameters,
                      subscriptionConditions,
                      ethers.constants.AddressZero,
                      roles.sponsor.address,
                      roles.requester.address,
                      fulfillFunctionId
                    )
                ).to.be.revertedWith('Relayer address zero');
              });
            });
          });
          context('Subscription conditions are too long', function () {
            it('reverts', async function () {
              const { roles, airnodeProtocol, templateId, chainId, subscriptionParameters, fulfillFunctionId } =
                await helpers.loadFixture(deploy);
              await expect(
                airnodeProtocol
                  .connect(roles.randomPerson)
                  .storeSubscription(
                    chainId,
                    roles.airnode.address,
                    templateId,
                    subscriptionParameters,
                    `0x${'12'.repeat(4096 + 1)}`,
                    roles.relayer.address,
                    roles.sponsor.address,
                    roles.requester.address,
                    fulfillFunctionId
                  )
              ).to.be.revertedWith('Conditions too long');
            });
          });
        });
        context('Subscription parameters are too long', function () {
          it('reverts', async function () {
            const { roles, airnodeProtocol, templateId, chainId, subscriptionConditions, fulfillFunctionId } =
              await helpers.loadFixture(deploy);
            await expect(
              airnodeProtocol
                .connect(roles.randomPerson)
                .storeSubscription(
                  chainId,
                  roles.airnode.address,
                  templateId,
                  `0x${'12'.repeat(4096 + 1)}`,
                  subscriptionConditions,
                  roles.relayer.address,
                  roles.sponsor.address,
                  roles.requester.address,
                  fulfillFunctionId
                )
            ).to.be.revertedWith('Parameters too long');
          });
        });
      });
      context('Airnode address is zero', function () {
        it('reverts', async function () {
          const {
            roles,
            airnodeProtocol,
            templateId,
            chainId,
            subscriptionParameters,
            subscriptionConditions,
            fulfillFunctionId,
          } = await helpers.loadFixture(deploy);
          await expect(
            airnodeProtocol
              .connect(roles.randomPerson)
              .storeSubscription(
                chainId,
                ethers.constants.AddressZero,
                templateId,
                subscriptionParameters,
                subscriptionConditions,
                roles.relayer.address,
                roles.sponsor.address,
                roles.requester.address,
                fulfillFunctionId
              )
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Chain ID is zero', function () {
      it('reverts', async function () {
        const {
          roles,
          airnodeProtocol,
          templateId,
          subscriptionParameters,
          subscriptionConditions,
          fulfillFunctionId,
        } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.randomPerson)
            .storeSubscription(
              0,
              roles.airnode.address,
              templateId,
              subscriptionParameters,
              subscriptionConditions,
              roles.relayer.address,
              roles.sponsor.address,
              roles.requester.address,
              fulfillFunctionId
            )
        ).to.be.revertedWith('Chain ID zero');
      });
    });
  });
});
