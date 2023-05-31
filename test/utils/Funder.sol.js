const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');

describe('Funder', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      owner: accounts[1],
      recipient: accounts[2],
      random: accounts[3],
    };

    const Funder = await ethers.getContractFactory('Funder', roles.deployer);
    const funder = await Funder.deploy();

    return {
      roles,
      funder,
    };
  }

  describe('deployFunderDepository', function () {
    context('Root is not zero', function () {
      it('deploys the contract', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        const randomBytes = testUtils.generateRandomBytes32();

        const FunderDepositoryArtifact = await hre.artifacts.readArtifact('FunderDepository');
        const FunderDepositoryBytecode = FunderDepositoryArtifact.bytecode;
        const encodedArgs = ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes32'],
          [roles.owner.address, randomBytes]
        );
        const initCode = FunderDepositoryBytecode + encodedArgs.slice(2);
        const initCodeHash = ethers.utils.keccak256(initCode);
        const salt = ethers.utils.hexZeroPad('0x0', 32);

        const funderDepository = ethers.utils.getCreate2Address(funder.address, salt, initCodeHash);

        await expect(funder.connect(roles.owner).deployFunderDepository(roles.owner.address, randomBytes))
          .to.emit(funder, 'DeployedFunderDepository')
          .withArgs(funderDepository, roles.owner.address, randomBytes);

        const funderDepositoryContract = await ethers.getContractAt('FunderDepository', funderDepository);

        expect(await funderDepositoryContract.funder()).to.equal(funder.address);
        expect(await funderDepositoryContract.owner()).to.equal(roles.owner.address);
        expect(await funderDepositoryContract.root()).to.equal(randomBytes);
      });
    });
    context('Root is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        const randomAddress = testUtils.generateRandomAddress();
        await expect(
          funder.connect(roles.owner).deployFunderDepository(randomAddress, ethers.constants.HashZero)
        ).to.be.revertedWith('Root zero');
      });
    });
  });

  describe('fund', function () {
    context('Recipient address is not zero', function () {
      context('High threshold is higher than low', function () {
        context('High threshold is not zero', function () {
          context('Proof is valid', function () {
            context('Balance is low enough', function () {
              context('Amount is not zero', function () {
                it('funds', async function () {
                  const { roles, funder } = await helpers.loadFixture(deploy);
                  const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
                  const lowThreshold = recipientBalance + 300;
                  const highThreshold = recipientBalance + 600;
                  const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];

                  const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
                  const proof = tree.getProof(0);

                  const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
                  const receipt = await tx.wait();
                  const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
                  const funderDepository = event.args.funderDepository;

                  await roles.owner.sendTransaction({ to: funderDepository, value: ethers.utils.parseEther('1') });

                  const funderDepositoryBalance = await ethers.provider.getBalance(funderDepository);
                  const amountNeededToTopUp = ethers.BigNumber.from(highThreshold).sub(recipientBalance);
                  const amount = amountNeededToTopUp.lte(funderDepositoryBalance)
                    ? amountNeededToTopUp
                    : funderDepositoryBalance;

                  await expect(
                    funder
                      .connect(roles.owner)
                      .fund(roles.owner.address, tree.root, proof, roles.recipient.address, lowThreshold, highThreshold)
                  )
                    .to.emit(funder, 'Funded')
                    .withArgs(funderDepository, roles.recipient.address, amount);

                  const expectedBalance = recipientBalance.add(ethers.BigNumber.from(amount.toString()));

                  expect(await ethers.provider.getBalance(roles.recipient.address)).to.equal(expectedBalance);
                });
              });
              context('Amount is zero', function () {
                it('reverts', async function () {
                  const { roles, funder } = await helpers.loadFixture(deploy);
                  const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
                  const lowThreshold = recipientBalance + 300;
                  const highThreshold = recipientBalance + 600;
                  const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];

                  const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
                  const proof = tree.getProof(0);

                  await expect(
                    funder
                      .connect(roles.owner)
                      .fund(roles.owner.address, tree.root, proof, roles.recipient.address, lowThreshold, highThreshold)
                  ).to.be.revertedWith('Amount zero');
                });
              });
            });
            context('Balance is not low enough', function () {
              it('reverts', async function () {
                const { roles, funder } = await helpers.loadFixture(deploy);
                const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
                const lowThreshold = 300;
                const highThreshold = recipientBalance + 600;
                const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];

                const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
                const proof = tree.getProof(0);

                await expect(
                  funder
                    .connect(roles.owner)
                    .fund(roles.owner.address, tree.root, proof, roles.recipient.address, lowThreshold, highThreshold)
                ).to.be.revertedWith('Balance not low enough');
              });
            });
          });
          context('Proof is not valid', function () {
            it('reverts', async function () {
              const { roles, funder } = await helpers.loadFixture(deploy);
              const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
              const lowThreshold = recipientBalance + 300;
              const highThreshold = recipientBalance + 600;
              const values = [[roles.random.address, 300, 600]];

              const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
              const proof = tree.getProof(0);

              await expect(
                funder
                  .connect(roles.owner)
                  .fund(roles.owner.address, tree.root, proof, roles.recipient.address, lowThreshold, highThreshold)
              ).to.be.revertedWith('Invalid proof');
            });
          });
        });
        context('High threshold is  zero', function () {
          it('reverts', async function () {
            const { roles, funder } = await helpers.loadFixture(deploy);

            const lowThreshold = 0;
            const highThreshold = 0;
            const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];

            const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
            const proof = tree.getProof(0);

            await expect(
              funder
                .connect(roles.owner)
                .fund(roles.owner.address, tree.root, proof, roles.recipient.address, lowThreshold, highThreshold)
            ).to.be.revertedWith('High threshold zero');
          });
        });
      });
      context('Low threshold is higher than high', function () {
        it('reverts', async function () {
          const { roles, funder } = await helpers.loadFixture(deploy);

          const lowThreshold = 600;
          const highThreshold = 300;
          const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];

          const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
          const proof = tree.getProof(0);

          await expect(
            funder
              .connect(roles.owner)
              .fund(roles.owner.address, tree.root, proof, roles.recipient.address, lowThreshold, highThreshold)
          ).to.be.revertedWith('Low threshold higher than high');
        });
      });
    });
    context('Recipient address is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);

        const lowThreshold = 300;
        const highThreshold = 600;
        const zeroAddress = '0x0000000000000000000000000000000000000000';

        const values = [[zeroAddress, lowThreshold.toString(), highThreshold.toString()]];

        const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
        const proof = tree.getProof(0);

        await expect(
          funder
            .connect(roles.owner)
            .fund(roles.owner.address, tree.root, proof, zeroAddress, lowThreshold, highThreshold)
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
              const { roles, funder } = await helpers.loadFixture(deploy);
              const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
              const lowThreshold = recipientBalance + 300;
              const highThreshold = recipientBalance + 600;
              const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];
              const amount = ethers.utils.parseEther('1');

              const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

              const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
              const receipt = await tx.wait();
              const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
              const funderDepository = event.args.funderDepository;

              await roles.owner.sendTransaction({ to: funderDepository, value: amount });

              const funderDepositoryBalance = await ethers.provider.getBalance(funderDepository);

              await expect(
                funder
                  .connect(roles.owner)
                  .withdraw(tree.root, roles.recipient.address, amount)
              )
                .to.emit(funder, 'Withdrew')
                .withArgs(funderDepository, roles.recipient.address, amount);

              const expectedRecipientBalance = recipientBalance.add(ethers.BigNumber.from(amount.toString()));
              const expectedFunderDepositoryBalance = funderDepositoryBalance.sub(ethers.BigNumber.from(amount.toString()));     

              expect(await ethers.provider.getBalance(roles.recipient.address)).to.equal(expectedRecipientBalance);
              expect(await ethers.provider.getBalance(funderDepository)).to.equal(expectedFunderDepositoryBalance);
            });
          });
          context('Balance is insufficient', function () {
            it('reverts', async function () {
              const { roles, funder } = await helpers.loadFixture(deploy);
              const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
              const lowThreshold = recipientBalance + 300;
              const highThreshold = recipientBalance + 600;
              const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];
              const amount = ethers.utils.parseEther('3');

              const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

              const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
              const receipt = await tx.wait();
              const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
              const funderDepository = event.args.funderDepository;

              await roles.owner.sendTransaction({ to: funderDepository, value: ethers.utils.parseEther('1') });

              await expect(
                funder
                  .connect(roles.owner)
                  .withdraw(tree.root, roles.recipient.address, amount)
              )
                .to.be.revertedWith('Insufficient balance');
            });
          });
        });
        context('FunderDepository is not deployed', function () {
          it('reverts', async function () {
            const { roles, funder } = await helpers.loadFixture(deploy);
            const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
            const lowThreshold = recipientBalance + 300;
            const highThreshold = recipientBalance + 600;
            const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];
            const amount = ethers.utils.parseEther('1');

            const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

            await expect(
              funder
                .connect(roles.owner)
                .withdraw(tree.root, roles.recipient.address, amount)
            )
              .to.be.revertedWith('No such FunderDepository');
          });
        });
      });
      context('Amount is zero', function () {
        it('reverts', async function () {
          const { roles, funder } = await helpers.loadFixture(deploy);
          const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
          const lowThreshold = recipientBalance + 300;
          const highThreshold = recipientBalance + 600;
          const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];
          const amount = 0;

          const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

          const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
          const receipt = await tx.wait();
          const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
          const funderDepository = event.args.funderDepository;

          await roles.owner.sendTransaction({ to: funderDepository, value: ethers.utils.parseEther('1') });

          await expect(
            funder
              .connect(roles.owner)
              .withdraw(tree.root, roles.recipient.address, amount)
          )
            .to.be.revertedWith('Amount zero');
        });
      });
    });
    context('Recipient address is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const lowThreshold = recipientBalance + 300;
        const highThreshold = recipientBalance + 600;
        const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];
        const amount = ethers.utils.parseEther('1');
        const zeroAddress = '0x0000000000000000000000000000000000000000';

        const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

        const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
        const receipt = await tx.wait();
        const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
        const funderDepository = event.args.funderDepository;

        await roles.owner.sendTransaction({ to: funderDepository, value: amount });

        await expect(
          funder
            .connect(roles.owner)
            .withdraw(tree.root, zeroAddress, amount)
        )
          .to.be.revertedWith('Recipient address zero');
      });
    });
  });

  describe('withdrawAll', function () {
    context('Function gets called', function () {
      it('withdraws', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const lowThreshold = recipientBalance + 300;
        const highThreshold = recipientBalance + 600;
        const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];
        const amount = ethers.utils.parseEther('1');

        const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

        const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
        const receipt = await tx.wait();
        const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
        const funderDepository = event.args.funderDepository;

        await roles.owner.sendTransaction({ to: funderDepository, value: amount });

        const funderDepositoryBalance = await ethers.provider.getBalance(funderDepository);

        await expect(
          funder
            .connect(roles.owner)
            .withdrawAll(tree.root, roles.recipient.address)
        )
          .to.emit(funder, 'Withdrew')
          .withArgs(funderDepository, roles.recipient.address, amount);

        const expectedRecipientBalance = recipientBalance.add(ethers.BigNumber.from(amount.toString()));
        const expectedFunderDepositoryBalance = funderDepositoryBalance.sub(ethers.BigNumber.from(amount.toString()));     

        expect(await ethers.provider.getBalance(roles.recipient.address)).to.equal(expectedRecipientBalance);
        expect(await ethers.provider.getBalance(funderDepository)).to.equal(expectedFunderDepositoryBalance);
      });
    });
  });

  describe('computeFunderDepositoryAddress', function () {
    context('Function gets called', function () {
      it('withdraws', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const lowThreshold = recipientBalance + 300;
        const highThreshold = recipientBalance + 600;
        const values = [[roles.recipient.address, lowThreshold.toString(), highThreshold.toString()]];

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
  });
});
