const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('ExpiringMetaCallForwarder', function () {
  function deriveTypedDataHashOfMetaCall(domain, value) {
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
      ethers.utils.toUtf8Bytes('ExpiringMetaCall(address from,address to,bytes data,uint256 expirationTimestamp)')
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
    const expiringMetaCallForwarderFactory = await ethers.getContractFactory(
      'ExpiringMetaCallForwarder',
      roles.deployer
    );
    const expiringMetaCallForwarder = await expiringMetaCallForwarderFactory.deploy();
    const expiringMetaCallForwarderTargetFactory = await ethers.getContractFactory(
      'MockExpiringMetaCallForwarderTarget',
      roles.deployer
    );
    const expiringMetaCallForwarderTarget = await expiringMetaCallForwarderTargetFactory.deploy(
      expiringMetaCallForwarder.address,
      roles.owner.address
    );
    const latestTimestamp = await helpers.time.latest();
    const nextTimestamp = latestTimestamp + 1;
    await helpers.time.setNextBlockTimestamp(nextTimestamp);
    const expiringMetaCallDomain = {
      name: 'ExpiringMetaCallForwarder',
      version: '1.0.0',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: expiringMetaCallForwarder.address,
    };
    const expiringMetaCallTypes = {
      ExpiringMetaCall: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'data', type: 'bytes' },
        { name: 'expirationTimestamp', type: 'uint256' },
      ],
    };
    const expiringMetaCallValue = {
      from: roles.owner.address,
      to: expiringMetaCallForwarderTarget.address,
      data: expiringMetaCallForwarderTarget.interface.encodeFunctionData('incrementCounter', []),
      expirationTimestamp: nextTimestamp + 60 * 60,
    };
    return {
      roles,
      expiringMetaCallForwarder,
      expiringMetaCallForwarderTarget,
      expiringMetaCallDomain,
      expiringMetaCallTypes,
      expiringMetaCallValue,
    };
  }

  describe('execute', function () {
    context('Meta-call with hash is not executed', function () {
      context('Meta-call has not expired', function () {
        context('Signature is valid', function () {
          it('executes', async function () {
            const {
              roles,
              expiringMetaCallForwarder,
              expiringMetaCallForwarderTarget,
              expiringMetaCallDomain,
              expiringMetaCallTypes,
              expiringMetaCallValue,
            } = await helpers.loadFixture(deploy);
            const signature = await roles.owner._signTypedData(
              expiringMetaCallDomain,
              expiringMetaCallTypes,
              expiringMetaCallValue
            );
            const counterInitial = await expiringMetaCallForwarderTarget.counter();
            const metaCallTypedDataHash = deriveTypedDataHashOfMetaCall(expiringMetaCallDomain, expiringMetaCallValue);
            expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash)).to.equal(false);
            await expect(
              expiringMetaCallForwarder.connect(roles.randomPerson).execute(expiringMetaCallValue, signature)
            ).to.not.be.reverted;
            expect(await expiringMetaCallForwarderTarget.counter()).to.be.equal(counterInitial.add(1));
            expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash)).to.equal(true);
          });
        });
        context('Signature is not valid', function () {
          it('reverts', async function () {
            const {
              roles,
              expiringMetaCallForwarder,
              expiringMetaCallDomain,
              expiringMetaCallTypes,
              expiringMetaCallValue,
            } = await helpers.loadFixture(deploy);
            const signature = await roles.randomPerson._signTypedData(
              expiringMetaCallDomain,
              expiringMetaCallTypes,
              expiringMetaCallValue
            );
            await expect(
              expiringMetaCallForwarder.connect(roles.randomPerson).execute(expiringMetaCallValue, signature)
            ).to.be.revertedWith('Invalid signature');
          });
        });
      });
      context('Meta-call has expired', function () {
        it('reverts', async function () {
          const {
            roles,
            expiringMetaCallForwarder,
            expiringMetaCallDomain,
            expiringMetaCallTypes,
            expiringMetaCallValue,
          } = await helpers.loadFixture(deploy);
          const signature = await roles.owner._signTypedData(
            expiringMetaCallDomain,
            expiringMetaCallTypes,
            expiringMetaCallValue
          );
          await helpers.time.setNextBlockTimestamp(expiringMetaCallValue.expirationTimestamp);
          await expect(
            expiringMetaCallForwarder.connect(roles.randomPerson).execute(expiringMetaCallValue, signature)
          ).to.be.revertedWith('Meta-call expired');
        });
      });
    });
    context('Meta-call with hash is already executed', function () {
      it('reverts', async function () {
        const {
          roles,
          expiringMetaCallForwarder,
          expiringMetaCallDomain,
          expiringMetaCallTypes,
          expiringMetaCallValue,
        } = await helpers.loadFixture(deploy);
        const signature = await roles.owner._signTypedData(
          expiringMetaCallDomain,
          expiringMetaCallTypes,
          expiringMetaCallValue
        );
        await expiringMetaCallForwarder.connect(roles.randomPerson).execute(expiringMetaCallValue, signature);
        await expect(
          expiringMetaCallForwarder.connect(roles.randomPerson).execute(expiringMetaCallValue, signature)
        ).to.be.revertedWith('Meta-call already executed');
      });
    });
  });

  describe('multicall', function () {
    it('executes multiple meta-calls', async function () {
      const {
        roles,
        expiringMetaCallForwarder,
        expiringMetaCallForwarderTarget,
        expiringMetaCallDomain,
        expiringMetaCallTypes,
        expiringMetaCallValue: expiringMetaCallValue1,
      } = await helpers.loadFixture(deploy);
      // Value can't be identical
      const expiringMetaCallValue2 = {
        ...expiringMetaCallValue1,
        expirationTimestamp: expiringMetaCallValue1.expirationTimestamp + 1,
      };
      const signature1 = await roles.owner._signTypedData(
        expiringMetaCallDomain,
        expiringMetaCallTypes,
        expiringMetaCallValue1
      );
      const signature2 = await roles.owner._signTypedData(
        expiringMetaCallDomain,
        expiringMetaCallTypes,
        expiringMetaCallValue2
      );
      const counterInitial = await expiringMetaCallForwarderTarget.counter();
      const metaCallTypedDataHash1 = deriveTypedDataHashOfMetaCall(expiringMetaCallDomain, expiringMetaCallValue1);
      const metaCallTypedDataHash2 = deriveTypedDataHashOfMetaCall(expiringMetaCallDomain, expiringMetaCallValue2);
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash1)).to.equal(false);
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash2)).to.equal(false);
      await expect(
        expiringMetaCallForwarder
          .connect(roles.randomPerson)
          .multicall([
            expiringMetaCallForwarder.interface.encodeFunctionData('execute', [expiringMetaCallValue1, signature1]),
            expiringMetaCallForwarder.interface.encodeFunctionData('execute', [expiringMetaCallValue2, signature2]),
          ])
      ).to.not.be.reverted;
      expect(await expiringMetaCallForwarderTarget.counter()).to.be.equal(counterInitial.add(2));
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash1)).to.equal(true);
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash2)).to.equal(true);
    });
  });

  describe('tryMulticall', function () {
    it('tries to execute multiple meta-calls', async function () {
      const {
        roles,
        expiringMetaCallForwarder,
        expiringMetaCallForwarderTarget,
        expiringMetaCallDomain,
        expiringMetaCallTypes,
        expiringMetaCallValue: expiringMetaCallValue1,
      } = await helpers.loadFixture(deploy);
      const expiringMetaCallValue2 = {
        ...expiringMetaCallValue1,
        expirationTimestamp: expiringMetaCallValue1.expirationTimestamp + 1,
      };
      const signature1 = await roles.owner._signTypedData(
        expiringMetaCallDomain,
        expiringMetaCallTypes,
        expiringMetaCallValue1
      );
      // Have random person sign to get an invalid signature
      const signature2 = await roles.randomPerson._signTypedData(
        expiringMetaCallDomain,
        expiringMetaCallTypes,
        expiringMetaCallValue2
      );
      const counterInitial = await expiringMetaCallForwarderTarget.counter();
      const metaCallTypedDataHash1 = deriveTypedDataHashOfMetaCall(expiringMetaCallDomain, expiringMetaCallValue1);
      const metaCallTypedDataHash2 = deriveTypedDataHashOfMetaCall(expiringMetaCallDomain, expiringMetaCallValue2);
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash1)).to.equal(false);
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash2)).to.equal(false);
      await expect(
        expiringMetaCallForwarder
          .connect(roles.randomPerson)
          .tryMulticall([
            expiringMetaCallForwarder.interface.encodeFunctionData('execute', [expiringMetaCallValue1, signature1]),
            expiringMetaCallForwarder.interface.encodeFunctionData('execute', [expiringMetaCallValue2, signature2]),
          ])
      ).to.not.be.reverted;
      expect(await expiringMetaCallForwarderTarget.counter()).to.be.equal(counterInitial.add(1));
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash1)).to.equal(true);
      expect(await expiringMetaCallForwarder.metaCallWithHashIsExecuted(metaCallTypedDataHash2)).to.equal(false);
    });
  });
});
