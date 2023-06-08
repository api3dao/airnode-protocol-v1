const { ethers } = require('hardhat');
const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('Funder', function () {
  async function deriveFunderDepositoryAddress(funderAddress, owner, root) {
    const FunderDepositoryArtifact = await hre.artifacts.readArtifact('FunderDepository');
    const initcode = ethers.utils.solidityPack(
      ['bytes', 'bytes'],
      [FunderDepositoryArtifact.bytecode, ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [owner, root])]
    );
    return ethers.utils.getCreate2Address(funderAddress, ethers.constants.HashZero, ethers.utils.keccak256(initcode));
  }

  async function deployFunder() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      owner: accounts[1],
      recipient1: accounts[2],
      recipient2: accounts[3],
      recipient3: accounts[4],
      randomPerson: accounts[9],
    };

    const Funder = await ethers.getContractFactory('Funder', roles.deployer);
    const funder = await Funder.deploy();

    const treeValues = await Promise.all(
      [roles.recipient1.address, roles.recipient2.address, roles.recipient3.address].map(async (recipientAddress) => {
        const recipientBalance = await ethers.provider.getBalance(recipientAddress);
        const lowThreshold = recipientBalance.add(
          ethers.utils.parseEther((Math.floor(Math.random() * 10) + 1).toString())
        );
        const highThreshold = lowThreshold.add(
          ethers.utils.parseEther((Math.floor(Math.random() * 10) + 1).toString())
        );
        return [recipientAddress, lowThreshold, highThreshold];
      })
    );
    const tree = StandardMerkleTree.of(treeValues, ['address', 'uint256', 'uint256']);

    return {
      roles,
      funder,
      tree,
    };
  }

  async function deployFunderAndFunderDepository() {
    const { roles, funder, tree } = await deployFunder();
    const funderDepositoryAddress = await deriveFunderDepositoryAddress(funder.address, roles.owner.address, tree.root);
    await funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root);
    const funderDepository = await ethers.getContractAt('FunderDepository', funderDepositoryAddress);
    await roles.randomPerson.sendTransaction({ to: funderDepository.address, value: ethers.utils.parseEther('100') });
    return {
      roles,
      funder,
      tree,
      funderDepository,
    };
  }

  describe('deployFunderDepository', function () {
    context('Root is not zero', function () {
      context('FunderDepository has not been deployed before', function () {
        it('deploys FunderDepository', async function () {
          const { roles, funder, tree } = await helpers.loadFixture(deployFunder);
          const funderDepositoryAddress = await deriveFunderDepositoryAddress(
            funder.address,
            roles.owner.address,
            tree.root
          );
          await expect(funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root))
            .to.emit(funder, 'DeployedFunderDepository')
            .withArgs(funderDepositoryAddress, roles.owner.address, tree.root);
          expect(await funder.ownerToRootToFunderDepositoryAddress(roles.owner.address, tree.root)).to.equal(
            funderDepositoryAddress
          );
          const funderDepository = await ethers.getContractAt('FunderDepository', funderDepositoryAddress);
          expect(await funderDepository.funder()).to.equal(funder.address);
          expect(await funderDepository.owner()).to.equal(roles.owner.address);
          expect(await funderDepository.root()).to.equal(tree.root);
        });
      });
      context('FunderDepository has been deployed before', function () {
        it('reverts', async function () {
          const { roles, funder, tree } = await helpers.loadFixture(deployFunder);
          await funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root);
          await expect(
            funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root)
          ).to.be.revertedWithoutReason;
        });
      });
    });
    context('Root is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deployFunder);
        await expect(
          funder.connect(roles.owner).deployFunderDepository(roles.owner.address, ethers.constants.HashZero)
        ).to.be.revertedWith('Root zero');
      });
    });
  });

  describe('fund', function () {
    context('Recipient address is not zero', function () {
      context('Low threshold is not higher than high', function () {
        context('High threshold is not zero', function () {
          context('Proof is valid', function () {
            context('Balance is low enough', function () {
              context('Amount is not zero', function () {
                context('Respective FunderDepository is deployed', function () {
                  context('Transfer is successful', function () {
                    it('funds', async function () {
                      const { roles, funder, tree, funderDepository } = await helpers.loadFixture(
                        deployFunderAndFunderDepository
                      );
                      await Promise.all(
                        tree.values.map(async (treeValue, treeValueIndex) => {
                          const recipientBalance = await ethers.provider.getBalance(treeValue.value[0]);
                          const amountNeededToTopUp = ethers.BigNumber.from(treeValue.value[2]).sub(recipientBalance);
                          // Note that we use `tree.getProof(treeValueIndex)` and not `tree.getProof(treeValue.treeIndex)`
                          await expect(
                            funder
                              .connect(roles.randomPerson)
                              .fund(
                                roles.owner.address,
                                tree.root,
                                tree.getProof(treeValueIndex),
                                treeValue.value[0],
                                treeValue.value[1],
                                treeValue.value[2]
                              )
                          )
                            .to.emit(funder, 'Funded')
                            .withArgs(funderDepository.address, treeValue.value[0], amountNeededToTopUp);
                          expect(await ethers.provider.getBalance(treeValue.value[0])).to.equal(
                            recipientBalance.add(amountNeededToTopUp)
                          );
                        })
                      );
                    });
                  });
                  context('Transfer is not successful', function () {
                    it('reverts', async function () {
                      const { roles, funder } = await helpers.loadFixture(deployFunder);
                      const tree = StandardMerkleTree.of([[funder.address, 1, 2]], ['address', 'uint256', 'uint256']);
                      const treeValueIndex = 0;
                      const treeValue = tree.values[treeValueIndex];
                      await funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root);
                      const funderDepositoryAddress = await deriveFunderDepositoryAddress(
                        funder.address,
                        roles.owner.address,
                        tree.root
                      );
                      await roles.randomPerson.sendTransaction({
                        to: funderDepositoryAddress,
                        value: ethers.utils.parseEther('100'),
                      });
                      await expect(
                        funder
                          .connect(roles.randomPerson)
                          .fund(
                            roles.owner.address,
                            tree.root,
                            tree.getProof(treeValueIndex),
                            treeValue.value[0],
                            treeValue.value[1],
                            treeValue.value[2]
                          )
                      ).to.be.revertedWith('Transfer unsuccessful');
                    });
                  });
                });
                context('Respective FunderDepository is not deployed', function () {
                  it('reverts', async function () {
                    const { roles, funder, tree } = await helpers.loadFixture(deployFunder);
                    const treeValueIndex = 0;
                    const treeValue = tree.values[treeValueIndex];
                    const funderDepositoryAddress = await deriveFunderDepositoryAddress(
                      funder.address,
                      roles.owner.address,
                      tree.root
                    );
                    await roles.randomPerson.sendTransaction({
                      to: funderDepositoryAddress,
                      value: ethers.utils.parseEther('100'),
                    });
                    await expect(
                      funder
                        .connect(roles.randomPerson)
                        .fund(
                          roles.owner.address,
                          tree.root,
                          tree.getProof(treeValueIndex),
                          treeValue.value[0],
                          treeValue.value[1],
                          treeValue.value[2]
                        )
                    ).to.be.revertedWith('No such FunderDepository');
                  });
                });
              });
              context('Amount is zero', function () {
                it('reverts', async function () {
                  const { roles, funder, tree } = await helpers.loadFixture(deployFunder);
                  const treeValueIndex = 0;
                  const treeValue = tree.values[treeValueIndex];
                  await funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root);
                  await expect(
                    funder
                      .connect(roles.randomPerson)
                      .fund(
                        roles.owner.address,
                        tree.root,
                        tree.getProof(treeValueIndex),
                        treeValue.value[0],
                        treeValue.value[1],
                        treeValue.value[2]
                      )
                  ).to.be.revertedWith('Amount zero');
                });
              });
            });
            context('Balance is not low enough', function () {
              it('reverts', async function () {
                const { roles, funder, tree } = await helpers.loadFixture(deployFunderAndFunderDepository);
                const treeValueIndex = 0;
                const treeValue = tree.values[treeValueIndex];
                const recipientBalance = await ethers.provider.getBalance(treeValue.value[0]);
                const amountNeededToExceedLowThreshold = ethers.BigNumber.from(treeValue.value[1])
                  .sub(recipientBalance)
                  .add(1);
                await roles.randomPerson.sendTransaction({
                  to: treeValue.value[0],
                  value: amountNeededToExceedLowThreshold,
                });
                await expect(
                  funder
                    .connect(roles.randomPerson)
                    .fund(
                      roles.owner.address,
                      tree.root,
                      tree.getProof(treeValueIndex),
                      treeValue.value[0],
                      treeValue.value[1],
                      treeValue.value[2]
                    )
                ).to.be.revertedWith('Balance not low enough');
              });
            });
          });
          context('Proof is not valid', function () {
            it('reverts', async function () {
              const { roles, funder, tree } = await helpers.loadFixture(deployFunderAndFunderDepository);
              const treeValueIndex = 0;
              const treeValue = tree.values[treeValueIndex];
              await expect(
                funder
                  .connect(roles.randomPerson)
                  .fund(
                    roles.owner.address,
                    tree.root,
                    [testUtils.generateRandomBytes32()],
                    treeValue.value[0],
                    treeValue.value[1],
                    treeValue.value[2]
                  )
              ).to.be.revertedWith('Invalid proof');
            });
          });
        });
        context('High threshold is zero', function () {
          it('reverts', async function () {
            const { roles, funder } = await helpers.loadFixture(deployFunder);
            const tree = StandardMerkleTree.of([[roles.recipient1.address, 0, 0]], ['address', 'uint256', 'uint256']);
            const treeValueIndex = 0;
            const treeValue = tree.values[treeValueIndex];
            await funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root);
            await expect(
              funder
                .connect(roles.randomPerson)
                .fund(
                  roles.owner.address,
                  tree.root,
                  tree.getProof(treeValueIndex),
                  treeValue.value[0],
                  treeValue.value[1],
                  treeValue.value[2]
                )
            ).to.be.revertedWith('High threshold zero');
          });
        });
      });
      context('Low threshold is higher than high', function () {
        it('reverts', async function () {
          const { roles, funder } = await helpers.loadFixture(deployFunder);
          const tree = StandardMerkleTree.of([[roles.recipient1.address, 2, 1]], ['address', 'uint256', 'uint256']);
          const treeValueIndex = 0;
          const treeValue = tree.values[treeValueIndex];
          await funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root);
          await expect(
            funder
              .connect(roles.randomPerson)
              .fund(
                roles.owner.address,
                tree.root,
                tree.getProof(treeValueIndex),
                treeValue.value[0],
                treeValue.value[1],
                treeValue.value[2]
              )
          ).to.be.revertedWith('Low threshold higher than high');
        });
      });
    });
    context('Recipient address is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deployFunder);
        const tree = StandardMerkleTree.of([[ethers.constants.AddressZero, 1, 2]], ['address', 'uint256', 'uint256']);
        const treeValueIndex = 0;
        const treeValue = tree.values[treeValueIndex];
        await funder.connect(roles.randomPerson).deployFunderDepository(roles.owner.address, tree.root);
        await expect(
          funder
            .connect(roles.randomPerson)
            .fund(
              roles.owner.address,
              tree.root,
              tree.getProof(treeValueIndex),
              treeValue.value[0],
              treeValue.value[1],
              treeValue.value[2]
            )
        ).to.be.revertedWith('Recipient address zero');
      });
    });
  });

  describe('withdraw', function () {
    context('Recipient address is not zero', function () {
      context('Amount is not zero', function () {
        context('FunderDepository is deployed', function () {
          context('Balance is sufficient', function () {
            it('withdraws', async function () {
              const { roles, funder, tree, funderDepository } = await helpers.loadFixture(
                deployFunderAndFunderDepository
              );
              const amount = ethers.utils.parseEther('1');
              const recipientBalance = await ethers.provider.getBalance(roles.randomPerson.address);
              await expect(funder.connect(roles.owner).withdraw(tree.root, roles.randomPerson.address, amount))
                .to.emit(funder, 'Withdrew')
                .withArgs(funderDepository.address, roles.randomPerson.address, amount);
              expect(await ethers.provider.getBalance(roles.randomPerson.address)).to.equal(
                recipientBalance.add(amount)
              );
            });
          });
          context('Balance is insufficient', function () {
            it('reverts', async function () {
              const { roles, funder, tree, funderDepository } = await helpers.loadFixture(
                deployFunderAndFunderDepository
              );
              const amount = (await ethers.provider.getBalance(funderDepository.address)).add(1);
              await expect(
                funder.connect(roles.owner).withdraw(tree.root, roles.randomPerson.address, amount)
              ).to.be.revertedWith('Insufficient balance');
            });
          });
        });
        context('FunderDepository is not deployed', function () {
          it('reverts', async function () {
            const { roles, funder, tree } = await helpers.loadFixture(deployFunder);
            const amount = ethers.utils.parseEther('1');
            await expect(
              funder.connect(roles.owner).withdraw(tree.root, roles.randomPerson.address, amount)
            ).to.be.revertedWith('No such FunderDepository');
          });
        });
      });
      context('Amount is zero', function () {
        it('reverts', async function () {
          const { roles, funder, tree } = await helpers.loadFixture(deployFunderAndFunderDepository);
          await expect(
            funder.connect(roles.owner).withdraw(tree.root, roles.randomPerson.address, 0)
          ).to.be.revertedWith('Amount zero');
        });
      });
    });
    context('Recipient address is zero', function () {
      it('reverts', async function () {
        const { roles, funder, tree } = await helpers.loadFixture(deployFunderAndFunderDepository);
        const amount = ethers.utils.parseEther('1');
        await expect(
          funder.connect(roles.owner).withdraw(tree.root, ethers.constants.AddressZero, amount)
        ).to.be.revertedWith('Recipient address zero');
      });
    });
  });

  describe('withdrawAll', function () {
    context('Function gets called', function () {
      context('Sender is funder', function () {
        context('Transfer successful', function () {
          it('withdraws', async function () {
            const { roles, funder } = await helpers.loadFixture(deployFunder);
            const recipientBalance = await ethers.provider.getBalance(roles.recipient1.address);
            const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
            const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
            const values = [[roles.recipient1.address, lowThreshold, highThreshold]];
            const amount = ethers.utils.parseEther('1');

            const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

            const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
            const receipt = await tx.wait();
            const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
            const funderDepository = event.args.funderDepository;

            await roles.owner.sendTransaction({ to: funderDepository, value: amount });

            const funderDepositoryBalance = await ethers.provider.getBalance(funderDepository);

            await expect(funder.connect(roles.owner).withdrawAll(tree.root, roles.recipient1.address))
              .to.emit(funder, 'Withdrew')
              .withArgs(funderDepository, roles.recipient1.address, amount);

            const expectedRecipientBalance = recipientBalance.add(ethers.BigNumber.from(amount));
            const expectedFunderDepositoryBalance = funderDepositoryBalance.sub(ethers.BigNumber.from(amount));

            expect(await ethers.provider.getBalance(roles.recipient1.address)).to.equal(expectedRecipientBalance);
            expect(await ethers.provider.getBalance(funderDepository)).to.equal(expectedFunderDepositoryBalance);
          });
        });
        context('Transfer unsuccessful', function () {
          it('reverts', async function () {
            const { roles, funder } = await helpers.loadFixture(deployFunder);
            const recipientBalance = await ethers.provider.getBalance(roles.recipient1.address);
            const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
            const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
            const values = [[roles.recipient1.address, lowThreshold, highThreshold]];
            const amount = ethers.utils.parseEther('1');

            const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

            const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
            const receipt = await tx.wait();
            const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
            const funderDepository = event.args.funderDepository;

            await roles.owner.sendTransaction({ to: funderDepository, value: amount });

            await expect(funder.connect(roles.owner).withdrawAll(tree.root, funder.address)).to.be.revertedWith(
              'Transfer unsuccessful'
            );
          });
        });
      });
      context('Sender is not the funder', function () {
        it('reverts', async function () {
          const { roles, funder } = await helpers.loadFixture(deployFunder);
          const recipientBalance = await ethers.provider.getBalance(roles.recipient1.address);
          const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
          const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
          const values = [[roles.recipient1.address, lowThreshold, highThreshold]];
          const amount = ethers.utils.parseEther('1');

          const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

          const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
          const receipt = await tx.wait();
          const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
          const funderDepository = event.args.funderDepository;
          const funderDepositoryContract = await ethers.getContractAt('FunderDepository', funderDepository);

          await roles.owner.sendTransaction({ to: funderDepository, value: amount });

          await expect(
            funderDepositoryContract.connect(roles.owner).withdraw(roles.recipient1.address, amount)
          ).to.be.revertedWith('Sender not Funder');
        });
      });
    });
  });

  describe('computeFunderDepositoryAddress', function () {
    context('Root is not zero', function () {
      it('computes', async function () {
        const { roles, funder } = await helpers.loadFixture(deployFunder);
        const recipientBalance = await ethers.provider.getBalance(roles.recipient1.address);
        const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
        const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
        const values = [[roles.recipient1.address, lowThreshold, highThreshold]];

        const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

        const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
        const receipt = await tx.wait();
        const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
        const funderDepository = event.args.funderDepository;

        const computedFunderDepositoryAddress = await funder
          .connect(roles.owner)
          .computeFunderDepositoryAddress(roles.owner.address, tree.root);

        expect(computedFunderDepositoryAddress).to.equal(funderDepository);
      });
    });
    context('Root is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deployFunder);

        await expect(
          funder.connect(roles.owner).computeFunderDepositoryAddress(roles.owner.address, ethers.constants.HashZero)
        ).to.be.revertedWith('Root zero');
      });
    });
  });
});
