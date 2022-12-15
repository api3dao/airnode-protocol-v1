const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('ProxyFactory2', function () {
  let roles;
  let proxyFactory, dapiServer;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let beaconId, beaconValue, beaconTimestamp;
  const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');

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

    const proxyFactoryFactory = await hre.ethers.getContractFactory('ProxyFactory2', roles.deployer);
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
        const proxyFactoryFactory = await hre.ethers.getContractFactory('ProxyFactory2', roles.deployer);
        await expect(proxyFactoryFactory.deploy(hre.ethers.constants.AddressZero)).to.be.revertedWith(
          'DapiServer address zero'
        );
      });
    });
  });

  describe('deployDataFeedProxy', function () {
    context('Data feed ID is not zero', function () {
      it('deploys data feed proxy', async function () {
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = await proxyFactory.callStatic.deployDataFeedProxy(beaconId, metadata);

        await expect(proxyFactory.deployDataFeedProxy(beaconId, metadata))
          .to.emit(proxyFactory, 'DeployedDataFeedProxy')
          .withArgs(proxyAddress, beaconId, metadata);

        const DataFeedProxy = await hre.artifacts.readArtifact('DataFeedProxy');
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
        const metadata = testUtils.generateRandomBytes();
        const proxyAddress = await proxyFactory.callStatic.deployDapiProxy(dapiName, metadata);

        await expect(proxyFactory.deployDapiProxy(dapiName, metadata))
          .to.emit(proxyFactory, 'DeployedDapiProxy')
          .withArgs(proxyAddress, dapiName, metadata);

        const DapiProxy = await hre.artifacts.readArtifact('DapiProxy');
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
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = await proxyFactory.callStatic.deployDataFeedProxyWithOev(
            beaconId,
            roles.oevBeneficiary.address,
            metadata
          );

          await expect(proxyFactory.deployDataFeedProxyWithOev(beaconId, roles.oevBeneficiary.address, metadata))
            .to.emit(proxyFactory, 'DeployedDataFeedProxyWithOev')
            .withArgs(proxyAddress, beaconId, roles.oevBeneficiary.address, metadata);

          const DataFeedProxyWithOev = await hre.artifacts.readArtifact('DataFeedProxyWithOev');
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
          const metadata = testUtils.generateRandomBytes();
          const proxyAddress = await proxyFactory.callStatic.deployDapiProxyWithOev(
            dapiName,
            roles.oevBeneficiary.address,
            metadata
          );

          await expect(proxyFactory.deployDapiProxyWithOev(dapiName, roles.oevBeneficiary.address, metadata))
            .to.emit(proxyFactory, 'DeployedDapiProxyWithOev')
            .withArgs(proxyAddress, dapiName, roles.oevBeneficiary.address, metadata);

          const DapiProxyWithOev = await hre.artifacts.readArtifact('DapiProxyWithOev');
          const dapiProxyWithOev = new hre.ethers.Contract(proxyAddress, DapiProxyWithOev.abi, hre.ethers.provider);
          expect(await dapiProxyWithOev.dapiServer()).to.equal(dapiServer.address);
          expect(await dapiProxyWithOev.dapiNameHash()).to.equal(
            hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName])
          );
          expect(await dapiProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
          const dapi = await dapiProxyWithOev.read();
          expect(dapi.value).to.equal(beaconValue);
          expect(dapi.timestamp).to.equal(beaconTimestamp);
          console.log(await dapiProxyWithOev.estimateGas.read());
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
