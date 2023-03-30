const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const zkSync = require('zksync-web3');
const testUtils = require('../../test-utils');
const zkSyncUtils = require('../../zksync-utils');

describe('ProxyFactoryZkSync', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      dapiNameSetter: accounts[2],
      airnode: accounts[3],
      oevBeneficiary: accounts[4],
    };
    const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';
    const dapiName = ethers.utils.formatBytes32String('My dAPI');
    const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const api3ServerV1Factory = await ethers.getContractFactory('Api3ServerV1', roles.deployer);
    const api3ServerV1 = await api3ServerV1Factory.deploy(
      accessControlRegistry.address,
      api3ServerV1AdminRoleDescription,
      roles.manager.address
    );
    const proxyFactoryFactory = await ethers.getContractFactory('ProxyFactoryZkSync', roles.deployer);
    const proxyFactory = await proxyFactoryFactory.deploy(api3ServerV1.address);

    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['bytes32', 'bytes'], [endpointId, templateParameters])
    );
    const beaconId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['address', 'bytes32'], [roles.airnode.address, templateId])
    );
    await api3ServerV1.connect(roles.manager).setDapiName(dapiName, beaconId);

    const beaconValue = 123;
    const beaconTimestamp = await helpers.time.latest();
    const data = ethers.utils.defaultAbiCoder.encode(['int256'], [beaconValue]);
    const signature = await testUtils.signData(roles.airnode, templateId, beaconTimestamp, data);
    await api3ServerV1.updateBeaconWithSignedData(roles.airnode.address, templateId, beaconTimestamp, data, signature);

    return {
      roles,
      api3ServerV1,
      proxyFactory,
      dapiName,
      dapiNameHash,
      beaconId,
      beaconValue,
      beaconTimestamp,
    };
  }

  describe('Proxy contract hashes', function () {
    it('are correct', async function () {
      const fs = require('fs');
      Object.keys(zkSyncUtils.bytecodeHashes).map((contractName) => {
        const bytecode = JSON.parse(
          fs.readFileSync(
            `./artifacts-zk/contracts/api3-server-v1/proxies/${contractName}.sol/${contractName}.json`,
            'utf8'
          )
        ).bytecode;
        const bytecodeHash = ethers.utils.hexlify(zkSync.utils.hashBytecode(bytecode));
        expect(bytecodeHash).to.equal(zkSyncUtils.bytecodeHashes[contractName]);
      });
    });
  });

  describe('constructor', function () {
    context('Api3ServerV1 addres is not zero', function () {
      it('constructs', async function () {
        const { api3ServerV1, proxyFactory } = await helpers.loadFixture(deploy);
        expect(await proxyFactory.api3ServerV1()).to.equal(api3ServerV1.address);
      });
    });
    context('Api3ServerV1 addres is zero', function () {
      it('reverts', async function () {
        const { roles } = await helpers.loadFixture(deploy);
        const proxyFactoryFactory = await ethers.getContractFactory('ProxyFactory', roles.deployer);
        await expect(proxyFactoryFactory.deploy(ethers.constants.AddressZero)).to.be.revertedWith(
          'Api3ServerV1 address zero'
        );
      });
    });
  });

  describe('computeDataFeedProxyAddress', function () {
    context('Data feed ID is not zero', function () {
      it('computes data feed proxy address', async function () {
        const { api3ServerV1, proxyFactory, beaconId } = await helpers.loadFixture(deploy);
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        // Precompute the proxy address
        const proxyAddress = zkSyncUtils.computeCreate2Address(
          proxyFactory.address,
          ethers.utils.keccak256(metadata),
          zkSyncUtils.bytecodeHashes.DataFeedProxy,
          ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [api3ServerV1.address, beaconId])
        );

        expect(await proxyFactory.computeDataFeedProxyAddress(beaconId, metadata)).to.be.equal(proxyAddress);
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.computeDataFeedProxyAddress(ethers.constants.HashZero, metadata)).to.be.revertedWith(
          'Data feed ID zero'
        );
      });
    });
  });

  describe('computeDapiProxyAddress', function () {
    context('dAPI name is not zero', function () {
      it('computes dAPI proxy address', async function () {
        const { api3ServerV1, proxyFactory, dapiName, dapiNameHash } = await helpers.loadFixture(deploy);
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        // Precompute the proxy address
        const proxyAddress = zkSyncUtils.computeCreate2Address(
          proxyFactory.address,
          ethers.utils.keccak256(metadata),
          zkSyncUtils.bytecodeHashes.DapiProxy,
          ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [api3ServerV1.address, dapiNameHash])
        );
        expect(await proxyFactory.computeDapiProxyAddress(dapiName, metadata)).to.be.equal(proxyAddress);
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.computeDapiProxyAddress(ethers.constants.HashZero, metadata)).to.be.revertedWith(
          'dAPI name zero'
        );
      });
    });
  });

  describe('computeDataFeedProxyWithOevAddress', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('computes data feed proxy address', async function () {
          const { roles, api3ServerV1, proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          // Precompute the proxy address
          const proxyAddress = zkSyncUtils.computeCreate2Address(
            proxyFactory.address,
            ethers.utils.keccak256(metadata),
            zkSyncUtils.bytecodeHashes.DataFeedProxyWithOev,
            ethers.utils.defaultAbiCoder.encode(
              ['address', 'bytes32', 'address'],
              [api3ServerV1.address, beaconId, roles.oevBeneficiary.address]
            )
          );
          expect(
            await proxyFactory.computeDataFeedProxyWithOevAddress(beaconId, roles.oevBeneficiary.address, metadata)
          ).to.be.equal(proxyAddress);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.computeDataFeedProxyWithOevAddress(beaconId, ethers.constants.AddressZero, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.computeDataFeedProxyWithOevAddress(
            ethers.constants.HashZero,
            roles.oevBeneficiary.address,
            metadata
          )
        ).to.be.revertedWith('Data feed ID zero');
      });
    });
  });

  describe('computeDapiProxyWithOevAddress', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('computes data feed proxy address', async function () {
          const { roles, api3ServerV1, proxyFactory, dapiName, dapiNameHash } = await helpers.loadFixture(deploy);
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          // Precompute the proxy address
          const proxyAddress = zkSyncUtils.computeCreate2Address(
            proxyFactory.address,
            ethers.utils.keccak256(metadata),
            zkSyncUtils.bytecodeHashes.DapiProxyWithOev,
            ethers.utils.defaultAbiCoder.encode(
              ['address', 'bytes32', 'address'],
              [api3ServerV1.address, dapiNameHash, roles.oevBeneficiary.address]
            )
          );
          expect(
            await proxyFactory.computeDapiProxyWithOevAddress(dapiName, roles.oevBeneficiary.address, metadata)
          ).to.be.equal(proxyAddress);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.computeDapiProxyWithOevAddress(beaconId, ethers.constants.AddressZero, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.computeDapiProxyWithOevAddress(ethers.constants.HashZero, roles.oevBeneficiary.address, metadata)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });
});
