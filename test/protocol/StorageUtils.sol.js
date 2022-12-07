const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('StorageUtils', function () {
  let roles;
  let airnodeProtocol;
  let endpointId, templateParameters, templateId;
  let subscriptionId,
    chainId,
    airnodeAddress,
    subscriptionParameters,
    subscriptionConditions,
    relayer,
    sponsor,
    requester,
    fulfillFunctionId;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      randomPerson: accounts[9],
    };
    const airnodeProtocolFactory = await hre.ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    airnodeProtocol = await airnodeProtocolFactory.deploy();
    endpointId = testUtils.generateRandomBytes32();
    templateParameters = testUtils.generateRandomBytes();
    templateId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['bytes32', 'bytes'], [endpointId, templateParameters])
    );
    chainId = 3;
    airnodeAddress = testUtils.generateRandomAddress();
    subscriptionParameters = testUtils.generateRandomBytes();
    subscriptionConditions = testUtils.generateRandomBytes();
    relayer = testUtils.generateRandomAddress();
    sponsor = testUtils.generateRandomAddress();
    requester = testUtils.generateRandomAddress();
    fulfillFunctionId = '0x12345678';
    subscriptionId = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'bytes32', 'bytes', 'bytes', 'address', 'address', 'address', 'bytes4'],
        [
          chainId,
          airnodeAddress,
          templateId,
          subscriptionParameters,
          subscriptionConditions,
          relayer,
          sponsor,
          requester,
          fulfillFunctionId,
        ]
      )
    );
  });

  describe('constructor', function () {
    it('constructs', async function () {
      expect(await airnodeProtocol.MAXIMUM_PARAMETER_LENGTH()).to.equal(4096);
    });
  });

  describe('announceTemplate', function () {
    context('Template parameters are not too long', function () {
      it('announces template but does not store it', async function () {
        await expect(airnodeProtocol.connect(roles.randomPerson).announceTemplate(endpointId, templateParameters))
          .to.emit(airnodeProtocol, 'AnnouncedTemplate')
          .withArgs(templateId, endpointId, templateParameters);
        const template = await airnodeProtocol.templates(templateId);
        expect(template.endpointId).to.equal(hre.ethers.constants.HashZero);
        expect(template.parameters).to.equal('0x');
      });
    });
    context('Template parameters are too long', function () {
      it('reverts', async function () {
        await expect(
          airnodeProtocol.connect(roles.randomPerson).announceTemplate(endpointId, `0x${'12'.repeat(4096 + 1)}`)
        ).to.be.revertedWith('Parameters too long');
      });
    });
  });

  describe('storeTemplate', function () {
    it('announces and stores template', async function () {
      await expect(airnodeProtocol.connect(roles.randomPerson).storeTemplate(endpointId, templateParameters))
        .to.emit(airnodeProtocol, 'AnnouncedTemplate')
        .withArgs(templateId, endpointId, templateParameters);
      const template = await airnodeProtocol.templates(templateId);
      expect(template.endpointId).to.equal(endpointId);
      expect(template.parameters).to.equal(templateParameters);
    });
  });

  describe('announceSubscription', function () {
    context('Chain ID is not zero', function () {
      context('Airnode address is not zero', function () {
        context('Subscription parameters are not too long', function () {
          context('Subscription conditions are not too long', function () {
            context('Relayer address is not zero', function () {
              context('Sponsor address is not zero', function () {
                context('Requester address is not zero', function () {
                  context('Fulfill function ID is not zero', function () {
                    it('announces subscription but does not store it', async function () {
                      await expect(
                        airnodeProtocol
                          .connect(roles.randomPerson)
                          .announceSubscription(
                            chainId,
                            airnodeAddress,
                            templateId,
                            subscriptionParameters,
                            subscriptionConditions,
                            relayer,
                            sponsor,
                            requester,
                            fulfillFunctionId
                          )
                      )
                        .to.emit(airnodeProtocol, 'AnnouncedSubscription')
                        .withArgs(
                          subscriptionId,
                          chainId,
                          airnodeAddress,
                          templateId,
                          subscriptionParameters,
                          subscriptionConditions,
                          relayer,
                          sponsor,
                          requester,
                          fulfillFunctionId
                        );
                      const subscription = await airnodeProtocol.subscriptions(subscriptionId);
                      expect(subscription.chainId).to.equal(0);
                      expect(subscription.airnode).to.equal(hre.ethers.constants.AddressZero);
                      expect(subscription.endpointOrTemplateId).to.equal(hre.ethers.constants.HashZero);
                      expect(subscription.parameters).to.equal('0x');
                      expect(subscription.conditions).to.equal('0x');
                      expect(subscription.relayer).to.equal(hre.ethers.constants.AddressZero);
                      expect(subscription.sponsor).to.equal(hre.ethers.constants.AddressZero);
                      expect(subscription.requester).to.equal(hre.ethers.constants.AddressZero);
                      expect(subscription.fulfillFunctionId).to.equal('0x00000000');
                    });
                  });
                  context('Fulfill function ID is zero', function () {
                    it('reverts', async function () {
                      await expect(
                        airnodeProtocol
                          .connect(roles.randomPerson)
                          .announceSubscription(
                            chainId,
                            airnodeAddress,
                            templateId,
                            subscriptionParameters,
                            subscriptionConditions,
                            relayer,
                            sponsor,
                            requester,
                            '0x00000000'
                          )
                      ).to.be.revertedWith('Fulfill function ID zero');
                    });
                  });
                });
                context('Requester address is zero', function () {
                  it('reverts', async function () {
                    await expect(
                      airnodeProtocol
                        .connect(roles.randomPerson)
                        .announceSubscription(
                          chainId,
                          airnodeAddress,
                          templateId,
                          subscriptionParameters,
                          subscriptionConditions,
                          relayer,
                          sponsor,
                          hre.ethers.constants.AddressZero,
                          fulfillFunctionId
                        )
                    ).to.be.revertedWith('Requester address zero');
                  });
                });
              });
              context('Sponsor address is zero', function () {
                it('reverts', async function () {
                  await expect(
                    airnodeProtocol
                      .connect(roles.randomPerson)
                      .announceSubscription(
                        chainId,
                        airnodeAddress,
                        templateId,
                        subscriptionParameters,
                        subscriptionConditions,
                        relayer,
                        hre.ethers.constants.AddressZero,
                        requester,
                        fulfillFunctionId
                      )
                  ).to.be.revertedWith('Sponsor address zero');
                });
              });
            });
            context('Relayer address is zero', function () {
              it('reverts', async function () {
                await expect(
                  airnodeProtocol
                    .connect(roles.randomPerson)
                    .announceSubscription(
                      chainId,
                      airnodeAddress,
                      templateId,
                      subscriptionParameters,
                      subscriptionConditions,
                      hre.ethers.constants.AddressZero,
                      sponsor,
                      requester,
                      fulfillFunctionId
                    )
                ).to.be.revertedWith('Relayer address zero');
              });
            });
          });
          context('Subscription conditions are too long', function () {
            it('reverts', async function () {
              await expect(
                airnodeProtocol
                  .connect(roles.randomPerson)
                  .announceSubscription(
                    chainId,
                    airnodeAddress,
                    templateId,
                    subscriptionParameters,
                    `0x${'12'.repeat(4096 + 1)}`,
                    relayer,
                    sponsor,
                    requester,
                    fulfillFunctionId
                  )
              ).to.be.revertedWith('Conditions too long');
            });
          });
        });
        context('Subscription parameters are too long', function () {
          it('reverts', async function () {
            await expect(
              airnodeProtocol
                .connect(roles.randomPerson)
                .announceSubscription(
                  chainId,
                  airnodeAddress,
                  templateId,
                  `0x${'12'.repeat(4096 + 1)}`,
                  subscriptionConditions,
                  relayer,
                  sponsor,
                  requester,
                  fulfillFunctionId
                )
            ).to.be.revertedWith('Parameters too long');
          });
        });
      });
      context('Airnode address is zero', function () {
        it('reverts', async function () {
          await expect(
            airnodeProtocol
              .connect(roles.randomPerson)
              .announceSubscription(
                chainId,
                hre.ethers.constants.AddressZero,
                templateId,
                subscriptionParameters,
                subscriptionConditions,
                relayer,
                sponsor,
                requester,
                fulfillFunctionId
              )
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Chain ID is zero', function () {
      it('reverts', async function () {
        await expect(
          airnodeProtocol
            .connect(roles.randomPerson)
            .announceSubscription(
              0,
              airnodeAddress,
              templateId,
              subscriptionParameters,
              subscriptionConditions,
              relayer,
              sponsor,
              requester,
              fulfillFunctionId
            )
        ).to.be.revertedWith('Chain ID zero');
      });
    });
  });

  describe('storeSubscription', function () {
    it('announces and stores subscription', async function () {
      await expect(
        airnodeProtocol
          .connect(roles.randomPerson)
          .storeSubscription(
            chainId,
            airnodeAddress,
            templateId,
            subscriptionParameters,
            subscriptionConditions,
            relayer,
            sponsor,
            requester,
            fulfillFunctionId
          )
      )
        .to.emit(airnodeProtocol, 'AnnouncedSubscription')
        .withArgs(
          subscriptionId,
          chainId,
          airnodeAddress,
          templateId,
          subscriptionParameters,
          subscriptionConditions,
          relayer,
          sponsor,
          requester,
          fulfillFunctionId
        );
      const subscription = await airnodeProtocol.subscriptions(subscriptionId);
      expect(subscription.chainId).to.equal(chainId);
      expect(subscription.airnode).to.equal(airnodeAddress);
      expect(subscription.endpointOrTemplateId).to.equal(templateId);
      expect(subscription.parameters).to.equal(subscriptionParameters);
      expect(subscription.conditions).to.equal(subscriptionConditions);
      expect(subscription.relayer).to.equal(relayer);
      expect(subscription.sponsor).to.equal(sponsor);
      expect(subscription.requester).to.equal(requester);
      expect(subscription.fulfillFunctionId).to.equal(fulfillFunctionId);
    });
  });
});
