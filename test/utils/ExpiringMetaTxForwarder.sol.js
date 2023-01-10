const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('ExpiringMetaTxForwarder', function () {
  function deriveTypedDataHashOfMetaTx(domain, value) {
    const domainTypeHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
    );
    const nameHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(domain.name));
    const versionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(domain.version));
    const domainSeparator = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [domainTypeHash, nameHash, versionHash, domain.chainId, domain.verifyingContract]
      )
    );

    // Struct hash derivation
    const structTypeHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes('ExpiringMetaTx(address from,address to,bytes data,uint256 expirationTimestamp)')
    );
    const structHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'address', 'address', 'bytes32', 'uint256'],
        [structTypeHash, value.from, value.to, ethers.utils.keccak256(value.data), value.expirationTimestamp]
      )
    );

    // Typed data hash derivation
    const typedDataHash = ethers.utils.keccak256(
      ethers.utils.solidityPack(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
    );
    return typedDataHash;
  }

  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      owner: accounts[1],
      randomPerson: accounts[9],
    };
    const expiringMetaTxForwarderFactory = await ethers.getContractFactory('ExpiringMetaTxForwarder', roles.deployer);
    const expiringMetaTxForwarder = await expiringMetaTxForwarderFactory.deploy();
    const expiringMetaTxForwarderTargetFactory = await ethers.getContractFactory(
      'MockExpiringMetaTxForwarderTarget',
      roles.deployer
    );
    const expiringMetaTxForwarderTarget = await expiringMetaTxForwarderTargetFactory.deploy(
      expiringMetaTxForwarder.address,
      roles.owner.address
    );
    const latestTimestamp = await helpers.time.latest();
    const nextTimestamp = latestTimestamp + 1;
    await helpers.time.setNextBlockTimestamp(nextTimestamp);
    const expiringMetaTxValue = {
      from: roles.owner.address,
      to: expiringMetaTxForwarderTarget.address,
      data: expiringMetaTxForwarderTarget.interface.encodeFunctionData('incrementCounter', []),
      expirationTimestamp: nextTimestamp + 60 * 60,
    };
    return {
      roles,
      expiringMetaTxForwarder,
      expiringMetaTxForwarderTarget,
      expiringMetaTxDomain: await testUtils.expiringMetaTxDomain(expiringMetaTxForwarder),
      expiringMetaTxTypes: testUtils.expiringMetaTxTypes(),
      expiringMetaTxValue,
    };
  }

  describe('execute', function () {
    context('Meta-tx with hash is not executed', function () {
      context('Meta-tx with hash is not canceled', function () {
        context('Meta-tx has not expired', function () {
          context('Signature is valid', function () {
            it('executes', async function () {
              const {
                roles,
                expiringMetaTxForwarder,
                expiringMetaTxForwarderTarget,
                expiringMetaTxDomain,
                expiringMetaTxTypes,
                expiringMetaTxValue,
              } = await helpers.loadFixture(deploy);
              const signature = await roles.owner._signTypedData(
                expiringMetaTxDomain,
                expiringMetaTxTypes,
                expiringMetaTxValue
              );
              const counterInitial = await expiringMetaTxForwarderTarget.counter();
              const metaTxTypedDataHash = deriveTypedDataHashOfMetaTx(expiringMetaTxDomain, expiringMetaTxValue);
              expect(await expiringMetaTxForwarder.metaTxWithHashIsExecutedOrCanceled(metaTxTypedDataHash)).to.equal(
                false
              );
              const returndata = await expiringMetaTxForwarder
                .connect(roles.randomPerson)
                .callStatic.execute(expiringMetaTxValue, signature);
              expect(returndata).to.equal(counterInitial.add(1));
              await expect(expiringMetaTxForwarder.connect(roles.randomPerson).execute(expiringMetaTxValue, signature))
                .to.emit(expiringMetaTxForwarder, 'ExecutedMetaTx')
                .withArgs(metaTxTypedDataHash);
              expect(await expiringMetaTxForwarderTarget.counter()).to.be.equal(counterInitial.add(1));
              expect(await expiringMetaTxForwarder.metaTxWithHashIsExecutedOrCanceled(metaTxTypedDataHash)).to.equal(
                true
              );
            });
          });
          context('Signature is not valid', function () {
            it('reverts', async function () {
              const { roles, expiringMetaTxForwarder, expiringMetaTxDomain, expiringMetaTxTypes, expiringMetaTxValue } =
                await helpers.loadFixture(deploy);
              const signature = await roles.randomPerson._signTypedData(
                expiringMetaTxDomain,
                expiringMetaTxTypes,
                expiringMetaTxValue
              );
              await expect(
                expiringMetaTxForwarder.connect(roles.randomPerson).execute(expiringMetaTxValue, signature)
              ).to.be.revertedWith('Invalid signature');
            });
          });
        });
        context('Meta-tx has expired', function () {
          it('reverts', async function () {
            const { roles, expiringMetaTxForwarder, expiringMetaTxDomain, expiringMetaTxTypes, expiringMetaTxValue } =
              await helpers.loadFixture(deploy);
            const signature = await roles.owner._signTypedData(
              expiringMetaTxDomain,
              expiringMetaTxTypes,
              expiringMetaTxValue
            );
            await helpers.time.setNextBlockTimestamp(expiringMetaTxValue.expirationTimestamp);
            await expect(
              expiringMetaTxForwarder.connect(roles.randomPerson).execute(expiringMetaTxValue, signature)
            ).to.be.revertedWith('Meta-tx expired');
          });
        });
      });
      context('Meta-tx with hash is canceled', function () {
        it('reverts', async function () {
          const { roles, expiringMetaTxForwarder, expiringMetaTxDomain, expiringMetaTxTypes, expiringMetaTxValue } =
            await helpers.loadFixture(deploy);
          const signature = await roles.owner._signTypedData(
            expiringMetaTxDomain,
            expiringMetaTxTypes,
            expiringMetaTxValue
          );
          await expiringMetaTxForwarder.connect(roles.owner).cancel(expiringMetaTxValue);
          await expect(
            expiringMetaTxForwarder.connect(roles.randomPerson).execute(expiringMetaTxValue, signature)
          ).to.be.revertedWith('Meta-tx executed or canceled');
        });
      });
    });
    context('Meta-tx with hash is already executed', function () {
      it('reverts', async function () {
        const { roles, expiringMetaTxForwarder, expiringMetaTxDomain, expiringMetaTxTypes, expiringMetaTxValue } =
          await helpers.loadFixture(deploy);
        const signature = await roles.owner._signTypedData(
          expiringMetaTxDomain,
          expiringMetaTxTypes,
          expiringMetaTxValue
        );
        await expiringMetaTxForwarder.connect(roles.randomPerson).execute(expiringMetaTxValue, signature);
        await expect(
          expiringMetaTxForwarder.connect(roles.randomPerson).execute(expiringMetaTxValue, signature)
        ).to.be.revertedWith('Meta-tx executed or canceled');
      });
    });
  });

  describe('cancel', function () {
    context('Sender is meta-tx source', function () {
      context('Meta-tx with hash is not executed yet', function () {
        context('Meta-tx with hash is not canceled yet', function () {
          context('Meta-tx has not expired', function () {
            it('nullifies', async function () {
              const {
                roles,
                expiringMetaTxForwarder,
                expiringMetaTxForwarderTarget,
                expiringMetaTxDomain,
                expiringMetaTxValue,
              } = await helpers.loadFixture(deploy);
              const counterInitial = await expiringMetaTxForwarderTarget.counter();
              const metaTxTypedDataHash = deriveTypedDataHashOfMetaTx(expiringMetaTxDomain, expiringMetaTxValue);
              expect(await expiringMetaTxForwarder.metaTxWithHashIsExecutedOrCanceled(metaTxTypedDataHash)).to.equal(
                false
              );
              await expect(expiringMetaTxForwarder.connect(roles.owner).cancel(expiringMetaTxValue))
                .to.emit(expiringMetaTxForwarder, 'CanceledMetaTx')
                .withArgs(metaTxTypedDataHash);
              expect(await expiringMetaTxForwarderTarget.counter()).to.be.equal(counterInitial);
              expect(await expiringMetaTxForwarder.metaTxWithHashIsExecutedOrCanceled(metaTxTypedDataHash)).to.equal(
                true
              );
            });
          });
          context('Meta-tx has expired', function () {
            it('reverts', async function () {
              const { roles, expiringMetaTxForwarder, expiringMetaTxValue } = await helpers.loadFixture(deploy);
              await helpers.time.setNextBlockTimestamp(expiringMetaTxValue.expirationTimestamp);
              await expect(expiringMetaTxForwarder.connect(roles.owner).cancel(expiringMetaTxValue)).to.be.revertedWith(
                'Meta-tx expired'
              );
            });
          });
        });
        context('Meta-tx with hash is already canceled', function () {
          it('reverts', async function () {
            const { roles, expiringMetaTxForwarder, expiringMetaTxValue } = await helpers.loadFixture(deploy);
            await expiringMetaTxForwarder.connect(roles.owner).cancel(expiringMetaTxValue);
            await expect(expiringMetaTxForwarder.connect(roles.owner).cancel(expiringMetaTxValue)).to.be.revertedWith(
              'Meta-tx executed or canceled'
            );
          });
        });
      });
      context('Meta-tx with hash is already executed', function () {
        it('reverts', async function () {
          const { roles, expiringMetaTxForwarder, expiringMetaTxDomain, expiringMetaTxTypes, expiringMetaTxValue } =
            await helpers.loadFixture(deploy);
          const signature = await roles.owner._signTypedData(
            expiringMetaTxDomain,
            expiringMetaTxTypes,
            expiringMetaTxValue
          );
          await expiringMetaTxForwarder.connect(roles.randomPerson).execute(expiringMetaTxValue, signature);
          await expect(expiringMetaTxForwarder.connect(roles.owner).cancel(expiringMetaTxValue)).to.be.revertedWith(
            'Meta-tx executed or canceled'
          );
        });
      });
    });
    context('Sender is not meta-tx source', function () {
      it('reverts', async function () {
        const { roles, expiringMetaTxForwarder, expiringMetaTxValue } = await helpers.loadFixture(deploy);
        await expect(
          expiringMetaTxForwarder.connect(roles.randomPerson).cancel(expiringMetaTxValue)
        ).to.be.revertedWith('Sender not meta-tx source');
      });
    });
  });
});
