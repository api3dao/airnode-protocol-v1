const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('AirnodeProtocol', function () {
  async function makeRequestAndPrepareFulfillment(
    airnodeProtocol,
    airnodeRequester,
    airnode,
    endpointOrTemplateId,
    requestParameters,
    sponsorAddress,
    fulfillFunctionId,
    airnodeSponsorWalletAddress
  ) {
    const requestId = await testUtils.deriveRequestId(
      airnodeProtocol,
      airnodeRequester.address,
      airnode.address,
      endpointOrTemplateId,
      requestParameters,
      sponsorAddress,
      fulfillFunctionId
    );
    await airnodeRequester.makeRequest(
      airnode.address,
      endpointOrTemplateId,
      requestParameters,
      sponsorAddress,
      fulfillFunctionId
    );
    const timestamp = await helpers.time.latest();
    const signature = await testUtils.signRrpFulfillment(airnode, requestId, timestamp, airnodeSponsorWalletAddress);
    return { requestId, timestamp, signature };
  }

  async function makeRelayedRequestAndPrepareFulfillment(
    airnodeProtocol,
    airnodeRequester,
    airnode,
    endpointOrTemplateId,
    requestParameters,
    relayer,
    sponsorAddress,
    fulfillFunctionId,
    relayerSponsorWalletAddress,
    fulfillData
  ) {
    const requestId = await testUtils.deriveRelayedRequestId(
      airnodeProtocol,
      airnodeRequester.address,
      airnode.address,
      endpointOrTemplateId,
      requestParameters,
      relayer.address,
      sponsorAddress,
      fulfillFunctionId
    );
    await airnodeRequester.makeRequestRelayed(
      airnode.address,
      endpointOrTemplateId,
      requestParameters,
      relayer.address,
      sponsorAddress,
      fulfillFunctionId
    );
    const timestamp = await helpers.time.latest();
    const signature = await testUtils.signRrpRelayedFulfillment(
      airnode,
      requestId,
      timestamp,
      relayerSponsorWalletAddress,
      fulfillData
    );
    const failSignature = await testUtils.signRrpRelayedFailure(
      relayer,
      requestId,
      timestamp,
      relayerSponsorWalletAddress
    );
    return { requestId, timestamp, signature, failSignature };
  }

  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      sponsor: accounts[1],
      randomPerson: accounts[9],
    };

    const { airnodeMnemonic, airnodeXpub } = testUtils.generateRandomAirnodeWallet();
    roles.airnode = ethers.Wallet.fromMnemonic(airnodeMnemonic);
    roles.airnodeSponsorWallet = testUtils.deriveSponsorWallet(
      airnodeMnemonic,
      roles.sponsor.address,
      testUtils.PROTOCOL_IDS.RRP
    );
    // Demonstrating how xpub can be used to derive the sponsor wallet address that needs to be funded
    const airnodeSponsorWalletAddress = testUtils.deriveSponsorWalletAddress(
      airnodeXpub,
      roles.sponsor.address,
      testUtils.PROTOCOL_IDS.RRP
    );
    await roles.deployer.sendTransaction({
      to: airnodeSponsorWalletAddress,
      value: ethers.utils.parseEther('1'),
    });
    const { airnodeMnemonic: relayerMnemonic, airnodeXpub: relayerXpub } = testUtils.generateRandomAirnodeWallet();
    roles.relayer = ethers.Wallet.fromMnemonic(relayerMnemonic);
    roles.relayerSponsorWallet = testUtils.deriveSponsorWallet(
      relayerMnemonic,
      roles.sponsor.address,
      testUtils.PROTOCOL_IDS.RELAYED_RRP
    );
    const relayerSponsorWalletAddress = testUtils.deriveSponsorWalletAddress(
      relayerXpub,
      roles.sponsor.address,
      testUtils.PROTOCOL_IDS.RELAYED_RRP
    );
    await roles.deployer.sendTransaction({
      to: relayerSponsorWalletAddress,
      value: ethers.utils.parseEther('1'),
    });

    const airnodeProtocolFactory = await ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const airnodeRequesterFactory = await ethers.getContractFactory('MockAirnodeRequester', roles.deployer);
    const airnodeRequester = await airnodeRequesterFactory.deploy(airnodeProtocol.address);

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.utils.solidityKeccak256(
      ['address', 'bytes32', 'bytes'],
      [roles.airnode.address, endpointId, templateParameters]
    );
    const requestParameters = testUtils.generateRandomBytes();
    const fulfillFunctionId = airnodeRequester.interface.getSighash('fulfillRequest');
    const fulfillData = ethers.utils.defaultAbiCoder.encode(['uint256', 'string'], ['123456', 'hello']);
    const errorMessage = 'Thing went wrong';

    const request = await makeRequestAndPrepareFulfillment(
      airnodeProtocol,
      airnodeRequester,
      roles.airnode,
      templateId,
      requestParameters,
      roles.sponsor.address,
      fulfillFunctionId,
      roles.airnodeSponsorWallet.address
    );
    const relayedRequest = await makeRelayedRequestAndPrepareFulfillment(
      airnodeProtocol,
      airnodeRequester,
      roles.airnode,
      templateId,
      requestParameters,
      roles.relayer,
      roles.sponsor.address,
      fulfillFunctionId,
      roles.relayerSponsorWallet.address,
      fulfillData
    );

    return {
      roles,
      airnodeProtocol,
      airnodeRequester,
      templateId,
      requestParameters,
      fulfillFunctionId,
      fulfillData,
      errorMessage,
      request,
      relayedRequest,
    };
  }

  describe('makeRequest', function () {
    context('Airnode address is not zero', function () {
      context('Endpoint or template ID is not zero', function () {
        context('Parameters are not too long', function () {
          context('Sponsor address is not zero', function () {
            context('Function selector is not zero', function () {
              it('makes request', async function () {
                const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillFunctionId } =
                  await helpers.loadFixture(deploy);
                const requestId = await testUtils.deriveRequestId(
                  airnodeProtocol,
                  airnodeRequester.address,
                  roles.airnode.address,
                  templateId,
                  requestParameters,
                  roles.sponsor.address,
                  fulfillFunctionId
                );
                const requestCountBefore = await airnodeProtocol.requesterToRequestCount(airnodeRequester.address);
                await expect(
                  airnodeRequester.makeRequest(
                    roles.airnode.address,
                    templateId,
                    requestParameters,
                    roles.sponsor.address,
                    fulfillFunctionId
                  )
                )
                  .to.emit(airnodeProtocol, 'MadeRequest')
                  .withArgs(
                    roles.airnode.address,
                    requestId,
                    airnodeRequester.address,
                    requestCountBefore.add(1),
                    templateId,
                    requestParameters,
                    roles.sponsor.address,
                    fulfillFunctionId
                  );
                expect(await airnodeProtocol.requesterToRequestCount(airnodeRequester.address)).to.equal(
                  requestCountBefore.add(1)
                );
                expect(await airnodeProtocol.requestIsAwaitingFulfillment(requestId)).to.equal(true);
              });
            });
            context('Function selector is zero', function () {
              it('reverts', async function () {
                const { roles, airnodeRequester, templateId, requestParameters } = await helpers.loadFixture(deploy);
                await expect(
                  airnodeRequester.makeRequest(
                    roles.airnode.address,
                    templateId,
                    requestParameters,
                    roles.sponsor.address,
                    '0x00000000'
                  )
                ).to.be.revertedWith('Fulfill function ID zero');
              });
            });
          });
          context('Sponsor address is zero', function () {
            it('reverts', async function () {
              const { roles, airnodeRequester, templateId, requestParameters, fulfillFunctionId } =
                await helpers.loadFixture(deploy);
              await expect(
                airnodeRequester.makeRequest(
                  roles.airnode.address,
                  templateId,
                  requestParameters,
                  ethers.constants.AddressZero,
                  fulfillFunctionId
                )
              ).to.be.revertedWith('Sponsor address zero');
            });
          });
        });
        context('Parameters are too long', function () {
          it('reverts', async function () {
            const { roles, airnodeRequester, templateId, fulfillFunctionId } = await helpers.loadFixture(deploy);
            await expect(
              airnodeRequester.makeRequest(
                roles.airnode.address,
                templateId,
                `0x${'01'.repeat(4096 + 1)}`,
                roles.sponsor.address,
                fulfillFunctionId
              )
            ).to.be.revertedWith('Parameters too long');
          });
        });
      });
      context('Endpoint or template ID is zero', function () {
        it('reverts', async function () {
          const { roles, airnodeRequester, requestParameters, fulfillFunctionId } = await helpers.loadFixture(deploy);
          await expect(
            airnodeRequester.makeRequest(
              roles.airnode.address,
              ethers.constants.HashZero,
              requestParameters,
              roles.sponsor.address,
              fulfillFunctionId
            )
          ).to.be.revertedWith('Endpoint or template ID zero');
        });
      });
    });
    context('Airnode address is zero', function () {
      it('reverts', async function () {
        const { roles, airnodeRequester, templateId, requestParameters, fulfillFunctionId } = await helpers.loadFixture(
          deploy
        );
        await expect(
          airnodeRequester.makeRequest(
            ethers.constants.AddressZero,
            templateId,
            requestParameters,
            roles.sponsor.address,
            fulfillFunctionId
          )
        ).to.be.revertedWith('Airnode address zero');
      });
    });
  });

  describe('fulfillRequest', function () {
    context('Fulfillment parameters are correct', function () {
      context('Signature is valid', function () {
        context('Fulfill function does not revert', function () {
          it('returns `true` and fulfills request', async function () {
            const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, request } =
              await helpers.loadFixture(deploy);
            const staticCallResult = await airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .callStatic.fulfillRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                fulfillData,
                request.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(true);
            expect(staticCallResult.callData).to.equal('0x');
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FulfilledRequest')
              .withArgs(roles.airnode.address, request.requestId, request.timestamp, fulfillData);
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(request.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(request.requestId)).to.equal(fulfillData);
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
        context('Fulfill function reverts with string', function () {
          it('returns `false` with revert string and fails', async function () {
            const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillData } =
              await helpers.loadFixture(deploy);
            const fulfillFunctionId = airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts');
            const request = await makeRequestAndPrepareFulfillment(
              airnodeProtocol,
              airnodeRequester,
              roles.airnode,
              templateId,
              requestParameters,
              roles.sponsor.address,
              fulfillFunctionId,
              roles.airnodeSponsorWallet.address
            );
            const staticCallResult = await airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .callStatic.fulfillRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                fulfillData,
                request.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Always reverts');
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FailedRequest')
              .withArgs(roles.airnode.address, request.requestId, request.timestamp, 'Fulfillment failed unexpectedly');
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(request.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(request.requestId)).to.equal('0x');
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
        context('Fulfill function reverts without string', function () {
          it('returns `false` without revert string and fails', async function () {
            const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillData } =
              await helpers.loadFixture(deploy);
            const fulfillFunctionId = airnodeRequester.interface.getSighash('fulfillRequestAlwaysRevertsWithNoString');
            const request = await makeRequestAndPrepareFulfillment(
              airnodeProtocol,
              airnodeRequester,
              roles.airnode,
              templateId,
              requestParameters,
              roles.sponsor.address,
              fulfillFunctionId,
              roles.airnodeSponsorWallet.address
            );
            const staticCallResult = await airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .callStatic.fulfillRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                fulfillData,
                request.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('No revert string');
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FailedRequest')
              .withArgs(roles.airnode.address, request.requestId, request.timestamp, 'Fulfillment failed unexpectedly');
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(request.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(request.requestId)).to.equal('0x');
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
        context('Fulfill function runs out of gas', function () {
          it('returns `false` without revert string and fails', async function () {
            const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillData } =
              await helpers.loadFixture(deploy);
            const fulfillFunctionId = airnodeRequester.interface.getSighash('fulfillRequestAlwaysRunsOutOfGas');
            const request = await makeRequestAndPrepareFulfillment(
              airnodeProtocol,
              airnodeRequester,
              roles.airnode,
              templateId,
              requestParameters,
              roles.sponsor.address,
              fulfillFunctionId,
              roles.airnodeSponsorWallet.address
            );
            const staticCallResult = await airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .callStatic.fulfillRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                fulfillData,
                request.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('No revert string');
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FailedRequest')
              .withArgs(roles.airnode.address, request.requestId, request.timestamp, 'Fulfillment failed unexpectedly');
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(request.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(request.requestId)).to.equal('0x');
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillRequest(
                  request.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  fulfillFunctionId,
                  request.timestamp,
                  fulfillData,
                  request.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, request } =
            await helpers.loadFixture(deploy);
          const differentSignature = await testUtils.signRrpFulfillment(
            roles.airnode,
            testUtils.generateRandomBytes32(),
            request.timestamp,
            roles.airnodeSponsorWallet.address
          );
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .fulfillRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                fulfillData,
                differentSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('Signature mismatch');
          const invalidSignature = '0x12345678';
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .fulfillRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                fulfillData,
                invalidSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Request ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, request } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillRequest(
              testUtils.generateRandomBytes32(),
              roles.airnode.address,
              airnodeRequester.address,
              fulfillFunctionId,
              request.timestamp,
              fulfillData,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Airnode address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, request } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillRequest(
              request.requestId,
              testUtils.generateRandomAddress(),
              airnodeRequester.address,
              fulfillFunctionId,
              request.timestamp,
              fulfillData,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Requester address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, fulfillFunctionId, fulfillData, request } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillRequest(
              request.requestId,
              roles.airnode.address,
              testUtils.generateRandomAddress(),
              fulfillFunctionId,
              request.timestamp,
              fulfillData,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Fulfill function ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillData, request } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillRequest(
              request.requestId,
              roles.airnode.address,
              airnodeRequester.address,
              airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts'),
              request.timestamp,
              fulfillData,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
  });

  describe('failRequest', function () {
    context('Fulfillment parameters are correct', function () {
      context('Signature is valid', function () {
        it('fails request with an error message', async function () {
          const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, request } =
            await helpers.loadFixture(deploy);
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .failRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                errorMessage,
                request.signature,
                { gasLimit: 500000 }
              )
          )
            .to.emit(airnodeProtocol, 'FailedRequest')
            .withArgs(roles.airnode.address, request.requestId, request.timestamp, errorMessage);
          // Should revert the second failure attempt
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .failRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                errorMessage,
                request.signature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('Invalid request fulfillment');
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, request } =
            await helpers.loadFixture(deploy);
          const differentSignature = await testUtils.signRrpFulfillment(
            roles.airnode,
            testUtils.generateRandomBytes32(),
            request.timestamp,
            roles.airnodeSponsorWallet.address
          );
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .failRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                errorMessage,
                differentSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('Signature mismatch');
          const invalidSignature = '0x12345678';
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .failRequest(
                request.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                fulfillFunctionId,
                request.timestamp,
                errorMessage,
                invalidSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Request ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, request } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .failRequest(
              testUtils.generateRandomBytes32(),
              roles.airnode.address,
              airnodeRequester.address,
              fulfillFunctionId,
              request.timestamp,
              errorMessage,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Airnode address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, request } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .failRequest(
              request.requestId,
              testUtils.generateRandomAddress(),
              airnodeRequester.address,
              fulfillFunctionId,
              request.timestamp,
              errorMessage,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Requester address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, fulfillFunctionId, errorMessage, request } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .failRequest(
              request.requestId,
              roles.airnode.address,
              testUtils.generateRandomAddress(),
              fulfillFunctionId,
              request.timestamp,
              errorMessage,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Fulfill function ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, errorMessage, request } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .failRequest(
              request.requestId,
              roles.airnode.address,
              airnodeRequester.address,
              airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts'),
              request.timestamp,
              errorMessage,
              request.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
  });

  describe('makeRequestRelayed', function () {
    context('Airnode address is not zero', function () {
      context('Endpoint or template ID is not zero', function () {
        context('Parameters are not too long', function () {
          context('Relayer address is not zero', function () {
            context('Sponsor address is not zero', function () {
              context('Function selector is not zero', function () {
                it('makes relayed request', async function () {
                  const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillFunctionId } =
                    await helpers.loadFixture(deploy);
                  const requestId = await testUtils.deriveRelayedRequestId(
                    airnodeProtocol,
                    airnodeRequester.address,
                    roles.airnode.address,
                    templateId,
                    requestParameters,
                    roles.relayer.address,
                    roles.sponsor.address,
                    fulfillFunctionId
                  );
                  const requestCountBefore = await airnodeProtocol.requesterToRequestCount(airnodeRequester.address);
                  await expect(
                    airnodeRequester.makeRequestRelayed(
                      roles.airnode.address,
                      templateId,
                      requestParameters,
                      roles.relayer.address,
                      roles.sponsor.address,
                      fulfillFunctionId
                    )
                  )
                    .to.emit(airnodeProtocol, 'MadeRequestRelayed')
                    .withArgs(
                      roles.relayer.address,
                      requestId,
                      roles.airnode.address,
                      airnodeRequester.address,
                      requestCountBefore.add(1),
                      templateId,
                      requestParameters,
                      roles.sponsor.address,
                      fulfillFunctionId
                    );
                  expect(await airnodeProtocol.requesterToRequestCount(airnodeRequester.address)).to.equal(
                    requestCountBefore.add(1)
                  );
                  expect(await airnodeProtocol.requestIsAwaitingFulfillment(requestId)).to.equal(true);
                });
              });
              context('Function selector is zero', function () {
                it('reverts', async function () {
                  const { roles, airnodeRequester, templateId, requestParameters } = await helpers.loadFixture(deploy);
                  await expect(
                    airnodeRequester.makeRequestRelayed(
                      roles.airnode.address,
                      templateId,
                      requestParameters,
                      roles.relayer.address,
                      roles.sponsor.address,
                      '0x00000000'
                    )
                  ).to.be.revertedWith('Fulfill function ID zero');
                });
              });
            });
            context('Sponsor address is zero', function () {
              it('reverts', async function () {
                const { roles, airnodeRequester, templateId, requestParameters, fulfillFunctionId } =
                  await helpers.loadFixture(deploy);
                await expect(
                  airnodeRequester.makeRequestRelayed(
                    roles.airnode.address,
                    templateId,
                    requestParameters,
                    roles.relayer.address,
                    ethers.constants.AddressZero,
                    fulfillFunctionId
                  )
                ).to.be.revertedWith('Sponsor address zero');
              });
            });
          });
          context('Relayer address is zero', function () {
            it('reverts', async function () {
              const { roles, airnodeRequester, templateId, requestParameters, fulfillFunctionId } =
                await helpers.loadFixture(deploy);
              await expect(
                airnodeRequester.makeRequestRelayed(
                  roles.airnode.address,
                  templateId,
                  requestParameters,
                  ethers.constants.AddressZero,
                  roles.sponsor.address,
                  fulfillFunctionId
                )
              ).to.be.revertedWith('Relayer address zero');
            });
          });
        });
        context('Parameters are too long', function () {
          it('reverts', async function () {
            const { roles, airnodeRequester, templateId, fulfillFunctionId } = await helpers.loadFixture(deploy);
            await expect(
              airnodeRequester.makeRequestRelayed(
                roles.airnode.address,
                templateId,
                `0x${'01'.repeat(4096 + 1)}`,
                roles.relayer.address,
                roles.sponsor.address,
                fulfillFunctionId
              )
            ).to.be.revertedWith('Parameters too long');
          });
        });
      });
      context('Endpoint or template ID is zero', function () {
        it('reverts', async function () {
          const { roles, airnodeRequester, requestParameters, fulfillFunctionId } = await helpers.loadFixture(deploy);
          await expect(
            airnodeRequester.makeRequestRelayed(
              roles.airnode.address,
              ethers.constants.HashZero,
              requestParameters,
              roles.relayer.address,
              roles.sponsor.address,
              fulfillFunctionId
            )
          ).to.be.revertedWith('Endpoint or template ID zero');
        });
      });
    });
    context('Airnode address is zero', function () {
      it('reverts', async function () {
        const { roles, airnodeRequester, templateId, requestParameters, fulfillFunctionId } = await helpers.loadFixture(
          deploy
        );
        await expect(
          airnodeRequester.makeRequestRelayed(
            ethers.constants.AddressZero,
            templateId,
            requestParameters,
            roles.relayer.address,
            roles.sponsor.address,
            fulfillFunctionId
          )
        ).to.be.revertedWith('Airnode address zero');
      });
    });
  });

  describe('fulfillRequestRelayed', function () {
    context('Fulfillment parameters are correct', function () {
      context('Signature is valid', function () {
        context('Fulfill function does not revert', function () {
          it('returns `true` and fulfills request', async function () {
            const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, relayedRequest } =
              await helpers.loadFixture(deploy);
            const staticCallResult = await airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .callStatic.fulfillRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                fulfillData,
                relayedRequest.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(true);
            expect(staticCallResult.callData).to.equal('0x');
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  fulfillFunctionId,
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FulfilledRequestRelayed')
              .withArgs(
                roles.relayer.address,
                relayedRequest.requestId,
                roles.airnode.address,
                relayedRequest.timestamp,
                fulfillData
              );
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(relayedRequest.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(relayedRequest.requestId)).to.equal(fulfillData);
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  fulfillFunctionId,
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
        context('Fulfill function reverts with string', function () {
          it('returns `false` with revert string and fails', async function () {
            const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillData } =
              await helpers.loadFixture(deploy);
            const fulfillFunctionId = airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts');
            const relayedRequest = await makeRelayedRequestAndPrepareFulfillment(
              airnodeProtocol,
              airnodeRequester,
              roles.airnode,
              templateId,
              requestParameters,
              roles.relayer,
              roles.sponsor.address,
              fulfillFunctionId,
              roles.relayerSponsorWallet.address,
              fulfillData
            );
            const staticCallResult = await airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .callStatic.fulfillRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                fulfillData,
                relayedRequest.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Always reverts');
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts'),
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FailedRequestRelayed')
              .withArgs(
                roles.relayer.address,
                relayedRequest.requestId,
                roles.airnode.address,
                relayedRequest.timestamp,
                'Fulfillment failed unexpectedly'
              );
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(relayedRequest.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(relayedRequest.requestId)).to.equal('0x');
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts'),
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
        context('Fulfill function reverts without string', function () {
          it('returns `false` without revert string and fails', async function () {
            const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillData } =
              await helpers.loadFixture(deploy);
            const fulfillFunctionId = airnodeRequester.interface.getSighash('fulfillRequestAlwaysRevertsWithNoString');
            const relayedRequest = await makeRelayedRequestAndPrepareFulfillment(
              airnodeProtocol,
              airnodeRequester,
              roles.airnode,
              templateId,
              requestParameters,
              roles.relayer,
              roles.sponsor.address,
              fulfillFunctionId,
              roles.relayerSponsorWallet.address,
              fulfillData
            );
            const staticCallResult = await airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .callStatic.fulfillRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                fulfillData,
                relayedRequest.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('No revert string');
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  fulfillFunctionId,
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FailedRequestRelayed')
              .withArgs(
                roles.relayer.address,
                relayedRequest.requestId,
                roles.airnode.address,
                relayedRequest.timestamp,
                'Fulfillment failed unexpectedly'
              );
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(relayedRequest.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(relayedRequest.requestId)).to.equal('0x');
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  fulfillFunctionId,
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
        context('Fulfill function runs out of gas', function () {
          it('returns `false` without revert string and fails', async function () {
            const { roles, airnodeProtocol, airnodeRequester, templateId, requestParameters, fulfillData } =
              await helpers.loadFixture(deploy);
            const fulfillFunctionId = airnodeRequester.interface.getSighash('fulfillRequestAlwaysRunsOutOfGas');
            const relayedRequest = await makeRelayedRequestAndPrepareFulfillment(
              airnodeProtocol,
              airnodeRequester,
              roles.airnode,
              templateId,
              requestParameters,
              roles.relayer,
              roles.sponsor.address,
              fulfillFunctionId,
              roles.relayerSponsorWallet.address,
              fulfillData
            );
            const staticCallResult = await airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .callStatic.fulfillRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                fulfillData,
                relayedRequest.signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('No revert string');
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  fulfillFunctionId,
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            )
              .to.emit(airnodeProtocol, 'FailedRequestRelayed')
              .withArgs(
                roles.relayer.address,
                relayedRequest.requestId,
                roles.airnode.address,
                relayedRequest.timestamp,
                'Fulfillment failed unexpectedly'
              );
            expect(await airnodeProtocol.requestIsAwaitingFulfillment(relayedRequest.requestId)).to.equal(false);
            expect(await airnodeRequester.requestIdToData(relayedRequest.requestId)).to.equal('0x');
            // Should revert the second fulfillment attempt
            await expect(
              airnodeProtocol
                .connect(roles.relayerSponsorWallet)
                .fulfillRequestRelayed(
                  relayedRequest.requestId,
                  roles.airnode.address,
                  airnodeRequester.address,
                  roles.relayer.address,
                  fulfillFunctionId,
                  relayedRequest.timestamp,
                  fulfillData,
                  relayedRequest.signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Invalid request fulfillment');
          });
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, relayedRequest } =
            await helpers.loadFixture(deploy);
          const differentSignature = await testUtils.signRrpRelayedFulfillment(
            roles.airnode,
            testUtils.generateRandomBytes32(),
            relayedRequest.timestamp,
            roles.relayerSponsorWallet.address,
            fulfillData
          );
          await expect(
            airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .fulfillRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                fulfillData,
                differentSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('Signature mismatch');
          const invalidSignature = '0x12345678';
          await expect(
            airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .fulfillRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                fulfillData,
                invalidSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Request ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, relayedRequest } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .fulfillRequestRelayed(
              testUtils.generateRandomBytes32(),
              roles.airnode.address,
              airnodeRequester.address,
              roles.relayer.address,
              fulfillFunctionId,
              relayedRequest.timestamp,
              fulfillData,
              relayedRequest.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Airnode address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, relayedRequest } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .fulfillRequestRelayed(
              relayedRequest.requestId,
              testUtils.generateRandomAddress(),
              airnodeRequester.address,
              roles.relayer.address,
              fulfillFunctionId,
              relayedRequest.timestamp,
              fulfillData,
              relayedRequest.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Requester address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, fulfillFunctionId, fulfillData, relayedRequest } = await helpers.loadFixture(
          deploy
        );
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .fulfillRequestRelayed(
              relayedRequest.requestId,
              roles.airnode.address,
              testUtils.generateRandomAddress(),
              roles.relayer.address,
              fulfillFunctionId,
              relayedRequest.timestamp,
              fulfillData,
              relayedRequest.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Relayer address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, fulfillData, relayedRequest } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .fulfillRequestRelayed(
              relayedRequest.requestId,
              roles.airnode.address,
              airnodeRequester.address,
              testUtils.generateRandomAddress(),
              fulfillFunctionId,
              relayedRequest.timestamp,
              fulfillData,
              relayedRequest.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Fulfill function ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillData, relayedRequest } = await helpers.loadFixture(
          deploy
        );
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .fulfillRequestRelayed(
              relayedRequest.requestId,
              roles.airnode.address,
              airnodeRequester.address,
              roles.relayer.address,
              airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts'),
              relayedRequest.timestamp,
              fulfillData,
              relayedRequest.signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
  });

  describe('failRequestRelayed', function () {
    context('Fulfillment parameters are correct', function () {
      context('Signature is valid', function () {
        it('fails request with an error message', async function () {
          const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, relayedRequest } =
            await helpers.loadFixture(deploy);
          await expect(
            airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .failRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                errorMessage,
                relayedRequest.failSignature,
                { gasLimit: 500000 }
              )
          )
            .to.emit(airnodeProtocol, 'FailedRequestRelayed')
            .withArgs(
              roles.relayer.address,
              relayedRequest.requestId,
              roles.airnode.address,
              relayedRequest.timestamp,
              errorMessage
            );
          // Should revert the second failure attempt
          await expect(
            airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .failRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                errorMessage,
                relayedRequest.failSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('Invalid request fulfillment');
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, relayedRequest } =
            await helpers.loadFixture(deploy);
          const differentSignature = await testUtils.signRrpRelayedFailure(
            roles.relayer,
            testUtils.generateRandomBytes32(),
            relayedRequest.timestamp,
            roles.relayerSponsorWallet.address
          );
          await expect(
            airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .failRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                errorMessage,
                differentSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('Signature mismatch');
          const invalidSignature = '0x12345678';
          await expect(
            airnodeProtocol
              .connect(roles.relayerSponsorWallet)
              .failRequestRelayed(
                relayedRequest.requestId,
                roles.airnode.address,
                airnodeRequester.address,
                roles.relayer.address,
                fulfillFunctionId,
                relayedRequest.timestamp,
                errorMessage,
                invalidSignature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Request ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, relayedRequest } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .failRequestRelayed(
              testUtils.generateRandomBytes32(),
              roles.airnode.address,
              airnodeRequester.address,
              roles.relayer.address,
              fulfillFunctionId,
              relayedRequest.timestamp,
              errorMessage,
              relayedRequest.failSignature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Airnode address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, relayedRequest } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .failRequestRelayed(
              relayedRequest.requestId,
              testUtils.generateRandomAddress(),
              airnodeRequester.address,
              roles.relayer.address,
              fulfillFunctionId,
              relayedRequest.timestamp,
              errorMessage,
              relayedRequest.failSignature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Requester address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, fulfillFunctionId, errorMessage, relayedRequest } = await helpers.loadFixture(
          deploy
        );
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .failRequestRelayed(
              relayedRequest.requestId,
              roles.airnode.address,
              testUtils.generateRandomAddress(),
              roles.relayer.address,
              fulfillFunctionId,
              relayedRequest.timestamp,
              errorMessage,
              relayedRequest.failSignature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Relayer address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, fulfillFunctionId, errorMessage, relayedRequest } =
          await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .failRequestRelayed(
              relayedRequest.requestId,
              roles.airnode.address,
              airnodeRequester.address,
              testUtils.generateRandomAddress(),
              fulfillFunctionId,
              relayedRequest.timestamp,
              errorMessage,
              relayedRequest.failSignature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
    context('Fulfill function ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, airnodeRequester, errorMessage, relayedRequest } = await helpers.loadFixture(
          deploy
        );
        await expect(
          airnodeProtocol
            .connect(roles.relayerSponsorWallet)
            .failRequestRelayed(
              relayedRequest.requestId,
              roles.airnode.address,
              airnodeRequester.address,
              roles.relayer.address,
              airnodeRequester.interface.getSighash('fulfillRequestAlwaysReverts'),
              relayedRequest.timestamp,
              errorMessage,
              relayedRequest.failSignature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Invalid request fulfillment');
      });
    });
  });
});
