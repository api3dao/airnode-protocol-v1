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
    const timestamp = Math.floor(Date.now() / 1000) + 3600;
    const chainId = (await timestampedHashRegistry.provider.getNetwork()).chainId;
    const domain = buildEIP712Domain('TimestampedHashRegistry', chainId, timestampedHashRegistry.address);
    const types = {
      SignedHash: [
        { name: 'hashType', type: 'bytes32' },
        { name: 'hash', type: 'bytes32' },
        { name: 'timestamp', type: 'uint256' },
      ],
    };
    const dapiFallbackHashType = hre.ethers.utils.formatBytes32String('dAPI fallback merkle tree root');
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
    const proof = tree.getProof(treeEntry);

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
      proof,
    };
  };

  describe('constructor', function () {
    it('constructs', async function () {
      const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
      // expect(await timestampedHashRegistry.dapiFallbackHashType()).to.equal(
      //   hre.ethers.utils.solidityKeccak256(
      //     ['string'],
      //     [await timestampedHashRegistry.DAPI_FALLBACK_HASH_TYPE_DESCRIPTION()]
      //   )
      // );
      // expect(await timestampedHashRegistry.priceManagementHashType()).to.equal(
      //   hre.ethers.utils.solidityKeccak256(
      //     ['string'],
      //     [await timestampedHashRegistry.PRICE_MANAGEMENT_HASH_TYPE_DESCRIPTION()]
      //   )
      // );
      // expect(await timestampedHashRegistry.dapiManagementHashType()).to.equal(
      //   hre.ethers.utils.solidityKeccak256(
      //     ['string'],
      //     [await timestampedHashRegistry.DAPI_MANAGEMENT_HASH_TYPE_DESCRIPTION()]
      //   )
      // );
      // expect(await timestampedHashRegistry.apiManagementHashType()).to.equal(
      //   hre.ethers.utils.solidityKeccak256(
      //     ['string'],
      //     [await timestampedHashRegistry.API_MANAGEMENT_HASH_TYPE_DESCRIPTION()]
      //   )
      // );
      expect(await timestampedHashRegistry.owner()).to.equal(roles.owner.address);
    });
  });

  describe('setHashTypeSigners', function () {
    context('Sender is the owner', function () {
      context('HashType is not zero', function () {
        context('Signers is not empty', function () {
          it('sets signers', async function () {
            const { roles, timestampedHashRegistry, dapiFallbackHashType } = await helpers.loadFixture(deploy);
            const signers = [
              roles.dapiFallbackRootSigner1.address,
              roles.dapiFallbackRootSigner2.address,
              roles.dapiFallbackRootSigner3.address,
            ];
            expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal([]);
            await expect(timestampedHashRegistry.connect(roles.owner).setHashTypeSigners(dapiFallbackHashType, signers))
              .to.emit(timestampedHashRegistry, 'HashTypeSignersSet')
              .withArgs(dapiFallbackHashType, signers);
            expect(await timestampedHashRegistry.getSigners(dapiFallbackHashType)).to.deep.equal(signers);
          });
        });
        context('Signers is empty', function () {
          it('reverts', async function () {
            const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
            await expect(
              timestampedHashRegistry.connect(roles.owner).setHashTypeSigners(generateRandomBytes32(), [])
            ).to.be.revertedWith('Signers length is empty');
          });
        });
      });
      context('HashType is zero', function () {
        it('reverts', async function () {
          const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
          await expect(
            timestampedHashRegistry.connect(roles.owner).setHashTypeSigners(hre.ethers.constants.HashZero, [])
          ).to.be.revertedWith('Hash is zero');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { roles, timestampedHashRegistry } = await helpers.loadFixture(deploy);
        const rootSigners = [generateRandomAddress(), generateRandomAddress(), generateRandomAddress()];
        await expect(
          timestampedHashRegistry.connect(roles.randomPerson).setHashTypeSigners(generateRandomBytes32(), rootSigners)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('registerSignedHash', function () {
    context('HashType is not zero', function () {
      context('Signers is not empty', function () {
        context('Number of signatures is equal to number of signers', function () {
          context('All signatures match', function () {
            it('registers hash', async function () {
              const { roles, timestampedHashRegistry, dapiFallbackHashType, root, timestamp, signatures } =
                await helpers.loadFixture(deploy);
              const signers = [
                roles.dapiFallbackRootSigner1.address,
                roles.dapiFallbackRootSigner2.address,
                roles.dapiFallbackRootSigner3.address,
              ];
              expect(await timestampedHashRegistry.hashTypeToSignedHash(dapiFallbackHashType)).to.contain(
                hre.ethers.constants.HashZero,
                0
              );
              await timestampedHashRegistry.connect(roles.owner).setHashTypeSigners(dapiFallbackHashType, signers);
              await expect(
                timestampedHashRegistry.registerSignedHash(dapiFallbackHashType, { hash: root, timestamp }, signatures)
              )
                .to.emit(timestampedHashRegistry, 'SignedHashRegistered')
                .withArgs(dapiFallbackHashType, root, timestamp, signatures);
              expect(await timestampedHashRegistry.hashTypeToSignedHash(dapiFallbackHashType)).to.contain(
                root,
                timestamp
              );
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
              await timestampedHashRegistry.connect(roles.owner).setHashTypeSigners(dapiFallbackHashType, signers);
              // Signed by a different signer
              await expect(
                timestampedHashRegistry.registerSignedHash(dapiFallbackHashType, { hash: root, timestamp }, [
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
                timestampedHashRegistry.registerSignedHash(dapiFallbackHashType, { hash: root, timestamp }, [
                  await roles.dapiFallbackRootSigner1._signTypedData(domain, types, {
                    hashType: dapiFallbackHashType,
                    hash: generateRandomBytes32(),
                    timestamp,
                  }),
                  ...signatures.slice(1),
                ])
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
            await timestampedHashRegistry.connect(roles.owner).setHashTypeSigners(dapiFallbackHashType, signers);
            await expect(
              timestampedHashRegistry.registerSignedHash(
                dapiFallbackHashType,
                { hash: root, timestamp },
                signatures.slice(1)
              )
            ).to.be.revertedWith('Signatures length mismatch');
          });
        });
      });
      context('Signers is empty', function () {
        it('reverts', async function () {
          const { timestampedHashRegistry, dapiFallbackHashType, root, timestamp } = await helpers.loadFixture(deploy);
          await expect(
            timestampedHashRegistry.registerSignedHash(dapiFallbackHashType, { hash: root, timestamp }, [])
          ).to.be.revertedWith('Signers have not been set');
        });
      });
    });
    context('HashType is zero', function () {
      it('reverts', async function () {
        const { timestampedHashRegistry, root, timestamp, signatures } = await helpers.loadFixture(deploy);
        await expect(
          timestampedHashRegistry.registerSignedHash(
            hre.ethers.constants.HashZero,
            { hash: root, timestamp },
            signatures
          )
        ).to.be.revertedWith('Hash type is zero');
      });
    });
  });
});
