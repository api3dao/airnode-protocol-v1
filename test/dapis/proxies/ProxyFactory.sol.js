const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('ProxyFactory', function () {
  let roles;
  let proxyFactory, dapiServer;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let beaconId, beaconValue, beaconTimestamp;
  const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
  const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      oevBeneficiary: accounts[2],
      randomPerson: accounts[9],
    };
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const airnodeProtocolFactory = await hre.ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const dapiServerFactory = await hre.ethers.getContractFactory('DapiServer', roles.deployer);
    dapiServer = await dapiServerFactory.deploy(
      accessControlRegistry.address,
      dapiServerAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );
    const airnodeData = testUtils.generateRandomAirnodeWallet();
    const airnodeAddress = airnodeData.airnodeAddress;
    const airnodeWallet = hre.ethers.Wallet.fromMnemonic(airnodeData.airnodeMnemonic, "m/44'/60'/0'/0/0");
    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    const templateId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['bytes32', 'bytes'], [endpointId, templateParameters])
    );
    beaconId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeAddress, templateId])
    );
    await dapiServer.connect(roles.manager).setDapiName(dapiName, beaconId);
    beaconValue = 123;
    beaconTimestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
    const data = hre.ethers.utils.defaultAbiCoder.encode(['int256'], [beaconValue]);
    const signature = await airnodeWallet.signMessage(
      hre.ethers.utils.arrayify(
        hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [templateId, beaconTimestamp, data])
        )
      )
    );
    await hre.ethers.provider.send('evm_setNextBlockTimestamp', [beaconTimestamp + 1]);
    await dapiServer.updateBeaconWithSignedData(airnodeAddress, templateId, beaconTimestamp, data, signature);

    const proxyFactoryFactory = await hre.ethers.getContractFactory('ProxyFactory', roles.deployer);
    proxyFactory = await proxyFactoryFactory.deploy(dapiServer.address);
  });

  describe('constructor', function () {
    context('DapiServer addres is not zero', function () {
      it('constructs', async function () {
        expect(await proxyFactory.dapiServer()).to.equal(dapiServer.address);
      });
    });
    context('DapiServer addres is zero', function () {
      it('reverts', async function () {
        const proxyFactoryFactory = await hre.ethers.getContractFactory('ProxyFactory', roles.deployer);
        await expect(proxyFactoryFactory.deploy(hre.ethers.constants.AddressZero)).to.be.revertedWith(
          'DapiServer address zero'
        );
      });
    });
  });

  describe('deployDataFeedProxy', function () {
    context('Data feed ID is not zero', function () {
      it('deploys data feed proxy', async function () {
        // Precompute the proxy address
        const DataFeedProxy = await hre.artifacts.readArtifact('DataFeedProxy');
        const initcode = hre.ethers.utils.solidityPack(
          ['bytes', 'bytes'],
          [
            DataFeedProxy.bytecode,
            hre.ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [dapiServer.address, beaconId]),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = hre.ethers.utils.getCreate2Address(
          proxyFactory.address,
          hre.ethers.utils.keccak256(metadata),
          hre.ethers.utils.keccak256(initcode)
        );

        // Can only deploy once
        await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata))
          .to.emit(proxyFactory, 'DeployedDataFeedProxy')
          .withArgs(proxyAddress, beaconId, metadata);
        // Subsequent deployments will revert with no string
        await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata)).to.be.reverted;

        // Confirm that the bytecode is the same
        const dataFeedProxyFactory = await hre.ethers.getContractFactory('DataFeedProxy', roles.deployer);
        const eoaDeployedDataFeedProxy = await dataFeedProxyFactory.deploy(dapiServer.address, beaconId);
        expect(await hre.ethers.provider.getCode(proxyAddress)).to.equal(
          await hre.ethers.provider.getCode(eoaDeployedDataFeedProxy.address)
        );

        // Test the deployed contract
        const dataFeedProxy = new hre.ethers.Contract(proxyAddress, DataFeedProxy.abi, hre.ethers.provider);
        expect(await dataFeedProxy.dapiServer()).to.equal(dapiServer.address);
        expect(await dataFeedProxy.dataFeedId()).to.equal(beaconId);
        const beacon = await dataFeedProxy.read();
        expect(beacon.value).to.equal(beaconValue);
        expect(beacon.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.deployDataFeedProxy(hre.ethers.constants.HashZero, metadata)).to.be.revertedWith(
          'Data feed ID zero'
        );
      });
    });
  });

  describe('deployDapiProxy', function () {
    context('dAPI name is not zero', function () {
      it('deploys dAPI proxy', async function () {
        // Precompute the proxy address
        const DapiProxy = await hre.artifacts.readArtifact('DapiProxy');
        const initcode = hre.ethers.utils.solidityPack(
          ['bytes', 'bytes'],
          [
            DapiProxy.bytecode,
            hre.ethers.utils.defaultAbiCoder.encode(['address', 'bytes32'], [dapiServer.address, dapiNameHash]),
          ]
        );
        // metadata includes information like coverage policy ID, etc.
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = hre.ethers.utils.getCreate2Address(
          proxyFactory.address,
          hre.ethers.utils.keccak256(metadata),
          hre.ethers.utils.keccak256(initcode)
        );

        // Can only deploy once
        await expect(proxyFactory.deployDapiProxy(dapiName, metadata))
          .to.emit(proxyFactory, 'DeployedDapiProxy')
          .withArgs(proxyAddress, dapiName, metadata);
        // Subsequent deployments will revert with no string
        await expect(proxyFactory.deployDapiProxy(dapiName, metadata)).to.be.reverted;

        // Confirm that the bytecode is the same
        const dapiProxyFactory = await hre.ethers.getContractFactory('DapiProxy', roles.deployer);
        const eoaDeployedDapiProxy = await dapiProxyFactory.deploy(dapiServer.address, dapiNameHash);
        expect(await hre.ethers.provider.getCode(proxyAddress)).to.equal(
          await hre.ethers.provider.getCode(eoaDeployedDapiProxy.address)
        );

        // Test the deployed contract
        const dapiProxy = new hre.ethers.Contract(proxyAddress, DapiProxy.abi, hre.ethers.provider);
        expect(await dapiProxy.dapiServer()).to.equal(dapiServer.address);
        expect(await dapiProxy.dapiNameHash()).to.equal(hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]));
        const dapi = await dapiProxy.read();
        expect(dapi.value).to.equal(beaconValue);
        expect(dapi.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const metadata = testUtils.generateRandomBytes();
        await expect(proxyFactory.deployDapiProxy(hre.ethers.constants.HashZero, metadata)).to.be.revertedWith(
          'dAPI name zero'
        );
      });
    });
  });

  describe('deployDataFeedProxyWithOev', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('deploys data feed proxy', async function () {
          // Precompute the proxy address
          const DataFeedProxyWithOev = await hre.artifacts.readArtifact('DataFeedProxyWithOev');
          const initcode = hre.ethers.utils.solidityPack(
            ['bytes', 'bytes'],
            [
              DataFeedProxyWithOev.bytecode,
              hre.ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32', 'address'],
                [dapiServer.address, beaconId, roles.oevBeneficiary.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = hre.ethers.utils.getCreate2Address(
            proxyFactory.address,
            hre.ethers.utils.keccak256(metadata),
            hre.ethers.utils.keccak256(initcode)
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
          const dataFeedProxyFactory = await hre.ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
          const eoaDeployedDataFeedProxyWithOev = await dataFeedProxyFactory.deploy(
            dapiServer.address,
            beaconId,
            roles.oevBeneficiary.address
          );
          expect(await hre.ethers.provider.getCode(proxyAddress)).to.equal(
            await hre.ethers.provider.getCode(eoaDeployedDataFeedProxyWithOev.address)
          );

          // Test the deployed contract
          const dataFeedProxyWithOev = new hre.ethers.Contract(
            proxyAddress,
            DataFeedProxyWithOev.abi,
            hre.ethers.provider
          );
          expect(await dataFeedProxyWithOev.dapiServer()).to.equal(dapiServer.address);
          expect(await dataFeedProxyWithOev.dataFeedId()).to.equal(beaconId);
          expect(await dataFeedProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
          const beacon = await dataFeedProxyWithOev.read();
          expect(beacon.value).to.equal(beaconValue);
          expect(beacon.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.deployDataFeedProxyWithOev(beaconId, hre.ethers.constants.AddressZero, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.deployDataFeedProxyWithOev(hre.ethers.constants.HashZero, roles.oevBeneficiary.address, metadata)
        ).to.be.revertedWith('Data feed ID zero');
      });
    });
  });

  describe('deployDapiProxyWithOev', function () {
    context('Data feed ID is not zero', function () {
      context('OEV beneficiary is not zero', function () {
        it('deploys data feed proxy', async function () {
          // Precompute the proxy address
          const DapiProxyWithOev = await hre.artifacts.readArtifact('DapiProxyWithOev');
          const initcode = hre.ethers.utils.solidityPack(
            ['bytes', 'bytes'],
            [
              DapiProxyWithOev.bytecode,
              hre.ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32', 'address'],
                [dapiServer.address, dapiNameHash, roles.oevBeneficiary.address]
              ),
            ]
          );
          // metadata includes information like coverage policy ID, etc.
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = hre.ethers.utils.getCreate2Address(
            proxyFactory.address,
            hre.ethers.utils.keccak256(metadata),
            hre.ethers.utils.keccak256(initcode)
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
          const dataFeedProxyFactory = await hre.ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
          const eoaDeployedDapiProxyWithOev = await dataFeedProxyFactory.deploy(
            dapiServer.address,
            dapiNameHash,
            roles.oevBeneficiary.address
          );
          expect(await hre.ethers.provider.getCode(proxyAddress)).to.equal(
            await hre.ethers.provider.getCode(eoaDeployedDapiProxyWithOev.address)
          );

          // Test the deployed contract
          const dapiProxyWithOev = new hre.ethers.Contract(proxyAddress, DapiProxyWithOev.abi, hre.ethers.provider);
          expect(await dapiProxyWithOev.dapiServer()).to.equal(dapiServer.address);
          expect(await dapiProxyWithOev.dapiNameHash()).to.equal(
            hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName])
          );
          expect(await dapiProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
          const dapi = await dapiProxyWithOev.read();
          expect(dapi.value).to.equal(beaconValue);
          expect(dapi.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('OEV beneficiary is zero', function () {
        it('reverts', async function () {
          const metadata = testUtils.generateRandomBytes();
          await expect(
            proxyFactory.deployDapiProxyWithOev(beaconId, hre.ethers.constants.AddressZero, metadata)
          ).to.be.revertedWith('OEV beneficiary zero');
        });
      });
    });
    context('Data feed ID is zero', function () {
      it('reverts', async function () {
        const metadata = testUtils.generateRandomBytes();
        await expect(
          proxyFactory.deployDapiProxyWithOev(hre.ethers.constants.HashZero, roles.oevBeneficiary.address, metadata)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });
});
