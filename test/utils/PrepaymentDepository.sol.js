const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('PrepaymentDepository', function () {
  async function deposit(token, prepaymentDepository, account, amount) {
    await token.connect(account).approve(prepaymentDepository.address, amount);
    await prepaymentDepository.connect(account).deposit(account.address, amount);
  }

  async function signErc2612Permit(token, signer, spenderAddress, amount, deadline) {
    return ethers.utils.splitSignature(
      await signer._signTypedData(
        {
          name: await token.name(),
          version: '2',
          chainId: (await token.provider.getNetwork()).chainId,
          verifyingContract: token.address,
        },
        {
          Permit: [
            {
              name: 'owner',
              type: 'address',
            },
            {
              name: 'spender',
              type: 'address',
            },
            {
              name: 'value',
              type: 'uint256',
            },
            {
              name: 'nonce',
              type: 'uint256',
            },
            {
              name: 'deadline',
              type: 'uint256',
            },
          ],
        },
        {
          owner: signer.address,
          spender: spenderAddress,
          value: amount,
          nonce: await token.nonces(signer.address),
          deadline,
        }
      )
    );
  }

  async function signWithdrawal(prepaymentDepository, signer, userAddress, amount, expirationTimestamp) {
    const withdrawalHash = ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'address', 'uint256', 'uint256'],
      [
        (await prepaymentDepository.provider.getNetwork()).chainId,
        prepaymentDepository.address,
        userAddress,
        amount,
        expirationTimestamp,
      ]
    );
    const signature = signer.signMessage(ethers.utils.arrayify(withdrawalHash));
    return { withdrawalHash, signature };
  }

  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      withdrawalSigner: accounts[2],
      userWithdrawalLimitIncreaser: accounts[3],
      userWithdrawalLimitDecreaser: accounts[4],
      claimer: accounts[5],
      user: accounts[6],
      withdrawalDestination: accounts[7],
      recipient: accounts[8],
      randomPerson: accounts[9],
    };
    const adminRoleDescription = 'PrepaymentDepository admin';
    const withdrawalSignerRoleDescription = 'Withdrawal signer';
    const userWithdrawalLimitIncreaserRoleDescription = 'User withdrawal limit increaser';
    const userWithdrawalLimitDecreaserRoleDescription = 'User withdrawal limit decreaser';
    const claimerRoleDescription = 'Claimer';

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const tokenFactory = await ethers.getContractFactory('MockErc20PermitToken', roles.deployer);
    const token = await tokenFactory.deploy(roles.deployer.address);
    const prepaymentRepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
    const prepaymentDepository = await prepaymentRepositoryFactory.deploy(
      accessControlRegistry.address,
      adminRoleDescription,
      roles.manager.address,
      token.address
    );

    const userBalance = 1000000;
    const initialDepositAmount = 1000;
    await token.connect(roles.deployer).transfer(roles.user.address, userBalance);
    await token.connect(roles.deployer).transfer(roles.randomPerson.address, userBalance);
    await deposit(token, prepaymentDepository, roles.user, initialDepositAmount);

    const rootRole = testUtils.deriveRootRole(roles.manager.address);
    const adminRole = testUtils.deriveRole(rootRole, adminRoleDescription);
    const withdrawalSignerRole = testUtils.deriveRole(adminRole, withdrawalSignerRoleDescription);
    const userWithdrawalLimitIncreaserRole = testUtils.deriveRole(
      adminRole,
      userWithdrawalLimitIncreaserRoleDescription
    );
    const userWithdrawalLimitDecreaserRole = testUtils.deriveRole(
      adminRole,
      userWithdrawalLimitDecreaserRoleDescription
    );
    const claimerRole = testUtils.deriveRole(adminRole, claimerRoleDescription);
    await accessControlRegistry.connect(roles.manager).initializeRoleAndGrantToSender(rootRole, adminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, withdrawalSignerRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, userWithdrawalLimitIncreaserRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, userWithdrawalLimitDecreaserRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, claimerRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(withdrawalSignerRole, roles.withdrawalSigner.address);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(userWithdrawalLimitIncreaserRole, roles.userWithdrawalLimitIncreaser.address);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(userWithdrawalLimitDecreaserRole, roles.userWithdrawalLimitDecreaser.address);
    await accessControlRegistry.connect(roles.manager).grantRole(claimerRole, roles.claimer.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(adminRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(withdrawalSignerRole, roles.manager.address);
    await accessControlRegistry
      .connect(roles.manager)
      .renounceRole(userWithdrawalLimitIncreaserRole, roles.manager.address);
    await accessControlRegistry
      .connect(roles.manager)
      .renounceRole(userWithdrawalLimitDecreaserRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(claimerRole, roles.manager.address);
    return {
      roles,
      accessControlRegistry,
      token,
      prepaymentDepository,
      adminRoleDescription,
      withdrawalSignerRole,
      userWithdrawalLimitIncreaserRole,
      userWithdrawalLimitDecreaserRole,
      claimerRole,
    };
  }

  describe('constructor', function () {
    context('Token contract address is not zero', function () {
      it('constructs', async function () {
        const {
          token,
          prepaymentDepository,
          withdrawalSignerRole,
          userWithdrawalLimitIncreaserRole,
          userWithdrawalLimitDecreaserRole,
          claimerRole,
        } = await helpers.loadFixture(deploy);
        expect(await prepaymentDepository.token()).to.equal(token.address);
        expect(await prepaymentDepository.withdrawalSignerRole()).to.equal(withdrawalSignerRole);
        expect(await prepaymentDepository.userWithdrawalLimitIncreaserRole()).to.equal(
          userWithdrawalLimitIncreaserRole
        );
        expect(await prepaymentDepository.userWithdrawalLimitDecreaserRole()).to.equal(
          userWithdrawalLimitDecreaserRole
        );
        expect(await prepaymentDepository.claimerRole()).to.equal(claimerRole);
      });
    });
    context('Token contract address is zero', function () {
      it('reverts', async function () {
        const { roles, accessControlRegistry, adminRoleDescription } = await helpers.loadFixture(deploy);
        const prepaymentRepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
        await expect(
          prepaymentRepositoryFactory.deploy(
            accessControlRegistry.address,
            adminRoleDescription,
            roles.manager.address,
            ethers.constants.AddressZero
          )
        ).to.be.revertedWith('Token address zero');
      });
    });
  });

  describe('setWithdrawalDestination', function () {
    context('User and withdrawal destination are not the same', function () {
      context('Sender is the user', function () {
        context('User withdrawal destination address is zero', function () {
          it('sets withdrawal destination', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            expect(await prepaymentDepository.userToWithdrawalDestination(roles.user.address)).to.equal(
              ethers.constants.AddressZero
            );
            await expect(
              prepaymentDepository
                .connect(roles.user)
                .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address)
            )
              .to.emit(prepaymentDepository, 'SetWithdrawalDestination')
              .withArgs(roles.user.address, roles.withdrawalDestination.address);
            expect(await prepaymentDepository.userToWithdrawalDestination(roles.user.address)).to.equal(
              roles.withdrawalDestination.address
            );
          });
        });
        context('User withdrawal destination address is not zero', function () {
          it('reverts', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            await prepaymentDepository
              .connect(roles.user)
              .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address);
            await expect(
              prepaymentDepository
                .connect(roles.user)
                .setWithdrawalDestination(roles.user.address, roles.randomPerson.address)
            ).to.be.revertedWith('Sender not destination');
          });
        });
      });
      context('Sender is not the user', function () {
        context('Sender is the user withdrawal destination', function () {
          it('sets withdrawal destination', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            await prepaymentDepository
              .connect(roles.user)
              .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address);
            expect(await prepaymentDepository.userToWithdrawalDestination(roles.user.address)).to.equal(
              roles.withdrawalDestination.address
            );
            await expect(
              prepaymentDepository
                .connect(roles.withdrawalDestination)
                .setWithdrawalDestination(roles.user.address, ethers.constants.AddressZero)
            )
              .to.emit(prepaymentDepository, 'SetWithdrawalDestination')
              .withArgs(roles.user.address, ethers.constants.AddressZero);
            expect(await prepaymentDepository.userToWithdrawalDestination(roles.user.address)).to.equal(
              ethers.constants.AddressZero
            );
          });
        });
        context('Sender is not the user withdrawal destination', function () {
          it('reverts', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            await prepaymentDepository
              .connect(roles.user)
              .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address);
            await expect(
              prepaymentDepository
                .connect(roles.user)
                .setWithdrawalDestination(roles.user.address, roles.randomPerson.address)
            ).to.be.revertedWith('Sender not destination');
          });
        });
      });
    });
    context('User and withdrawal destination are the same', function () {
      it('reverts', async function () {
        const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
        await expect(
          prepaymentDepository.setWithdrawalDestination(roles.user.address, roles.user.address)
        ).to.be.revertedWith('Same user and destination');
      });
    });
  });

  describe('increaseUserWithdrawalLimit', function () {
    context('User address is not zero', function () {
      context('Amount is not zero', function () {
        context('Sender is the manager', function () {
          it('increases user withdrawal limit', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
            const increaseAmount = initialLimit;
            const expectedLimit = initialLimit.add(increaseAmount);
            expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(initialLimit);
            expect(
              await prepaymentDepository
                .connect(roles.manager)
                .callStatic.increaseUserWithdrawalLimit(roles.user.address, increaseAmount)
            ).to.equal(expectedLimit);
            await expect(
              prepaymentDepository
                .connect(roles.manager)
                .increaseUserWithdrawalLimit(roles.user.address, increaseAmount)
            )
              .to.emit(prepaymentDepository, 'IncreasedUserWithdrawalLimit')
              .withArgs(roles.user.address, increaseAmount, expectedLimit, roles.manager.address);
            expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(expectedLimit);
          });
        });
        context('Sender is a user withdrawal limit increaser', function () {
          it('increases user withdrawal limit', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
            const increaseAmount = initialLimit;
            const expectedLimit = initialLimit.add(increaseAmount);
            expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(initialLimit);
            expect(
              await prepaymentDepository
                .connect(roles.userWithdrawalLimitIncreaser)
                .callStatic.increaseUserWithdrawalLimit(roles.user.address, increaseAmount)
            ).to.equal(expectedLimit);
            await expect(
              prepaymentDepository
                .connect(roles.userWithdrawalLimitIncreaser)
                .increaseUserWithdrawalLimit(roles.user.address, increaseAmount)
            )
              .to.emit(prepaymentDepository, 'IncreasedUserWithdrawalLimit')
              .withArgs(roles.user.address, increaseAmount, expectedLimit, roles.userWithdrawalLimitIncreaser.address);
            expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(expectedLimit);
          });
        });
        context('Sender is not the manager or a user withdrawal limit increaser', function () {
          it('reverts', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
            const increaseAmount = initialLimit;
            await expect(
              prepaymentDepository
                .connect(roles.randomPerson)
                .increaseUserWithdrawalLimit(roles.user.address, increaseAmount)
            ).to.be.revertedWith('Cannot increase withdrawal limit');
          });
        });
      });
      context('Amount is zero', function () {
        it('reverts', async function () {
          const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
          await expect(
            prepaymentDepository.connect(roles.manager).increaseUserWithdrawalLimit(roles.user.address, 0)
          ).to.be.revertedWith('Amount zero');
        });
      });
    });
    context('User address is zero', function () {
      it('reverts', async function () {
        const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
        const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        const increaseAmount = initialLimit;
        await expect(
          prepaymentDepository
            .connect(roles.manager)
            .increaseUserWithdrawalLimit(ethers.constants.AddressZero, increaseAmount)
        ).to.be.revertedWith('User address zero');
      });
    });
  });

  describe('decreaseUserWithdrawalLimit', function () {
    context('User address is not zero', function () {
      context('Amount is not zero', function () {
        context('Sender is the manager', function () {
          context('Amount does not exceed withdrawal limit', function () {
            it('decreases user withdrawal limit', async function () {
              const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
              const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
              const decreaseAmount = initialLimit.div(2);
              const expectedLimit = initialLimit.sub(decreaseAmount);
              expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(initialLimit);
              expect(
                await prepaymentDepository
                  .connect(roles.manager)
                  .callStatic.decreaseUserWithdrawalLimit(roles.user.address, decreaseAmount)
              ).to.equal(expectedLimit);
              await expect(
                prepaymentDepository
                  .connect(roles.manager)
                  .decreaseUserWithdrawalLimit(roles.user.address, decreaseAmount)
              )
                .to.emit(prepaymentDepository, 'DecreasedUserWithdrawalLimit')
                .withArgs(roles.user.address, decreaseAmount, expectedLimit, roles.manager.address);
              expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(expectedLimit);
            });
          });
          context('Amount exceeds withdrawal limit', function () {
            it('reverts', async function () {
              const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
              const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
              const decreaseAmount = initialLimit.mul(2);
              await expect(
                prepaymentDepository
                  .connect(roles.manager)
                  .decreaseUserWithdrawalLimit(roles.user.address, decreaseAmount)
              ).to.be.revertedWith('Amount exceeds limit');
            });
          });
        });
        context('Sender is a user withdrawal limit decreaser', function () {
          context('Amount does not exceed withdrawal limit', function () {
            it('decreases user withdrawal limit', async function () {
              const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
              const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
              const decreaseAmount = initialLimit.div(2);
              const expectedLimit = initialLimit.sub(decreaseAmount);
              expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(initialLimit);
              expect(
                await prepaymentDepository
                  .connect(roles.userWithdrawalLimitDecreaser)
                  .callStatic.decreaseUserWithdrawalLimit(roles.user.address, decreaseAmount)
              ).to.equal(expectedLimit);
              await expect(
                prepaymentDepository
                  .connect(roles.userWithdrawalLimitDecreaser)
                  .decreaseUserWithdrawalLimit(roles.user.address, decreaseAmount)
              )
                .to.emit(prepaymentDepository, 'DecreasedUserWithdrawalLimit')
                .withArgs(
                  roles.user.address,
                  decreaseAmount,
                  expectedLimit,
                  roles.userWithdrawalLimitDecreaser.address
                );
              expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(expectedLimit);
            });
          });
          context('Amount exceeds withdrawal limit', function () {
            it('reverts', async function () {
              const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
              const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
              const decreaseAmount = initialLimit.mul(2);
              await expect(
                prepaymentDepository
                  .connect(roles.userWithdrawalLimitDecreaser)
                  .decreaseUserWithdrawalLimit(roles.user.address, decreaseAmount)
              ).to.be.revertedWith('Amount exceeds limit');
            });
          });
        });
        context('Sender is not the manager or a user withdrawal limit decreaser', function () {
          it('reverts', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
            const decreaseAmount = initialLimit.div(2);
            await expect(
              prepaymentDepository
                .connect(roles.randomPerson)
                .decreaseUserWithdrawalLimit(roles.user.address, decreaseAmount)
            ).to.be.revertedWith('Cannot decrease withdrawal limit');
          });
        });
      });
      context('Amount is zero', function () {
        it('reverts', async function () {
          const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
          await expect(
            prepaymentDepository.connect(roles.manager).decreaseUserWithdrawalLimit(roles.user.address, 0)
          ).to.be.revertedWith('Amount zero');
        });
      });
    });
    context('User address is zero', function () {
      it('reverts', async function () {
        const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
        const decreaseAmount = 500;
        await expect(
          prepaymentDepository
            .connect(roles.manager)
            .decreaseUserWithdrawalLimit(ethers.constants.AddressZero, decreaseAmount)
        ).to.be.revertedWith('User address zero');
      });
    });
  });

  describe('claim', function () {
    context('Recipient address is not zero', function () {
      context('Amount is not zero', function () {
        context('Sender is the manager', function () {
          context('Transfer is successful', function () {
            it('claims', async function () {
              const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
              const maximumClaimAmount = await token.balanceOf(prepaymentDepository.address);
              const amount = maximumClaimAmount.div(2);
              expect(await token.balanceOf(roles.recipient.address)).to.equal(0);
              await expect(prepaymentDepository.connect(roles.manager).claim(roles.recipient.address, amount))
                .to.emit(prepaymentDepository, 'Claimed')
                .withArgs(roles.recipient.address, amount, roles.manager.address);
              expect(await token.balanceOf(roles.recipient.address)).to.equal(amount);
            });
          });
          context('Transfer is not successful', function () {
            it('reverts', async function () {
              const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
              const maximumClaimAmount = await token.balanceOf(prepaymentDepository.address);
              const amount = maximumClaimAmount.mul(2);
              await expect(
                prepaymentDepository.connect(roles.manager).claim(roles.recipient.address, amount)
              ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
            });
          });
        });
        context('Sender is a claimer', function () {
          context('Transfer is successful', function () {
            it('claims', async function () {
              const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
              const maximumClaimAmount = await token.balanceOf(prepaymentDepository.address);
              const amount = maximumClaimAmount.div(2);
              expect(await token.balanceOf(roles.recipient.address)).to.equal(0);
              await expect(prepaymentDepository.connect(roles.claimer).claim(roles.recipient.address, amount))
                .to.emit(prepaymentDepository, 'Claimed')
                .withArgs(roles.recipient.address, amount, roles.claimer.address);
              expect(await token.balanceOf(roles.recipient.address)).to.equal(amount);
            });
          });
          context('Transfer is not successful', function () {
            it('reverts', async function () {
              const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
              const maximumClaimAmount = await token.balanceOf(prepaymentDepository.address);
              const amount = maximumClaimAmount.mul(2);
              await expect(
                prepaymentDepository.connect(roles.claimer).claim(roles.recipient.address, amount)
              ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
            });
          });
        });
        context('Sender is not the manager or a claimer', function () {
          it('reverts', async function () {
            const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
            const maximumClaimAmount = await token.balanceOf(prepaymentDepository.address);
            const amount = maximumClaimAmount.div(2);
            await expect(
              prepaymentDepository.connect(roles.randomPerson).claim(roles.recipient.address, amount)
            ).to.be.revertedWith('Cannot claim');
          });
        });
      });
      context('Amount is zero', function () {
        it('reverts', async function () {
          const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
          await expect(
            prepaymentDepository.connect(roles.manager).claim(roles.recipient.address, 0)
          ).to.be.revertedWith('Amount zero');
        });
      });
    });
    context('Recipient address is zero', function () {
      it('reverts', async function () {
        const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
        const maximumClaimAmount = await token.balanceOf(prepaymentDepository.address);
        const amount = maximumClaimAmount.div(2);
        await expect(
          prepaymentDepository.connect(roles.manager).claim(ethers.constants.AddressZero, amount)
        ).to.be.revertedWith('Recipient address zero');
      });
    });
  });

  describe('deposit', function () {
    context('User address is not zero', function () {
      context('Amount is not zero', function () {
        context('Transfer is successful', function () {
          it('deposits', async function () {
            const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
            const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
            const depositAmount = initialLimit;
            const expectedLimit = initialLimit.add(depositAmount);
            const initialBalance = await token.balanceOf(prepaymentDepository.address);
            const expectedBalance = initialBalance.add(depositAmount);
            await token.connect(roles.randomPerson).approve(prepaymentDepository.address, depositAmount);
            expect(
              await prepaymentDepository
                .connect(roles.randomPerson)
                .callStatic.deposit(roles.user.address, depositAmount)
            ).to.equal(expectedLimit);
            await expect(prepaymentDepository.connect(roles.randomPerson).deposit(roles.user.address, depositAmount))
              .to.emit(prepaymentDepository, 'Deposited')
              .withArgs(roles.user.address, depositAmount, expectedLimit, roles.randomPerson.address);
            expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.be.equal(expectedLimit);
            expect(await token.balanceOf(prepaymentDepository.address)).to.be.equal(expectedBalance);
          });
        });
        context('Transfer is not successful', function () {
          it('reverts', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
            const depositAmount = initialLimit;
            await expect(
              prepaymentDepository.connect(roles.randomPerson).deposit(roles.user.address, depositAmount)
            ).to.be.revertedWith('ERC20: insufficient allowance');
          });
        });
      });
      context('Amount is zero', function () {
        it('reverts', async function () {
          const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
          await expect(
            prepaymentDepository.connect(roles.randomPerson).deposit(roles.user.address, 0)
          ).to.be.revertedWith('Amount zero');
        });
      });
    });
    context('User address is zero', function () {
      it('reverts', async function () {
        const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
        const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        const depositAmount = initialLimit;
        await expect(
          prepaymentDepository.connect(roles.randomPerson).deposit(ethers.constants.AddressZero, depositAmount)
        ).to.be.revertedWith('User address zero');
      });
    });
  });

  describe('applyPermitAndDeposit', function () {
    context('Permit is valid', function () {
      it('applies permit and deposits', async function () {
        const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
        const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        const depositAmount = initialLimit;
        const expectedLimit = initialLimit.add(depositAmount);
        const initialBalance = await token.balanceOf(prepaymentDepository.address);
        const expectedBalance = initialBalance.add(depositAmount);
        const deadline = ethers.constants.MaxUint256;
        const { v, r, s } = await signErc2612Permit(
          token,
          roles.randomPerson,
          prepaymentDepository.address,
          depositAmount,
          deadline
        );
        expect(
          await prepaymentDepository
            .connect(roles.randomPerson)
            .callStatic.applyPermitAndDeposit(roles.user.address, depositAmount, deadline, v, r, s)
        ).to.equal(expectedLimit);
        await expect(
          prepaymentDepository
            .connect(roles.randomPerson)
            .applyPermitAndDeposit(roles.user.address, depositAmount, deadline, v, r, s)
        )
          .to.emit(prepaymentDepository, 'Deposited')
          .withArgs(roles.user.address, depositAmount, expectedLimit, roles.randomPerson.address);
        expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.be.equal(expectedLimit);
        expect(await token.balanceOf(prepaymentDepository.address)).to.be.equal(expectedBalance);
      });
    });
    context('Permit is not valid', function () {
      it('reverts', async function () {
        const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
        const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        const depositAmount = initialLimit;
        const deadline = (await helpers.time.latest()) - 1;
        const { v, r, s } = await signErc2612Permit(
          token,
          roles.randomPerson,
          prepaymentDepository.address,
          depositAmount,
          deadline
        );
        await expect(
          prepaymentDepository
            .connect(roles.randomPerson)
            .applyPermitAndDeposit(roles.user.address, depositAmount, deadline, v, r, s)
        ).to.be.revertedWith('ERC20Permit: expired deadline');
      });
    });
  });

  describe('withdraw', function () {
    context('Amount is not zero', function () {
      context('It is before expiration timestamp', function () {
        context('Withdrawal with hash has not been executed', function () {
          context('Signature is reported to belong to the manager', function () {
            context('Signature is valid', function () {
              context('Amount does not exceed withdrawal limit', function () {
                context('User has not set a withdrawal destination', function () {
                  context('Transfer is successful', function () {
                    it('withdraws', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expectedLimit = initialLimit.sub(withdrawalAmount);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      const expectedBalance = initialBalance.sub(withdrawalAmount);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { withdrawalHash, signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.manager,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      const {
                        withdrawalDestination: returnedWithdrawalDestination,
                        withdrawalLimit: returnedWithdrawalLimit,
                      } = await prepaymentDepository
                        .connect(roles.user)
                        .callStatic.withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature);
                      expect(returnedWithdrawalDestination).to.equal(roles.user.address);
                      expect(returnedWithdrawalLimit).to.equal(expectedLimit);
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
                      )
                        .to.emit(prepaymentDepository, 'Withdrew')
                        .withArgs(
                          roles.user.address,
                          withdrawalHash,
                          withdrawalAmount,
                          expirationTimestamp,
                          roles.manager.address,
                          roles.user.address,
                          expectedLimit
                        );
                      expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.be.equal(
                        expectedLimit
                      );
                      expect(await token.balanceOf(prepaymentDepository.address)).to.be.equal(expectedBalance);
                    });
                  });
                  context('Transfer is not successful', function () {
                    it('reverts', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      await prepaymentDepository.connect(roles.manager).claim(roles.manager.address, initialBalance);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.manager,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
                      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });
                  });
                });
                context('User has set a withdrawal destination', function () {
                  context('Transfer is successful', function () {
                    it('withdraws', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      await prepaymentDepository
                        .connect(roles.user)
                        .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expectedLimit = initialLimit.sub(withdrawalAmount);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      const expectedBalance = initialBalance.sub(withdrawalAmount);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { withdrawalHash, signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.manager,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      const {
                        withdrawalDestination: returnedWithdrawalDestination,
                        withdrawalLimit: returnedWithdrawalLimit,
                      } = await prepaymentDepository
                        .connect(roles.user)
                        .callStatic.withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature);
                      expect(returnedWithdrawalDestination).to.equal(roles.withdrawalDestination.address);
                      expect(returnedWithdrawalLimit).to.equal(expectedLimit);
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
                      )
                        .to.emit(prepaymentDepository, 'Withdrew')
                        .withArgs(
                          roles.user.address,
                          withdrawalHash,
                          withdrawalAmount,
                          expirationTimestamp,
                          roles.manager.address,
                          roles.withdrawalDestination.address,
                          expectedLimit
                        );
                      expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.be.equal(
                        expectedLimit
                      );
                      expect(await token.balanceOf(prepaymentDepository.address)).to.be.equal(expectedBalance);
                    });
                  });
                  context('Transfer is not successful', function () {
                    it('reverts', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      await prepaymentDepository
                        .connect(roles.user)
                        .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      await prepaymentDepository.connect(roles.manager).claim(roles.manager.address, initialBalance);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.manager,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
                      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });
                  });
                });
              });
              context('Amount exceeds withdrawal limit', function () {
                it('reverts', async function () {
                  const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
                  const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                  const withdrawalAmount = initialLimit.mul(2);
                  const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                  const { signature } = await signWithdrawal(
                    prepaymentDepository,
                    roles.manager,
                    roles.user.address,
                    withdrawalAmount,
                    expirationTimestamp
                  );
                  await expect(
                    prepaymentDepository
                      .connect(roles.user)
                      .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
                  ).to.be.revertedWith('Amount exceeds limit');
                });
              });
            });
            context('Signature is not valid', function () {
              it('reverts', async function () {
                const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
                const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                const withdrawalAmount = initialLimit.mul(2);
                const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                await expect(
                  prepaymentDepository
                    .connect(roles.user)
                    .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, '0x123456')
                ).to.be.revertedWith('ECDSA: invalid signature length');
              });
            });
          });
          context('Signature is reported to belong to a withdrawal signer', function () {
            context('Signature is valid', function () {
              context('Amount does not exceed withdrawal limit', function () {
                context('User has not set a withdrawal destination', function () {
                  context('Transfer is successful', function () {
                    it('withdraws', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expectedLimit = initialLimit.sub(withdrawalAmount);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      const expectedBalance = initialBalance.sub(withdrawalAmount);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { withdrawalHash, signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.withdrawalSigner,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      const {
                        withdrawalDestination: returnedWithdrawalDestination,
                        withdrawalLimit: returnedWithdrawalLimit,
                      } = await prepaymentDepository
                        .connect(roles.user)
                        .callStatic.withdraw(
                          withdrawalAmount,
                          expirationTimestamp,
                          roles.withdrawalSigner.address,
                          signature
                        );
                      expect(returnedWithdrawalDestination).to.equal(roles.user.address);
                      expect(returnedWithdrawalLimit).to.equal(expectedLimit);
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.withdrawalSigner.address, signature)
                      )
                        .to.emit(prepaymentDepository, 'Withdrew')
                        .withArgs(
                          roles.user.address,
                          withdrawalHash,
                          withdrawalAmount,
                          expirationTimestamp,
                          roles.withdrawalSigner.address,
                          roles.user.address,
                          expectedLimit
                        );
                      expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.be.equal(
                        expectedLimit
                      );
                      expect(await token.balanceOf(prepaymentDepository.address)).to.be.equal(expectedBalance);
                    });
                  });
                  context('Transfer is not successful', function () {
                    it('reverts', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      await prepaymentDepository.connect(roles.manager).claim(roles.manager.address, initialBalance);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.withdrawalSigner,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.withdrawalSigner.address, signature)
                      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });
                  });
                });
                context('User has set a withdrawal destination', function () {
                  context('Transfer is successful', function () {
                    it('withdraws', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      await prepaymentDepository
                        .connect(roles.user)
                        .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expectedLimit = initialLimit.sub(withdrawalAmount);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      const expectedBalance = initialBalance.sub(withdrawalAmount);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { withdrawalHash, signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.withdrawalSigner,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      const {
                        withdrawalDestination: returnedWithdrawalDestination,
                        withdrawalLimit: returnedWithdrawalLimit,
                      } = await prepaymentDepository
                        .connect(roles.user)
                        .callStatic.withdraw(
                          withdrawalAmount,
                          expirationTimestamp,
                          roles.withdrawalSigner.address,
                          signature
                        );
                      expect(returnedWithdrawalDestination).to.equal(roles.withdrawalDestination.address);
                      expect(returnedWithdrawalLimit).to.equal(expectedLimit);
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.withdrawalSigner.address, signature)
                      )
                        .to.emit(prepaymentDepository, 'Withdrew')
                        .withArgs(
                          roles.user.address,
                          withdrawalHash,
                          withdrawalAmount,
                          expirationTimestamp,
                          roles.withdrawalSigner.address,
                          roles.withdrawalDestination.address,
                          expectedLimit
                        );
                      expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.be.equal(
                        expectedLimit
                      );
                      expect(await token.balanceOf(prepaymentDepository.address)).to.be.equal(expectedBalance);
                    });
                  });
                  context('Transfer is not successful', function () {
                    it('reverts', async function () {
                      const { roles, token, prepaymentDepository } = await helpers.loadFixture(deploy);
                      await prepaymentDepository
                        .connect(roles.user)
                        .setWithdrawalDestination(roles.user.address, roles.withdrawalDestination.address);
                      const initialBalance = await token.balanceOf(prepaymentDepository.address);
                      await prepaymentDepository.connect(roles.manager).claim(roles.manager.address, initialBalance);
                      const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                      const withdrawalAmount = initialLimit.div(2);
                      const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                      const { signature } = await signWithdrawal(
                        prepaymentDepository,
                        roles.withdrawalSigner,
                        roles.user.address,
                        withdrawalAmount,
                        expirationTimestamp
                      );
                      await expect(
                        prepaymentDepository
                          .connect(roles.user)
                          .withdraw(withdrawalAmount, expirationTimestamp, roles.withdrawalSigner.address, signature)
                      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });
                  });
                });
              });
              context('Amount exceeds withdrawal limit', function () {
                it('reverts', async function () {
                  const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
                  const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                  const withdrawalAmount = initialLimit.mul(2);
                  const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                  const { signature } = await signWithdrawal(
                    prepaymentDepository,
                    roles.withdrawalSigner,
                    roles.user.address,
                    withdrawalAmount,
                    expirationTimestamp
                  );
                  await expect(
                    prepaymentDepository
                      .connect(roles.user)
                      .withdraw(withdrawalAmount, expirationTimestamp, roles.withdrawalSigner.address, signature)
                  ).to.be.revertedWith('Amount exceeds limit');
                });
              });
            });
            context('Signature is not valid', function () {
              it('reverts', async function () {
                const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
                const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
                const withdrawalAmount = initialLimit.mul(2);
                const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
                await expect(
                  prepaymentDepository
                    .connect(roles.user)
                    .withdraw(withdrawalAmount, expirationTimestamp, roles.withdrawalSigner.address, '0x123456')
                ).to.be.revertedWith('ECDSA: invalid signature length');
              });
            });
          });
          context('Signature is not reported to belong to the manager or a withdrawal signer', function () {
            it('reverts', async function () {
              const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
              const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
              const withdrawalAmount = initialLimit.div(2);
              const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
              const { signature } = await signWithdrawal(
                prepaymentDepository,
                roles.randomPerson,
                roles.user.address,
                withdrawalAmount,
                expirationTimestamp
              );
              await expect(
                prepaymentDepository
                  .connect(roles.user)
                  .withdraw(withdrawalAmount, expirationTimestamp, roles.randomPerson.address, signature)
              ).to.be.revertedWith('Cannot sign withdrawal');
            });
          });
        });
        context('Withdrawal with hash has been executed', function () {
          it('reverts', async function () {
            const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
            const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
            const withdrawalAmount = initialLimit.div(2);
            const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
            const { signature } = await signWithdrawal(
              prepaymentDepository,
              roles.manager,
              roles.user.address,
              withdrawalAmount,
              expirationTimestamp
            );
            await prepaymentDepository
              .connect(roles.user)
              .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature);
            await expect(
              prepaymentDepository
                .connect(roles.user)
                .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
            ).to.be.revertedWith('Withdrawal already executed');
          });
        });
      });
      context('It is not before expiration timestamp', function () {
        it('reverts', async function () {
          const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
          const initialLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
          const withdrawalAmount = initialLimit.div(2);
          const expirationTimestamp = (await helpers.time.latest()) - 1;
          const { signature } = await signWithdrawal(
            prepaymentDepository,
            roles.manager,
            roles.user.address,
            withdrawalAmount,
            expirationTimestamp
          );
          await expect(
            prepaymentDepository
              .connect(roles.user)
              .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
          ).to.be.revertedWith('Signature expired');
        });
      });
    });
    context('Amount is zero', function () {
      it('reverts', async function () {
        const { roles, prepaymentDepository } = await helpers.loadFixture(deploy);
        const withdrawalAmount = 0;
        const expirationTimestamp = (await helpers.time.latest()) + 60 * 60;
        const { signature } = await signWithdrawal(
          prepaymentDepository,
          roles.manager,
          roles.user.address,
          withdrawalAmount,
          expirationTimestamp
        );
        await expect(
          prepaymentDepository
            .connect(roles.user)
            .withdraw(withdrawalAmount, expirationTimestamp, roles.manager.address, signature)
        ).to.be.revertedWith('Amount zero');
      });
    });
  });
});
