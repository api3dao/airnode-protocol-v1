const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { expect } = require('chai');
const { generateRandomBytes32, generateRandomAddress, buildEIP712Domain } = require('../test-utils');

describe('TimestampedHashRegistry', function () {
  const deploy = async () => {
    const roleNames = [
      'deployer',
      'owner',
      'dapiFallbackRootSigner1',
      'dapiFallbackRootSigner2',
      'dapiFallbackRootSigner3',
      'airnode',
      'randomPerson',
    ];
    const accounts = await hre.ethers.getSigners();
    const roles = roleNames.reduce((acc, roleName, index) => {
      return { ...acc, [roleName]: accounts[index] };
    }, {});

    const TimestampedHashRegistry = await hre.ethers.getContractFactory('TimestampedHashRegistry', roles.deployer);
    const timestampedHashRegistry = await TimestampedHashRegistry.deploy();
    await timestampedHashRegistry.connect(roles.deployer).transferOwnership(roles.owner.address);

    const dapiName = 'API3/USD';
    const fallbackBeaconTemplateId = generateRandomBytes32();
    const fallbackBeaconId = hre.ethers.utils.solidityKeccak256(
      ['address', 'bytes32'],
      [roles.airnode.address, fallbackBeaconTemplateId]
    );
    const fallbackSponsorWalletAddress = generateRandomAddress();

    const treeEntry = [hre.ethers.utils.formatBytes32String(dapiName), fallbackBeaconId, fallbackSponsorWalletAddress];
    const treeValues = [
      [generateRandomBytes32(), generateRandomBytes32(), generateRandomAddress()],
      [generateRandomBytes32(), generateRandomBytes32(), generateRandomAddress()],
      treeEntry,
      [generateRandomBytes32(), generateRandomBytes32(), generateRandomAddress()],
      [generateRandomBytes32(), generateRandomBytes32(), generateRandomAddress()],
    ];
    const tree = StandardMerkleTree.of(treeValues, ['bytes32', 'bytes32', 'address']);
    const root = tree.root;
    const timestamp = Math.floor(Date.now() / 1000);
    const chainId = (await timestampedHashRegistry.provider.getNetwork()).chainId;
    const domain = buildEIP712Domain('TimestampedHashRegistry', chainId, timestampedHashRegistry.address);
    const types = {
      SignedHash: [
        { name: 'hashType', type: 'bytes32' },
        { name: 'hash', type: 'bytes32' },
        { name: 'timestamp', type: 'uint256' },
      ],
    };
    const dapiFallbackHashType = hre.ethers.utils.solidityKeccak256(['string'], ['dAPI fallback root']);
    const values = {
      hashType: dapiFallbackHashType,
      hash: root,
      timestamp,
    };
    const signatures = await Promise.all(
      [roles.dapiFallbackRootSigner1, roles.dapiFallbackRootSigner2, roles.dapiFallbackRootSigner3].map(
        async (rootSigner) => await rootSigner._signTypedData(domain, types, values)
      )
    );

    return {
      roles,
      timestampedHashRegistry,
      dapiName,
      fallbackBeaconTemplateId,
      fallbackBeaconId,
      fallbackSponsorWalletAddress,
      domain,
      types,
      dapiFallbackHashType,
      root,
      timestamp,
      signatures,
    };
  };

  describe('constructor', function () {
    it('constructs', async function () {
      const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
      expect(await timestampedHashRegistry.owner()).to.equal(roles.owner.address);
    });
  });

  describe('setupSigners', function () {
    context('Signers is not emtpy', function () {
      context('Hash type signers is empty', function () {
        it('setup signers', async function () {
          const { roles, timestampedHashRegistry, dapiFallbackHashType } = await helpers.loadFixture(deploy);
          expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([]);
          const signers = [
            roles.dapiFallbackRootSigner1.address,
            roles.dapiFallbackRootSigner2.address,
            roles.dapiFallbackRootSigner3.address,
          ];
          await expect(timestampedHashRegistry.connect(roles.owner).setupSigners(dapiFallbackHashType, signers))
            .to.emit(timestampedHashRegistry, 'SetupSigners')
            .withArgs(dapiFallbackHashType, signers);
          expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal(signers);
        });
      });
      context('Hash type signers is not empty', function () {
        it('reverts', async function () {
          const { roles, timestampedHashRegistry, dapiFallbackHashType } = await helpers.loadFixture(deploy);
          expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([]);
          await expect(
            timestampedHashRegistry
              .connect(roles.owner)
              .addSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address)
          )
            .to.emit(timestampedHashRegistry, 'AddedSigner')
            .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address);
          await expect(
            timestampedHashRegistry
              .connect(roles.owner)
              .setupSigners(dapiFallbackHashType, [
                roles.dapiFallbackRootSigner2.address,
                roles.dapiFallbackRootSigner3.address,
              ])
          ).to.be.revertedWith('Hash type signers is not empty');
        });
      });
    });
    context('Signers is emtpy', function () {
      it('reverts', async function () {
        const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
        await expect(
          timestampedHashRegistry.connect(roles.owner).setupSigners(generateRandomBytes32(), [])
        ).to.be.revertedWith('Signers is empty');
      });
    });
  });

  describe('addSigner', function () {
    context('Sender is the owner', function () {
      context('Hash type is not zero', function () {
        context('Signer is not zero', function () {
          context('Signer does not exist', function () {
            it('adds signer', async function () {
              const { roles, timestampedHashRegistry, dapiFallbackHashType } = await helpers.loadFixture(deploy);
              expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([]);
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .addSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address)
              )
                .to.emit(timestampedHashRegistry, 'AddedSigner')
                .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address);
              expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([
                roles.dapiFallbackRootSigner1.address,
              ]);
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .addSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner2.address)
              )
                .to.emit(timestampedHashRegistry, 'AddedSigner')
                .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner2.address);
              expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([
                roles.dapiFallbackRootSigner1.address,
                roles.dapiFallbackRootSigner2.address,
              ]);
            });
          });
          context('Signer exists', function () {
            it('reverts', async function () {
              const { roles, timestampedHashRegistry, dapiFallbackHashType } = await helpers.loadFixture(deploy);
              expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([]);
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .addSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address)
              )
                .to.emit(timestampedHashRegistry, 'AddedSigner')
                .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address);
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .addSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address)
              ).to.be.revertedWith('Signer already exists');
            });
          });
        });
        context('Signer is zero', function () {
          it('reverts', async function () {
            const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
            await expect(
              timestampedHashRegistry
                .connect(roles.owner)
                .addSigner(generateRandomBytes32(), hre.ethers.constants.AddressZero)
            ).to.be.revertedWith('Signer is zero');
          });
        });
      });
      context('Hash type is zero', function () {
        it('reverts', async function () {
          const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
          await expect(
            timestampedHashRegistry
              .connect(roles.owner)
              .addSigner(hre.ethers.constants.HashZero, roles.dapiFallbackRootSigner1.address)
          ).to.be.revertedWith('Hash type is zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
        await expect(
          timestampedHashRegistry
            .connect(roles.randomPerson)
            .addSigner(generateRandomBytes32(), generateRandomAddress())
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('removeSigner', function () {
    context('Sender is the owner', function () {
      context('Hash type is not zero', function () {
        context('Signer is not zero', function () {
          context('Signer exists', function () {
            it('removes signer', async function () {
              const { roles, timestampedHashRegistry, dapiFallbackHashType } = await helpers.loadFixture(deploy);
              const signers = [
                roles.dapiFallbackRootSigner1,
                roles.dapiFallbackRootSigner2,
                roles.dapiFallbackRootSigner3,
              ];
              expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([]);
              for (const signer of signers) {
                await expect(
                  timestampedHashRegistry.connect(roles.owner).addSigner(dapiFallbackHashType, signer.address)
                )
                  .to.emit(timestampedHashRegistry, 'AddedSigner')
                  .withArgs(dapiFallbackHashType, signer.address);
              }
              // remove from the middle
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .removeSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner2.address)
              )
                .to.emit(timestampedHashRegistry, 'RemovedSigner')
                .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner2.address);
              // remove at the end
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .removeSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner3.address)
              )
                .to.emit(timestampedHashRegistry, 'RemovedSigner')
                .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner3.address);
              // remove remaining signer
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .removeSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address)
              )
                .to.emit(timestampedHashRegistry, 'RemovedSigner')
                .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address);
            });
          });
          context('Signer does not exist', function () {
            it('reverts', async function () {
              const { roles, timestampedHashRegistry, dapiFallbackHashType } = await helpers.loadFixture(deploy);
              expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([]);
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .removeSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address)
              ).to.be.revertedWith('Signer does not exist');
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .addSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address)
              )
                .to.emit(timestampedHashRegistry, 'AddedSigner')
                .withArgs(dapiFallbackHashType, roles.dapiFallbackRootSigner1.address);
              await expect(
                timestampedHashRegistry
                  .connect(roles.owner)
                  .removeSigner(dapiFallbackHashType, roles.dapiFallbackRootSigner2.address)
              ).to.be.revertedWith('Signer does not exist');
            });
          });
        });
        context('Signer is zero', function () {
          it('reverts', async function () {
            const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
            await expect(
              timestampedHashRegistry
                .connect(roles.owner)
                .removeSigner(generateRandomBytes32(), hre.ethers.constants.AddressZero)
            ).to.be.revertedWith('Signer is zero');
          });
        });
      });
      context('Hash type is zero', function () {
        it('reverts', async function () {
          const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
          await expect(
            timestampedHashRegistry
              .connect(roles.owner)
              .removeSigner(hre.ethers.constants.HashZero, roles.dapiFallbackRootSigner1.address)
          ).to.be.revertedWith('Hash type is zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
        await expect(
          timestampedHashRegistry
            .connect(roles.randomPerson)
            .removeSigner(generateRandomBytes32(), generateRandomAddress())
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('registerHash', function () {
    context('Hash type is not zero', function () {
      context('Signers is not empty', function () {
        context('Number of signatures is equal to number of signers', function () {
          context('All signatures match', function () {
            context('Timestamp is newer', function () {
              it('registers hash', async function () {
                const { roles, timestampedHashRegistry, dapiFallbackHashType, root, timestamp, signatures } =
                  await helpers.loadFixture(deploy);
                const signers = [
                  roles.dapiFallbackRootSigner1.address,
                  roles.dapiFallbackRootSigner2.address,
                  roles.dapiFallbackRootSigner3.address,
                ];
                expect(await timestampedHashRegistry.hashTypeToHash(dapiFallbackHashType)).to.equal(
                  hre.ethers.constants.HashZero
                );
                expect(await timestampedHashRegistry.hashTypeToTimestamp(dapiFallbackHashType)).to.equal(0);
                await timestampedHashRegistry
                  .connect(roles.owner)
                  .multicall(
                    signers.map((signer) =>
                      timestampedHashRegistry.interface.encodeFunctionData('addSigner', [dapiFallbackHashType, signer])
                    )
                  );
                await expect(timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, signatures))
                  .to.emit(timestampedHashRegistry, 'RegisteredHash')
                  .withArgs(dapiFallbackHashType, root, timestamp);
                expect(await timestampedHashRegistry.hashTypeToHash(dapiFallbackHashType)).to.equal(root);
                expect(await timestampedHashRegistry.hashTypeToTimestamp(dapiFallbackHashType)).to.equal(timestamp);
              });
            });
            context('Timestamp is not newer', function () {
              it('reverts', async function () {
                const { roles, timestampedHashRegistry, dapiFallbackHashType, root, timestamp, signatures } =
                  await helpers.loadFixture(deploy);
                const signers = [
                  roles.dapiFallbackRootSigner1.address,
                  roles.dapiFallbackRootSigner2.address,
                  roles.dapiFallbackRootSigner3.address,
                ];
                await timestampedHashRegistry
                  .connect(roles.owner)
                  .multicall(
                    signers.map((signer) =>
                      timestampedHashRegistry.interface.encodeFunctionData('addSigner', [dapiFallbackHashType, signer])
                    )
                  );
                expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal(signers);
                await expect(timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, signatures))
                  .to.emit(timestampedHashRegistry, 'RegisteredHash')
                  .withArgs(dapiFallbackHashType, root, timestamp);
                await expect(
                  timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, signatures)
                ).to.be.revertedWith('Timestamp is not newer');
              });
            });
          });
          context('All signatures do not match', function () {
            it('reverts', async function () {
              const {
                roles,
                timestampedHashRegistry,
                domain,
                types,
                dapiFallbackHashType,
                root,
                timestamp,
                signatures,
              } = await helpers.loadFixture(deploy);
              const signers = [
                roles.dapiFallbackRootSigner1.address,
                roles.dapiFallbackRootSigner2.address,
                roles.dapiFallbackRootSigner3.address,
              ];
              await timestampedHashRegistry
                .connect(roles.owner)
                .multicall(
                  signers.map((signer) =>
                    timestampedHashRegistry.interface.encodeFunctionData('addSigner', [dapiFallbackHashType, signer])
                  )
                );
              // Signed by a different signer
              await expect(
                timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, [
                  await roles.randomPerson._signTypedData(domain, types, {
                    hashType: dapiFallbackHashType,
                    hash: root,
                    timestamp,
                  }),
                  ...signatures.slice(1),
                ])
              ).to.be.revertedWith('Signature mismatch');
              // Signed a different root
              await expect(
                timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, [
                  await roles.dapiFallbackRootSigner1._signTypedData(domain, types, {
                    hashType: dapiFallbackHashType,
                    hash: generateRandomBytes32(),
                    timestamp,
                  }),
                  ...signatures.slice(1),
                ])
              ).to.be.revertedWith('Signature mismatch');
              // All signatures are different
              await expect(
                timestampedHashRegistry.registerHash(
                  dapiFallbackHashType,
                  root,
                  timestamp,
                  Array(3).fill(signatures[0])
                )
              ).to.be.revertedWith('Signature mismatch');
              // All signatures are in the expected order
              await expect(
                timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, signatures.reverse())
              ).to.be.revertedWith('Signature mismatch');
            });
          });
        });
        context('Number of signatures is not equal to number of signers', function () {
          it('reverts', async function () {
            const { roles, timestampedHashRegistry, dapiFallbackHashType, root, timestamp, signatures } =
              await helpers.loadFixture(deploy);
            const signers = [
              roles.dapiFallbackRootSigner1.address,
              roles.dapiFallbackRootSigner2.address,
              roles.dapiFallbackRootSigner3.address,
            ];
            await timestampedHashRegistry
              .connect(roles.owner)
              .multicall(
                signers.map((signer) =>
                  timestampedHashRegistry.interface.encodeFunctionData('addSigner', [dapiFallbackHashType, signer])
                )
              );
            await expect(
              timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, signatures.slice(1))
            ).to.be.revertedWith('Invalid number of signatures');
          });
        });
      });
      context('Signers is empty', function () {
        it('reverts', async function () {
          const { timestampedHashRegistry, dapiFallbackHashType, root, timestamp } = await helpers.loadFixture(deploy);
          await expect(
            timestampedHashRegistry.registerHash(dapiFallbackHashType, root, timestamp, [])
          ).to.be.revertedWith('Signers have not been set');
        });
      });
    });
    context('Hash type is zero', function () {
      it('reverts', async function () {
        const { timestampedHashRegistry, root, timestamp, signatures } = await helpers.loadFixture(deploy);
        await expect(
          timestampedHashRegistry.registerHash(hre.ethers.constants.HashZero, root, timestamp, signatures)
        ).to.be.revertedWith('Hash type is zero');
      });
    });
  });
});
