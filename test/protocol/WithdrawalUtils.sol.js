const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');
const { solidityKeccak256 } = require('ethers/lib/utils');

describe('WithdrawalUtils', function () {
  async function makeWithdrawalRequestAndPrepareFulfillment(
    airnodeProtocol,
    sponsor,
    protocolId,
    airnode,
    airnodeSponsorWalletAddress
  ) {
    const requestId = await deriveWithdrawalRequestId(airnodeProtocol, sponsor.address, protocolId);
    await airnodeProtocol.connect(sponsor).requestWithdrawal(airnode.address, protocolId);
    const timestamp = await helpers.time.latest();
    const signature = await signWithdrawalFulfillment(airnode, requestId, timestamp, airnodeSponsorWalletAddress);
    return { requestId, timestamp, signature };
  }

  async function deriveWithdrawalRequestId(airnodeProtocol, sponsorAddress, protocolId) {
    return ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ['uint256', 'address', 'address', 'uint256'],
        [(await airnodeProtocol.provider.getNetwork()).chainId, airnodeProtocol.address, sponsorAddress, protocolId]
      )
    );
  }

  async function signWithdrawalFulfillment(airnode, requestId, timestamp, airnodeSponsorWalletAddress) {
    return await airnode.signMessage(
      ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ['bytes32', 'uint256', 'address'],
          [requestId, timestamp, airnodeSponsorWalletAddress]
        )
      )
    );
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
      testUtils.PROTOCOL_IDS.RELAYED_RRP
    );
    // Demonstrating how xpub can be used to derive the sponsor wallet address that needs to be funded
    const airnodeSponsorWalletAddress = testUtils.deriveSponsorWalletAddress(
      airnodeXpub,
      roles.sponsor.address,
      testUtils.PROTOCOL_IDS.RELAYED_RRP
    );
    await roles.deployer.sendTransaction({
      to: airnodeSponsorWalletAddress,
      value: ethers.utils.parseEther('1'),
    });

    const airnodeProtocolFactory = await ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();

    const protocolId = testUtils.PROTOCOL_IDS.RRP;

    return {
      roles,
      airnodeMnemonic,
      airnodeProtocol,
      protocolId,
    };
  }

  async function deployAndMakeWithdrawalRequest() {
    const { roles, airnodeProtocol, protocolId } = await deploy();
    const withdrawalRequest = await makeWithdrawalRequestAndPrepareFulfillment(
      airnodeProtocol,
      roles.sponsor,
      protocolId,
      roles.airnode,
      roles.airnodeSponsorWallet.address
    );
    return { roles, airnodeProtocol, protocolId, withdrawalRequest };
  }

  describe('requestWithdrawal', function () {
    context('Airnode/relayer address is not zero', function () {
      context('Protocol ID is not zero', function () {
        it('requests withdrawal', async function () {
          const { roles, airnodeProtocol, protocolId } = await helpers.loadFixture(deploy);
          const requestId = await deriveWithdrawalRequestId(airnodeProtocol, roles.sponsor.address, protocolId);
          expect(await airnodeProtocol.withdrawalRequestIsAwaitingFulfillment(requestId)).to.equal(false);
          await expect(airnodeProtocol.connect(roles.sponsor).requestWithdrawal(roles.airnode.address, protocolId))
            .to.emit(airnodeProtocol, 'RequestedWithdrawal')
            .withArgs(roles.airnode.address, roles.sponsor.address, requestId, protocolId);
          expect(await airnodeProtocol.withdrawalRequestIsAwaitingFulfillment(requestId)).to.equal(true);
        });
      });
      context('Protocol ID is zero', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol } = await helpers.loadFixture(deploy);
          await expect(
            airnodeProtocol.connect(roles.sponsor).requestWithdrawal(roles.airnode.address, 0)
          ).to.be.revertedWith('Protocol ID zero');
        });
      });
    });
    context('Airnode/relayer address is zero', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, protocolId } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol.connect(roles.sponsor).requestWithdrawal(ethers.constants.AddressZero, protocolId)
        ).to.be.revertedWith('Airnode/relayer address zero');
      });
    });
  });

  describe('fulfillWithdrawal', function () {
    context('Fulfillment parameters are correct', function () {
      context('Timestamp is valid', function () {
        context('Signature is valid', function () {
          it('fulfills withdrawal', async function () {
            const { roles, airnodeProtocol, protocolId, withdrawalRequest } = await helpers.loadFixture(
              deployAndMakeWithdrawalRequest
            );
            // Calculate the amount to be withdrawn
            const gasEstimate = await airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .estimateGas.fulfillWithdrawal(
                withdrawalRequest.requestId,
                roles.airnode.address,
                protocolId,
                roles.sponsor.address,
                withdrawalRequest.timestamp,
                withdrawalRequest.signature,
                {
                  value: 1,
                  gasLimit: 500000,
                }
              );
            const gasPrice = await ethers.provider.getGasPrice();
            const txCost = gasEstimate.mul(gasPrice);
            const sponsorWalletBalance = await ethers.provider.getBalance(roles.airnodeSponsorWallet.address);
            const fundsToSend = sponsorWalletBalance.sub(txCost);
            // Fulfill the withdrawal request
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillWithdrawal(
                  withdrawalRequest.requestId,
                  roles.airnode.address,
                  protocolId,
                  roles.sponsor.address,
                  withdrawalRequest.timestamp,
                  withdrawalRequest.signature,
                  {
                    value: fundsToSend,
                    gasLimit: gasEstimate,
                    gasPrice: gasPrice,
                  }
                )
            )
              .to.emit(airnodeProtocol, 'FulfilledWithdrawal')
              .withArgs(
                roles.airnode.address,
                roles.sponsor.address,
                withdrawalRequest.requestId,
                protocolId,
                roles.airnodeSponsorWallet.address,
                fundsToSend
              );
            expect(await airnodeProtocol.sponsorToBalance(roles.sponsor.address)).to.equal(fundsToSend);
            expect(await airnodeProtocol.withdrawalRequestIsAwaitingFulfillment(withdrawalRequest.requestId)).to.equal(
              false
            );
          });
        });
        context('Signature is not valid', function () {
          it('reverts', async function () {
            const { roles, airnodeProtocol, protocolId, withdrawalRequest } = await helpers.loadFixture(
              deployAndMakeWithdrawalRequest
            );
            const differentSignature = await roles.airnode.signMessage(
              ethers.utils.arrayify(
                ethers.utils.solidityKeccak256(
                  ['bytes32', 'uint256', 'address'],
                  [testUtils.generateRandomBytes32(), withdrawalRequest.timestamp, roles.airnodeSponsorWallet.address]
                )
              )
            );
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillWithdrawal(
                  withdrawalRequest.requestId,
                  roles.airnode.address,
                  protocolId,
                  roles.sponsor.address,
                  withdrawalRequest.timestamp,
                  differentSignature,
                  {
                    value: 1,
                    gasLimit: 500000,
                  }
                )
            ).to.be.revertedWith('Signature mismatch');
            const invalidSignature = '0x12345678';
            await expect(
              airnodeProtocol
                .connect(roles.airnodeSponsorWallet)
                .fulfillWithdrawal(
                  withdrawalRequest.requestId,
                  roles.airnode.address,
                  protocolId,
                  roles.sponsor.address,
                  withdrawalRequest.timestamp,
                  invalidSignature,
                  {
                    value: 1,
                    gasLimit: 500000,
                  }
                )
            ).to.be.revertedWith('ECDSA: invalid signature length');
          });
        });
      });
      context('Timestamp is not valid', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, protocolId, withdrawalRequest } = await helpers.loadFixture(
            deployAndMakeWithdrawalRequest
          );
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const timestampStale = nextTimestamp - 60 * 60;
          const signatureStale = await roles.airnode.signMessage(
            ethers.utils.arrayify(
              solidityKeccak256(
                ['bytes32', 'uint256', 'address'],
                [withdrawalRequest.requestId, timestampStale, roles.airnodeSponsorWallet.address]
              )
            )
          );
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .fulfillWithdrawal(
                withdrawalRequest.requestId,
                roles.airnode.address,
                protocolId,
                roles.sponsor.address,
                timestampStale,
                signatureStale,
                {
                  value: 1,
                  gasLimit: 500000,
                }
              )
          ).to.be.revertedWith('Timestamp not valid');

          const nextTimestamp2 = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp2);
          const timestampFromFuture = nextTimestamp + 60 * 60 + 1;
          const signatureFromFuture = await roles.airnode.signMessage(
            ethers.utils.arrayify(
              ethers.utils.solidityKeccak256(
                ['bytes32', 'uint256', 'address'],
                [withdrawalRequest.requestId, timestampFromFuture, roles.airnodeSponsorWallet.address]
              )
            )
          );
          await expect(
            airnodeProtocol
              .connect(roles.airnodeSponsorWallet)
              .fulfillWithdrawal(
                withdrawalRequest.requestId,
                roles.airnode.address,
                protocolId,
                roles.sponsor.address,
                timestampFromFuture,
                signatureFromFuture,
                {
                  value: 1,
                  gasLimit: 500000,
                }
              )
          ).to.be.revertedWith('Timestamp not valid');
        });
      });
    });
    context('Withdrawal request ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, protocolId, withdrawalRequest } = await helpers.loadFixture(
          deployAndMakeWithdrawalRequest
        );
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillWithdrawal(
              testUtils.generateRandomBytes32(),
              roles.airnode.address,
              protocolId,
              roles.sponsor.address,
              withdrawalRequest.timestamp,
              withdrawalRequest.signature,
              {
                value: 1,
                gasLimit: 500000,
              }
            )
        ).to.be.revertedWith('Invalid withdrawal fulfillment');
      });
    });
    context('Airnode/relayer address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, protocolId, withdrawalRequest } = await helpers.loadFixture(
          deployAndMakeWithdrawalRequest
        );
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillWithdrawal(
              withdrawalRequest.requestId,
              testUtils.generateRandomAddress(),
              protocolId,
              roles.sponsor.address,
              withdrawalRequest.timestamp,
              withdrawalRequest.signature,
              {
                value: 1,
                gasLimit: 500000,
              }
            )
        ).to.be.revertedWith('Invalid withdrawal fulfillment');
      });
    });
    context('Protocol ID is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, withdrawalRequest } = await helpers.loadFixture(deployAndMakeWithdrawalRequest);
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillWithdrawal(
              withdrawalRequest.requestId,
              roles.airnode.address,
              1837837,
              roles.sponsor.address,
              withdrawalRequest.timestamp,
              withdrawalRequest.signature,
              {
                value: 1,
                gasLimit: 500000,
              }
            )
        ).to.be.revertedWith('Invalid withdrawal fulfillment');
      });
    });
    context('Sponsor address is not correct', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol, protocolId, withdrawalRequest } = await helpers.loadFixture(
          deployAndMakeWithdrawalRequest
        );
        await expect(
          airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillWithdrawal(
              withdrawalRequest.requestId,
              roles.airnode.address,
              protocolId,
              testUtils.generateRandomAddress(),
              withdrawalRequest.timestamp,
              withdrawalRequest.signature,
              {
                value: 1,
                gasLimit: 500000,
              }
            )
        ).to.be.revertedWith('Invalid withdrawal fulfillment');
      });
    });
  });

  describe('claimBalance', function () {
    context('Sender balance is not zero', function () {
      context('Transfer is successful', function () {
        it('claims balance', async function () {
          const { roles, airnodeProtocol, protocolId, withdrawalRequest } = await helpers.loadFixture(
            deployAndMakeWithdrawalRequest
          );
          // Calculate the amount to be withdrawn
          const gasEstimate = await airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .estimateGas.fulfillWithdrawal(
              withdrawalRequest.requestId,
              roles.airnode.address,
              protocolId,
              roles.sponsor.address,
              withdrawalRequest.timestamp,
              withdrawalRequest.signature,
              {
                value: 1,
                gasLimit: 500000,
              }
            );
          const gasPrice = await ethers.provider.getGasPrice();
          const txCost = gasEstimate.mul(gasPrice);
          const sponsorWalletBalance = await ethers.provider.getBalance(roles.airnodeSponsorWallet.address);
          const fundsToSend = sponsorWalletBalance.sub(txCost);
          // Fulfill the withdrawal request
          await airnodeProtocol
            .connect(roles.airnodeSponsorWallet)
            .fulfillWithdrawal(
              withdrawalRequest.requestId,
              roles.airnode.address,
              protocolId,
              roles.sponsor.address,
              withdrawalRequest.timestamp,
              withdrawalRequest.signature,
              {
                value: fundsToSend,
                gasLimit: gasEstimate,
                gasPrice: gasPrice,
              }
            );
          // Claim balance
          const sponsorBalance = await ethers.provider.getBalance(roles.sponsor.address);
          await expect(airnodeProtocol.connect(roles.sponsor).claimBalance())
            .to.emit(airnodeProtocol, 'ClaimedBalance')
            .withArgs(roles.sponsor.address, fundsToSend);
          // Less than 0.001 ETH will be spent on the transaction
          expect(sponsorBalance.add(fundsToSend).sub(await ethers.provider.getBalance(roles.sponsor.address))).to.be.lt(
            ethers.utils.parseEther('0.001')
          );
          expect(await ethers.provider.getBalance(airnodeProtocol.address)).to.equal(0);
        });
      });
      context('Transfer is not successful', function () {
        it('reverts', async function () {
          const { roles, airnodeMnemonic, airnodeProtocol, protocolId } = await helpers.loadFixture(deploy);
          const mockSponsorFactory = await ethers.getContractFactory('MockSponsor', roles.deployer);
          const sponsor = await mockSponsorFactory.deploy(airnodeProtocol.address);
          const airnodeSponsorWallet = testUtils.deriveSponsorWallet(
            airnodeMnemonic,
            sponsor.address,
            testUtils.PROTOCOL_IDS.RRP
          );
          await roles.deployer.sendTransaction({
            to: airnodeSponsorWallet.address,
            value: ethers.utils.parseEther('1'),
          });

          const requestId = await deriveWithdrawalRequestId(airnodeProtocol, sponsor.address, protocolId);
          await sponsor.requestWithdrawal(roles.airnode.address, protocolId);
          const timestamp = await helpers.time.latest();
          const signature = await roles.airnode.signMessage(
            ethers.utils.arrayify(
              ethers.utils.solidityKeccak256(
                ['bytes32', 'uint256', 'address'],
                [requestId, timestamp, airnodeSponsorWallet.address]
              )
            )
          );
          // Calculate the amount to be withdrawn
          const gasEstimate = await airnodeProtocol
            .connect(airnodeSponsorWallet)
            .estimateGas.fulfillWithdrawal(
              requestId,
              roles.airnode.address,
              protocolId,
              sponsor.address,
              timestamp,
              signature,
              {
                value: 1,
                gasLimit: 500000,
              }
            );
          const gasPrice = await ethers.provider.getGasPrice();
          const txCost = gasEstimate.mul(gasPrice);
          const sponsorWalletBalance = await ethers.provider.getBalance(airnodeSponsorWallet.address);
          const fundsToSend = sponsorWalletBalance.sub(txCost);
          // Fulfill the withdrawal request
          await airnodeProtocol
            .connect(airnodeSponsorWallet)
            .fulfillWithdrawal(requestId, roles.airnode.address, protocolId, sponsor.address, timestamp, signature, {
              value: fundsToSend,
              gasLimit: gasEstimate,
              gasPrice: gasPrice,
            });
          // Attempt to claim balance
          await expect(sponsor.claimBalance()).to.be.revertedWith('Transfer failed');
        });
      });
    });
    context('Sender balance is zero', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol } = await helpers.loadFixture(deploy);
        await expect(airnodeProtocol.connect(roles.sponsor).claimBalance()).to.be.revertedWith('Sender balance zero');
      });
    });
  });
});
