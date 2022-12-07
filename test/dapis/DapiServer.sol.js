const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('DapiServer', function () {
  let roles;
  let accessControlRegistry, airnodeProtocol, dapiServer;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let dapiNameSetterRole;
  let airnodeAddress, airnodeWallet, relayerAddress;
  let airnodeRrpSponsorWallet, airnodePspSponsorWallet, relayerRrpSponsorWallet, relayerPspSponsorWallet;
  let endpointId, parameters, templateId, beaconSetTemplateIds;
  let beaconId;
  let beaconUpdateSubscriptionId,
    beaconUpdateSubscriptionRelayedId,
    beaconUpdateSubscriptionConditionParameters,
    beaconUpdateSubscriptionConditions;
  let beaconSetBeaconIds = [],
    beaconSetId;
  let beaconSetUpdateSubscriptionId,
    beaconSetUpdateSubscriptionRelayedId,
    beaconSetUpdateSubscriptionConditionParameters;

  async function deployContracts() {
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    accessControlRegistry = await accessControlRegistryFactory.deploy();
    const airnodeProtocolFactory = await hre.ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    airnodeProtocol = await airnodeProtocolFactory.deploy();
    const dapiServerFactory = await hre.ethers.getContractFactory('DapiServer', roles.deployer);
    dapiServer = await dapiServerFactory.deploy(
      accessControlRegistry.address,
      dapiServerAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );
  }

  async function setUpRoles() {
    const managerRootRole = await accessControlRegistry.deriveRootRole(roles.manager.address);
    // Initialize the roles and grant them to respective accounts
    const adminRole = await dapiServer.adminRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, dapiServerAdminRoleDescription);
    dapiNameSetterRole = await dapiServer.dapiNameSetterRole();
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, await dapiServer.DAPI_NAME_SETTER_ROLE_DESCRIPTION());
    await accessControlRegistry.connect(roles.manager).grantRole(dapiNameSetterRole, roles.dapiNameSetter.address);
    await dapiServer.connect(roles.sponsor).setRrpBeaconUpdatePermissionStatus(roles.updateRequester.address, true);
  }

  async function setUpSponsorWallets() {
    let airnodeMnemonic;
    ({ airnodeAddress, airnodeMnemonic } = testUtils.generateRandomAirnodeWallet());
    airnodeWallet = hre.ethers.Wallet.fromMnemonic(airnodeMnemonic, "m/44'/60'/0'/0/0");
    const relayerData = testUtils.generateRandomAirnodeWallet();
    relayerAddress = relayerData.airnodeAddress;
    const relayerMnemonic = relayerData.airnodeMnemonic;
    airnodeRrpSponsorWallet = testUtils
      .deriveSponsorWallet(airnodeMnemonic, roles.sponsor.address, 1)
      .connect(hre.ethers.provider);
    relayerRrpSponsorWallet = testUtils
      .deriveSponsorWallet(relayerMnemonic, roles.sponsor.address, 2)
      .connect(hre.ethers.provider);
    airnodePspSponsorWallet = testUtils
      .deriveSponsorWallet(airnodeMnemonic, roles.sponsor.address, 3)
      .connect(hre.ethers.provider);
    relayerPspSponsorWallet = testUtils
      .deriveSponsorWallet(relayerMnemonic, roles.sponsor.address, 4)
      .connect(hre.ethers.provider);
    await roles.deployer.sendTransaction({
      to: airnodeRrpSponsorWallet.address,
      value: hre.ethers.utils.parseEther('1'),
    });
    await roles.deployer.sendTransaction({
      to: relayerRrpSponsorWallet.address,
      value: hre.ethers.utils.parseEther('1'),
    });
    await roles.deployer.sendTransaction({
      to: airnodePspSponsorWallet.address,
      value: hre.ethers.utils.parseEther('1'),
    });
    await roles.deployer.sendTransaction({
      to: relayerPspSponsorWallet.address,
      value: hre.ethers.utils.parseEther('1'),
    });
  }

  async function setUpTemplate() {
    endpointId = testUtils.generateRandomBytes32();
    parameters = testUtils.generateRandomBytes();
    templateId = hre.ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointId, parameters]);
    beaconSetTemplateIds = [
      testUtils.generateRandomBytes32(),
      testUtils.generateRandomBytes32(),
      testUtils.generateRandomBytes32(),
    ];
  }

  async function setUpBeacon() {
    beaconId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeAddress, templateId])
    );
    // Deviation threshold is 10% and heartbeat interval is 1 day
    beaconUpdateSubscriptionConditionParameters = hre.ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'int224', 'uint256'],
      [(await dapiServer.HUNDRED_PERCENT()).div(10), 0, 24 * 60 * 60]
    );
    // Create Beacon update conditions using Airnode ABI
    beaconUpdateSubscriptionConditions = hre.ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'bytes32', 'address', 'bytes32', 'bytes32', 'bytes32', 'bytes'],
      [
        hre.ethers.utils.formatBytes32String('1uabB'),
        hre.ethers.utils.formatBytes32String('_conditionChainId'),
        (await hre.ethers.provider.getNetwork()).chainId,
        hre.ethers.utils.formatBytes32String('_conditionAddress'),
        dapiServer.address,
        hre.ethers.utils.formatBytes32String('_conditionFunctionId'),
        hre.ethers.utils.defaultAbiCoder.encode(
          ['bytes4'],
          [dapiServer.interface.getSighash('conditionPspBeaconUpdate')]
        ),
        hre.ethers.utils.formatBytes32String('_conditionParameters'),
        beaconUpdateSubscriptionConditionParameters,
      ]
    );
    // Register the Beacon update subscription
    beaconUpdateSubscriptionId = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'bytes32', 'bytes', 'bytes', 'address', 'address', 'address', 'bytes4'],
        [
          (await hre.ethers.provider.getNetwork()).chainId,
          airnodeAddress,
          templateId,
          '0x',
          beaconUpdateSubscriptionConditions,
          airnodeAddress,
          roles.sponsor.address,
          dapiServer.address,
          dapiServer.interface.getSighash('fulfillPspBeaconUpdate'),
        ]
      )
    );
    await dapiServer
      .connect(roles.randomPerson)
      .registerBeaconUpdateSubscription(
        airnodeAddress,
        templateId,
        beaconUpdateSubscriptionConditions,
        airnodeAddress,
        roles.sponsor.address
      );
    // Register the relayed Beacon update subscription
    beaconUpdateSubscriptionRelayedId = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'bytes32', 'bytes', 'bytes', 'address', 'address', 'address', 'bytes4'],
        [
          (await hre.ethers.provider.getNetwork()).chainId,
          airnodeAddress,
          templateId,
          '0x',
          beaconUpdateSubscriptionConditions,
          relayerAddress,
          roles.sponsor.address,
          dapiServer.address,
          dapiServer.interface.getSighash('fulfillPspBeaconUpdate'),
        ]
      )
    );
    await dapiServer
      .connect(roles.randomPerson)
      .registerBeaconUpdateSubscription(
        airnodeAddress,
        templateId,
        beaconUpdateSubscriptionConditions,
        relayerAddress,
        roles.sponsor.address
      );
  }

  async function setUpBeaconSet() {
    for (let ind = 0; ind < 3; ind++) {
      const beaconSetBeaconId = hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeAddress, beaconSetTemplateIds[ind]])
      );
      beaconSetBeaconIds[ind] = beaconSetBeaconId;
    }
    beaconSetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds])
    );
    // Deviation threshold is 5% and heartbeat interval is 2 days
    beaconSetUpdateSubscriptionConditionParameters = hre.ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'int224', 'uint256'],
      [(await dapiServer.HUNDRED_PERCENT()).div(20), 0, 2 * 24 * 60 * 60]
    );
    // Create Beacon set update conditions using Airnode ABI
    const beaconSetUpdateSubscriptionConditions = hre.ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'bytes32', 'address', 'bytes32', 'bytes32', 'bytes32', 'bytes'],
      [
        hre.ethers.utils.formatBytes32String('1uabB'),
        hre.ethers.utils.formatBytes32String('_conditionChainId'),
        (await hre.ethers.provider.getNetwork()).chainId,
        hre.ethers.utils.formatBytes32String('_conditionAddress'),
        dapiServer.address,
        hre.ethers.utils.formatBytes32String('_conditionFunctionId'),
        hre.ethers.utils.defaultAbiCoder.encode(
          ['bytes4'],
          [dapiServer.interface.getSighash('conditionPspBeaconSetUpdate')]
        ),
        hre.ethers.utils.formatBytes32String('_conditionParameters'),
        beaconSetUpdateSubscriptionConditionParameters,
      ]
    );
    // Create the Beacon set update template
    const beaconSetUpdateTemplateId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['bytes32', 'bytes'], [hre.ethers.constants.HashZero, '0x'])
    );
    // Calculate the Beacon set update subscription ID
    const beaconSetUpdateParameters = hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]);
    beaconSetUpdateSubscriptionId = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'bytes32', 'bytes', 'bytes', 'address', 'address', 'address', 'bytes4'],
        [
          (await hre.ethers.provider.getNetwork()).chainId,
          airnodeAddress,
          beaconSetUpdateTemplateId,
          beaconSetUpdateParameters,
          beaconSetUpdateSubscriptionConditions,
          airnodeAddress,
          roles.sponsor.address,
          dapiServer.address,
          dapiServer.interface.getSighash('fulfillPspBeaconSetUpdate'),
        ]
      )
    );
    beaconSetUpdateSubscriptionRelayedId = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'bytes32', 'bytes', 'bytes', 'address', 'address', 'address', 'bytes4'],
        [
          (await hre.ethers.provider.getNetwork()).chainId,
          airnodeAddress,
          beaconSetUpdateTemplateId,
          beaconSetUpdateParameters,
          beaconSetUpdateSubscriptionConditionParameters,
          relayerAddress,
          roles.sponsor.address,
          dapiServer.address,
          dapiServer.interface.getSighash('fulfillPspBeaconSetUpdate'),
        ]
      )
    );
  }

  function encodeData(decodedData) {
    return hre.ethers.utils.defaultAbiCoder.encode(['int256'], [decodedData]);
  }

  async function encodeAndSignFulfillment(decodedData, requestOrSubscriptionId, timestamp, sponsorWalletAddress) {
    const signature = await airnodeWallet.signMessage(
      hre.ethers.utils.arrayify(
        hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(
            ['bytes32', 'uint256', 'address'],
            [requestOrSubscriptionId, timestamp, sponsorWalletAddress]
          )
        )
      )
    );
    return [encodeData(decodedData), signature];
  }

  async function encodeAndSignFulfillmentRelayed(
    decodedData,
    requestOrSubscriptionId,
    timestamp,
    sponsorWalletAddress
  ) {
    const data = encodeData(decodedData);
    const signature = await airnodeWallet.signMessage(
      hre.ethers.utils.arrayify(
        hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(
            ['bytes32', 'uint256', 'address', 'bytes'],
            [requestOrSubscriptionId, timestamp, sponsorWalletAddress, data]
          )
        )
      )
    );
    return [data, signature];
  }

  async function encodeAndSignData(decodedData, requestHash, timestamp) {
    const data = encodeData(decodedData);
    const signature = await airnodeWallet.signMessage(
      hre.ethers.utils.arrayify(
        hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [requestHash, timestamp, data])
        )
      )
    );
    return [data, signature];
  }

  async function encodeAndDomainSignData(decodedData, templateId, timestamp) {
    const data = encodeData(decodedData);
    const signature = await airnodeWallet.signMessage(
      hre.ethers.utils.arrayify(
        hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'bytes32', 'uint256', 'bytes'],
            [(await hre.ethers.provider.getNetwork()).chainId, dapiServer.address, templateId, timestamp, data]
          )
        )
      )
    );
    return [data, signature];
  }

  async function deriveRegularRequestId() {
    return hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'bytes4'],
        [
          (await hre.ethers.provider.getNetwork()).chainId,
          airnodeProtocol.address,
          dapiServer.address,
          (await airnodeProtocol.requesterToRequestCount(dapiServer.address)).add(1),
          airnodeAddress,
          templateId,
          '0x',
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
        ]
      )
    );
  }

  async function deriveRelayedRequestId() {
    return hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(
        ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'address', 'bytes4'],
        [
          (await hre.ethers.provider.getNetwork()).chainId,
          airnodeProtocol.address,
          dapiServer.address,
          (await airnodeProtocol.requesterToRequestCount(dapiServer.address)).add(1),
          airnodeAddress,
          templateId,
          '0x',
          relayerAddress,
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
        ]
      )
    );
  }

  async function setBeacon(templateId, decodedData, timestamp) {
    const [data, signature] = await encodeAndSignData(decodedData, templateId, timestamp);
    await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
    await dapiServer
      .connect(roles.randomPerson)
      .updateBeaconWithSignedData(airnodeAddress, templateId, timestamp, data, signature);
  }

  async function setBeaconSet(airnodeAddress, templateIds, decodedData, timestamps) {
    const dataArray = [];
    const signatureArray = [];
    for (let ind = 0; ind < decodedData.length; ind++) {
      const [data, signature] = await encodeAndSignData(decodedData[ind], beaconSetTemplateIds[ind], timestamps[ind]);
      dataArray.push(data);
      signatureArray.push(signature);
    }
    await hre.ethers.provider.send('evm_setNextBlockTimestamp', [Math.max(...timestamps)]);
    await dapiServer.updateBeaconSetWithSignedData(
      Array(3).fill(airnodeAddress),
      templateIds,
      timestamps,
      dataArray,
      signatureArray
    );
  }

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      unlimitedReader: accounts[2],
      dapiNameSetter: accounts[3],
      sponsor: accounts[4],
      updateRequester: accounts[5],
      beaconReader: accounts[6],
      oevProxy: accounts[7],
      randomPerson: accounts[9],
    };
    await deployContracts();
    await setUpRoles();
    await setUpSponsorWallets();
    await setUpTemplate();
    await setUpBeacon();
    await setUpBeaconSet();
  });

  describe('constructor', function () {
    context('AirnodeProtocol address is not zero', function () {
      it('constructs', async function () {
        expect(await dapiServer.DAPI_NAME_SETTER_ROLE_DESCRIPTION()).to.equal('dAPI name setter');
        expect(await dapiServer.HUNDRED_PERCENT()).to.equal(Math.pow(10, 8));
        expect(await dapiServer.accessControlRegistry()).to.equal(accessControlRegistry.address);
        expect(await dapiServer.adminRoleDescription()).to.equal(dapiServerAdminRoleDescription);
        expect(await dapiServer.manager()).to.equal(roles.manager.address);
        expect(await dapiServer.airnodeProtocol()).to.equal(airnodeProtocol.address);
        expect(await dapiServer.dapiNameSetterRole()).to.equal(dapiNameSetterRole);
      });
    });
    context('AirnodeProtocol address is zero', function () {
      it('reverts', async function () {
        const dapiServerFactory = await hre.ethers.getContractFactory('DapiServer', roles.deployer);
        await expect(
          dapiServerFactory.deploy(
            accessControlRegistry.address,
            dapiServerAdminRoleDescription,
            roles.manager.address,
            hre.ethers.constants.AddressZero
          )
        ).to.be.revertedWith('AirnodeProtocol address zero');
      });
    });
  });

  describe('setRrpBeaconUpdatePermissionStatus', function () {
    context('Update requester is not zero address', function () {
      it('sets RRP-based beacon update permission status', async function () {
        expect(
          await dapiServer.sponsorToRrpBeaconUpdateRequesterToPermissionStatus(
            roles.sponsor.address,
            roles.randomPerson.address
          )
        ).to.equal(false);
        await expect(
          dapiServer.connect(roles.sponsor).setRrpBeaconUpdatePermissionStatus(roles.randomPerson.address, true)
        )
          .to.emit(dapiServer, 'SetRrpBeaconUpdatePermissionStatus')
          .withArgs(roles.sponsor.address, roles.randomPerson.address, true);
        expect(
          await dapiServer.sponsorToRrpBeaconUpdateRequesterToPermissionStatus(
            roles.sponsor.address,
            roles.randomPerson.address
          )
        ).to.equal(true);
        await expect(
          dapiServer.connect(roles.sponsor).setRrpBeaconUpdatePermissionStatus(roles.randomPerson.address, false)
        )
          .to.emit(dapiServer, 'SetRrpBeaconUpdatePermissionStatus')
          .withArgs(roles.sponsor.address, roles.randomPerson.address, false);
        expect(
          await dapiServer.sponsorToRrpBeaconUpdateRequesterToPermissionStatus(
            roles.sponsor.address,
            roles.randomPerson.address
          )
        ).to.equal(false);
      });
    });
    context('Update requester is zero address', function () {
      it('reverts', async function () {
        await expect(
          dapiServer.connect(roles.sponsor).setRrpBeaconUpdatePermissionStatus(hre.ethers.constants.AddressZero, false)
        ).to.be.revertedWith('Update requester zero');
      });
    });
  });

  describe('requestRrpBeaconUpdateWithTemplate', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = await deriveRegularRequestId();
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address)
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address)
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(beaconId, roles.sponsor.address, roles.sponsor.address, requestId, airnodeAddress, templateId);
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = await deriveRegularRequestId();
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address)
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address)
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(
            beaconId,
            roles.sponsor.address,
            roles.updateRequester.address,
            requestId,
            airnodeAddress,
            templateId
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address)
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('requestRrpBeaconUpdateWithEndpoint', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'bytes4'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              airnodeProtocol.address,
              dapiServer.address,
              (await airnodeProtocol.requesterToRequestCount(dapiServer.address)).add(1),
              airnodeAddress,
              endpointId,
              parameters,
              roles.sponsor.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
            ]
          )
        );
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRrpBeaconUpdateWithEndpoint(
              airnodeAddress,
              endpointId,
              parameters,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithEndpoint(airnodeAddress, endpointId, parameters, roles.sponsor.address)
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(beaconId, roles.sponsor.address, roles.sponsor.address, requestId, airnodeAddress, templateId);
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'bytes4'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              airnodeProtocol.address,
              dapiServer.address,
              (await airnodeProtocol.requesterToRequestCount(dapiServer.address)).add(1),
              airnodeAddress,
              endpointId,
              parameters,
              roles.sponsor.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
            ]
          )
        );
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRrpBeaconUpdateWithEndpoint(
              airnodeAddress,
              endpointId,
              parameters,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithEndpoint(airnodeAddress, endpointId, parameters, roles.sponsor.address)
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(
            beaconId,
            roles.sponsor.address,
            roles.updateRequester.address,
            requestId,
            airnodeAddress,
            templateId
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRrpBeaconUpdateWithEndpoint(airnodeAddress, endpointId, parameters, roles.sponsor.address)
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('requestRelayedRrpBeaconUpdateWithTemplate', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = await deriveRelayedRequestId();
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRelayedRrpBeaconUpdateWithTemplate(
              airnodeAddress,
              templateId,
              relayerAddress,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              airnodeAddress,
              templateId,
              relayerAddress,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beaconId,
            roles.sponsor.address,
            roles.sponsor.address,
            requestId,
            airnodeAddress,
            relayerAddress,
            templateId
          );
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = await deriveRelayedRequestId();
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRelayedRrpBeaconUpdateWithTemplate(
              airnodeAddress,
              templateId,
              relayerAddress,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              airnodeAddress,
              templateId,
              relayerAddress,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beaconId,
            roles.sponsor.address,
            roles.updateRequester.address,
            requestId,
            airnodeAddress,
            relayerAddress,
            templateId
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              airnodeAddress,
              templateId,
              relayerAddress,
              roles.sponsor.address
            )
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('requestRelayedRrpBeaconUpdateWithEndpoint', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'address', 'bytes4'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              airnodeProtocol.address,
              dapiServer.address,
              (await airnodeProtocol.requesterToRequestCount(dapiServer.address)).add(1),
              airnodeAddress,
              endpointId,
              parameters,
              relayerAddress,
              roles.sponsor.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
            ]
          )
        );
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRelayedRrpBeaconUpdateWithEndpoint(
              airnodeAddress,
              endpointId,
              parameters,
              relayerAddress,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              airnodeAddress,
              endpointId,
              parameters,
              relayerAddress,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beaconId,
            roles.sponsor.address,
            roles.sponsor.address,
            requestId,
            airnodeAddress,
            relayerAddress,
            templateId
          );
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const requestId = hre.ethers.utils.keccak256(
          hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'address', 'bytes32', 'bytes', 'address', 'address', 'bytes4'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              airnodeProtocol.address,
              dapiServer.address,
              (await airnodeProtocol.requesterToRequestCount(dapiServer.address)).add(1),
              airnodeAddress,
              endpointId,
              parameters,
              relayerAddress,
              roles.sponsor.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
            ]
          )
        );
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRelayedRrpBeaconUpdateWithEndpoint(
              airnodeAddress,
              endpointId,
              parameters,
              relayerAddress,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              airnodeAddress,
              endpointId,
              parameters,
              relayerAddress,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beaconId,
            roles.sponsor.address,
            roles.updateRequester.address,
            requestId,
            airnodeAddress,
            relayerAddress,
            templateId
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              airnodeAddress,
              endpointId,
              parameters,
              relayerAddress,
              roles.sponsor.address
            )
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('fulfillRrpBeaconUpdate', function () {
    context('Sender is AirnodeProtocol', function () {
      context('Timestamp is valid', function () {
        context('Encoded data length is correct', function () {
          context('Data is typecast successfully', function () {
            context('Data is fresher than Beacon', function () {
              context('Request is regular', function () {
                it('updates Beacon', async function () {
                  const initialBeacon = await dapiServer.dataFeeds(beaconId);
                  expect(initialBeacon.value).to.equal(0);
                  expect(initialBeacon.timestamp).to.equal(0);
                  const requestId = await deriveRegularRequestId();
                  await dapiServer
                    .connect(roles.updateRequester)
                    .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
                  const decodedData = 123;
                  const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                  const [data, signature] = await encodeAndSignFulfillment(
                    decodedData,
                    requestId,
                    timestamp,
                    airnodeRrpSponsorWallet.address
                  );
                  await expect(
                    airnodeProtocol
                      .connect(airnodeRrpSponsorWallet)
                      .fulfillRequest(
                        requestId,
                        airnodeAddress,
                        dapiServer.address,
                        dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithRrp')
                    .withArgs(beaconId, requestId, decodedData, timestamp);
                  const beacon = await dapiServer.dataFeeds(beaconId);
                  expect(beacon.value).to.equal(decodedData);
                  expect(beacon.timestamp).to.equal(timestamp);
                });
              });
              context('Request is relayed', function () {
                it('updates Beacon', async function () {
                  const initialBeacon = await dapiServer.dataFeeds(beaconId);
                  expect(initialBeacon.value).to.equal(0);
                  expect(initialBeacon.timestamp).to.equal(0);
                  const requestId = await deriveRelayedRequestId();
                  await dapiServer
                    .connect(roles.updateRequester)
                    .requestRelayedRrpBeaconUpdateWithTemplate(
                      airnodeAddress,
                      templateId,
                      relayerAddress,
                      roles.sponsor.address
                    );
                  const decodedData = 123;
                  const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                  const [data, signature] = await encodeAndSignFulfillmentRelayed(
                    decodedData,
                    requestId,
                    timestamp,
                    relayerRrpSponsorWallet.address
                  );
                  await expect(
                    airnodeProtocol
                      .connect(relayerRrpSponsorWallet)
                      .fulfillRequestRelayed(
                        requestId,
                        airnodeAddress,
                        dapiServer.address,
                        relayerAddress,
                        dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithRrp')
                    .withArgs(beaconId, requestId, decodedData, timestamp);
                  const beacon = await dapiServer.dataFeeds(beaconId);
                  expect(beacon.value).to.equal(decodedData);
                  expect(beacon.timestamp).to.equal(timestamp);
                });
              });
            });
            context('Data is not fresher than Beacon', function () {
              it('does not update Beacon', async function () {
                const initialTimestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                const requestId = await deriveRegularRequestId();
                await dapiServer
                  .connect(roles.updateRequester)
                  .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
                const [data, signature] = await encodeAndSignFulfillment(
                  456,
                  requestId,
                  initialTimestamp,
                  airnodeRrpSponsorWallet.address
                );
                const futureTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                await setBeacon(templateId, 123, futureTimestamp);
                const staticCallResult = await airnodeProtocol
                  .connect(airnodeRrpSponsorWallet)
                  .callStatic.fulfillRequest(
                    requestId,
                    airnodeAddress,
                    dapiServer.address,
                    dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                    initialTimestamp,
                    data,
                    signature,
                    { gasLimit: 500000 }
                  );
                expect(staticCallResult.callSuccess).to.equal(false);
                expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal(
                  'Fulfillment older than Beacon'
                );
                await expect(
                  airnodeProtocol
                    .connect(airnodeRrpSponsorWallet)
                    .fulfillRequest(
                      requestId,
                      airnodeAddress,
                      dapiServer.address,
                      dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                      initialTimestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
                const beacon = await dapiServer.dataFeeds(beaconId);
                expect(beacon.value).to.equal(123);
                expect(beacon.timestamp).to.equal(futureTimestamp);
              });
            });
          });
          context('Data is not typecast successfully', function () {
            context('Data larger than maximum int224', function () {
              it('does not update Beacon', async function () {
                const requestId = await deriveRegularRequestId();
                await dapiServer
                  .connect(roles.updateRequester)
                  .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
                const largeDecodedData = hre.ethers.BigNumber.from(2).pow(223);
                const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                const [data, signature] = await encodeAndSignFulfillment(
                  largeDecodedData,
                  requestId,
                  timestamp,
                  airnodeRrpSponsorWallet.address
                );
                const staticCallResult = await airnodeProtocol
                  .connect(airnodeRrpSponsorWallet)
                  .callStatic.fulfillRequest(
                    requestId,
                    airnodeAddress,
                    dapiServer.address,
                    dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                    timestamp,
                    data,
                    signature,
                    { gasLimit: 500000 }
                  );
                expect(staticCallResult.callSuccess).to.equal(false);
                expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Value typecasting error');
                await expect(
                  airnodeProtocol
                    .connect(airnodeRrpSponsorWallet)
                    .fulfillRequest(
                      requestId,
                      airnodeAddress,
                      dapiServer.address,
                      dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
                const beacon = await dapiServer.dataFeeds(beaconId);
                expect(beacon.value).to.equal(0);
                expect(beacon.timestamp).to.equal(0);
              });
            });
            context('Data smaller than minimum int224', function () {
              it('does not update Beacon', async function () {
                const requestId = await deriveRegularRequestId();
                await dapiServer
                  .connect(roles.updateRequester)
                  .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
                const smallDecodedData = hre.ethers.BigNumber.from(2).pow(223).add(1).mul(-1);
                const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                const [data, signature] = await encodeAndSignFulfillment(
                  smallDecodedData,
                  requestId,
                  timestamp,
                  airnodeRrpSponsorWallet.address
                );
                const staticCallResult = await airnodeProtocol
                  .connect(airnodeRrpSponsorWallet)
                  .callStatic.fulfillRequest(
                    requestId,
                    airnodeAddress,
                    dapiServer.address,
                    dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                    timestamp,
                    data,
                    signature,
                    { gasLimit: 500000 }
                  );
                expect(staticCallResult.callSuccess).to.equal(false);
                expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Value typecasting error');
                await expect(
                  airnodeProtocol
                    .connect(airnodeRrpSponsorWallet)
                    .fulfillRequest(
                      requestId,
                      airnodeAddress,
                      dapiServer.address,
                      dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
                const beacon = await dapiServer.dataFeeds(beaconId);
                expect(beacon.value).to.equal(0);
                expect(beacon.timestamp).to.equal(0);
              });
            });
          });
        });
        context('Encoded data length is too long', function () {
          it('does not update Beacon', async function () {
            const requestId = await deriveRegularRequestId();
            await dapiServer
              .connect(roles.updateRequester)
              .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
            const decodedData = 123;
            const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
            const [data, signature] = await encodeAndSignFulfillment(
              decodedData,
              requestId,
              timestamp,
              airnodeRrpSponsorWallet.address
            );
            const longData = data + '00';
            const staticCallResult = await airnodeProtocol
              .connect(airnodeRrpSponsorWallet)
              .callStatic.fulfillRequest(
                requestId,
                airnodeAddress,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                longData,
                signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Data length not correct');
            await expect(
              airnodeProtocol
                .connect(airnodeRrpSponsorWallet)
                .fulfillRequest(
                  requestId,
                  airnodeAddress,
                  dapiServer.address,
                  dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                  timestamp,
                  longData,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
            const beacon = await dapiServer.dataFeeds(beaconId);
            expect(beacon.value).to.equal(0);
            expect(beacon.timestamp).to.equal(0);
          });
        });
        context('Encoded data length is too short', function () {
          it('reverts', async function () {
            const requestId = await deriveRegularRequestId();
            await dapiServer
              .connect(roles.updateRequester)
              .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
            const decodedData = 123;
            const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
            const [data, signature] = await encodeAndSignFulfillment(
              decodedData,
              requestId,
              timestamp,
              airnodeRrpSponsorWallet.address
            );
            const shortData = data.substring(0, data.length - 2);
            const staticCallResult = await airnodeProtocol
              .connect(airnodeRrpSponsorWallet)
              .callStatic.fulfillRequest(
                requestId,
                airnodeAddress,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                shortData,
                signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Data length not correct');
            await expect(
              airnodeProtocol
                .connect(airnodeRrpSponsorWallet)
                .fulfillRequest(
                  requestId,
                  airnodeAddress,
                  dapiServer.address,
                  dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                  timestamp,
                  shortData,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
            const beacon = await dapiServer.dataFeeds(beaconId);
            expect(beacon.value).to.equal(0);
            expect(beacon.timestamp).to.equal(0);
          });
        });
      });
      context('Timestamp is older than 1 hour', function () {
        it('does not update Beacon', async function () {
          const requestId = await deriveRegularRequestId();
          await dapiServer
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
          const decodedData = 123;
          const currentTimestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
          await hre.ethers.provider.send('evm_setNextBlockTimestamp', [currentTimestamp + 1]);
          const timestamp = currentTimestamp - 60 * 60;
          const [data, signature] = await encodeAndSignFulfillment(
            decodedData,
            requestId,
            timestamp,
            airnodeRrpSponsorWallet.address
          );
          const staticCallResult = await airnodeProtocol
            .connect(airnodeRrpSponsorWallet)
            .callStatic.fulfillRequest(
              requestId,
              airnodeAddress,
              dapiServer.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
              timestamp,
              data,
              signature,
              { gasLimit: 500000 }
            );
          expect(staticCallResult.callSuccess).to.equal(false);
          expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Timestamp not valid');
          await expect(
            airnodeProtocol
              .connect(airnodeRrpSponsorWallet)
              .fulfillRequest(
                requestId,
                airnodeAddress,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
          const beacon = await dapiServer.dataFeeds(beaconId);
          expect(beacon.value).to.equal(0);
          expect(beacon.timestamp).to.equal(0);
        });
      });
      context('Timestamp is more than 15 minutes from the future', function () {
        it('reverts', async function () {
          const requestId = await deriveRegularRequestId();
          await dapiServer
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithTemplate(airnodeAddress, templateId, roles.sponsor.address);
          const currentTimestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
          await hre.ethers.provider.send('evm_setNextBlockTimestamp', [currentTimestamp + 1]);
          const timestamp = currentTimestamp + 15 * 60 + 1;
          const decodedData = 123;
          const [data, signature] = await encodeAndSignFulfillment(
            decodedData,
            requestId,
            timestamp,
            airnodeRrpSponsorWallet.address
          );
          const staticCallResult = await airnodeProtocol
            .connect(airnodeRrpSponsorWallet)
            .callStatic.fulfillRequest(
              requestId,
              airnodeAddress,
              dapiServer.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
              timestamp,
              data,
              signature,
              { gasLimit: 500000 }
            );
          expect(staticCallResult.callSuccess).to.equal(false);
          expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Timestamp not valid');
          await expect(
            airnodeProtocol
              .connect(airnodeRrpSponsorWallet)
              .fulfillRequest(
                requestId,
                airnodeAddress,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
          const beacon = await dapiServer.dataFeeds(beaconId);
          expect(beacon.value).to.equal(0);
          expect(beacon.timestamp).to.equal(0);
        });
      });
    });
    context('Sender is not AirnodeProtocol', function () {
      it('reverts', async function () {
        await expect(
          dapiServer.connect(roles.randomPerson).fulfillRrpBeaconUpdate(hre.ethers.constants.HashZero, 0, '0x')
        ).to.be.revertedWith('Sender not Airnode protocol');
      });
    });
  });

  describe('registerBeaconUpdateSubscription', function () {
    context('Relayer address is not zero', function () {
      context('Sponsor address is not zero', function () {
        it('registers beacon update subscription', async function () {
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                airnodeAddress,
                templateId,
                beaconUpdateSubscriptionConditions,
                airnodeAddress,
                roles.sponsor.address
              )
          )
            .to.emit(dapiServer, 'RegisteredBeaconUpdateSubscription')
            .withArgs(
              beaconUpdateSubscriptionId,
              airnodeAddress,
              templateId,
              '0x',
              beaconUpdateSubscriptionConditions,
              airnodeAddress,
              roles.sponsor.address,
              dapiServer.address,
              dapiServer.interface.getSighash('fulfillPspBeaconUpdate')
            );
          expect(await dapiServer.subscriptionIdToBeaconId(beaconUpdateSubscriptionId)).to.equal(beaconId);
        });
      });
      context('Sponsor address is zero', function () {
        it('reverts', async function () {
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                airnodeAddress,
                templateId,
                beaconUpdateSubscriptionConditions,
                airnodeAddress,
                hre.ethers.constants.AddressZero
              )
          ).to.be.revertedWith('Sponsor address zero');
        });
      });
    });
    context('Relayer address is zero', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .registerBeaconUpdateSubscription(
              airnodeAddress,
              templateId,
              beaconUpdateSubscriptionConditions,
              hre.ethers.constants.AddressZero,
              roles.sponsor.address
            )
        ).to.be.revertedWith('Relayer address zero');
      });
    });
  });

  describe('conditionPspBeaconUpdate', function () {
    context('Subscription is registered', function () {
      context('Data length is correct', function () {
        context('Condition parameters length is correct', function () {
          context('Beacon timestamp is zero', function () {
            it('returns true', async function () {
              // Even if the deviation and heartbeat interval is zero, since the Beacon timestamp
              // is zero, the condition will return true
              const conditionData = encodeData(0);
              const conditionParameters = hre.ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'int224', 'uint256'],
                [0, 0, 0]
              );
              expect(
                await dapiServer.callStatic.conditionPspBeaconUpdate(
                  beaconUpdateSubscriptionId,
                  conditionData,
                  conditionParameters
                )
              ).to.equal(true);
            });
          });
          context('Beacon timestamp is not zero', function () {
            context('Data makes a larger update than the threshold', function () {
              context('Update is upwards', function () {
                context('It has been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    // Set the Beacon to 100 first
                    const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                    await setBeacon(templateId, 100, timestamp);
                    // beaconUpdateSubscriptionConditionParameters is 10% and 1 day
                    // 100 -> 110 satisfies the condition
                    const conditionData = encodeData(110);
                    // It has been 1 day since the Beacon timestamp
                    await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp + 24 * 60 * 60]);
                    await hre.ethers.provider.send('evm_mine');
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        conditionData,
                        beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('It has not been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    // Set the Beacon to 100 first
                    const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                    await setBeacon(templateId, 100, timestamp);
                    // beaconUpdateSubscriptionConditionParameters is 10%
                    // 100 -> 110 satisfies the condition and returns true
                    const conditionData = encodeData(110);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        conditionData,
                        beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                it('returns true', async function () {
                  // Set the Beacon to 100 first
                  const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                  await setBeacon(templateId, 100, timestamp);
                  // beaconUpdateSubscriptionConditionParameters is 10%
                  // 100 -> 110 satisfies the condition and returns true
                  const conditionData = encodeData(110);
                  expect(
                    await dapiServer.callStatic.conditionPspBeaconUpdate(
                      beaconUpdateSubscriptionId,
                      conditionData,
                      beaconUpdateSubscriptionConditionParameters
                    )
                  ).to.equal(true);
                });
              });
              context('Update is downwards', function () {
                context('It has been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    // Set the Beacon to 100 first
                    const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                    await setBeacon(templateId, 100, timestamp);
                    // beaconUpdateSubscriptionConditionParameters is 10% and 1 day
                    // 100 -> 90 satisfies the condition
                    const conditionData = encodeData(90);
                    // It has been 1 day since the Beacon timestamp
                    await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp + 24 * 60 * 60]);
                    await hre.ethers.provider.send('evm_mine');
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        conditionData,
                        beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('It has not been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    // Set the Beacon to 100 first
                    const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                    await setBeacon(templateId, 100, timestamp);
                    // beaconUpdateSubscriptionConditionParameters is 10%
                    // 100 -> 90 satisfies the condition and returns true
                    const conditionData = encodeData(90);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        conditionData,
                        beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
              });
            });
            context('Data does not make a larger update than the threshold', function () {
              context('Update is upwards', function () {
                context('Initial value is deviation reference', function () {
                  it('returns true', async function () {
                    // Set the Beacon to 0 first
                    const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                    await setBeacon(templateId, 0, timestamp);
                    // beaconUpdateSubscriptionConditionParameters is 10%
                    // 0 -> 1 doesn't satisfy the condition but the initial value is deviation reference,
                    // so this will always return true
                    const conditionData = encodeData(1);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        conditionData,
                        beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('Initial value is not deviation reference', function () {
                  context('It has been at least heartbeat interval seconds since the last update', function () {
                    it('returns true', async function () {
                      // Set the Beacon to 100 first
                      const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                      await setBeacon(templateId, 100, timestamp);
                      // beaconUpdateSubscriptionConditionParameters is 10% and 1 day
                      // 100 -> 109 doesn't satisfy the condition
                      const conditionData = encodeData(109);
                      // It has been 1 day since the Beacon timestamp
                      await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp + 24 * 60 * 60]);
                      await hre.ethers.provider.send('evm_mine');
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beaconUpdateSubscriptionId,
                          conditionData,
                          beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(true);
                    });
                  });
                  context('It has not been at least heartbeat interval seconds since the last update', function () {
                    it('returns false', async function () {
                      // Set the Beacon to 100 first
                      const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                      await setBeacon(templateId, 100, timestamp);
                      // beaconUpdateSubscriptionConditionParameters is 10%
                      // 100 -> 109 doesn't satisfy the condition and returns false
                      const conditionData = encodeData(109);
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beaconUpdateSubscriptionId,
                          conditionData,
                          beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(false);
                    });
                  });
                });
              });
              context('Update is downwards', function () {
                context('Initial value is deviation reference', function () {
                  it('returns true', async function () {
                    // Set the Beacon to 0 first
                    const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                    await setBeacon(templateId, 0, timestamp);
                    // beaconUpdateSubscriptionConditionParameters is 10%
                    // 0 -> -1 doesn't satisfy the condition but the initial value is deviation reference,
                    // so this will always return true
                    const conditionData = encodeData(-1);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        conditionData,
                        beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('Initial value is not deviation reference', function () {
                  context('It has been at least heartbeat interval seconds since the last update', function () {
                    it('returns true', async function () {
                      // Set the Beacon to 100 first
                      const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                      await setBeacon(templateId, 100, timestamp);
                      // beaconUpdateSubscriptionConditionParameters is 10% and 1 day
                      // 100 -> 91 doesn't satisfy the condition
                      const conditionData = encodeData(91);
                      // It has been 1 day since the Beacon timestamp
                      await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp + 24 * 60 * 60]);
                      await hre.ethers.provider.send('evm_mine');
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beaconUpdateSubscriptionId,
                          conditionData,
                          beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(true);
                    });
                  });
                  context('It has not been at least heartbeat interval seconds since the last update', function () {
                    it('returns false', async function () {
                      // Set the Beacon to 100 first
                      const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                      await setBeacon(templateId, 100, timestamp);
                      // beaconUpdateSubscriptionConditionParameters is 10%
                      // 100 -> 91 doesn't satisfy the condition and returns false
                      const conditionData = encodeData(91);
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beaconUpdateSubscriptionId,
                          conditionData,
                          beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(false);
                    });
                  });
                });
              });
            });
          });
        });
        context('Condition parameters length is not correct', function () {
          it('reverts', async function () {
            await dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                airnodeAddress,
                templateId,
                beaconUpdateSubscriptionConditions,
                airnodeAddress,
                roles.sponsor.address
              );
            const data = encodeData(123);
            const shortBeaconUpdateSubscriptionConditionParameters =
              beaconUpdateSubscriptionConditionParameters.substring(0, data.length - 2);
            const longBeaconUpdateSubscriptionConditionParameters = beaconUpdateSubscriptionConditionParameters + '00';
            await expect(
              dapiServer.callStatic.conditionPspBeaconUpdate(
                beaconUpdateSubscriptionId,
                data,
                shortBeaconUpdateSubscriptionConditionParameters
              )
            ).to.be.revertedWith('Incorrect parameter length');
            await expect(
              dapiServer.callStatic.conditionPspBeaconUpdate(
                beaconUpdateSubscriptionId,
                data,
                longBeaconUpdateSubscriptionConditionParameters
              )
            ).to.be.revertedWith('Incorrect parameter length');
          });
        });
      });
      context('Data length is not correct', function () {
        it('reverts', async function () {
          const data = encodeData(123);
          const shortData = data.substring(0, data.length - 2);
          const longData = data + '00';
          await expect(
            dapiServer.callStatic.conditionPspBeaconUpdate(
              beaconUpdateSubscriptionId,
              shortData,
              beaconUpdateSubscriptionConditionParameters
            )
          ).to.be.revertedWith('Data length not correct');
          await expect(
            dapiServer.callStatic.conditionPspBeaconUpdate(
              beaconUpdateSubscriptionId,
              longData,
              beaconUpdateSubscriptionConditionParameters
            )
          ).to.be.revertedWith('Data length not correct');
        });
      });
    });
    context('Subscription is not registered', function () {
      it('reverts', async function () {
        const data = encodeData(123);
        await expect(
          dapiServer.callStatic.conditionPspBeaconUpdate(
            testUtils.generateRandomBytes32(),
            data,
            beaconUpdateSubscriptionConditionParameters
          )
        ).to.be.revertedWith('Subscription not registered');
      });
    });
  });

  describe('fulfillPspBeaconUpdate', function () {
    context('Timestamp is valid', function () {
      context('Subscription is registered', function () {
        context('Data length is correct', function () {
          context('Data is fresher than Beacon', function () {
            context('Subscription is regular', function () {
              context('Signature is valid', function () {
                it('updates Beacon', async function () {
                  const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                  const [data, signature] = await encodeAndSignFulfillment(
                    123,
                    beaconUpdateSubscriptionId,
                    timestamp,
                    airnodePspSponsorWallet.address
                  );
                  await expect(
                    dapiServer
                      .connect(airnodePspSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        airnodeAddress,
                        airnodeAddress,
                        roles.sponsor.address,
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithPsp')
                    .withArgs(beaconId, beaconUpdateSubscriptionId, 123, timestamp);
                  const beacon = await dapiServer.dataFeeds(beaconId);
                  expect(beacon.value).to.equal(123);
                  expect(beacon.timestamp).to.equal(timestamp);
                });
              });
              context('Signature is not valid', function () {
                it('reverts', async function () {
                  const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                  const data = encodeData(123);
                  await expect(
                    dapiServer
                      .connect(airnodePspSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        beaconUpdateSubscriptionId,
                        airnodeAddress,
                        airnodeAddress,
                        roles.sponsor.address,
                        timestamp,
                        data,
                        '0x12345678',
                        { gasLimit: 500000 }
                      )
                  ).to.be.revertedWith('ECDSA: invalid signature length');
                });
              });
            });
            context('Subscription is relayed', function () {
              context('Signature is valid', function () {
                it('updates Beacon', async function () {
                  const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                  const [data, signature] = await encodeAndSignFulfillmentRelayed(
                    123,
                    beaconUpdateSubscriptionRelayedId,
                    timestamp,
                    relayerPspSponsorWallet.address
                  );
                  await expect(
                    dapiServer
                      .connect(relayerPspSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        beaconUpdateSubscriptionRelayedId,
                        airnodeAddress,
                        relayerAddress,
                        roles.sponsor.address,
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithPsp')
                    .withArgs(beaconId, beaconUpdateSubscriptionRelayedId, 123, timestamp);
                  const beacon = await dapiServer.dataFeeds(beaconId);
                  expect(beacon.value).to.equal(123);
                  expect(beacon.timestamp).to.equal(timestamp);
                });
              });
              context('Signature is not valid', function () {
                it('reverts', async function () {
                  const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
                  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
                  const data = encodeData(123);
                  await expect(
                    dapiServer
                      .connect(airnodePspSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        beaconUpdateSubscriptionRelayedId,
                        airnodeAddress,
                        relayerAddress,
                        roles.sponsor.address,
                        timestamp,
                        data,
                        '0x12345678',
                        { gasLimit: 500000 }
                      )
                  ).to.be.revertedWith('ECDSA: invalid signature length');
                });
              });
            });
          });
          context('Data is not fresher than Beacon', function () {
            it('reverts', async function () {
              const initialTimestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
              const futureTimestamp = initialTimestamp + 1;
              await setBeacon(templateId, 123, futureTimestamp);
              const [data, signature] = await encodeAndSignFulfillment(
                456,
                beaconUpdateSubscriptionId,
                initialTimestamp,
                airnodePspSponsorWallet.address
              );
              await expect(
                dapiServer
                  .connect(airnodePspSponsorWallet)
                  .fulfillPspBeaconUpdate(
                    beaconUpdateSubscriptionId,
                    airnodeAddress,
                    airnodeAddress,
                    roles.sponsor.address,
                    initialTimestamp,
                    data,
                    signature,
                    { gasLimit: 500000 }
                  )
              ).to.be.revertedWith('Fulfillment older than Beacon');
            });
          });
        });
        context('Data length is not correct', function () {
          it('reverts', async function () {
            const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
            const [data, signature] = await encodeAndSignFulfillment(
              123,
              beaconUpdateSubscriptionId,
              timestamp,
              airnodePspSponsorWallet.address
            );
            const longData = data + '00';
            await expect(
              dapiServer
                .connect(airnodePspSponsorWallet)
                .fulfillPspBeaconUpdate(
                  beaconUpdateSubscriptionId,
                  airnodeAddress,
                  airnodeAddress,
                  roles.sponsor.address,
                  timestamp,
                  longData,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Subscription is not registered', function () {
        it('reverts', async function () {
          const anotherBeaconUpdateSubscriptionId = testUtils.generateRandomBytes32();
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
          const [data, signature] = await encodeAndSignFulfillment(
            123,
            anotherBeaconUpdateSubscriptionId,
            timestamp,
            airnodePspSponsorWallet.address
          );
          await expect(
            dapiServer
              .connect(airnodePspSponsorWallet)
              .fulfillPspBeaconUpdate(
                anotherBeaconUpdateSubscriptionId,
                airnodeAddress,
                airnodeAddress,
                roles.sponsor.address,
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          ).to.be.revertedWith('Subscription not registered');
        });
      });
    });
    context('Timestamp is not valid', function () {
      it('reverts', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) - 60 * 60;
        const [data, signature] = await encodeAndSignFulfillment(
          123,
          beaconUpdateSubscriptionId,
          timestamp,
          airnodePspSponsorWallet.address
        );
        await expect(
          dapiServer
            .connect(airnodePspSponsorWallet)
            .fulfillPspBeaconUpdate(
              beaconUpdateSubscriptionId,
              airnodeAddress,
              airnodeAddress,
              roles.sponsor.address,
              timestamp,
              data,
              signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
  });

  describe('updateBeaconWithSignedData', function () {
    context('Timestamp is valid', function () {
      context('Signature is valid', function () {
        context('Data length is correct', function () {
          context('Data is fresher than Beacon', function () {
            it('updates Beacon', async function () {
              const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
              const [data, signature] = await encodeAndSignData(123, templateId, timestamp);
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(airnodeAddress, templateId, timestamp, data, signature)
              )
                .to.emit(dapiServer, 'UpdatedBeaconWithSignedData')
                .withArgs(beaconId, 123, timestamp);
              const beacon = await dapiServer.dataFeeds(beaconId);
              expect(beacon.value).to.equal(123);
              expect(beacon.timestamp).to.equal(timestamp);
            });
          });
          context('Data is not fresher than Beacon', function () {
            it('reverts', async function () {
              const initialTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
              const futureTimestamp = initialTimestamp + 1;
              await setBeacon(templateId, 123, futureTimestamp);
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [futureTimestamp + 1]);
              const [data, signature] = await encodeAndSignData(456, templateId, initialTimestamp);
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(airnodeAddress, templateId, initialTimestamp, data, signature)
              ).to.be.revertedWith('Fulfillment older than Beacon');
            });
          });
        });
        context('Data length is not correct', function () {
          it('reverts', async function () {
            const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
            const data = encodeData(123);
            const longData = data + '00';
            const signature = await airnodeWallet.signMessage(
              hre.ethers.utils.arrayify(
                hre.ethers.utils.keccak256(
                  hre.ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, longData])
                )
              )
            );
            await expect(
              dapiServer
                .connect(roles.randomPerson)
                .updateBeaconWithSignedData(airnodeAddress, templateId, timestamp, longData, signature)
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .updateBeaconWithSignedData(airnodeAddress, templateId, timestamp, '0x', '0x')
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Timestamp is not valid', function () {
      it('reverts', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) - 60 * 60;
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconWithSignedData(airnodeAddress, templateId, timestamp, '0x', '0x')
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
  });

  describe('updateBeaconWithDomainSignedData', function () {
    context('Timestamp is valid', function () {
      context('Signature is valid', function () {
        context('Data length is correct', function () {
          context('Data is fresher than Beacon', function () {
            it('updates Beacon', async function () {
              const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
              const [data, signature] = await encodeAndDomainSignData(123, templateId, timestamp);
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconWithDomainSignedData(airnodeAddress, templateId, timestamp, data, signature)
              )
                .to.emit(dapiServer, 'UpdatedBeaconWithDomainSignedData')
                .withArgs(beaconId, 123, timestamp);
              const beacon = await dapiServer.dataFeeds(beaconId);
              expect(beacon.value).to.equal(123);
              expect(beacon.timestamp).to.equal(timestamp);
            });
          });
          context('Data is not fresher than Beacon', function () {
            it('reverts', async function () {
              const initialTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
              const futureTimestamp = initialTimestamp + 1;
              await setBeacon(templateId, 123, futureTimestamp);
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [futureTimestamp + 1]);
              const [data, signature] = await encodeAndDomainSignData(456, templateId, initialTimestamp);
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconWithDomainSignedData(airnodeAddress, templateId, initialTimestamp, data, signature)
              ).to.be.revertedWith('Fulfillment older than Beacon');
            });
          });
        });
        context('Data length is not correct', function () {
          it('reverts', async function () {
            const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
            const data = encodeData(123);
            const longData = data + '00';
            const signature = await airnodeWallet.signMessage(
              hre.ethers.utils.arrayify(
                hre.ethers.utils.keccak256(
                  hre.ethers.utils.solidityPack(
                    ['uint256', 'address', 'bytes32', 'uint256', 'bytes'],
                    [
                      (await hre.ethers.provider.getNetwork()).chainId,
                      dapiServer.address,
                      templateId,
                      timestamp,
                      longData,
                    ]
                  )
                )
              )
            );
            await expect(
              dapiServer
                .connect(roles.randomPerson)
                .updateBeaconWithDomainSignedData(airnodeAddress, templateId, timestamp, longData, signature)
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .updateBeaconWithDomainSignedData(airnodeAddress, templateId, timestamp, '0x', '0x')
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Timestamp is not valid', function () {
      it('reverts', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) - 60 * 60;
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconWithDomainSignedData(airnodeAddress, templateId, timestamp, '0x', '0x')
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
  });

  describe('updateBeaconSetWithBeacons', function () {
    context('Did not specify less than two Beacons', function () {
      context('Updated value is not outdated', function () {
        it('updates Beacon set', async function () {
          // Populate the Beacons
          let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
          const beaconData = [123, 456, 789];
          for (let ind = 0; ind < beaconData.length; ind++) {
            timestamp++;
            await setBeacon(beaconSetTemplateIds[ind], beaconData[ind], timestamp);
          }
          const beaconSetInitial = await dapiServer.dataFeeds(beaconSetId);
          expect(beaconSetInitial.value).to.equal(0);
          expect(beaconSetInitial.timestamp).to.equal(0);
          expect(
            await dapiServer.connect(roles.randomPerson).callStatic.updateBeaconSetWithBeacons(beaconSetBeaconIds)
          ).to.equal(beaconSetId);
          await expect(dapiServer.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSetBeaconIds))
            .to.emit(dapiServer, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSetId, 456, timestamp - 1);
        });
      });
      context('Updated value is outdated', function () {
        it('reverts', async function () {
          // Populate the Beacons
          let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
          const beaconData = [123, 456, 789];
          for (let ind = 0; ind < beaconData.length; ind++) {
            timestamp++;
            await setBeacon(beaconSetTemplateIds[ind], beaconData[ind], timestamp);
          }
          // Update the Beacon set with signed data
          const beaconSetData = [321, 654, 987];
          timestamp++;
          await setBeaconSet(airnodeAddress, beaconSetTemplateIds, beaconSetData, [timestamp, timestamp, timestamp]);
          // Update with Beacons will fail because the previous update with signed data was fresher
          await expect(
            dapiServer.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSetBeaconIds)
          ).to.be.revertedWith('Updated value outdated');
        });
      });
    });
    context('Specified less than two Beacons', function () {
      it('reverts', async function () {
        await expect(
          dapiServer.connect(roles.randomPerson).updateBeaconSetWithBeacons([testUtils.generateRandomBytes32()])
        ).to.be.revertedWith('Specified less than two Beacons');
        await expect(dapiServer.connect(roles.randomPerson).updateBeaconSetWithBeacons([])).to.be.revertedWith(
          'Specified less than two Beacons'
        );
      });
    });
  });

  describe('conditionPspBeaconSetUpdate', function () {
    context('Data length is correct', function () {
      context('Condition parameters length is correct', function () {
        context('Beacon set timestamp is zero', function () {
          context('Update will set the Beacon set timestamp to a non-zero value', function () {
            it('returns true', async function () {
              let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
              const encodedData = [0, 0, 0];
              for (let ind = 0; ind < encodedData.length; ind++) {
                timestamp++;
                await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
              }
              // Even if the Beacon values are zero, since their timestamps are not zero,
              // the condition will return true
              expect(
                await dapiServer
                  .connect(roles.randomPerson)
                  .callStatic.conditionPspBeaconSetUpdate(
                    beaconSetUpdateSubscriptionId,
                    hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                    beaconSetUpdateSubscriptionConditionParameters
                  )
              ).to.equal(true);
            });
          });
          context('Update will not set the Beacon set timestamp to a non-zero value', function () {
            it('returns false', async function () {
              expect(
                await dapiServer
                  .connect(roles.randomPerson)
                  .callStatic.conditionPspBeaconSetUpdate(
                    beaconSetUpdateSubscriptionId,
                    hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                    beaconSetUpdateSubscriptionConditionParameters
                  )
              ).to.equal(false);
            });
          });
        });
        context('Beacon set timestamp is not zero', function () {
          context('Data makes a larger update than the threshold', function () {
            context('Update is upwards', function () {
              context('It has been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5% and 2 days
                  // 100 -> 105 satisfies the condition
                  const encodedData = [105, 110, 100];
                  // It has been 2 days since the Beacon set timestamp
                  timestamp = timestamp + 2 * 24 * 60 * 60;
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5%
                  // 100 -> 105 satisfies the condition and returns true
                  const encodedData = [105, 110, 100];
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
            });
            context('Update is downwards', function () {
              context('It has been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5% and 2 days
                  // 100 -> 95 satisfies the condition
                  const encodedData = [95, 100, 90];
                  // It has been 2 days since the Beacon set timestamp
                  timestamp = timestamp + 2 * 24 * 60 * 60;
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5%
                  // 100 -> 95 satisfies the condition and returns true
                  const encodedData = [95, 100, 90];
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
            });
          });
          context('Data does not make a larger update than the threshold', function () {
            context('Update is upwards', function () {
              context('It has been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5% and 2 days
                  // 100 -> 104 does not satisfy the condition
                  const encodedData = [110, 104, 95];
                  // It has been 2 days since the Beacon set timestamp
                  timestamp = timestamp + 2 * 24 * 60 * 60;
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns false', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5%
                  // 100 -> 104 does not satisfy the condition and returns false
                  const encodedData = [110, 104, 95];
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(false);
                });
              });
            });
            context('Update is downwards', function () {
              context('It has been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5% and 2 days
                  // 100 -> 96 does not satisfy the condition
                  const encodedData = [105, 96, 95];
                  // It has been 2 days since the Beacon set timestamp
                  timestamp = timestamp + 2 * 24 * 60 * 60;
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns false', async function () {
                  // Set the Beacon set to 100 first
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  timestamp++;
                  await setBeaconSet(
                    airnodeAddress,
                    beaconSetTemplateIds,
                    [100, 100, 100],
                    [timestamp, timestamp, timestamp]
                  );
                  // beaconSetUpdateSubscriptionConditionParameters is 5%
                  // 100 -> 96 does not satisfy the condition and returns false
                  const encodedData = [105, 96, 95];
                  for (let ind = 0; ind < encodedData.length; ind++) {
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
                  }
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSetUpdateSubscriptionId,
                        hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]),
                        beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(false);
                });
              });
            });
          });
        });
      });
      context('Condition parameters length is not correct', function () {
        it('reverts', async function () {
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .callStatic.conditionPspBeaconSetUpdate(
                testUtils.generateRandomBytes32(),
                hre.ethers.utils.defaultAbiCoder.encode(
                  ['bytes32[]'],
                  [
                    [
                      testUtils.generateRandomBytes32(),
                      testUtils.generateRandomBytes32(),
                      testUtils.generateRandomBytes32(),
                    ],
                  ]
                ),
                beaconSetUpdateSubscriptionConditionParameters + '00'
              )
          ).to.be.revertedWith('Incorrect parameter length');
        });
      });
    });
    context('Data length is not correct', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .callStatic.conditionPspBeaconSetUpdate(
              testUtils.generateRandomBytes32(),
              hre.ethers.utils.defaultAbiCoder.encode(
                ['bytes32[]'],
                [
                  [
                    testUtils.generateRandomBytes32(),
                    testUtils.generateRandomBytes32(),
                    testUtils.generateRandomBytes32(),
                  ],
                ]
              ) + '00',
              beaconSetUpdateSubscriptionConditionParameters
            )
        ).to.be.revertedWith('Data length not correct');
      });
    });
  });

  describe('fulfillPspBeaconSetUpdate', function () {
    context('Data length is correct', function () {
      context('Subscription is regular', function () {
        it('updates Beacon set', async function () {
          let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
          const encodedData = [95, 100, 90];
          for (let ind = 0; ind < encodedData.length; ind++) {
            timestamp++;
            await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
          }
          const data = hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]);
          const signature = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'address'],
                  [beaconSetUpdateSubscriptionId, timestamp, airnodePspSponsorWallet.address]
                )
              )
            )
          );
          await expect(
            dapiServer
              .connect(airnodePspSponsorWallet)
              .fulfillPspBeaconSetUpdate(
                beaconSetUpdateSubscriptionId,
                airnodeAddress,
                airnodeAddress,
                roles.sponsor.address,
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          )
            .to.emit(dapiServer, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSetId, 95, timestamp - 1);
          const beaconSet = await dapiServer.dataFeeds(beaconSetId);
          expect(beaconSet.value).to.equal(95);
          expect(beaconSet.timestamp).to.equal(timestamp - 1);
        });
      });
      context('Subscription is relayed', function () {
        it('updates Beacon set', async function () {
          // Note that updating a Beacon set with a relayed subscription makes no sense
          // We are testing this for the sake of completeness
          let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
          const encodedData = [95, 100, 90];
          for (let ind = 0; ind < encodedData.length; ind++) {
            timestamp++;
            await setBeacon(beaconSetTemplateIds[ind], encodedData[ind], timestamp);
          }
          const data = hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]);
          const signature = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'address', 'bytes'],
                  [beaconSetUpdateSubscriptionRelayedId, timestamp, relayerPspSponsorWallet.address, data]
                )
              )
            )
          );
          await expect(
            dapiServer
              .connect(relayerPspSponsorWallet)
              .fulfillPspBeaconSetUpdate(
                beaconSetUpdateSubscriptionRelayedId,
                airnodeAddress,
                relayerAddress,
                roles.sponsor.address,
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          )
            .to.emit(dapiServer, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSetId, 95, timestamp - 1);
          const beaconSet = await dapiServer.dataFeeds(beaconSetId);
          expect(beaconSet.value).to.equal(95);
          expect(beaconSet.timestamp).to.equal(timestamp - 1);
        });
      });
    });
    context('Data length is not correct', function () {
      it('reverts', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
        const data = hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds]);
        const longData = data + '00';
        const signature = await airnodeWallet.signMessage(
          hre.ethers.utils.arrayify(
            hre.ethers.utils.keccak256(
              hre.ethers.utils.solidityPack(
                ['bytes32', 'uint256', 'address'],
                [beaconSetUpdateSubscriptionId, timestamp, airnodePspSponsorWallet.address]
              )
            )
          )
        );
        await expect(
          dapiServer
            .connect(airnodePspSponsorWallet)
            .fulfillPspBeaconSetUpdate(
              beaconSetUpdateSubscriptionId,
              airnodeAddress,
              airnodeAddress,
              roles.sponsor.address,
              timestamp,
              longData,
              signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Data length not correct');
      });
    });
  });

  describe('updateBeaconSetWithSignedData', function () {
    context('Parameter lengths match', function () {
      context('Did not specify less than two Beacons', function () {
        context('All signed timestamps are valid', function () {
          context('All signatures are valid', function () {
            context('All signed data has correct length', function () {
              context('All signed data can be typecast successfully', function () {
                context('Updated value is not outdated', function () {
                  it('updates Beacon set with signed data', async function () {
                    let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                    // Set the first beacon to a value
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                    // Sign data for the next two beacons
                    const [data1, signature1] = await encodeAndSignData(105, beaconSetTemplateIds[1], timestamp);
                    const [data2, signature2] = await encodeAndSignData(110, beaconSetTemplateIds[2], timestamp);
                    // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                    await expect(
                      dapiServer
                        .connect(roles.randomPerson)
                        .updateBeaconSetWithSignedData(
                          Array(3).fill(airnodeAddress),
                          beaconSetTemplateIds,
                          [0, timestamp, timestamp],
                          ['0x', data1, data2],
                          ['0x', signature1, signature2]
                        )
                    )
                      .to.emit(dapiServer, 'UpdatedBeaconSetWithSignedData')
                      .withArgs(beaconSetId, 105, timestamp);
                    const beaconSet = await dapiServer.dataFeeds(beaconSetId);
                    expect(beaconSet.value).to.equal(105);
                    expect(beaconSet.timestamp).to.equal(timestamp);
                  });
                });
                context('Updated value is outdated', function () {
                  it('reverts', async function () {
                    let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                    timestamp++;
                    await setBeaconSet(
                      airnodeAddress,
                      beaconSetTemplateIds,
                      Array(3).fill(100),
                      Array(3).fill(timestamp)
                    );
                    // Set the first beacon to a value
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                    // Sign data for the next two beacons
                    const [data1, signature1] = await encodeAndSignData(110, beaconSetTemplateIds[1], timestamp - 5);
                    const [data2, signature2] = await encodeAndSignData(105, beaconSetTemplateIds[2], timestamp - 5);
                    // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                    await expect(
                      dapiServer
                        .connect(roles.randomPerson)
                        .updateBeaconSetWithSignedData(
                          Array(3).fill(airnodeAddress),
                          beaconSetTemplateIds,
                          [0, timestamp - 5, timestamp - 5],
                          ['0x', data1, data2],
                          ['0x', signature1, signature2]
                        )
                    ).to.be.revertedWith('Updated value outdated');
                  });
                });
              });
              context('All signed data cannot be typecast successfully', function () {
                it('reverts', async function () {
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  // Set the first beacon to a value
                  timestamp++;
                  await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                  // Sign data for the next beacons
                  const [data1, signature1] = await encodeAndSignData(110, beaconSetTemplateIds[1], timestamp);
                  // The third data contains an un-typecastable value
                  const data2 = encodeData(hre.ethers.BigNumber.from(2).pow(223));
                  const signature2 = await airnodeWallet.signMessage(
                    hre.ethers.utils.arrayify(
                      hre.ethers.utils.keccak256(
                        hre.ethers.utils.solidityPack(
                          ['bytes32', 'uint256', 'bytes'],
                          [beaconSetTemplateIds[2], timestamp, data2]
                        )
                      )
                    )
                  );
                  // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                  await expect(
                    dapiServer
                      .connect(roles.randomPerson)
                      .updateBeaconSetWithSignedData(
                        Array(3).fill(airnodeAddress),
                        beaconSetTemplateIds,
                        [0, timestamp, timestamp],
                        ['0x', data1, data2],
                        ['0x', signature1, signature2]
                      )
                  ).to.be.revertedWith('Value typecasting error');
                });
              });
            });
            context('Not all signed data has correct length', function () {
              it('reverts', async function () {
                let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                // Set the first beacon to a value
                timestamp++;
                await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                // Sign data for the next beacons
                const [data1, signature1] = await encodeAndSignData(110, beaconSetTemplateIds[1], timestamp);
                // The third data does not have the correct length
                const data2 = encodeData(105) + '00';
                const signature2 = await airnodeWallet.signMessage(
                  hre.ethers.utils.arrayify(
                    hre.ethers.utils.keccak256(
                      hre.ethers.utils.solidityPack(
                        ['bytes32', 'uint256', 'bytes'],
                        [beaconSetTemplateIds[2], timestamp, data2]
                      )
                    )
                  )
                );
                // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                await expect(
                  dapiServer
                    .connect(roles.randomPerson)
                    .updateBeaconSetWithSignedData(
                      Array(3).fill(airnodeAddress),
                      beaconSetTemplateIds,
                      [0, timestamp, timestamp],
                      ['0x', data1, data2],
                      ['0x', signature1, signature2]
                    )
                ).to.be.revertedWith('Data length not correct');
              });
            });
          });
          context('Not all signatures are valid', function () {
            it('reverts', async function () {
              let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
              // Set the first beacon to a value
              timestamp++;
              await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
              // Sign data for the next two beacons
              const [data1, signature1] = await encodeAndSignData(110, beaconSetTemplateIds[1], timestamp);
              const [data2] = await encodeAndSignData(105, beaconSetTemplateIds[2], timestamp);
              // Pass an empty signature for the first beacon, meaning that it will be read from the storage
              // The signature for the third beacon is invalid
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconSetWithSignedData(
                    Array(3).fill(airnodeAddress),
                    beaconSetTemplateIds,
                    [0, timestamp, timestamp],
                    ['0x', data1, data2],
                    ['0x', signature1, '0x12345678']
                  )
              ).to.be.revertedWith('ECDSA: invalid signature length');
            });
          });
        });
        context('Not all signed timestamps are valid', function () {
          it('reverts', async function () {
            let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
            // Set the first beacon to a value
            timestamp++;
            await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
            // Sign data for the next two beacons
            const [data1, signature1] = await encodeAndSignData(110, beaconSetTemplateIds[1], timestamp);
            const [data2, signature2] = await encodeAndSignData(105, beaconSetTemplateIds[2], 0);
            // Pass an empty signature for the first beacon, meaning that it will be read from the storage
            // The timestamp for the third beacon is invalid
            await expect(
              dapiServer
                .connect(roles.randomPerson)
                .updateBeaconSetWithSignedData(
                  Array(3).fill(airnodeAddress),
                  beaconSetTemplateIds,
                  [0, timestamp, 0],
                  ['0x', data1, data2],
                  ['0x', signature1, signature2]
                )
            ).to.be.revertedWith('Timestamp not valid');
          });
        });
      });
      context('Specified less than two Beacons', function () {
        it('reverts', async function () {
          await expect(
            dapiServer.connect(roles.randomPerson).updateBeaconSetWithSignedData([], [], [], [], [])
          ).to.be.revertedWith('Specified less than two Beacons');
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .updateBeaconSetWithSignedData(
                [testUtils.generateRandomAddress()],
                [testUtils.generateRandomBytes32()],
                [0],
                [testUtils.generateRandomBytes()],
                [testUtils.generateRandomBytes()]
              )
          ).to.be.revertedWith('Specified less than two Beacons');
        });
      });
    });
    context('Parameter lengths do not match', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithSignedData(
              Array(4).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(4).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(4).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(4).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(4).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
      });
    });
  });

  describe('updateBeaconSetWithDomainSignedData', function () {
    context('Parameter lengths match', function () {
      context('Did not specify less than two Beacons', function () {
        context('All signed timestamps are valid', function () {
          context('All signatures are valid', function () {
            context('All signed data has correct length', function () {
              context('All signed data can be typecast successfully', function () {
                context('Updated value is not outdated', function () {
                  it('updates Beacon set with signed data', async function () {
                    let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                    // Set the first beacon to a value
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                    // Sign data for the next two beacons
                    const [data1, signature1] = await encodeAndDomainSignData(105, beaconSetTemplateIds[1], timestamp);
                    const [data2, signature2] = await encodeAndDomainSignData(110, beaconSetTemplateIds[2], timestamp);
                    // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                    await expect(
                      dapiServer
                        .connect(roles.randomPerson)
                        .updateBeaconSetWithDomainSignedData(
                          Array(3).fill(airnodeAddress),
                          beaconSetTemplateIds,
                          [0, timestamp, timestamp],
                          ['0x', data1, data2],
                          ['0x', signature1, signature2]
                        )
                    )
                      .to.emit(dapiServer, 'UpdatedBeaconSetWithDomainSignedData')
                      .withArgs(beaconSetId, 105, timestamp);
                    const beaconSet = await dapiServer.dataFeeds(beaconSetId);
                    expect(beaconSet.value).to.equal(105);
                    expect(beaconSet.timestamp).to.equal(timestamp);
                  });
                });
                context('Updated value is outdated', function () {
                  it('reverts', async function () {
                    let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                    timestamp++;
                    await setBeaconSet(
                      airnodeAddress,
                      beaconSetTemplateIds,
                      Array(3).fill(100),
                      Array(3).fill(timestamp)
                    );
                    // Set the first beacon to a value
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                    // Sign data for the next two beacons
                    const [data1, signature1] = await encodeAndDomainSignData(
                      110,
                      beaconSetTemplateIds[1],
                      timestamp - 5
                    );
                    const [data2, signature2] = await encodeAndDomainSignData(
                      105,
                      beaconSetTemplateIds[2],
                      timestamp - 5
                    );
                    // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                    await expect(
                      dapiServer
                        .connect(roles.randomPerson)
                        .updateBeaconSetWithDomainSignedData(
                          Array(3).fill(airnodeAddress),
                          beaconSetTemplateIds,
                          [0, timestamp - 5, timestamp - 5],
                          ['0x', data1, data2],
                          ['0x', signature1, signature2]
                        )
                    ).to.be.revertedWith('Updated value outdated');
                  });
                });
              });
              context('All signed data cannot be typecast successfully', function () {
                it('reverts', async function () {
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  // Set the first beacon to a value
                  timestamp++;
                  await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                  // Sign data for the next beacons
                  const [data1, signature1] = await encodeAndDomainSignData(110, beaconSetTemplateIds[1], timestamp);
                  // The third data contains an un-typecastable value
                  const data2 = encodeData(hre.ethers.BigNumber.from(2).pow(224).add(1));
                  const signature2 = await airnodeWallet.signMessage(
                    hre.ethers.utils.arrayify(
                      hre.ethers.utils.keccak256(
                        hre.ethers.utils.solidityPack(
                          ['uint256', 'address', 'bytes32', 'uint256', 'bytes'],
                          [
                            (await hre.ethers.provider.getNetwork()).chainId,
                            dapiServer.address,
                            beaconSetTemplateIds[2],
                            timestamp,
                            data2,
                          ]
                        )
                      )
                    )
                  );
                  // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                  await expect(
                    dapiServer
                      .connect(roles.randomPerson)
                      .updateBeaconSetWithDomainSignedData(
                        Array(3).fill(airnodeAddress),
                        beaconSetTemplateIds,
                        [0, timestamp, timestamp],
                        ['0x', data1, data2],
                        ['0x', signature1, signature2]
                      )
                  ).to.be.revertedWith('Value typecasting error');
                });
              });
            });
            context('Not all signed data has correct length', function () {
              it('reverts', async function () {
                let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                // Set the first beacon to a value
                timestamp++;
                await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                // Sign data for the next beacons
                const [data1, signature1] = await encodeAndDomainSignData(110, beaconSetTemplateIds[1], timestamp);
                // The third data does not have the correct length
                const data2 = encodeData(105) + '00';
                const signature2 = await airnodeWallet.signMessage(
                  hre.ethers.utils.arrayify(
                    hre.ethers.utils.keccak256(
                      hre.ethers.utils.solidityPack(
                        ['uint256', 'address', 'bytes32', 'uint256', 'bytes'],
                        [
                          (await hre.ethers.provider.getNetwork()).chainId,
                          dapiServer.address,
                          beaconSetTemplateIds[2],
                          timestamp,
                          data2,
                        ]
                      )
                    )
                  )
                );
                // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                await expect(
                  dapiServer
                    .connect(roles.randomPerson)
                    .updateBeaconSetWithDomainSignedData(
                      Array(3).fill(airnodeAddress),
                      beaconSetTemplateIds,
                      [0, timestamp, timestamp],
                      ['0x', data1, data2],
                      ['0x', signature1, signature2]
                    )
                ).to.be.revertedWith('Data length not correct');
              });
            });
          });
          context('Not all signatures are valid', function () {
            it('reverts', async function () {
              let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
              // Set the first beacon to a value
              timestamp++;
              await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
              // Sign data for the next two beacons
              const [data1, signature1] = await encodeAndDomainSignData(110, beaconSetTemplateIds[1], timestamp);
              const [data2] = await encodeAndDomainSignData(105, beaconSetTemplateIds[2], timestamp);
              // Pass an empty signature for the first beacon, meaning that it will be read from the storage
              // The signature for the third beacon is invalid
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconSetWithDomainSignedData(
                    Array(3).fill(airnodeAddress),
                    beaconSetTemplateIds,
                    [0, timestamp, timestamp],
                    ['0x', data1, data2],
                    ['0x', signature1, '0x12345678']
                  )
              ).to.be.revertedWith('ECDSA: invalid signature length');
            });
          });
        });
        context('Not all signed timestamps are valid', function () {
          it('reverts', async function () {
            let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
            // Set the first beacon to a value
            timestamp++;
            await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
            // Sign data for the next two beacons
            const [data1, signature1] = await encodeAndDomainSignData(110, beaconSetTemplateIds[1], timestamp);
            const [data2, signature2] = await encodeAndDomainSignData(105, beaconSetTemplateIds[2], 0);
            // Pass an empty signature for the first beacon, meaning that it will be read from the storage
            // The timestamp for the third beacon is invalid
            await expect(
              dapiServer
                .connect(roles.randomPerson)
                .updateBeaconSetWithDomainSignedData(
                  Array(3).fill(airnodeAddress),
                  beaconSetTemplateIds,
                  [0, timestamp, 0],
                  ['0x', data1, data2],
                  ['0x', signature1, signature2]
                )
            ).to.be.revertedWith('Timestamp not valid');
          });
        });
      });
      context('Specified less than two Beacons', function () {
        it('reverts', async function () {
          await expect(
            dapiServer.connect(roles.randomPerson).updateBeaconSetWithDomainSignedData([], [], [], [], [])
          ).to.be.revertedWith('Specified less than two Beacons');
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .updateBeaconSetWithDomainSignedData(
                [testUtils.generateRandomAddress()],
                [testUtils.generateRandomBytes32()],
                [0],
                [testUtils.generateRandomBytes()],
                [testUtils.generateRandomBytes()]
              )
          ).to.be.revertedWith('Specified less than two Beacons');
        });
      });
    });
    context('Parameter lengths do not match', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithDomainSignedData(
              Array(4).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithDomainSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(4).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithDomainSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(4).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithDomainSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(4).fill(testUtils.generateRandomBytes()),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconSetWithDomainSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              Array(4).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
      });
    });
  });

  describe('updateOevProxyBeaconWithSignedData', function () {
    context('Timestamp is valid', function () {
      context('Signature is valid', function () {
        context('Data length is correct', function () {
          context('Data is fresher than OEV proxy Beacon', function () {
            it('updates OEV proxy Beacon', async function () {
              const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
              const data = encodeData(123);
              const metadata = testUtils.generateRandomBytes();
              const signature = await airnodeWallet.signMessage(
                hre.ethers.utils.arrayify(
                  hre.ethers.utils.keccak256(
                    hre.ethers.utils.solidityPack(
                      ['bytes32', 'uint256', 'bytes', 'bytes'],
                      [templateId, timestamp, data, metadata]
                    )
                  )
                )
              );
              await expect(
                dapiServer
                  .connect(roles.oevProxy)
                  .updateOevProxyBeaconWithSignedData(airnodeAddress, templateId, timestamp, data, metadata, signature)
              )
                .to.emit(dapiServer, 'UpdatedOevProxyBeaconWithSignedData')
                .withArgs(beaconId, roles.oevProxy.address, 123, timestamp);
              const beacon = await dapiServer.connect(roles.oevProxy).readDataFeedWithIdAsOevProxy(beaconId);
              expect(beacon.value).to.equal(123);
              expect(beacon.timestamp).to.equal(timestamp);
            });
          });
          context('Data is not fresher than OEV proxy Beacon', function () {
            it('reverts', async function () {
              const initialTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
              const futureTimestamp = initialTimestamp + 1;
              const data1 = encodeData(123);
              const metadata = testUtils.generateRandomBytes();
              const signature1 = await airnodeWallet.signMessage(
                hre.ethers.utils.arrayify(
                  hre.ethers.utils.keccak256(
                    hre.ethers.utils.solidityPack(
                      ['bytes32', 'uint256', 'bytes', 'bytes'],
                      [templateId, futureTimestamp, data1, metadata]
                    )
                  )
                )
              );
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [futureTimestamp]);
              await dapiServer
                .connect(roles.oevProxy)
                .updateOevProxyBeaconWithSignedData(
                  airnodeAddress,
                  templateId,
                  futureTimestamp,
                  data1,
                  metadata,
                  signature1
                );
              await hre.ethers.provider.send('evm_setNextBlockTimestamp', [futureTimestamp + 1]);
              const data2 = encodeData(456);
              const signature2 = await airnodeWallet.signMessage(
                hre.ethers.utils.arrayify(
                  hre.ethers.utils.keccak256(
                    hre.ethers.utils.solidityPack(
                      ['bytes32', 'uint256', 'bytes', 'bytes'],
                      [templateId, initialTimestamp, data2, metadata]
                    )
                  )
                )
              );
              await expect(
                dapiServer
                  .connect(roles.oevProxy)
                  .updateOevProxyBeaconWithSignedData(
                    airnodeAddress,
                    templateId,
                    initialTimestamp,
                    data2,
                    metadata,
                    signature2
                  )
              ).to.be.revertedWith('Fulfillment older than Beacon');
            });
          });
        });
        context('Data length is not correct', function () {
          it('reverts', async function () {
            const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
            await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
            const data = encodeData(123);
            const longData = data + '00';
            const metadata = testUtils.generateRandomBytes();
            const signature = await airnodeWallet.signMessage(
              hre.ethers.utils.arrayify(
                hre.ethers.utils.keccak256(
                  hre.ethers.utils.solidityPack(
                    ['bytes32', 'uint256', 'bytes', 'bytes'],
                    [templateId, timestamp, longData, metadata]
                  )
                )
              )
            );
            await expect(
              dapiServer
                .connect(roles.oevProxy)
                .updateOevProxyBeaconWithSignedData(
                  airnodeAddress,
                  templateId,
                  timestamp,
                  longData,
                  metadata,
                  signature
                )
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
          await expect(
            dapiServer
              .connect(roles.oevProxy)
              .updateOevProxyBeaconWithSignedData(airnodeAddress, templateId, timestamp, '0x', '0x', '0x')
          ).to.be.revertedWith('ECDSA: invalid signature length');
        });
      });
    });
    context('Timestamp is not valid', function () {
      it('reverts', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) - 60 * 60;
        await expect(
          dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconWithSignedData(airnodeAddress, templateId, timestamp, '0x', '0x', '0x')
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
  });

  describe('updateOevProxyBeaconSetWithSignedData', function () {
    context('Parameter lengths match', function () {
      context('Did not specify less than two Beacons', function () {
        context('All signed timestamps are valid', function () {
          context('All signatures are valid', function () {
            context('All signed data has correct length', function () {
              context('All signed data can be typecast successfully', function () {
                context('Updated value is not outdated', function () {
                  it('updates Beacon set with signed data', async function () {
                    let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                    // Set the first beacon to a value
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                    // Sign data for the next two beacons
                    const metadata = testUtils.generateRandomBytes();
                    const data1 = encodeData(105);
                    const signature1 = await airnodeWallet.signMessage(
                      hre.ethers.utils.arrayify(
                        hre.ethers.utils.keccak256(
                          hre.ethers.utils.solidityPack(
                            ['bytes32', 'uint256', 'bytes', 'bytes'],
                            [beaconSetTemplateIds[1], timestamp, data1, metadata]
                          )
                        )
                      )
                    );
                    const data2 = encodeData(110);
                    const signature2 = await airnodeWallet.signMessage(
                      hre.ethers.utils.arrayify(
                        hre.ethers.utils.keccak256(
                          hre.ethers.utils.solidityPack(
                            ['bytes32', 'uint256', 'bytes', 'bytes'],
                            [beaconSetTemplateIds[2], timestamp, data2, metadata]
                          )
                        )
                      )
                    );
                    // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                    await expect(
                      dapiServer
                        .connect(roles.oevProxy)
                        .updateOevProxyBeaconSetWithSignedData(
                          Array(3).fill(airnodeAddress),
                          beaconSetTemplateIds,
                          [0, timestamp, timestamp],
                          ['0x', data1, data2],
                          metadata,
                          ['0x', signature1, signature2]
                        )
                    )
                      .to.emit(dapiServer, 'UpdatedOevProxyBeaconSetWithSignedData')
                      .withArgs(beaconSetId, roles.oevProxy.address, 105, timestamp);
                    const beaconSet = await dapiServer
                      .connect(roles.oevProxy)
                      .readDataFeedWithIdAsOevProxy(beaconSetId);
                    expect(beaconSet.value).to.equal(105);
                    expect(beaconSet.timestamp).to.equal(timestamp);
                  });
                });
                context('Updated value is outdated', function () {
                  it('reverts', async function () {
                    let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                    timestamp++;
                    const metadata = testUtils.generateRandomBytes();
                    const data = encodeData(100);
                    const initSignature0 = await airnodeWallet.signMessage(
                      hre.ethers.utils.arrayify(
                        hre.ethers.utils.keccak256(
                          hre.ethers.utils.solidityPack(
                            ['bytes32', 'uint256', 'bytes', 'bytes'],
                            [beaconSetTemplateIds[0], timestamp, data, metadata]
                          )
                        )
                      )
                    );
                    const initSignature1 = await airnodeWallet.signMessage(
                      hre.ethers.utils.arrayify(
                        hre.ethers.utils.keccak256(
                          hre.ethers.utils.solidityPack(
                            ['bytes32', 'uint256', 'bytes', 'bytes'],
                            [beaconSetTemplateIds[1], timestamp, data, metadata]
                          )
                        )
                      )
                    );
                    const initSignature2 = await airnodeWallet.signMessage(
                      hre.ethers.utils.arrayify(
                        hre.ethers.utils.keccak256(
                          hre.ethers.utils.solidityPack(
                            ['bytes32', 'uint256', 'bytes', 'bytes'],
                            [beaconSetTemplateIds[2], timestamp, data, metadata]
                          )
                        )
                      )
                    );
                    await dapiServer
                      .connect(roles.oevProxy)
                      .updateOevProxyBeaconSetWithSignedData(
                        Array(3).fill(airnodeAddress),
                        beaconSetTemplateIds,
                        [timestamp, timestamp, timestamp],
                        [data, data, data],
                        metadata,
                        [initSignature0, initSignature1, initSignature2]
                      );
                    // Set the first beacon to a value
                    timestamp++;
                    await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                    // Sign data for the next two beacons
                    const signature1 = await airnodeWallet.signMessage(
                      hre.ethers.utils.arrayify(
                        hre.ethers.utils.keccak256(
                          hre.ethers.utils.solidityPack(
                            ['bytes32', 'uint256', 'bytes', 'bytes'],
                            [beaconSetTemplateIds[1], timestamp - 5, data, metadata]
                          )
                        )
                      )
                    );
                    const signature2 = await airnodeWallet.signMessage(
                      hre.ethers.utils.arrayify(
                        hre.ethers.utils.keccak256(
                          hre.ethers.utils.solidityPack(
                            ['bytes32', 'uint256', 'bytes', 'bytes'],
                            [beaconSetTemplateIds[2], timestamp - 5, data, metadata]
                          )
                        )
                      )
                    );
                    // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                    await expect(
                      dapiServer
                        .connect(roles.oevProxy)
                        .updateOevProxyBeaconSetWithSignedData(
                          Array(3).fill(airnodeAddress),
                          beaconSetTemplateIds,
                          [0, timestamp - 5, timestamp - 5],
                          ['0x', data, data],
                          metadata,
                          ['0x', signature1, signature2]
                        )
                    ).to.be.revertedWith('Updated value outdated');
                  });
                });
              });
              context('All signed data cannot be typecast successfully', function () {
                it('reverts', async function () {
                  let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                  // Set the first beacon to a value
                  timestamp++;
                  await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                  // Sign data for the next beacons
                  const metadata = testUtils.generateRandomBytes();
                  const data1 = encodeData(110);
                  const signature1 = await airnodeWallet.signMessage(
                    hre.ethers.utils.arrayify(
                      hre.ethers.utils.keccak256(
                        hre.ethers.utils.solidityPack(
                          ['bytes32', 'uint256', 'bytes', 'bytes'],
                          [beaconSetTemplateIds[1], timestamp, data1, metadata]
                        )
                      )
                    )
                  );
                  // The third data contains an un-typecastable value
                  const data2 = encodeData(hre.ethers.BigNumber.from(2).pow(224).add(1));
                  const signature2 = await airnodeWallet.signMessage(
                    hre.ethers.utils.arrayify(
                      hre.ethers.utils.keccak256(
                        hre.ethers.utils.solidityPack(
                          ['bytes32', 'uint256', 'bytes', 'bytes'],
                          [beaconSetTemplateIds[2], timestamp, data2, metadata]
                        )
                      )
                    )
                  );
                  // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                  await expect(
                    dapiServer
                      .connect(roles.oevProxy)
                      .updateOevProxyBeaconSetWithSignedData(
                        Array(3).fill(airnodeAddress),
                        beaconSetTemplateIds,
                        [0, timestamp, timestamp],
                        ['0x', data1, data2],
                        metadata,
                        ['0x', signature1, signature2]
                      )
                  ).to.be.revertedWith('Value typecasting error');
                });
              });
            });
            context('Not all signed data has correct length', function () {
              it('reverts', async function () {
                let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
                // Set the first beacon to a value
                timestamp++;
                await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
                // Sign data for the next beacons
                const metadata = testUtils.generateRandomBytes();
                const data1 = encodeData(110);
                const signature1 = await airnodeWallet.signMessage(
                  hre.ethers.utils.arrayify(
                    hre.ethers.utils.keccak256(
                      hre.ethers.utils.solidityPack(
                        ['bytes32', 'uint256', 'bytes', 'bytes'],
                        [beaconSetTemplateIds[1], timestamp, data1, metadata]
                      )
                    )
                  )
                );
                // The third data does not have the correct length
                const data2 = encodeData(105) + '00';
                const signature2 = await airnodeWallet.signMessage(
                  hre.ethers.utils.arrayify(
                    hre.ethers.utils.keccak256(
                      hre.ethers.utils.solidityPack(
                        ['bytes32', 'uint256', 'bytes', 'bytes'],
                        [beaconSetTemplateIds[2], timestamp, data2, metadata]
                      )
                    )
                  )
                );
                // Pass an empty signature for the first beacon, meaning that it will be read from the storage
                await expect(
                  dapiServer
                    .connect(roles.oevProxy)
                    .updateOevProxyBeaconSetWithSignedData(
                      Array(3).fill(airnodeAddress),
                      beaconSetTemplateIds,
                      [0, timestamp, timestamp],
                      ['0x', data1, data2],
                      metadata,
                      ['0x', signature1, signature2]
                    )
                ).to.be.revertedWith('Data length not correct');
              });
            });
          });
          context('Not all signatures are valid', function () {
            it('reverts', async function () {
              let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
              // Set the first beacon to a value
              timestamp++;
              await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
              // Sign data for the next two beacons
              const metadata = testUtils.generateRandomBytes();
              const data1 = encodeData(110);
              const signature1 = await airnodeWallet.signMessage(
                hre.ethers.utils.arrayify(
                  hre.ethers.utils.keccak256(
                    hre.ethers.utils.solidityPack(
                      ['bytes32', 'uint256', 'bytes', 'bytes'],
                      [beaconSetTemplateIds[1], timestamp, data1, metadata]
                    )
                  )
                )
              );
              const data2 = encodeData(105);
              // Pass an empty signature for the first beacon, meaning that it will be read from the storage
              // The signature for the third beacon is invalid
              await expect(
                dapiServer
                  .connect(roles.oevProxy)
                  .updateOevProxyBeaconSetWithSignedData(
                    Array(3).fill(airnodeAddress),
                    beaconSetTemplateIds,
                    [0, timestamp, timestamp],
                    ['0x', data1, data2],
                    metadata,
                    ['0x', signature1, '0x12345678']
                  )
              ).to.be.revertedWith('ECDSA: invalid signature length');
            });
          });
        });
        context('Not all signed timestamps are valid', function () {
          it('reverts', async function () {
            let timestamp = await testUtils.getCurrentTimestamp(hre.ethers.provider);
            // Set the first beacon to a value
            timestamp++;
            await setBeacon(beaconSetTemplateIds[0], 100, timestamp);
            // Sign data for the next two beacons
            const metadata = testUtils.generateRandomBytes();
            const data1 = encodeData(110);
            const signature1 = await airnodeWallet.signMessage(
              hre.ethers.utils.arrayify(
                hre.ethers.utils.keccak256(
                  hre.ethers.utils.solidityPack(
                    ['bytes32', 'uint256', 'bytes', 'bytes'],
                    [beaconSetTemplateIds[1], timestamp, data1, metadata]
                  )
                )
              )
            );
            const data2 = encodeData(105);
            const signature2 = await airnodeWallet.signMessage(
              hre.ethers.utils.arrayify(
                hre.ethers.utils.keccak256(
                  hre.ethers.utils.solidityPack(
                    ['bytes32', 'uint256', 'bytes', 'bytes'],
                    [beaconSetTemplateIds[1], 0, data2, metadata]
                  )
                )
              )
            );
            // Pass an empty signature for the first beacon, meaning that it will be read from the storage
            // The timestamp for the third beacon is invalid
            await expect(
              dapiServer
                .connect(roles.oevProxy)
                .updateOevProxyBeaconSetWithSignedData(
                  Array(3).fill(airnodeAddress),
                  beaconSetTemplateIds,
                  [0, timestamp, 0],
                  ['0x', data1, data2],
                  metadata,
                  ['0x', signature1, signature2]
                )
            ).to.be.revertedWith('Timestamp not valid');
          });
        });
      });
      context('Specified less than two Beacons', function () {
        it('reverts', async function () {
          await expect(
            dapiServer
              .connect(roles.oevProxy)
              .updateOevProxyBeaconSetWithSignedData([], [], [], [], testUtils.generateRandomBytes(), [])
          ).to.be.revertedWith('Specified less than two Beacons');
          await expect(
            dapiServer
              .connect(roles.oevProxy)
              .updateOevProxyBeaconSetWithSignedData(
                [testUtils.generateRandomAddress()],
                [testUtils.generateRandomBytes32()],
                [0],
                [testUtils.generateRandomBytes()],
                testUtils.generateRandomBytes(),
                [testUtils.generateRandomBytes()]
              )
          ).to.be.revertedWith('Specified less than two Beacons');
        });
      });
    });
    context('Parameter lengths do not match', function () {
      it('reverts', async function () {
        await expect(
          dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconSetWithSignedData(
              Array(4).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              testUtils.generateRandomBytes(),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(4).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              testUtils.generateRandomBytes(),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(4).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              testUtils.generateRandomBytes(),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(4).fill(testUtils.generateRandomBytes()),
              testUtils.generateRandomBytes(),
              Array(3).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
        await expect(
          dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconSetWithSignedData(
              Array(3).fill(testUtils.generateRandomAddress()),
              Array(3).fill(testUtils.generateRandomBytes32()),
              Array(3).fill(0),
              Array(3).fill(testUtils.generateRandomBytes()),
              testUtils.generateRandomBytes(),
              Array(4).fill(testUtils.generateRandomBytes())
            )
        ).to.be.revertedWith('Parameter length mismatch');
      });
    });
  });

  describe('setDapiName', function () {
    context('dAPI name is not zero', function () {
      context('Data feed ID is not zero', function () {
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(hre.ethers.constants.HashZero);
            await expect(dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSetId))
              .to.emit(dapiServer, 'SetDapiName')
              .withArgs(dapiName, beaconSetId, roles.dapiNameSetter.address);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
            await expect(dapiServer.connect(roles.randomPerson).setDapiName(dapiName, beaconSetId)).to.be.revertedWith(
              'Sender cannot set dAPI name'
            );
          });
        });
      });
      context('Data feed ID is zero', function () {
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSetId);
            await expect(dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, hre.ethers.constants.HashZero))
              .to.emit(dapiServer, 'SetDapiName')
              .withArgs(dapiName, hre.ethers.constants.HashZero, roles.dapiNameSetter.address);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(hre.ethers.constants.HashZero);
            // Check if we can still set the dAPI name
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSetId);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
            await expect(
              dapiServer.connect(roles.randomPerson).setDapiName(dapiName, hre.ethers.constants.HashZero)
            ).to.be.revertedWith('Sender cannot set dAPI name');
          });
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        await expect(
          dapiServer.connect(roles.dapiNameSetter).setDapiName(hre.ethers.constants.HashZero, beaconSetId)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('readDataFeedWithDapiNameHash', function () {
    context('dAPI name set to Beacon', function () {
      it('reads Beacon', async function () {
        const dapiName = hre.ethers.utils.formatBytes32String('My beacon');
        const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconId);
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        await setBeacon(templateId, 123, timestamp);
        const beacon = await dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash);
        expect(beacon.value).to.be.equal(123);
        expect(beacon.timestamp).to.be.equal(timestamp);
      });
    });
    context('dAPI name set to Beacon set', function () {
      it('reads Beacon set', async function () {
        const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
        const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSetId);
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        await setBeaconSet(
          airnodeAddress,
          beaconSetTemplateIds,
          [123, 456, 789],
          [timestamp - 2, timestamp, timestamp + 2]
        );
        const beaconSet = await dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash);
        expect(beaconSet.value).to.be.equal(456);
        expect(beaconSet.timestamp).to.be.equal(timestamp);
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const dapiName = hre.ethers.utils.formatBytes32String('My beacon');
        const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await expect(
          dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });

  describe('readDataFeedWithIdAsOevProxy', function () {
    context('OEV proxy data feed is more up to date', function () {
      it('reads OEV proxy data feed', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        const data = encodeData(123);
        const metadata = testUtils.generateRandomBytes();
        const signature = await airnodeWallet.signMessage(
          hre.ethers.utils.arrayify(
            hre.ethers.utils.keccak256(
              hre.ethers.utils.solidityPack(
                ['bytes32', 'uint256', 'bytes', 'bytes'],
                [templateId, timestamp, data, metadata]
              )
            )
          )
        );
        await dapiServer
          .connect(roles.oevProxy)
          .updateOevProxyBeaconWithSignedData(airnodeAddress, templateId, timestamp, data, metadata, signature);
        const beacon = await dapiServer.connect(roles.oevProxy).readDataFeedWithIdAsOevProxy(beaconId);
        expect(beacon.value).to.equal(123);
        expect(beacon.timestamp).to.equal(timestamp);
      });
    });
    context('Base data feed is more up to date', function () {
      it('reads base data feed', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        await setBeacon(templateId, 123, timestamp);
        const beacon = await dapiServer.connect(roles.oevProxy).readDataFeedWithIdAsOevProxy(beaconId);
        expect(beacon.value).to.equal(123);
        expect(beacon.timestamp).to.equal(timestamp);
      });
    });
  });

  describe('readDataFeedWithDapiNameHashAsOevProxy', function () {
    context('dAPI name set to Beacon', function () {
      context('OEV proxy data feed is more up to date', function () {
        it('reads OEV proxy data feed', async function () {
          const dapiName = hre.ethers.utils.formatBytes32String('My beacon');
          const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconId);
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const data = encodeData(123);
          const metadata = testUtils.generateRandomBytes();
          const signature = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [templateId, timestamp, data, metadata]
                )
              )
            )
          );
          await dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconWithSignedData(airnodeAddress, templateId, timestamp, data, metadata, signature);
          const beacon = await dapiServer.connect(roles.oevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
          expect(beacon.value).to.equal(123);
          expect(beacon.timestamp).to.equal(timestamp);
        });
      });
      context('Base data feed is more up to date', function () {
        it('reads base data feed', async function () {
          const dapiName = hre.ethers.utils.formatBytes32String('My beacon');
          const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconId);
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          await setBeacon(templateId, 123, timestamp);
          const beacon = await dapiServer.connect(roles.oevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
          expect(beacon.value).to.equal(123);
          expect(beacon.timestamp).to.equal(timestamp);
        });
      });
    });
    context('dAPI name set to Beacon set', function () {
      context('OEV proxy data feed is more up to date', function () {
        it('reads OEV proxy data feed', async function () {
          const dapiName = hre.ethers.utils.formatBytes32String('My beacon');
          const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSetId);
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const metadata = testUtils.generateRandomBytes();
          const data0 = encodeData(123);
          const signature0 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[0], timestamp, data0, metadata]
                )
              )
            )
          );
          const data1 = encodeData(456);
          const signature1 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[1], timestamp, data1, metadata]
                )
              )
            )
          );
          const data2 = encodeData(789);
          const signature2 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[2], timestamp, data2, metadata]
                )
              )
            )
          );
          await dapiServer
            .connect(roles.oevProxy)
            .updateOevProxyBeaconSetWithSignedData(
              [airnodeAddress, airnodeAddress, airnodeAddress],
              beaconSetTemplateIds,
              [timestamp, timestamp, timestamp],
              [data0, data1, data2],
              metadata,
              [signature0, signature1, signature2]
            );
          const beaconSet = await dapiServer
            .connect(roles.oevProxy)
            .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
          expect(beaconSet.value).to.equal(456);
          expect(beaconSet.timestamp).to.equal(timestamp);
        });
      });
      context('Base data feed is more up to date', function () {
        it('reads base data feed', async function () {
          const dapiName = hre.ethers.utils.formatBytes32String('My beacon');
          const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSetId);
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          await setBeaconSet(airnodeAddress, beaconSetTemplateIds, [123, 456, 789], [timestamp, timestamp, timestamp]);
          const beaconSet = await dapiServer
            .connect(roles.oevProxy)
            .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
          expect(beaconSet.value).to.equal(456);
          expect(beaconSet.timestamp).to.equal(timestamp);
        });
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const dapiName = hre.ethers.utils.formatBytes32String('My beacon');
        const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await expect(
          dapiServer.connect(roles.oevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });

  describe('deriveBeaconId', function () {
    context('Airnode address is not zero', function () {
      context('Template ID is not zero', function () {
        it('derives Beacon ID', async function () {
          expect(await dapiServer.deriveBeaconId(airnodeAddress, templateId)).to.equal(beaconId);
        });
      });
      context('Template ID is zero', function () {
        it('reverts', async function () {
          await expect(dapiServer.deriveBeaconId(airnodeAddress, hre.ethers.constants.HashZero)).to.be.revertedWith(
            'Template ID zero'
          );
        });
      });
    });
    context('Airnode address is zero', function () {
      it('reverts', async function () {
        await expect(dapiServer.deriveBeaconId(hre.ethers.constants.AddressZero, templateId)).to.be.revertedWith(
          'Airnode address zero'
        );
      });
    });
  });

  describe('deriveBeaconSetId', function () {
    it('derives Beacon set ID', async function () {
      expect(await dapiServer.deriveBeaconSetId(beaconSetBeaconIds)).to.equal(beaconSetId);
      // beaconSetId != 0 if no beacon ID is specified
      expect(await dapiServer.deriveBeaconSetId([])).to.not.equal(hre.ethers.constants.HashZero);
    });
  });
});
