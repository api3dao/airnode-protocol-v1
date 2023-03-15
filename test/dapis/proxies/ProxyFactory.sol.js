const { artifacts, ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('ProxyFactory', function () {
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
    const proxyFactoryFactory = await ethers.getContractFactory('ProxyFactory', roles.deployer);
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

  describe('deployDataFeedProxy', function () {
    context('Data feed ID is not zero', function () {
      it('deploys data feed proxy', async function () {
        const { roles, api3ServerV1, proxyFactory, beaconId, beaconValue, beaconTimestamp } = await helpers.loadFixture(
          deploy
        );
        // Precompute the proxy address
        const DataFeedProxy = await artifacts.readArtifact('DataFeedProxy');
        const initcode = ethers.utils.solidityPack(
          ['bytes', 'bytes'],
          [
            DataFeedProxy.bytecode,
            ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [api3ServerV1.address, beaconId]),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.utils.getCreate2Address(
          proxyFactory.address,
          ethers.utils.keccak256(metadata),
          ethers.utils.keccak256(initcode)
        );

        // Can only deploy once
        await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata))
          .to.emit(proxyFactory, 'DeployedDataFeedProxy')
          .withArgs(proxyAddress, beaconId, metadata);
        // Subsequent deployments will revert with no string
        await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata)).to.be.reverted;

        // Confirm that the bytecode is the same
        const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxy', roles.deployer);
        const eoaDeployedDataFeedProxy = await dataFeedProxyFactory.deploy(api3ServerV1.address, beaconId);
        expect(await ethers.provider.getCode(proxyAddress)).to.equal(
          await ethers.provider.getCode(eoaDeployedDataFeedProxy.address)
        );

        // Test the deployed contract
        const dataFeedProxy = new ethers.Contract(proxyAddress, DataFeedProxy.abi, ethers.provider);
        expect(await dataFeedProxy.api3ServerV1()).to.equal(api3ServerV1.address);
        expect(await dataFeedProxy.dataFeedId()).to.equal(beaconId);
        const beacon = await dataFeedProxy.read();
        expect(beacon.value).to.equal(beaconValue);
        expect(beacon.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.deployDataFeedProxy(ethers.constants.HashZero, metadata)).to.be.revertedWith(
          'Data feed ID zero'
        );
      });
    });
  });

  describe('deployDapiProxy', function () {
    context('dAPI name is not zero', function () {
      it('deploys dAPI proxy', async function () {
        const { roles, api3ServerV1, proxyFactory, dapiName, dapiNameHash, beaconValue, beaconTimestamp } =
          await helpers.loadFixture(deploy);
        // Precompute the proxy address
        const DapiProxy = await artifacts.readArtifact('DapiProxy');
        const initcode = ethers.utils.solidityPack(
          ['bytes', 'bytes'],
          [
            DapiProxy.bytecode,
            ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [api3ServerV1.address, dapiNameHash]),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.utils.getCreate2Address(
          proxyFactory.address,
          ethers.utils.keccak256(metadata),
          ethers.utils.keccak256(initcode)
        );

        // Can only deploy once
        await expect(proxyFactory.deployDapiProxy(dapiName, metadata))
          .to.emit(proxyFactory, 'DeployedDapiProxy')
          .withArgs(proxyAddress, dapiName, metadata);
        // Subsequent deployments will revert with no string
        await expect(proxyFactory.deployDapiProxy(dapiName, metadata)).to.be.reverted;

        // Confirm that the bytecode is the same
        const dapiProxyFactory = await ethers.getContractFactory('DapiProxy', roles.deployer);
        const eoaDeployedDapiProxy = await dapiProxyFactory.deploy(api3ServerV1.address, dapiNameHash);
        expect(await ethers.provider.getCode(proxyAddress)).to.equal(
          await ethers.provider.getCode(eoaDeployedDapiProxy.address)
        );

        // Test the deployed contract
        const dapiProxy = new ethers.Contract(proxyAddress, DapiProxy.abi, ethers.provider);
        expect(await dapiProxy.api3ServerV1()).to.equal(api3ServerV1.address);
        expect(await dapiProxy.dapiNameHash()).to.equal(ethers.utils.solidityKeccak256(['bytes32'], [dapiName]));
        const dapi = await dapiProxy.read();
        expect(dapi.value).to.equal(beaconValue);
        expect(dapi.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.deployDapiProxy(ethers.constants.HashZero, metadata)).to.be.revertedWith(
          'dAPI name zero'
        );
      });
    });
  });

  describe('deployDataFeedProxyWithOev', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('deploys data feed proxy', async function () {
          const { roles, api3ServerV1, proxyFactory, beaconId, beaconValue, beaconTimestamp } =
            await helpers.loadFixture(deploy);
          // Precompute the proxy address
          const DataFeedProxyWithOev = await artifacts.readArtifact('DataFeedProxyWithOev');
          const initcode = ethers.utils.solidityPack(
            ['bytes', 'bytes'],
            [
              DataFeedProxyWithOev.bytecode,
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32', 'address'],
                [api3ServerV1.address, beaconId, roles.oevBeneficiary.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.utils.getCreate2Address(
            proxyFactory.address,
            ethers.utils.keccak256(metadata),
            ethers.utils.keccak256(initcode)
          );

          // Can only deploy once
          await expect(proxyFactory.deployDataFeedProxyWithOev(beaconId, roles.oevBeneficiary.address, metadata))
            .to.emit(proxyFactory, 'DeployedDataFeedProxyWithOev')
            .withArgs(proxyAddress, beaconId, roles.oevBeneficiary.address, metadata);
          // Subsequent deployments will revert with no string
          await expect(
            proxyFactory.deployDataFeedProxyWithOev(beaconId, roles.oevBeneficiary.address, metadata)
          ).to.be.reverted;

          // Confirm that the bytecode is the same
          const dataFeedProxyFactory = await ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
          const eoaDeployedDataFeedProxyWithOev = await dataFeedProxyFactory.deploy(
            api3ServerV1.address,
            beaconId,
            roles.oevBeneficiary.address
          );
          expect(await ethers.provider.getCode(proxyAddress)).to.equal(
            await ethers.provider.getCode(eoaDeployedDataFeedProxyWithOev.address)
          );

          // Test the deployed contract
          const dataFeedProxyWithOev = new ethers.Contract(proxyAddress, DataFeedProxyWithOev.abi, ethers.provider);
          expect(await dataFeedProxyWithOev.api3ServerV1()).to.equal(api3ServerV1.address);
          expect(await dataFeedProxyWithOev.dataFeedId()).to.equal(beaconId);
          expect(await dataFeedProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
          const beacon = await dataFeedProxyWithOev.read();
          expect(beacon.value).to.equal(beaconValue);
          expect(beacon.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.deployDataFeedProxyWithOev(beaconId, ethers.constants.AddressZero, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.deployDataFeedProxyWithOev(ethers.constants.HashZero, roles.oevBeneficiary.address, metadata)
        ).to.be.revertedWith('Data feed ID zero');
      });
    });
  });

  describe('deployDapiProxyWithOev', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('deploys data feed proxy', async function () {
          const { roles, api3ServerV1, proxyFactory, dapiName, dapiNameHash, beaconValue, beaconTimestamp } =
            await helpers.loadFixture(deploy);
          // Precompute the proxy address
          const DapiProxyWithOev = await artifacts.readArtifact('DapiProxyWithOev');
          const initcode = ethers.utils.solidityPack(
            ['bytes', 'bytes'],
            [
              DapiProxyWithOev.bytecode,
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32', 'address'],
                [api3ServerV1.address, dapiNameHash, roles.oevBeneficiary.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.utils.getCreate2Address(
            proxyFactory.address,
            ethers.utils.keccak256(metadata),
            ethers.utils.keccak256(initcode)
          );

          // Can only deploy once
          await expect(proxyFactory.deployDapiProxyWithOev(dapiName, roles.oevBeneficiary.address, metadata))
            .to.emit(proxyFactory, 'DeployedDapiProxyWithOev')
            .withArgs(proxyAddress, dapiName, roles.oevBeneficiary.address, metadata);
          // Subsequent deployments will revert with no string
          await expect(
            proxyFactory.deployDapiProxyWithOev(dapiName, roles.oevBeneficiary.address, metadata)
          ).to.be.reverted;

          // Confirm that the bytecode is the same
          const dataFeedProxyFactory = await ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
          const eoaDeployedDapiProxyWithOev = await dataFeedProxyFactory.deploy(
            api3ServerV1.address,
            dapiNameHash,
            roles.oevBeneficiary.address
          );
          expect(await ethers.provider.getCode(proxyAddress)).to.equal(
            await ethers.provider.getCode(eoaDeployedDapiProxyWithOev.address)
          );

          // Test the deployed contract
          const dapiProxyWithOev = new ethers.Contract(proxyAddress, DapiProxyWithOev.abi, ethers.provider);
          expect(await dapiProxyWithOev.api3ServerV1()).to.equal(api3ServerV1.address);
          expect(await dapiProxyWithOev.dapiNameHash()).to.equal(
            ethers.utils.solidityKeccak256(['bytes32'], [dapiName])
          );
          expect(await dapiProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
          const dapi = await dapiProxyWithOev.read();
          expect(dapi.value).to.equal(beaconValue);
          expect(dapi.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const { proxyFactory, beaconId } = await helpers.loadFixture(deploy);
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.deployDapiProxyWithOev(beaconId, ethers.constants.AddressZero, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const { roles, proxyFactory } = await helpers.loadFixture(deploy);
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.deployDapiProxyWithOev(ethers.constants.HashZero, roles.oevBeneficiary.address, metadata)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('computeDataFeedProxyAddress', function () {
    context('Data feed ID is not zero', function () {
      it('computes data feed proxy address', async function () {
        const { api3ServerV1, proxyFactory, beaconId } = await helpers.loadFixture(deploy);
        // Precompute the proxy address
        const DataFeedProxy = await artifacts.readArtifact('DataFeedProxy');
        const initcode = ethers.utils.solidityPack(
          ['bytes', 'bytes'],
          [
            DataFeedProxy.bytecode,
            ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [api3ServerV1.address, beaconId]),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.utils.getCreate2Address(
          proxyFactory.address,
          ethers.utils.keccak256(metadata),
          ethers.utils.keccak256(initcode)
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
        // Precompute the proxy address
        const DapiProxy = await artifacts.readArtifact('DapiProxy');
        const initcode = ethers.utils.solidityPack(
          ['bytes', 'bytes'],
          [
            DapiProxy.bytecode,
            ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [api3ServerV1.address, dapiNameHash]),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = ethers.utils.getCreate2Address(
          proxyFactory.address,
          ethers.utils.keccak256(metadata),
          ethers.utils.keccak256(initcode)
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
          // Precompute the proxy address
          const DataFeedProxyWithOev = await artifacts.readArtifact('DataFeedProxyWithOev');
          const initcode = ethers.utils.solidityPack(
            ['bytes', 'bytes'],
            [
              DataFeedProxyWithOev.bytecode,
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32', 'address'],
                [api3ServerV1.address, beaconId, roles.oevBeneficiary.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.utils.getCreate2Address(
            proxyFactory.address,
            ethers.utils.keccak256(metadata),
            ethers.utils.keccak256(initcode)
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
          // Precompute the proxy address
          const DapiProxyWithOev = await artifacts.readArtifact('DapiProxyWithOev');
          const initcode = ethers.utils.solidityPack(
            ['bytes', 'bytes'],
            [
              DapiProxyWithOev.bytecode,
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32', 'address'],
                [api3ServerV1.address, dapiNameHash, roles.oevBeneficiary.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = ethers.utils.getCreate2Address(
            proxyFactory.address,
            ethers.utils.keccak256(metadata),
            ethers.utils.keccak256(initcode)
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
