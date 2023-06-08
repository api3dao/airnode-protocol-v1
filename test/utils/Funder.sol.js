const { ethers } = require('hardhat');
const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { expect } = require('chai');

describe('Funder', function () {
  async function deriveFunderDepositoryAddress(funderAddress, owner, root) {
    const FunderDepositoryArtifact = await hre.artifacts.readArtifact('FunderDepository');
    const initcode = ethers.utils.solidityPack(
      ['bytes', 'bytes'],
      [FunderDepositoryArtifact.bytecode, ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [owner, root])]
    );
    return ethers.utils.getCreate2Address(funderAddress, ethers.constants.HashZero, ethers.utils.keccak256(initcode));
  }

  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      owner: accounts[1],
      recipient: accounts[2],
      randomPerson: accounts[9],
    };

    const Funder = await ethers.getContractFactory('Funder', roles.deployer);
    const funder = await Funder.deploy();

    const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
    const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
    const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
    const values = [[roles.recipient.address, lowThreshold, highThreshold]];
    const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

    return {
      roles,
      funder,
      tree,
    };
  }

  describe('deployFunderDepository', function () {
    context('Root is not zero', function () {
      it('deploys the contract and updates the mapping', async function () {
        const { roles, funder, tree } = await helpers.loadFixture(deploy);
        const funderDepositoryAddress = await deriveFunderDepositoryAddress(
          funder.address,
          roles.owner.address,
          tree.root
        );
        expect(await funder.ownerToRootToFunderDepositoryAddress(roles.owner.address, tree.root)).to.equal(
          ethers.constants.AddressZero
        );
        await expect(funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root))
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
    context('Root is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        await expect(
          funder.connect(roles.owner).deployFunderDepository(roles.owner.address, ethers.constants.HashZero)
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
                  const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
                  const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
                  const values = [[roles.recipient.address, lowThreshold, highThreshold]];

                  const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
                  const proof = tree.getProof(0);

                  const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
                  const receipt = await tx.wait();
                  const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
                  const funderDepository = event.args.funderDepository;

                  await roles.owner.sendTransaction({ to: funderDepository, value: ethers.utils.parseEther('1') });

                  const amountNeededToTopUp = ethers.BigNumber.from(highThreshold).sub(recipientBalance);

                  await expect(
                    funder
                      .connect(roles.owner)
                      .fund(roles.owner.address, tree.root, proof, roles.recipient.address, lowThreshold, highThreshold)
                  )
                    .to.emit(funder, 'Funded')
                    .withArgs(funderDepository, roles.recipient.address, amountNeededToTopUp);

                  const expectedBalance = ethers.BigNumber.from(recipientBalance).add(amountNeededToTopUp);

                  expect(await ethers.provider.getBalance(roles.recipient.address)).to.equal(expectedBalance);
                });
              });
              context('Amount is zero', function () {
                it('reverts', async function () {
                  const { roles, funder } = await helpers.loadFixture(deploy);
                  const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
                  const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
                  const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
                  const values = [[roles.recipient.address, lowThreshold, highThreshold]];

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
                const lowThreshold = ethers.BigNumber.from('3');
                const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
                const values = [[roles.recipient.address, lowThreshold, highThreshold]];

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
              const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
              const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
              const values = [[roles.randomPerson.address, 3, 6]];

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
            const values = [[roles.recipient.address, lowThreshold, highThreshold]];

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

          const lowThreshold = ethers.BigNumber.from('6');
          const highThreshold = ethers.BigNumber.from('3');
          const values = [[roles.recipient.address, lowThreshold, highThreshold]];

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

        const lowThreshold = ethers.BigNumber.from('3');
        const highThreshold = ethers.BigNumber.from('6');

        const values = [[ethers.constants.AddressZero, lowThreshold, highThreshold]];

        const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);
        const proof = tree.getProof(0);

        await expect(
          funder
            .connect(roles.owner)
            .fund(roles.owner.address, tree.root, proof, ethers.constants.AddressZero, lowThreshold, highThreshold)
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
              const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
              const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
              const values = [[roles.recipient.address, lowThreshold, highThreshold]];
              const amount = ethers.utils.parseEther('1');

              const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

              const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
              const receipt = await tx.wait();
              const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
              const funderDepository = event.args.funderDepository;

              await roles.owner.sendTransaction({ to: funderDepository, value: amount });

              const funderDepositoryBalance = await ethers.provider.getBalance(funderDepository);

              await expect(funder.connect(roles.owner).withdraw(tree.root, roles.recipient.address, amount))
                .to.emit(funder, 'Withdrew')
                .withArgs(funderDepository, roles.recipient.address, amount);

              const expectedRecipientBalance = recipientBalance.add(ethers.BigNumber.from(amount));
              const expectedFunderDepositoryBalance = funderDepositoryBalance.sub(ethers.BigNumber.from(amount));

              expect(await ethers.provider.getBalance(roles.recipient.address)).to.equal(expectedRecipientBalance);
              expect(await ethers.provider.getBalance(funderDepository)).to.equal(expectedFunderDepositoryBalance);
            });
          });
          context('Balance is insufficient', function () {
            it('reverts', async function () {
              const { roles, funder } = await helpers.loadFixture(deploy);
              const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
              const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
              const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
              const values = [[roles.recipient.address, lowThreshold, highThreshold]];
              const amount = ethers.utils.parseEther('3');

              const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

              const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
              const receipt = await tx.wait();
              const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
              const funderDepository = event.args.funderDepository;

              await roles.owner.sendTransaction({ to: funderDepository, value: ethers.utils.parseEther('1') });

              await expect(
                funder.connect(roles.owner).withdraw(tree.root, roles.recipient.address, amount)
              ).to.be.revertedWith('Insufficient balance');
            });
          });
        });
        context('FunderDepository is not deployed', function () {
          it('reverts', async function () {
            const { roles, funder } = await helpers.loadFixture(deploy);
            const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
            const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
            const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
            const values = [[roles.recipient.address, lowThreshold, highThreshold]];
            const amount = ethers.utils.parseEther('1');

            const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

            await expect(
              funder.connect(roles.owner).withdraw(tree.root, roles.recipient.address, amount)
            ).to.be.revertedWith('No such FunderDepository');
          });
        });
      });
      context('Amount is zero', function () {
        it('reverts', async function () {
          const { roles, funder } = await helpers.loadFixture(deploy);
          const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
          const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
          const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
          const values = [[roles.recipient.address, lowThreshold, highThreshold]];
          const amount = 0;

          const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

          const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
          const receipt = await tx.wait();
          const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
          const funderDepository = event.args.funderDepository;

          await roles.owner.sendTransaction({ to: funderDepository, value: ethers.utils.parseEther('1') });

          await expect(
            funder.connect(roles.owner).withdraw(tree.root, roles.recipient.address, amount)
          ).to.be.revertedWith('Amount zero');
        });
      });
    });
    context('Recipient address is zero', function () {
      it('reverts', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
        const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
        const values = [[roles.recipient.address, lowThreshold, highThreshold]];
        const amount = ethers.utils.parseEther('1');

        const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

        const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
        const receipt = await tx.wait();
        const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
        const funderDepository = event.args.funderDepository;

        await roles.owner.sendTransaction({ to: funderDepository, value: amount });

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
            const { roles, funder } = await helpers.loadFixture(deploy);
            const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
            const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
            const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
            const values = [[roles.recipient.address, lowThreshold, highThreshold]];
            const amount = ethers.utils.parseEther('1');

            const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

            const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
            const receipt = await tx.wait();
            const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
            const funderDepository = event.args.funderDepository;

            await roles.owner.sendTransaction({ to: funderDepository, value: amount });

            const funderDepositoryBalance = await ethers.provider.getBalance(funderDepository);

            await expect(funder.connect(roles.owner).withdrawAll(tree.root, roles.recipient.address))
              .to.emit(funder, 'Withdrew')
              .withArgs(funderDepository, roles.recipient.address, amount);

            const expectedRecipientBalance = recipientBalance.add(ethers.BigNumber.from(amount));
            const expectedFunderDepositoryBalance = funderDepositoryBalance.sub(ethers.BigNumber.from(amount));

            expect(await ethers.provider.getBalance(roles.recipient.address)).to.equal(expectedRecipientBalance);
            expect(await ethers.provider.getBalance(funderDepository)).to.equal(expectedFunderDepositoryBalance);
          });
        });
        context('Transfer unsuccessful', function () {
          it('reverts', async function () {
            const { roles, funder } = await helpers.loadFixture(deploy);
            const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
            const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
            const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
            const values = [[roles.recipient.address, lowThreshold, highThreshold]];
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
          const { roles, funder } = await helpers.loadFixture(deploy);
          const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
          const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
          const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
          const values = [[roles.recipient.address, lowThreshold, highThreshold]];
          const amount = ethers.utils.parseEther('1');

          const tree = StandardMerkleTree.of(values, ['address', 'uint256', 'uint256']);

          const tx = await funder.connect(roles.owner).deployFunderDepository(roles.owner.address, tree.root);
          const receipt = await tx.wait();
          const event = receipt.events.find((e) => e.event === 'DeployedFunderDepository');
          const funderDepository = event.args.funderDepository;
          const funderDepositoryContract = await ethers.getContractAt('FunderDepository', funderDepository);

          await roles.owner.sendTransaction({ to: funderDepository, value: amount });

          await expect(
            funderDepositoryContract.connect(roles.owner).withdraw(roles.recipient.address, amount)
          ).to.be.revertedWith('Sender not Funder');
        });
      });
    });
  });

  describe('computeFunderDepositoryAddress', function () {
    context('Root is not zero', function () {
      it('computes', async function () {
        const { roles, funder } = await helpers.loadFixture(deploy);
        const recipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const lowThreshold = ethers.BigNumber.from(recipientBalance).add('3');
        const highThreshold = ethers.BigNumber.from(recipientBalance).add('6');
        const values = [[roles.recipient.address, lowThreshold, highThreshold]];

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
        const { roles, funder } = await helpers.loadFixture(deploy);

        await expect(
          funder.connect(roles.owner).computeFunderDepositoryAddress(roles.owner.address, ethers.constants.HashZero)
        ).to.be.revertedWith('Root zero');
      });
    });
  });
});
