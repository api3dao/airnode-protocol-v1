const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('DapiServer', function () {
  const HUNDRED_PERCENT = 1e8;

  function encodeData(decodedData) {
    return ethers.utils.defaultAbiCoder.encode(['int256'], [decodedData]);
  }

  function encodeSignedData(airnodeAddress, templateId, timestamp, data, signature) {
    return ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'uint256', 'bytes', 'bytes'],
      [airnodeAddress, templateId, timestamp, data, signature]
    );
  }

  async function updateBeacon(roles, dapiServer, beacon, decodedData, timestamp) {
    if (!timestamp) {
      timestamp = await helpers.time.latest();
    }
    const data = encodeData(decodedData);
    const signature = await testUtils.signData(beacon.airnode.wallet, beacon.templateId, timestamp, data);
    await dapiServer
      .connect(roles.randomPerson)
      .updateBeaconWithSignedData(beacon.airnode.wallet.address, beacon.templateId, timestamp, data, signature);
    return timestamp;
  }

  async function updateBeaconSet(roles, dapiServer, beacons, decodedData, timestamp) {
    if (!timestamp) {
      timestamp = await helpers.time.latest();
    }
    const data = encodeData(decodedData);
    const signatures = await Promise.all(
      beacons.map(async (beacon) => {
        return testUtils.signData(beacon.airnode.wallet, beacon.templateId, timestamp, data);
      })
    );
    const updateBeaconsCalldata = signatures.map((signature, index) => {
      const beacon = beacons[index];
      return dapiServer.interface.encodeFunctionData('updateBeaconWithSignedData', [
        beacon.airnode.wallet.address,
        beacon.templateId,
        timestamp,
        data,
        signature,
      ]);
    });
    const beaconIds = beacons.map((beacon) => {
      return beacon.beaconId;
    });
    const updateBeaconSetCalldata = [
      ...updateBeaconsCalldata,
      dapiServer.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds]),
    ];
    await dapiServer.connect(roles.randomPerson).multicall(updateBeaconSetCalldata);
  }

  function encodeUpdateSubscriptionConditionParameters(
    deviationThresholdInPercentage,
    deviationReference,
    heartbeatInterval
  ) {
    return ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'int224', 'uint256'],
      [deviationThresholdInPercentage, deviationReference, heartbeatInterval]
    );
  }

  async function encodeUpdateSubscriptionConditions(
    dapiServer,
    conditionFunctionId,
    updateSubscriptionConditionParameters
  ) {
    // Using Airnode ABI
    return ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'bytes32', 'address', 'bytes32', 'bytes32', 'bytes32', 'bytes'],
      [
        ethers.utils.formatBytes32String('1uabB'),
        ethers.utils.formatBytes32String('_conditionChainId'),
        (await dapiServer.provider.getNetwork()).chainId,
        ethers.utils.formatBytes32String('_conditionAddress'),
        dapiServer.address,
        ethers.utils.formatBytes32String('_conditionFunctionId'),
        ethers.utils.defaultAbiCoder.encode(['bytes4'], [conditionFunctionId]),
        ethers.utils.formatBytes32String('_conditionParameters'),
        updateSubscriptionConditionParameters,
      ]
    );
  }

  async function deriveUpdateSubscriptionId(
    dapiServer,
    airnodeAddress,
    templateId,
    updateSubscriptionConditions,
    relayerAddress,
    sponsorAddress,
    fulfillFunctionId,
    parameters
  ) {
    if (!parameters) {
      parameters = '0x';
    }
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'bytes32', 'bytes', 'bytes', 'address', 'address', 'address', 'bytes4'],
        [
          (await dapiServer.provider.getNetwork()).chainId,
          airnodeAddress,
          templateId,
          parameters,
          updateSubscriptionConditions,
          relayerAddress,
          sponsorAddress,
          dapiServer.address,
          fulfillFunctionId,
        ]
      )
    );
  }

  function median(array) {
    if (array.length === 0) {
      throw new Error('Attempted to calculate median of empty array');
    }
    array.sort((a, b) => {
      return a - b;
    });
    if (array.length % 2 == 1) {
      return array[Math.floor(array.length / 2)];
    } else {
      // We want negatives to round down to zero
      return parseInt((array[array.length / 2 - 1] + array[array.length / 2]) / 2);
    }
  }

  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      dapiNameSetter: accounts[2],
      sponsor: accounts[3],
      updateRequester: accounts[4],
      searcher: accounts[5],
      oevBeneficiary: accounts[6],
      mockOevProxy: accounts[7],
      randomPerson: accounts[9],
    };

    const dapiServerAdminRoleDescription = 'DapiServer admin';
    const dapiNameSetterRoleDescription = 'dAPI name setter';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const airnodeProtocolFactory = await ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const dapiServerFactory = await ethers.getContractFactory('DapiServer', roles.deployer);
    const dapiServer = await dapiServerFactory.deploy(
      accessControlRegistry.address,
      dapiServerAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );

    const managerRootRole = testUtils.deriveRootRole(roles.manager.address);
    const adminRole = testUtils.deriveRole(managerRootRole, dapiServerAdminRoleDescription);
    const dapiNameSetterRole = testUtils.deriveRole(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, dapiServerAdminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(dapiNameSetterRole, roles.dapiNameSetter.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(dapiNameSetterRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(adminRole, roles.manager.address);

    await dapiServer.connect(roles.sponsor).setRrpBeaconUpdatePermissionStatus(roles.updateRequester.address, true);

    // Specify Beacons
    const beacons = [];
    for (let i = 0; i < 3; i++) {
      // Each Beacon is associated to one Airnode
      const { airnodeMnemonic } = testUtils.generateRandomAirnodeWallet();
      // Using the same sponsor for brevity
      const airnode = {
        wallet: ethers.Wallet.fromMnemonic(airnodeMnemonic),
        rrpSponsorWallet: testUtils.deriveSponsorWallet(
          airnodeMnemonic,
          roles.sponsor.address,
          testUtils.PROTOCOL_IDS.RRP
        ),
        pspSponsorWallet: testUtils.deriveSponsorWallet(
          airnodeMnemonic,
          roles.sponsor.address,
          testUtils.PROTOCOL_IDS.PSP
        ),
      };
      // Each Beacon is associated to one relayer
      const { airnodeMnemonic: relayerMnemonic } = testUtils.generateRandomAirnodeWallet();
      const relayer = {
        wallet: ethers.Wallet.fromMnemonic(relayerMnemonic),
        rrpRelayedSponsorWallet: testUtils.deriveSponsorWallet(
          relayerMnemonic,
          roles.sponsor.address,
          testUtils.PROTOCOL_IDS.RELAYED_RRP
        ),
        pspRelayedSponsorWallet: testUtils.deriveSponsorWallet(
          relayerMnemonic,
          roles.sponsor.address,
          testUtils.PROTOCOL_IDS.RELAYED_PSP
        ),
      };
      // Fund the sponsor wallets
      await roles.deployer.sendTransaction({
        to: airnode.rrpSponsorWallet.address,
        value: ethers.utils.parseEther('1'),
      });
      await roles.deployer.sendTransaction({
        to: airnode.pspSponsorWallet.address,
        value: ethers.utils.parseEther('1'),
      });
      await roles.deployer.sendTransaction({
        to: relayer.rrpRelayedSponsorWallet.address,
        value: ethers.utils.parseEther('1'),
      });
      await roles.deployer.sendTransaction({
        to: relayer.pspRelayedSponsorWallet.address,
        value: ethers.utils.parseEther('1'),
      });
      // Each Beacon has unique parameters
      const endpointId = testUtils.generateRandomBytes32();
      const templateParameters = testUtils.generateRandomBytes();
      const templateId = ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointId, templateParameters]);
      const requestParameters = testUtils.generateRandomBytes();
      const beaconId = ethers.utils.keccak256(
        ethers.utils.solidityPack(['address', 'bytes32'], [airnode.wallet.address, templateId])
      );
      const beaconUpdateSubscriptionConditionParameters = encodeUpdateSubscriptionConditionParameters(
        HUNDRED_PERCENT / 10,
        -100,
        24 * 60 * 60
      );
      const beaconUpdateSubscriptionConditions = await encodeUpdateSubscriptionConditions(
        dapiServer,
        dapiServer.interface.getSighash('conditionPspBeaconUpdate'),
        beaconUpdateSubscriptionConditionParameters
      );
      const beaconUpdateSubscriptionId = await deriveUpdateSubscriptionId(
        dapiServer,
        airnode.wallet.address,
        templateId,
        beaconUpdateSubscriptionConditions,
        airnode.wallet.address,
        roles.sponsor.address,
        dapiServer.interface.getSighash('fulfillPspBeaconUpdate')
      );
      beacons.push({
        airnode,
        relayer,
        endpointId,
        templateParameters,
        templateId,
        requestParameters,
        beaconId,
        beaconUpdateSubscriptionConditionParameters,
        beaconUpdateSubscriptionConditions,
        beaconUpdateSubscriptionId,
      });
    }
    const beaconIds = beacons.map((beacon) => {
      return beacon.beaconId;
    });
    const beaconSetId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconIds]));
    const beaconSetUpdateSubscriptionConditionParameters = encodeUpdateSubscriptionConditionParameters(
      HUNDRED_PERCENT / 20,
      -100,
      2 * 24 * 60 * 60
    );
    const beaconSetUpdateSubscriptionConditions = await encodeUpdateSubscriptionConditions(
      dapiServer,
      dapiServer.interface.getSighash('conditionPspBeaconSetUpdate'),
      beaconSetUpdateSubscriptionConditionParameters
    );
    const beaconSetUpdateSubscriptionId = await deriveUpdateSubscriptionId(
      dapiServer,
      beacons[0].airnode.wallet.address,
      ethers.constants.HashZero,
      beaconSetUpdateSubscriptionConditions,
      beacons[0].airnode.wallet.address,
      roles.sponsor.address,
      dapiServer.interface.getSighash('fulfillPspBeaconSetUpdate'),
      ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconIds])
    );
    const beaconSet = {
      beaconIds,
      beaconSetId,
      beaconSetUpdateSubscriptionConditionParameters,
      beaconSetUpdateSubscriptionConditions,
      beaconSetUpdateSubscriptionId,
    };

    const dataFeedProxyWithOevFactory = await ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
    const oevProxy = await dataFeedProxyWithOevFactory.deploy(
      dapiServer.address,
      beacons[0].beaconId,
      roles.oevBeneficiary.address
    );

    return {
      roles,
      accessControlRegistry,
      airnodeProtocol,
      dapiServer,
      oevProxy,
      dapiServerAdminRoleDescription,
      dapiNameSetterRole,
      beacons,
      beaconSet,
    };
  }

  describe('constructor', function () {
    context('AirnodeProtocol address is not zero', function () {
      it('constructs', async function () {
        const {
          roles,
          accessControlRegistry,
          airnodeProtocol,
          dapiServer,
          dapiServerAdminRoleDescription,
          dapiNameSetterRole,
        } = await helpers.loadFixture(deploy);
        expect(await dapiServer.DAPI_NAME_SETTER_ROLE_DESCRIPTION()).to.equal('dAPI name setter');
        expect(await dapiServer.HUNDRED_PERCENT()).to.equal(HUNDRED_PERCENT);
        expect(await dapiServer.accessControlRegistry()).to.equal(accessControlRegistry.address);
        expect(await dapiServer.adminRoleDescription()).to.equal(dapiServerAdminRoleDescription);
        expect(await dapiServer.manager()).to.equal(roles.manager.address);
        expect(await dapiServer.airnodeProtocol()).to.equal(airnodeProtocol.address);
        expect(await dapiServer.dapiNameSetterRole()).to.equal(dapiNameSetterRole);
      });
    });
    context('AirnodeProtocol address is zero', function () {
      it('reverts', async function () {
        const { roles, accessControlRegistry, dapiServerAdminRoleDescription } = await helpers.loadFixture(deploy);
        const dapiServerFactory = await ethers.getContractFactory('DapiServer', roles.deployer);
        await expect(
          dapiServerFactory.deploy(
            accessControlRegistry.address,
            dapiServerAdminRoleDescription,
            roles.manager.address,
            ethers.constants.AddressZero
          )
        ).to.be.revertedWith('AirnodeProtocol address zero');
      });
    });
  });

  describe('setRrpBeaconUpdatePermissionStatus', function () {
    context('Update requester is not zero address', function () {
      it('sets RRP-based beacon update permission status', async function () {
        const { roles, dapiServer } = await helpers.loadFixture(deploy);
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
        const { roles, dapiServer } = await helpers.loadFixture(deploy);
        await expect(
          dapiServer.connect(roles.sponsor).setRrpBeaconUpdatePermissionStatus(ethers.constants.AddressZero, false)
        ).to.be.revertedWith('Update requester zero');
      });
    });
  });

  describe('requestRrpBeaconUpdateWithTemplate', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithTemplate(beacon.airnode.wallet.address, beacon.templateId, roles.sponsor.address)
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            roles.sponsor.address,
            requestId,
            roles.sponsor.address
          );
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithTemplate(beacon.airnode.wallet.address, beacon.templateId, roles.sponsor.address)
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            roles.sponsor.address,
            requestId,
            roles.updateRequester.address
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRrpBeaconUpdateWithTemplate(beacon.airnode.wallet.address, beacon.templateId, roles.sponsor.address)
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('requestRrpBeaconUpdateWithEndpoint', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            roles.sponsor.address,
            requestId,
            roles.sponsor.address
          );
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            roles.sponsor.address,
            requestId,
            roles.updateRequester.address
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('requestRelayedRrpBeaconUpdateWithTemplate', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.relayer.wallet.address,
            roles.sponsor.address,
            requestId,
            roles.sponsor.address
          );
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.relayer.wallet.address,
            roles.sponsor.address,
            requestId,
            roles.updateRequester.address
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('requestRelayedRrpBeaconUpdateWithEndpoint', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.sponsor)
            .callStatic.requestRelayedRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.sponsor)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.relayer.wallet.address,
            roles.sponsor.address,
            requestId,
            roles.sponsor.address
          );
      });
    });
    context('Request updater is permitted', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dapiServer.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dapiServer
            .connect(roles.updateRequester)
            .callStatic.requestRelayedRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dapiServer
            .connect(roles.updateRequester)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dapiServer, 'RequestedRelayedRrpBeaconUpdate')
          .withArgs(
            beacon.beaconId,
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.relayer.wallet.address,
            roles.sponsor.address,
            requestId,
            roles.updateRequester.address
          );
      });
    });
    context('Request updater is not permitted', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              beacon.relayer.wallet.address,
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
                  const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
                  const beacon = beacons[0];
                  const requestId = await testUtils.deriveRequestId(
                    airnodeProtocol,
                    dapiServer.address,
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    '0x',
                    roles.sponsor.address,
                    dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
                  );
                  await dapiServer
                    .connect(roles.sponsor)
                    .requestRrpBeaconUpdateWithTemplate(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      roles.sponsor.address
                    );
                  const beaconBefore = await dapiServer.dataFeeds(beacon.beaconId);
                  expect(beaconBefore.value).to.equal(0);
                  expect(beaconBefore.timestamp).to.equal(0);
                  const decodedData = 123;
                  const data = encodeData(decodedData);
                  const timestamp = await helpers.time.latest();
                  const signature = testUtils.signRrpFulfillment(
                    beacon.airnode.wallet,
                    requestId,
                    timestamp,
                    beacon.airnode.rrpSponsorWallet.address
                  );
                  await expect(
                    airnodeProtocol
                      .connect(beacon.airnode.rrpSponsorWallet)
                      .fulfillRequest(
                        requestId,
                        beacon.airnode.wallet.address,
                        dapiServer.address,
                        dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithRrp')
                    .withArgs(beacon.beaconId, requestId, decodedData, timestamp);
                  const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
              context('Request is relayed', function () {
                it('updates Beacon', async function () {
                  const { roles, airnodeProtocol, dapiServer, beacons } = await helpers.loadFixture(deploy);
                  const beacon = beacons[0];
                  const requestId = await testUtils.deriveRelayedRequestId(
                    airnodeProtocol,
                    dapiServer.address,
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    '0x',
                    beacon.relayer.wallet.address,
                    roles.sponsor.address,
                    dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
                  );
                  await dapiServer
                    .connect(roles.sponsor)
                    .requestRelayedRrpBeaconUpdateWithTemplate(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  const beaconBefore = await dapiServer.dataFeeds(beacon.beaconId);
                  expect(beaconBefore.value).to.equal(0);
                  expect(beaconBefore.timestamp).to.equal(0);
                  const decodedData = 123;
                  const data = encodeData(decodedData);
                  const timestamp = await helpers.time.latest();
                  const signature = testUtils.signRrpRelayedFulfillment(
                    beacon.airnode.wallet,
                    requestId,
                    timestamp,
                    beacon.relayer.rrpRelayedSponsorWallet.address,
                    data
                  );
                  await expect(
                    airnodeProtocol
                      .connect(beacon.relayer.rrpRelayedSponsorWallet)
                      .fulfillRequestRelayed(
                        requestId,
                        beacon.airnode.wallet.address,
                        dapiServer.address,
                        beacon.relayer.wallet.address,
                        dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithRrp')
                    .withArgs(beacon.beaconId, requestId, decodedData, timestamp);
                  const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
            });
            context('Data is not fresher than Beacon', function () {
              it('does not update Beacon', async function () {
                const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
                const beacon = beacons[0];
                const requestId = await testUtils.deriveRequestId(
                  airnodeProtocol,
                  dapiServer.address,
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  '0x',
                  roles.sponsor.address,
                  dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
                );
                await dapiServer
                  .connect(roles.sponsor)
                  .requestRrpBeaconUpdateWithTemplate(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    roles.sponsor.address
                  );
                const beaconBefore = await dapiServer.dataFeeds(beacon.beaconId);
                expect(beaconBefore.value).to.equal(0);
                expect(beaconBefore.timestamp).to.equal(0);
                const decodedData = 123;
                const data = encodeData(decodedData);
                const timestamp = (await helpers.time.latest()) - 10 * 60;
                const signature = testUtils.signRrpFulfillment(
                  beacon.airnode.wallet,
                  requestId,
                  timestamp,
                  beacon.airnode.rrpSponsorWallet.address
                );
                const updatedDecodedData = 456;
                const updatedTimestamp = await updateBeacon(roles, dapiServer, beacon, updatedDecodedData);
                const staticCallResult = await airnodeProtocol
                  .connect(beacon.airnode.rrpSponsorWallet)
                  .callStatic.fulfillRequest(
                    requestId,
                    beacon.airnode.wallet.address,
                    dapiServer.address,
                    dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                    timestamp,
                    data,
                    signature,
                    { gasLimit: 500000 }
                  );
                expect(staticCallResult.callSuccess).to.equal(false);
                expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Does not update timestamp');
                await expect(
                  airnodeProtocol
                    .connect(beacon.airnode.rrpSponsorWallet)
                    .fulfillRequest(
                      requestId,
                      beacon.airnode.wallet.address,
                      dapiServer.address,
                      dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
                const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(updatedDecodedData);
                expect(beaconAfter.timestamp).to.equal(updatedTimestamp);
              });
            });
          });
          context('Data is not typecast successfully', function () {
            context('Data larger than maximum int224', function () {
              it('does not update Beacon', async function () {
                const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
                const beacon = beacons[0];
                const requestId = await testUtils.deriveRequestId(
                  airnodeProtocol,
                  dapiServer.address,
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  '0x',
                  roles.sponsor.address,
                  dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
                );
                await dapiServer
                  .connect(roles.sponsor)
                  .requestRrpBeaconUpdateWithTemplate(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    roles.sponsor.address
                  );
                const decodedData = ethers.BigNumber.from(2).pow(223);
                const data = encodeData(decodedData);
                const timestamp = await helpers.time.latest();
                const signature = testUtils.signRrpFulfillment(
                  beacon.airnode.wallet,
                  requestId,
                  timestamp,
                  beacon.airnode.rrpSponsorWallet.address
                );
                const staticCallResult = await airnodeProtocol
                  .connect(beacon.airnode.rrpSponsorWallet)
                  .callStatic.fulfillRequest(
                    requestId,
                    beacon.airnode.wallet.address,
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
                    .connect(beacon.airnode.rrpSponsorWallet)
                    .fulfillRequest(
                      requestId,
                      beacon.airnode.wallet.address,
                      dapiServer.address,
                      dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
                const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(0);
                expect(beaconAfter.timestamp).to.equal(0);
              });
            });
            context('Data smaller than minimum int224', function () {
              it('does not update Beacon', async function () {
                const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
                const beacon = beacons[0];
                const requestId = await testUtils.deriveRequestId(
                  airnodeProtocol,
                  dapiServer.address,
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  '0x',
                  roles.sponsor.address,
                  dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
                );
                await dapiServer
                  .connect(roles.sponsor)
                  .requestRrpBeaconUpdateWithTemplate(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    roles.sponsor.address
                  );
                const decodedData = ethers.BigNumber.from(2).pow(223).add(1).mul(-1);
                const data = encodeData(decodedData);
                const timestamp = await helpers.time.latest();
                const signature = testUtils.signRrpFulfillment(
                  beacon.airnode.wallet,
                  requestId,
                  timestamp,
                  beacon.airnode.rrpSponsorWallet.address
                );
                const staticCallResult = await airnodeProtocol
                  .connect(beacon.airnode.rrpSponsorWallet)
                  .callStatic.fulfillRequest(
                    requestId,
                    beacon.airnode.wallet.address,
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
                    .connect(beacon.airnode.rrpSponsorWallet)
                    .fulfillRequest(
                      requestId,
                      beacon.airnode.wallet.address,
                      dapiServer.address,
                      dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
                const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(0);
                expect(beaconAfter.timestamp).to.equal(0);
              });
            });
          });
        });
        context('Encoded data length is too long', function () {
          it('does not update Beacon', async function () {
            const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            const requestId = await testUtils.deriveRequestId(
              airnodeProtocol,
              dapiServer.address,
              beacon.airnode.wallet.address,
              beacon.templateId,
              '0x',
              roles.sponsor.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
            );
            await dapiServer
              .connect(roles.sponsor)
              .requestRrpBeaconUpdateWithTemplate(
                beacon.airnode.wallet.address,
                beacon.templateId,
                roles.sponsor.address
              );
            const decodedData = 123;
            const data = encodeData(decodedData) + '00';
            const timestamp = await helpers.time.latest();
            const signature = testUtils.signRrpFulfillment(
              beacon.airnode.wallet,
              requestId,
              timestamp,
              beacon.airnode.rrpSponsorWallet.address
            );
            const staticCallResult = await airnodeProtocol
              .connect(beacon.airnode.rrpSponsorWallet)
              .callStatic.fulfillRequest(
                requestId,
                beacon.airnode.wallet.address,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Data length not correct');
            await expect(
              airnodeProtocol
                .connect(beacon.airnode.rrpSponsorWallet)
                .fulfillRequest(
                  requestId,
                  beacon.airnode.wallet.address,
                  dapiServer.address,
                  dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                  timestamp,
                  data,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
            const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
            expect(beaconAfter.value).to.equal(0);
            expect(beaconAfter.timestamp).to.equal(0);
          });
        });
        context('Encoded data length is too short', function () {
          it('reverts', async function () {
            const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            const requestId = await testUtils.deriveRequestId(
              airnodeProtocol,
              dapiServer.address,
              beacon.airnode.wallet.address,
              beacon.templateId,
              '0x',
              roles.sponsor.address,
              dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
            );
            await dapiServer
              .connect(roles.sponsor)
              .requestRrpBeaconUpdateWithTemplate(
                beacon.airnode.wallet.address,
                beacon.templateId,
                roles.sponsor.address
              );
            const decodedData = 123;
            const encodedData = encodeData(decodedData);
            const data = encodedData.substring(0, encodedData.length - 2);
            const timestamp = await helpers.time.latest();
            const signature = testUtils.signRrpFulfillment(
              beacon.airnode.wallet,
              requestId,
              timestamp,
              beacon.airnode.rrpSponsorWallet.address
            );
            const staticCallResult = await airnodeProtocol
              .connect(beacon.airnode.rrpSponsorWallet)
              .callStatic.fulfillRequest(
                requestId,
                beacon.airnode.wallet.address,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              );
            expect(staticCallResult.callSuccess).to.equal(false);
            expect(testUtils.decodeRevertString(staticCallResult.callData)).to.equal('Data length not correct');
            await expect(
              airnodeProtocol
                .connect(beacon.airnode.rrpSponsorWallet)
                .fulfillRequest(
                  requestId,
                  beacon.airnode.wallet.address,
                  dapiServer.address,
                  dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                  timestamp,
                  data,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
            const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
            expect(beaconAfter.value).to.equal(0);
            expect(beaconAfter.timestamp).to.equal(0);
          });
        });
      });
      context('Timestamp is older than 1 hour', function () {
        it('does not update Beacon', async function () {
          const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const requestId = await testUtils.deriveRequestId(
            airnodeProtocol,
            dapiServer.address,
            beacon.airnode.wallet.address,
            beacon.templateId,
            '0x',
            roles.sponsor.address,
            dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
          );
          await dapiServer
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            );
          const decodedData = 123;
          const data = encodeData(decodedData);
          const timestamp = (await helpers.time.latest()) - 60 * 60;
          const signature = testUtils.signRrpFulfillment(
            beacon.airnode.wallet,
            requestId,
            timestamp,
            beacon.airnode.rrpSponsorWallet.address
          );
          const staticCallResult = await airnodeProtocol
            .connect(beacon.airnode.rrpSponsorWallet)
            .callStatic.fulfillRequest(
              requestId,
              beacon.airnode.wallet.address,
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
              .connect(beacon.airnode.rrpSponsorWallet)
              .fulfillRequest(
                requestId,
                beacon.airnode.wallet.address,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
          const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
          expect(beaconAfter.value).to.equal(0);
          expect(beaconAfter.timestamp).to.equal(0);
        });
      });
      context('Timestamp is more than 15 minutes from the future', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const requestId = await testUtils.deriveRequestId(
            airnodeProtocol,
            dapiServer.address,
            beacon.airnode.wallet.address,
            beacon.templateId,
            '0x',
            roles.sponsor.address,
            dapiServer.interface.getSighash('fulfillRrpBeaconUpdate')
          );
          await dapiServer
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            );
          const decodedData = 123;
          const data = encodeData(decodedData);
          const timestamp = (await helpers.time.latest()) + 15 * 60 + 1;
          const signature = testUtils.signRrpFulfillment(
            beacon.airnode.wallet,
            requestId,
            timestamp,
            beacon.airnode.rrpSponsorWallet.address
          );
          const staticCallResult = await airnodeProtocol
            .connect(beacon.airnode.rrpSponsorWallet)
            .callStatic.fulfillRequest(
              requestId,
              beacon.airnode.wallet.address,
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
              .connect(beacon.airnode.rrpSponsorWallet)
              .fulfillRequest(
                requestId,
                beacon.airnode.wallet.address,
                dapiServer.address,
                dapiServer.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          ).to.not.emit(dapiServer, 'UpdatedBeaconWithRrp');
          const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
          expect(beaconAfter.value).to.equal(0);
          expect(beaconAfter.timestamp).to.equal(0);
        });
      });
    });
    context('Sender is not AirnodeProtocol', function () {
      it('reverts', async function () {
        const { roles, dapiServer } = await deploy();
        await expect(
          dapiServer.connect(roles.randomPerson).fulfillRrpBeaconUpdate(ethers.constants.HashZero, 0, '0x')
        ).to.be.revertedWith('Sender not Airnode protocol');
      });
    });
  });

  describe('registerBeaconUpdateSubscription', function () {
    context('Relayer address is not zero', function () {
      context('Sponsor address is not zero', function () {
        context('Subscription is not registered', function () {
          it('registers beacon update subscription', async function () {
            const { roles, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            await expect(
              dapiServer
                .connect(roles.randomPerson)
                .registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beacon.beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                )
            )
              .to.emit(dapiServer, 'RegisteredBeaconUpdateSubscription')
              .withArgs(
                beacon.beaconId,
                beacon.beaconUpdateSubscriptionId,
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            expect(await dapiServer.subscriptionIdToBeaconId(beacon.beaconUpdateSubscriptionId)).to.equal(
              beacon.beaconId
            );
          });
        });
        context('Subscription is already registered', function () {
          it('reverts', async function () {
            const { roles, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            await dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await expect(
              dapiServer
                .connect(roles.randomPerson)
                .registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beacon.beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                )
            ).to.be.revertedWith('Subscription already registered');
          });
        });
      });
      context('Sponsor address is zero', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                ethers.constants.AddressZero
              )
          ).to.be.revertedWith('Sponsor address zero');
        });
      });
    });
    context('Relayer address is zero', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await deploy();
        const beacon = beacons[0];
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .registerBeaconUpdateSubscription(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.beaconUpdateSubscriptionConditions,
              ethers.constants.AddressZero,
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
              const { roles, dapiServer, beacons } = await deploy();
              const beacon = beacons[0];
              // Even if the deviation and heartbeat interval are zero, since the Beacon timestamp
              // is zero, the condition will return true
              const beaconUpdateSubscriptionConditionParameters = encodeUpdateSubscriptionConditionParameters(0, 0, 0);
              const beaconUpdateSubscriptionConditions = await encodeUpdateSubscriptionConditions(
                dapiServer,
                dapiServer.interface.getSighash('conditionPspBeaconUpdate'),
                beaconUpdateSubscriptionConditionParameters
              );
              const beaconUpdateSubscriptionId = await dapiServer
                .connect(roles.randomPerson)
                .callStatic.registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                );
              await dapiServer
                .connect(roles.randomPerson)
                .registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                );
              const data = encodeData(0);
              expect(
                await dapiServer.callStatic.conditionPspBeaconUpdate(
                  beaconUpdateSubscriptionId,
                  data,
                  beaconUpdateSubscriptionConditionParameters
                )
              ).to.equal(true);
            });
          });
          context('Beacon timestamp is not zero', function () {
            context('Data makes a larger update than the threshold', function () {
              context('Update is upwards', function () {
                context('It has been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    const { roles, dapiServer, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dapiServer
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    const timestamp = await updateBeacon(roles, dapiServer, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(120);
                    // It has been 1 day since the Beacon timestamp
                    await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                    await helpers.mine();
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('It has not been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    const { roles, dapiServer, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dapiServer
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    await updateBeacon(roles, dapiServer, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(120);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
              });
              context('Update is downwards', function () {
                context('It has been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    const { roles, dapiServer, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dapiServer
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    const timestamp = await updateBeacon(roles, dapiServer, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(80);
                    // It has been 1 day since the Beacon timestamp
                    await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                    await helpers.mine();
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('It has not been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    const { roles, dapiServer, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dapiServer
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    await updateBeacon(roles, dapiServer, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(80);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
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
                    const { roles, dapiServer, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dapiServer
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to -100 first (deviation reference)
                    await updateBeacon(roles, dapiServer, beacon, -100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // Any value satisfies the condition
                    const data = encodeData(-99);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('Initial value is not deviation reference', function () {
                  context('It has been at least heartbeat interval seconds since the last update', function () {
                    it('returns true', async function () {
                      const { roles, dapiServer, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dapiServer
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      const timestamp = await updateBeacon(roles, dapiServer, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(119);
                      // It has been 1 day since the Beacon timestamp
                      await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                      await helpers.mine();
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beacon.beaconUpdateSubscriptionId,
                          data,
                          beacon.beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(true);
                    });
                  });
                  context('It has not been at least heartbeat interval seconds since the last update', function () {
                    it('returns false', async function () {
                      const { roles, dapiServer, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dapiServer
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      await updateBeacon(roles, dapiServer, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(119);
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beacon.beaconUpdateSubscriptionId,
                          data,
                          beacon.beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(false);
                    });
                  });
                });
              });
              context('Update is downwards', function () {
                context('Initial value is deviation reference', function () {
                  it('returns true', async function () {
                    const { roles, dapiServer, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dapiServer
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to -100 first (deviation reference)
                    await updateBeacon(roles, dapiServer, beacon, -100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // Any value satisfies the condition
                    const data = encodeData(-101);
                    expect(
                      await dapiServer.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('Initial value is not deviation reference', function () {
                  context('It has been at least heartbeat interval seconds since the last update', function () {
                    it('returns true', async function () {
                      const { roles, dapiServer, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dapiServer
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      const timestamp = await updateBeacon(roles, dapiServer, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(81);
                      // It has been 1 day since the Beacon timestamp
                      await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                      await helpers.mine();
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beacon.beaconUpdateSubscriptionId,
                          data,
                          beacon.beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(true);
                    });
                  });
                  context('It has not been at least heartbeat interval seconds since the last update', function () {
                    it('returns false', async function () {
                      const { roles, dapiServer, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dapiServer
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      await updateBeacon(roles, dapiServer, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(81);
                      expect(
                        await dapiServer.callStatic.conditionPspBeaconUpdate(
                          beacon.beaconUpdateSubscriptionId,
                          data,
                          beacon.beaconUpdateSubscriptionConditionParameters
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
            const { roles, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];

            const longConditionParameters = beacon.beaconUpdateSubscriptionConditionParameters + '00';
            const longConditions = await encodeUpdateSubscriptionConditions(
              dapiServer,
              dapiServer.interface.getSighash('conditionPspBeaconUpdate'),
              longConditionParameters
            );
            const subscriptionIdWithLongConditionParameters = await dapiServer
              .connect(roles.randomPerson)
              .callStatic.registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                longConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                longConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            const data = encodeData(0);
            await expect(
              dapiServer.callStatic.conditionPspBeaconUpdate(
                subscriptionIdWithLongConditionParameters,
                data,
                longConditionParameters
              )
            ).to.be.revertedWith('Incorrect parameter length');

            const shortConditionParameters = beacon.beaconUpdateSubscriptionConditionParameters.substring(
              0,
              beacon.beaconUpdateSubscriptionConditionParameters.length - 2
            );
            const shortConditions = await encodeUpdateSubscriptionConditions(
              dapiServer,
              dapiServer.interface.getSighash('conditionPspBeaconUpdate'),
              shortConditionParameters
            );
            const subscriptionIdWithShortConditionParameters = await dapiServer
              .connect(roles.randomPerson)
              .callStatic.registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                shortConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                shortConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await expect(
              dapiServer.callStatic.conditionPspBeaconUpdate(
                subscriptionIdWithShortConditionParameters,
                data,
                shortConditionParameters
              )
            ).to.be.revertedWith('Incorrect parameter length');
          });
        });
      });
      context('Data length is not correct', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          await dapiServer
            .connect(roles.randomPerson)
            .registerBeaconUpdateSubscription(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.beaconUpdateSubscriptionConditions,
              beacon.airnode.wallet.address,
              roles.sponsor.address
            );
          const data = encodeData(123);
          const shortData = data.substring(0, data.length - 2);
          const longData = data + '00';
          await expect(
            dapiServer.callStatic.conditionPspBeaconUpdate(
              beacon.beaconUpdateSubscriptionId,
              shortData,
              beacon.beaconUpdateSubscriptionConditionParameters
            )
          ).to.be.revertedWith('Data length not correct');
          await expect(
            dapiServer.callStatic.conditionPspBeaconUpdate(
              beacon.beaconUpdateSubscriptionId,
              longData,
              beacon.beaconUpdateSubscriptionConditionParameters
            )
          ).to.be.revertedWith('Data length not correct');
        });
      });
    });
    context('Subscription is not registered', function () {
      it('reverts', async function () {
        const { dapiServer } = await deploy();
        const data = encodeData(123);
        await expect(
          dapiServer.callStatic.conditionPspBeaconUpdate(testUtils.generateRandomBytes32(), data, '0x')
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
                  const { roles, dapiServer, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dapiServer
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.airnode.wallet.address,
                      roles.sponsor.address
                    );
                  await dapiServer
                    .connect(roles.randomPerson)
                    .registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.airnode.wallet.address,
                      roles.sponsor.address
                    );
                  const decodedData = 123;
                  const data = encodeData(decodedData);
                  const timestamp = await helpers.time.latest();
                  const signature = testUtils.signPspFulfillment(
                    beacon.airnode.wallet,
                    subscriptionId,
                    timestamp,
                    beacon.airnode.pspSponsorWallet.address
                  );
                  await expect(
                    dapiServer
                      .connect(beacon.airnode.pspSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        subscriptionId,
                        beacon.airnode.wallet.address,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address,
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithPsp')
                    .withArgs(beacon.beaconId, subscriptionId, decodedData, timestamp);
                  const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
              context('Signature is not valid', function () {
                it('reverts', async function () {
                  const { roles, dapiServer, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dapiServer
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.airnode.wallet.address,
                      roles.sponsor.address
                    );
                  await dapiServer
                    .connect(roles.randomPerson)
                    .registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.airnode.wallet.address,
                      roles.sponsor.address
                    );
                  const decodedData = 123;
                  const data = encodeData(decodedData);
                  const timestamp = await helpers.time.latest();
                  await expect(
                    dapiServer
                      .connect(beacon.airnode.pspSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        subscriptionId,
                        beacon.airnode.wallet.address,
                        beacon.airnode.wallet.address,
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
                  const { roles, dapiServer, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dapiServer
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  await dapiServer
                    .connect(roles.randomPerson)
                    .registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  const decodedData = 123;
                  const data = encodeData(decodedData);
                  const timestamp = await helpers.time.latest();
                  const signature = testUtils.signPspRelayedFulfillment(
                    beacon.airnode.wallet,
                    subscriptionId,
                    timestamp,
                    beacon.relayer.pspRelayedSponsorWallet.address,
                    data
                  );
                  await expect(
                    dapiServer
                      .connect(beacon.relayer.pspRelayedSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        subscriptionId,
                        beacon.airnode.wallet.address,
                        beacon.relayer.wallet.address,
                        roles.sponsor.address,
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dapiServer, 'UpdatedBeaconWithPsp')
                    .withArgs(beacon.beaconId, subscriptionId, decodedData, timestamp);
                  const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
              context('Signature is not valid', function () {
                it('reverts', async function () {
                  const { roles, dapiServer, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dapiServer
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  await dapiServer
                    .connect(roles.randomPerson)
                    .registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  const decodedData = 123;
                  const data = encodeData(decodedData);
                  const timestamp = await helpers.time.latest();
                  await expect(
                    dapiServer
                      .connect(beacon.relayer.pspRelayedSponsorWallet)
                      .fulfillPspBeaconUpdate(
                        subscriptionId,
                        beacon.airnode.wallet.address,
                        beacon.relayer.wallet.address,
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
              const { roles, dapiServer, beacons } = await deploy();
              const beacon = beacons[0];
              const subscriptionId = await dapiServer
                .connect(roles.randomPerson)
                .callStatic.registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beacon.beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                );
              await dapiServer
                .connect(roles.randomPerson)
                .registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beacon.beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                );
              const decodedData = 123;
              const data = encodeData(decodedData);
              const timestamp = (await helpers.time.latest()) - 10 * 60;
              const signature = testUtils.signPspFulfillment(
                beacon.airnode.wallet,
                subscriptionId,
                timestamp,
                beacon.airnode.pspSponsorWallet.address
              );
              const updatedDecodedData = 456;
              await updateBeacon(roles, dapiServer, beacon, updatedDecodedData);
              await expect(
                dapiServer
                  .connect(beacon.airnode.pspSponsorWallet)
                  .fulfillPspBeaconUpdate(
                    subscriptionId,
                    beacon.airnode.wallet.address,
                    beacon.airnode.wallet.address,
                    roles.sponsor.address,
                    timestamp,
                    data,
                    signature,
                    { gasLimit: 500000 }
                  )
              ).to.be.revertedWith('Does not update timestamp');
            });
          });
        });
        context('Data length is not correct', function () {
          it('reverts', async function () {
            const { roles, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            const subscriptionId = await dapiServer
              .connect(roles.randomPerson)
              .callStatic.registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await dapiServer
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            const decodedData = 123;
            const data = encodeData(decodedData);
            const timestamp = await helpers.time.latest();
            const signature = testUtils.signPspFulfillment(
              beacon.airnode.wallet,
              subscriptionId,
              timestamp,
              beacon.airnode.pspSponsorWallet.address
            );
            const longData = data + '00';
            await expect(
              dapiServer
                .connect(beacon.airnode.pspSponsorWallet)
                .fulfillPspBeaconUpdate(
                  subscriptionId,
                  beacon.airnode.wallet.address,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address,
                  timestamp,
                  longData,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Data length not correct');
            const shortData = data.substring(0, data.length - 2);
            await expect(
              dapiServer
                .connect(beacon.airnode.pspSponsorWallet)
                .fulfillPspBeaconUpdate(
                  subscriptionId,
                  beacon.airnode.wallet.address,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address,
                  timestamp,
                  shortData,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Subscription is not registered', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const subscriptionId = await dapiServer
            .connect(roles.randomPerson)
            .callStatic.registerBeaconUpdateSubscription(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.beaconUpdateSubscriptionConditions,
              beacon.airnode.wallet.address,
              roles.sponsor.address
            );
          const decodedData = 123;
          const data = encodeData(decodedData);
          const timestamp = await helpers.time.latest();
          const signature = testUtils.signPspFulfillment(
            beacon.airnode.wallet,
            subscriptionId,
            timestamp,
            beacon.airnode.pspSponsorWallet.address
          );
          await expect(
            dapiServer
              .connect(beacon.airnode.pspSponsorWallet)
              .fulfillPspBeaconUpdate(
                subscriptionId,
                beacon.airnode.wallet.address,
                beacon.airnode.wallet.address,
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
        const { roles, dapiServer, beacons } = await deploy();
        const beacon = beacons[0];
        const subscriptionId = await dapiServer
          .connect(roles.randomPerson)
          .callStatic.registerBeaconUpdateSubscription(
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.beaconUpdateSubscriptionConditions,
            beacon.airnode.wallet.address,
            roles.sponsor.address
          );
        await dapiServer
          .connect(roles.randomPerson)
          .registerBeaconUpdateSubscription(
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.beaconUpdateSubscriptionConditions,
            beacon.airnode.wallet.address,
            roles.sponsor.address
          );
        const decodedData = 123;
        const data = encodeData(decodedData);
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const timestampTooOld = nextTimestamp - 60 * 60;
        const signatureWithTimestampTooOld = testUtils.signPspFulfillment(
          beacon.airnode.wallet,
          subscriptionId,
          timestampTooOld,
          beacon.airnode.pspSponsorWallet.address
        );
        await expect(
          dapiServer
            .connect(beacon.airnode.pspSponsorWallet)
            .fulfillPspBeaconUpdate(
              subscriptionId,
              beacon.airnode.wallet.address,
              beacon.airnode.wallet.address,
              roles.sponsor.address,
              timestampTooOld,
              data,
              signatureWithTimestampTooOld,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Timestamp not valid');
        const timestampFromFuture = nextTimestamp + 15 * 60 + 1;
        const signatureWithTimestampFromFuture = testUtils.signPspFulfillment(
          beacon.airnode.wallet,
          subscriptionId,
          timestampFromFuture,
          beacon.airnode.pspSponsorWallet.address
        );
        await expect(
          dapiServer
            .connect(beacon.airnode.pspSponsorWallet)
            .fulfillPspBeaconUpdate(
              subscriptionId,
              beacon.airnode.wallet.address,
              beacon.airnode.wallet.address,
              roles.sponsor.address,
              timestampFromFuture,
              data,
              signatureWithTimestampFromFuture,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
  });

  describe('updateBeaconSetWithBeacons', function () {
    context('Did not specify less than two Beacons', function () {
      context('Updated value updates timestamp', function () {
        it('updates Beacon set', async function () {
          const { roles, dapiServer, beacons, beaconSet } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
            })
          );
          const beaconSetValue = median(beaconValues);
          const beaconSetTimestamp = median(beaconTimestamps);
          const beaconSetBefore = await dapiServer.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetBefore.value).to.equal(0);
          expect(beaconSetBefore.timestamp).to.equal(0);
          expect(
            await dapiServer.connect(roles.randomPerson).callStatic.updateBeaconSetWithBeacons(beaconSet.beaconIds)
          ).to.equal(beaconSet.beaconSetId);
          await expect(dapiServer.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds))
            .to.emit(dapiServer, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSet.beaconSetId, beaconSetValue, beaconSetTimestamp);
          const beaconSetAfter = await dapiServer.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetAfter.value).to.equal(beaconSetValue);
          expect(beaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
        });
      });
      context('Updated value does not update timestamp', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons, beaconSet } = await deploy();
          // Update Beacon set with recent timestamp
          await updateBeaconSet(roles, dapiServer, beacons, 123);
          await expect(
            dapiServer.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds)
          ).to.be.revertedWith('Does not update timestamp');
        });
      });
    });
    context('Specified less than two Beacons', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await deploy();
        await expect(
          dapiServer.connect(roles.randomPerson).updateBeaconSetWithBeacons([beacons[0].beaconId])
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
              const { roles, dapiServer, beacons, beaconSet } = await deploy();
              // Populate the Beacons
              const beaconValues = beacons.map(() => 0);
              const currentTimestamp = await helpers.time.latest();
              const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
              await Promise.all(
                beacons.map(async (beacon, index) => {
                  await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                })
              );
              // Even if the Beacon values are zero, since their timestamps are not zero,
              // the condition will return true
              expect(
                await dapiServer
                  .connect(roles.randomPerson)
                  .callStatic.conditionPspBeaconSetUpdate(
                    beaconSet.beaconSetUpdateSubscriptionId,
                    ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                    beaconSet.beaconSetUpdateSubscriptionConditionParameters
                  )
              ).to.equal(true);
            });
          });
          context('Update will not set the Beacon set timestamp to a non-zero value', function () {
            it('returns false', async function () {
              const { roles, dapiServer, beaconSet } = await deploy();
              expect(
                await dapiServer
                  .connect(roles.randomPerson)
                  .callStatic.conditionPspBeaconSetUpdate(
                    beaconSet.beaconSetUpdateSubscriptionId,
                    ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                    beaconSet.beaconSetUpdateSubscriptionConditionParameters
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
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 110 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 110);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 110 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 110);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
            });
            context('Update is downwards', function () {
              context('It has been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 90 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 90);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 90 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 90);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
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
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 109 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 109);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns false', async function () {
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 109 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 109);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(false);
                });
              });
            });
            context('Update is downwards', function () {
              context('It has been at least heartbeat interval seconds since the last update', function () {
                it('returns true', async function () {
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 91 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 91);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
                      )
                  ).to.equal(true);
                });
              });
              context('It has not been at least heartbeat interval seconds since the last update', function () {
                it('returns false', async function () {
                  const { roles, dapiServer, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dapiServer, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 91 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dapiServer, beacon, 91);
                    })
                  );
                  expect(
                    await dapiServer
                      .connect(roles.randomPerson)
                      .callStatic.conditionPspBeaconSetUpdate(
                        beaconSet.beaconSetUpdateSubscriptionId,
                        ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                        beaconSet.beaconSetUpdateSubscriptionConditionParameters
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
          const { roles, dapiServer, beaconSet } = await deploy();
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .callStatic.conditionPspBeaconSetUpdate(
                beaconSet.beaconSetUpdateSubscriptionId,
                ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]),
                beaconSet.beaconSetUpdateSubscriptionConditionParameters + '00'
              )
          ).to.be.revertedWith('Incorrect parameter length');
        });
      });
    });
    context('Data length is not correct', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beaconSet } = await deploy();
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .callStatic.conditionPspBeaconSetUpdate(
              beaconSet.beaconSetUpdateSubscriptionId,
              ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]) + '00',
              beaconSet.beaconSetUpdateSubscriptionConditionParameters + '00'
            )
        ).to.be.revertedWith('Data length not correct');
      });
    });
  });

  describe('fulfillPspBeaconSetUpdate', function () {
    context('Data length is correct', function () {
      context('Subscription is regular', function () {
        it('updates Beacon set', async function () {
          const { roles, dapiServer, beacons, beaconSet } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
            })
          );
          const beaconSetValue = median(beaconValues);
          const beaconSetTimestamp = median(beaconTimestamps);
          const data = ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]);
          const timestamp = await helpers.time.latest();
          const signature = testUtils.signPspFulfillment(
            beacons[0].airnode.wallet,
            beaconSet.beaconSetUpdateSubscriptionId,
            timestamp,
            beacons[0].airnode.pspSponsorWallet.address
          );
          const beaconSetBefore = await dapiServer.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetBefore.value).to.equal(0);
          expect(beaconSetBefore.timestamp).to.equal(0);
          await expect(
            dapiServer
              .connect(beacons[0].airnode.pspSponsorWallet)
              .fulfillPspBeaconSetUpdate(
                beaconSet.beaconSetUpdateSubscriptionId,
                beacons[0].airnode.wallet.address,
                beacons[0].airnode.wallet.address,
                roles.sponsor.address,
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          )
            .to.emit(dapiServer, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSet.beaconSetId, beaconSetValue, beaconSetTimestamp);
          const beaconSetAfter = await dapiServer.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetAfter.value).to.equal(beaconSetValue);
          expect(beaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
        });
      });
      context('Subscription is relayed', function () {
        it('updates Beacon set', async function () {
          // Note that updating a Beacon set with a relayed subscription makes no sense
          // We are testing this for the sake of completeness
          const { roles, dapiServer, beacons, beaconSet } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
            })
          );
          const beaconSetValue = median(beaconValues);
          const beaconSetTimestamp = median(beaconTimestamps);
          const beaconSetUpdateSubscriptionId = await deriveUpdateSubscriptionId(
            dapiServer,
            beacons[0].airnode.wallet.address,
            ethers.constants.HashZero,
            beaconSet.beaconSetUpdateSubscriptionConditions,
            beacons[0].relayer.wallet.address,
            roles.sponsor.address,
            dapiServer.interface.getSighash('fulfillPspBeaconSetUpdate'),
            ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds])
          );
          const data = ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]);
          const timestamp = await helpers.time.latest();
          const signature = testUtils.signPspRelayedFulfillment(
            beacons[0].airnode.wallet,
            beaconSetUpdateSubscriptionId,
            timestamp,
            beacons[0].relayer.pspRelayedSponsorWallet.address,
            data
          );
          const beaconSetBefore = await dapiServer.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetBefore.value).to.equal(0);
          expect(beaconSetBefore.timestamp).to.equal(0);
          await expect(
            dapiServer
              .connect(beacons[0].relayer.pspRelayedSponsorWallet)
              .fulfillPspBeaconSetUpdate(
                beaconSetUpdateSubscriptionId,
                beacons[0].airnode.wallet.address,
                beacons[0].relayer.wallet.address,
                roles.sponsor.address,
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          )
            .to.emit(dapiServer, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSet.beaconSetId, beaconSetValue, beaconSetTimestamp);
          const beaconSetAfter = await dapiServer.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetAfter.value).to.equal(beaconSetValue);
          expect(beaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
        });
      });
    });
    context('Data length is not correct', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons, beaconSet } = await deploy();
        // Populate the Beacons
        const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
        const currentTimestamp = await helpers.time.latest();
        const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
        await Promise.all(
          beacons.map(async (beacon, index) => {
            await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
          })
        );
        const data = ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSet.beaconIds]) + '00';
        const timestamp = await helpers.time.latest();
        const signature = testUtils.signPspFulfillment(
          beacons[0].airnode.wallet,
          beaconSet.beaconSetUpdateSubscriptionId,
          timestamp,
          beacons[0].airnode.pspSponsorWallet.address
        );
        await expect(
          dapiServer
            .connect(beacons[0].airnode.pspSponsorWallet)
            .fulfillPspBeaconSetUpdate(
              beaconSet.beaconSetUpdateSubscriptionId,
              beacons[0].airnode.wallet.address,
              beacons[0].airnode.wallet.address,
              roles.sponsor.address,
              timestamp,
              data,
              signature,
              { gasLimit: 500000 }
            )
        ).to.be.revertedWith('Data length not correct');
      });
    });
  });

  describe('updateBeaconWithSignedData', function () {
    context('Signature is valid', function () {
      context('Timestamp is valid', function () {
        context('Fulfillment data length is correct', function () {
          context('Decoded fulfillment data can be typecasted into int224', function () {
            context('Updates timestamp', function () {
              it('updates Beacon with signed data', async function () {
                const { roles, dapiServer, beacons } = await deploy();
                const beacon = beacons[0];
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = await helpers.time.latest();
                const signature = await testUtils.signData(
                  beacon.airnode.wallet,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue)
                );
                const beaconBefore = await dapiServer.dataFeeds(beacon.beaconId);
                expect(beaconBefore.value).to.equal(0);
                expect(beaconBefore.timestamp).to.equal(0);
                await expect(
                  dapiServer
                    .connect(roles.randomPerson)
                    .updateBeaconWithSignedData(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beaconTimestamp,
                      encodeData(beaconValue),
                      signature
                    )
                )
                  .to.emit(dapiServer, 'UpdatedBeaconWithSignedData')
                  .withArgs(beacon.beaconId, beaconValue, beaconTimestamp);
                const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(beaconValue);
                expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
              });
            });
            context('Does not update timestamp', function () {
              it('reverts', async function () {
                const { roles, dapiServer, beacons } = await deploy();
                const beacon = beacons[0];
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = await helpers.time.latest();
                const signature = await testUtils.signData(
                  beacon.airnode.wallet,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue)
                );
                await dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValue),
                    signature
                  );
                await expect(
                  dapiServer
                    .connect(roles.randomPerson)
                    .updateBeaconWithSignedData(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beaconTimestamp,
                      encodeData(beaconValue),
                      signature
                    )
                ).to.be.revertedWith('Does not update timestamp');
              });
            });
          });
          context('Decoded fulfillment data cannot be typecasted into int224', function () {
            it('reverts', async function () {
              const { roles, dapiServer, beacons } = await deploy();
              const beacon = beacons[0];
              const beaconValueWithOverflow = ethers.BigNumber.from(2).pow(223);
              const beaconTimestamp = await helpers.time.latest();
              const signatureWithOverflow = await testUtils.signData(
                beacon.airnode.wallet,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValueWithOverflow)
              );
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithOverflow),
                    signatureWithOverflow
                  )
              ).to.be.revertedWith('Value typecasting error');
              const beaconValueWithUnderflow = ethers.BigNumber.from(-2).pow(223).sub(1);
              const signatureWithUnderflow = await testUtils.signData(
                beacon.airnode.wallet,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValueWithUnderflow)
              );
              await expect(
                dapiServer
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithUnderflow),
                    signatureWithUnderflow
                  )
              ).to.be.revertedWith('Value typecasting error');
            });
          });
        });
        context('Fulfillment data length is not correct', function () {
          it('reverts', async function () {
            const { roles, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            const signature = await testUtils.signData(
              beacon.airnode.wallet,
              beacon.templateId,
              beaconTimestamp,
              encodeData(beaconValue) + '00'
            );
            await expect(
              dapiServer
                .connect(roles.randomPerson)
                .updateBeaconWithSignedData(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue) + '00',
                  signature
                )
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Timestamp is not valid', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const beaconTimestampTooLate = nextTimestamp - 60 * 60;
          const signatureTooLate = await testUtils.signData(
            beacon.airnode.wallet,
            beacon.templateId,
            beaconTimestampTooLate,
            encodeData(beaconValue)
          );
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .updateBeaconWithSignedData(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beaconTimestampTooLate,
                encodeData(beaconValue),
                signatureTooLate
              )
          ).to.be.revertedWith('Timestamp not valid');
          const beaconTimestampFromFuture = nextTimestamp + 15 * 60 + 1;
          const signatureFromFuture = await testUtils.signData(
            beacon.airnode.wallet,
            beacon.templateId,
            beaconTimestampFromFuture,
            encodeData(beaconValue)
          );
          await expect(
            dapiServer
              .connect(roles.randomPerson)
              .updateBeaconWithSignedData(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beaconTimestampFromFuture,
                encodeData(beaconValue),
                signatureFromFuture
              )
          ).to.be.revertedWith('Timestamp not valid');
        });
      });
    });
    context('Signature is not valid', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await deploy();
        const beacon = beacons[0];
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const beaconTimestamp = await helpers.time.latest();
        await expect(
          dapiServer
            .connect(roles.randomPerson)
            .updateBeaconWithSignedData(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beaconTimestamp,
              encodeData(beaconValue),
              '0x12345678'
            )
        ).to.be.revertedWith('ECDSA: invalid signature length');
      });
    });
  });

  describe('updateOevProxyDataFeedWithSignedData', function () {
    context('More than one Beacon is specified', function () {
      context('All signed data is decodable', function () {
        context('Signed data with no signature has no data', function () {
          context('All signatures are valid', function () {
            context('All fulfillment data lengths are correct', function () {
              context('All decoded fulfillment data can be typecasted into int224', function () {
                context('All timestamps are valid', function () {
                  context('Updates timestamp', function () {
                    context('Signed data includes correct number of signatures', function () {
                      it('updates Beacon set with signed data', async function () {
                        const { roles, dapiServer, oevProxy, beacons, beaconSet } = await deploy();
                        // Populate the Beacons
                        const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                        const currentTimestamp = await helpers.time.latest();
                        const beaconTimestamps = beacons.map(() =>
                          Math.floor(currentTimestamp - Math.random() * 5 * 60)
                        );
                        const beaconSetValue = median(beaconValues);
                        const beaconSetTimestamp = Math.floor(
                          beaconTimestamps.reduce((sum, beaconTimestamp) => {
                            return sum + beaconTimestamp;
                          }, 0) / beaconTimestamps.length
                        );
                        await Promise.all(
                          beacons.map(async (beacon, index) => {
                            await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                          })
                        );
                        const bidAmount = 10000;
                        const updateId = testUtils.generateRandomBytes32();
                        // Randomly omit one of the signatures for the Beacon value to be read from the chain
                        const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                        const signatures = await Promise.all(
                          beacons.map(async (beacon, index) => {
                            if (index === omitSignatureAtIndex) {
                              return '0x';
                            } else {
                              return await testUtils.signOevData(
                                dapiServer,
                                oevProxy.address,
                                roles.searcher.address,
                                bidAmount,
                                updateId,
                                beacons.length - 1,
                                beacons.length,
                                beacon.airnode.wallet,
                                beacon.templateId,
                                beaconTimestamps[index],
                                encodeData(beaconValues[index])
                              );
                            }
                          })
                        );
                        // Omit the data if the signature is omitted
                        const signedData = signatures.map((signature, index) => {
                          if (signature === '0x') {
                            return encodeSignedData(
                              beacons[index].airnode.wallet.address,
                              beacons[index].templateId,
                              0,
                              '0x',
                              signature
                            );
                          } else {
                            return encodeSignedData(
                              beacons[index].airnode.wallet.address,
                              beacons[index].templateId,
                              beaconTimestamps[index],
                              encodeData(beaconValues[index]),
                              signature
                            );
                          }
                        });
                        const beaconSetBefore = await dapiServer.dataFeeds(beaconSet.beaconSetId);
                        expect(beaconSetBefore.value).to.equal(0);
                        expect(beaconSetBefore.timestamp).to.equal(0);
                        const oevProxyBeaconSetBefore = await dapiServer.oevProxyToIdToDataFeed(
                          oevProxy.address,
                          beaconSet.beaconSetId
                        );
                        expect(oevProxyBeaconSetBefore.value).to.equal(0);
                        expect(oevProxyBeaconSetBefore.timestamp).to.equal(0);
                        await expect(
                          dapiServer
                            .connect(roles.searcher)
                            .updateOevProxyDataFeedWithSignedData(
                              oevProxy.address,
                              updateId,
                              beacons.length - 1,
                              signedData,
                              { value: bidAmount }
                            )
                        )
                          .to.emit(dapiServer, 'UpdatedOevProxyBeaconSetWithSignedData')
                          .withArgs(
                            beaconSet.beaconSetId,
                            oevProxy.address,
                            updateId,
                            beaconSetValue,
                            beaconSetTimestamp
                          );
                        const beaconSetAfter = await dapiServer.dataFeeds(beaconSet.beaconSetId);
                        expect(beaconSetAfter.value).to.equal(0);
                        expect(beaconSetAfter.timestamp).to.equal(0);
                        const oevProxyBeaconSetAfter = await dapiServer.oevProxyToIdToDataFeed(
                          oevProxy.address,
                          beaconSet.beaconSetId
                        );
                        expect(oevProxyBeaconSetAfter.value).to.equal(beaconSetValue);
                        expect(oevProxyBeaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
                      });
                    });
                    context('Signed data includes more signatures than stated', function () {
                      it('reverts', async function () {
                        const { roles, dapiServer, oevProxy, beacons } = await deploy();
                        // Populate the Beacons
                        const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                        const currentTimestamp = await helpers.time.latest();
                        const beaconTimestamps = beacons.map(() =>
                          Math.floor(currentTimestamp - Math.random() * 5 * 60)
                        );
                        await Promise.all(
                          beacons.map(async (beacon, index) => {
                            await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                          })
                        );
                        const bidAmount = 10000;
                        const updateId = testUtils.generateRandomBytes32();
                        // Randomly omit one of the signatures for the Beacon value to be read from the chain
                        const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                        const signatures = await Promise.all(
                          beacons.map(async (beacon, index) => {
                            if (index === omitSignatureAtIndex) {
                              return '0x';
                            } else {
                              return await testUtils.signOevData(
                                dapiServer,
                                oevProxy.address,
                                roles.searcher.address,
                                bidAmount,
                                updateId,
                                beacons.length - 2,
                                beacons.length,
                                beacon.airnode.wallet,
                                beacon.templateId,
                                beaconTimestamps[index],
                                encodeData(beaconValues[index])
                              );
                            }
                          })
                        );
                        // Omit the data if the signature is omitted
                        const signedData = signatures.map((signature, index) => {
                          if (signature === '0x') {
                            return encodeSignedData(
                              beacons[index].airnode.wallet.address,
                              beacons[index].templateId,
                              0,
                              '0x',
                              signature
                            );
                          } else {
                            return encodeSignedData(
                              beacons[index].airnode.wallet.address,
                              beacons[index].templateId,
                              beaconTimestamps[index],
                              encodeData(beaconValues[index]),
                              signature
                            );
                          }
                        });
                        await expect(
                          dapiServer
                            .connect(roles.searcher)
                            .updateOevProxyDataFeedWithSignedData(
                              oevProxy.address,
                              updateId,
                              beacons.length - 2,
                              signedData,
                              { value: bidAmount }
                            )
                        ).to.be.revertedWith('More signatures than stated');
                      });
                    });
                    context('Signed data includes less signatures than stated', function () {
                      it('reverts', async function () {
                        const { roles, dapiServer, oevProxy, beacons } = await deploy();
                        // Populate the Beacons
                        const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                        const currentTimestamp = await helpers.time.latest();
                        const beaconTimestamps = beacons.map(() =>
                          Math.floor(currentTimestamp - Math.random() * 5 * 60)
                        );
                        await Promise.all(
                          beacons.map(async (beacon, index) => {
                            await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                          })
                        );
                        const bidAmount = 10000;
                        const updateId = testUtils.generateRandomBytes32();
                        // Randomly omit one of the signatures for the Beacon value to be read from the chain
                        const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                        const signatures = await Promise.all(
                          beacons.map(async (beacon, index) => {
                            if (index === omitSignatureAtIndex) {
                              return '0x';
                            } else {
                              return await testUtils.signOevData(
                                dapiServer,
                                oevProxy.address,
                                roles.searcher.address,
                                bidAmount,
                                updateId,
                                beacons.length,
                                beacons.length,
                                beacon.airnode.wallet,
                                beacon.templateId,
                                beaconTimestamps[index],
                                encodeData(beaconValues[index])
                              );
                            }
                          })
                        );
                        // Omit the data if the signature is omitted
                        const signedData = signatures.map((signature, index) => {
                          if (signature === '0x') {
                            return encodeSignedData(
                              beacons[index].airnode.wallet.address,
                              beacons[index].templateId,
                              0,
                              '0x',
                              signature
                            );
                          } else {
                            return encodeSignedData(
                              beacons[index].airnode.wallet.address,
                              beacons[index].templateId,
                              beaconTimestamps[index],
                              encodeData(beaconValues[index]),
                              signature
                            );
                          }
                        });
                        await expect(
                          dapiServer
                            .connect(roles.searcher)
                            .updateOevProxyDataFeedWithSignedData(
                              oevProxy.address,
                              updateId,
                              beacons.length,
                              signedData,
                              { value: bidAmount }
                            )
                        ).to.be.revertedWith('Less signatures than stated');
                      });
                    });
                  });
                  context('Does not update timestamp', function () {
                    it('reverts', async function () {
                      const { roles, dapiServer, oevProxy, beacons } = await deploy();
                      // Populate the Beacons
                      const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                      const currentTimestamp = await helpers.time.latest();
                      const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
                      await Promise.all(
                        beacons.map(async (beacon, index) => {
                          await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                        })
                      );
                      const bidAmount = 10000;
                      const updateId = testUtils.generateRandomBytes32();
                      // Randomly omit one of the signatures for the Beacon value to be read from the chain
                      const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                      const signatures = await Promise.all(
                        beacons.map(async (beacon, index) => {
                          if (index === omitSignatureAtIndex) {
                            return '0x';
                          } else {
                            return await testUtils.signOevData(
                              dapiServer,
                              oevProxy.address,
                              roles.searcher.address,
                              bidAmount,
                              updateId,
                              beacons.length - 1,
                              beacons.length,
                              beacon.airnode.wallet,
                              beacon.templateId,
                              beaconTimestamps[index],
                              encodeData(beaconValues[index])
                            );
                          }
                        })
                      );
                      // Omit the data if the signature is omitted
                      const signedData = signatures.map((signature, index) => {
                        if (signature === '0x') {
                          return encodeSignedData(
                            beacons[index].airnode.wallet.address,
                            beacons[index].templateId,
                            0,
                            '0x',
                            signature
                          );
                        } else {
                          return encodeSignedData(
                            beacons[index].airnode.wallet.address,
                            beacons[index].templateId,
                            beaconTimestamps[index],
                            encodeData(beaconValues[index]),
                            signature
                          );
                        }
                      });
                      await dapiServer
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(
                          oevProxy.address,
                          updateId,
                          beacons.length - 1,
                          signedData,
                          { value: bidAmount }
                        );
                      await expect(
                        dapiServer
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            oevProxy.address,
                            updateId,
                            beacons.length - 1,
                            signedData,
                            { value: bidAmount }
                          )
                      ).to.be.revertedWith('Does not update timestamp');
                    });
                  });
                });
                context('Not all timestamps are not valid', function () {
                  it('reverts', async function () {
                    const { roles, dapiServer, oevProxy, beacons } = await deploy();
                    // Populate the Beacons
                    const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                    const currentTimestamp = await helpers.time.latest();
                    const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
                    await Promise.all(
                      beacons.map(async (beacon, index) => {
                        await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                      })
                    );
                    const bidAmount = 10000;
                    const updateId = testUtils.generateRandomBytes32();
                    // Randomly omit one of the signatures for the Beacon value to be read from the chain
                    const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                    // Make timestamp invalid
                    if (omitSignatureAtIndex === beacons.length - 1) {
                      beaconTimestamps[beacons.length - 2] = 0;
                    } else {
                      beaconTimestamps[beacons.length - 1] = 0;
                    }
                    const signatures = await Promise.all(
                      beacons.map(async (beacon, index) => {
                        if (index === omitSignatureAtIndex) {
                          return '0x';
                        } else {
                          return await testUtils.signOevData(
                            dapiServer,
                            oevProxy.address,
                            roles.searcher.address,
                            bidAmount,
                            updateId,
                            beacons.length - 1,
                            beacons.length,
                            beacon.airnode.wallet,
                            beacon.templateId,
                            beaconTimestamps[index],
                            encodeData(beaconValues[index])
                          );
                        }
                      })
                    );
                    // Omit the data if the signature is omitted
                    const signedData = signatures.map((signature, index) => {
                      if (signature === '0x') {
                        return encodeSignedData(
                          beacons[index].airnode.wallet.address,
                          beacons[index].templateId,
                          0,
                          '0x',
                          signature
                        );
                      } else {
                        return encodeSignedData(
                          beacons[index].airnode.wallet.address,
                          beacons[index].templateId,
                          beaconTimestamps[index],
                          encodeData(beaconValues[index]),
                          signature
                        );
                      }
                    });
                    await expect(
                      dapiServer
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(
                          oevProxy.address,
                          updateId,
                          beacons.length - 1,
                          signedData,
                          { value: bidAmount }
                        )
                    ).to.be.revertedWith('Timestamp not valid');
                  });
                });
              });
              context('Not all decoded fulfillment data can be typecasted into int224', function () {
                it('reverts', async function () {
                  const { roles, dapiServer, oevProxy, beacons } = await deploy();
                  // Populate the Beacons
                  const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                  const currentTimestamp = await helpers.time.latest();
                  const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
                  await Promise.all(
                    beacons.map(async (beacon, index) => {
                      await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                    })
                  );
                  const bidAmount = 10000;
                  const updateId = testUtils.generateRandomBytes32();
                  // Randomly omit one of the signatures for the Beacon value to be read from the chain
                  const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                  // Make value overflow
                  if (omitSignatureAtIndex === beacons.length - 1) {
                    beaconValues[beacons.length - 2] = ethers.BigNumber.from(2).pow(223);
                  } else {
                    beaconValues[beacons.length - 1] = ethers.BigNumber.from(2).pow(223);
                  }
                  const signaturesWithOverflow = await Promise.all(
                    beacons.map(async (beacon, index) => {
                      if (index === omitSignatureAtIndex) {
                        return '0x';
                      } else {
                        return await testUtils.signOevData(
                          dapiServer,
                          oevProxy.address,
                          roles.searcher.address,
                          bidAmount,
                          updateId,
                          beacons.length - 1,
                          beacons.length,
                          beacon.airnode.wallet,
                          beacon.templateId,
                          beaconTimestamps[index],
                          encodeData(beaconValues[index])
                        );
                      }
                    })
                  );
                  // Omit the data if the signature is omitted
                  const signedDataWithOverflow = signaturesWithOverflow.map((signature, index) => {
                    if (signature === '0x') {
                      return encodeSignedData(
                        beacons[index].airnode.wallet.address,
                        beacons[index].templateId,
                        0,
                        '0x',
                        signature
                      );
                    } else {
                      return encodeSignedData(
                        beacons[index].airnode.wallet.address,
                        beacons[index].templateId,
                        beaconTimestamps[index],
                        encodeData(beaconValues[index]),
                        signature
                      );
                    }
                  });
                  await expect(
                    dapiServer
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(
                        oevProxy.address,
                        updateId,
                        beacons.length - 1,
                        signedDataWithOverflow,
                        { value: bidAmount }
                      )
                  ).to.be.revertedWith('Value typecasting error');
                  // Make value underflow
                  if (omitSignatureAtIndex === beacons.length - 1) {
                    beaconValues[beacons.length - 2] = ethers.BigNumber.from(-2).pow(223).sub(1);
                  } else {
                    beaconValues[beacons.length - 1] = ethers.BigNumber.from(-2).pow(223).sub(1);
                  }
                  const signaturesWithUnderflow = await Promise.all(
                    beacons.map(async (beacon, index) => {
                      if (index === omitSignatureAtIndex) {
                        return '0x';
                      } else {
                        return await testUtils.signOevData(
                          dapiServer,
                          oevProxy.address,
                          roles.searcher.address,
                          bidAmount,
                          updateId,
                          beacons.length - 1,
                          beacons.length,
                          beacon.airnode.wallet,
                          beacon.templateId,
                          beaconTimestamps[index],
                          encodeData(beaconValues[index])
                        );
                      }
                    })
                  );
                  // Omit the data if the signature is omitted
                  const signedDataWithUnderflow = signaturesWithUnderflow.map((signature, index) => {
                    if (signature === '0x') {
                      return encodeSignedData(
                        beacons[index].airnode.wallet.address,
                        beacons[index].templateId,
                        0,
                        '0x',
                        signature
                      );
                    } else {
                      return encodeSignedData(
                        beacons[index].airnode.wallet.address,
                        beacons[index].templateId,
                        beaconTimestamps[index],
                        encodeData(beaconValues[index]),
                        signature
                      );
                    }
                  });
                  await expect(
                    dapiServer
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(
                        oevProxy.address,
                        updateId,
                        beacons.length - 1,
                        signedDataWithUnderflow,
                        { value: bidAmount }
                      )
                  ).to.be.revertedWith('Value typecasting error');
                });
              });
            });
            context('All fulfillment data length is not correct', function () {
              it('reverts', async function () {
                const { roles, dapiServer, oevProxy, beacons } = await deploy();
                // Populate the Beacons
                const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
                const currentTimestamp = await helpers.time.latest();
                const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
                await Promise.all(
                  beacons.map(async (beacon, index) => {
                    await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                  })
                );
                const bidAmount = 10000;
                const updateId = testUtils.generateRandomBytes32();
                // Randomly omit one of the signatures for the Beacon value to be read from the chain
                const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                // Lengthen one of the encoded data
                const encodedData = beacons.map((_, index) => {
                  return encodeData(beaconValues[index]);
                });
                if (omitSignatureAtIndex === beacons.length - 1) {
                  encodedData[beacons.length - 2] = encodedData[beacons.length - 2] + '00';
                } else {
                  encodedData[beacons.length - 1] = encodedData[beacons.length - 1] + '00';
                }
                const signatures = await Promise.all(
                  beacons.map(async (beacon, index) => {
                    if (index === omitSignatureAtIndex) {
                      return '0x';
                    } else {
                      return await testUtils.signOevData(
                        dapiServer,
                        oevProxy.address,
                        roles.searcher.address,
                        bidAmount,
                        updateId,
                        beacons.length - 1,
                        beacons.length,
                        beacon.airnode.wallet,
                        beacon.templateId,
                        beaconTimestamps[index],
                        encodedData[index]
                      );
                    }
                  })
                );
                // Omit the data if the signature is omitted
                const signedData = signatures.map((signature, index) => {
                  if (signature === '0x') {
                    return encodeSignedData(
                      beacons[index].airnode.wallet.address,
                      beacons[index].templateId,
                      0,
                      '0x',
                      signature
                    );
                  } else {
                    return encodeSignedData(
                      beacons[index].airnode.wallet.address,
                      beacons[index].templateId,
                      beaconTimestamps[index],
                      encodedData[index],
                      signature
                    );
                  }
                });
                await expect(
                  dapiServer
                    .connect(roles.searcher)
                    .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, beacons.length - 1, signedData, {
                      value: bidAmount,
                    })
                ).to.be.revertedWith('Data length not correct');
              });
            });
          });
          context('Not all signatures are valid', function () {
            it('reverts', async function () {
              const { roles, dapiServer, oevProxy, beacons } = await deploy();
              // Populate the Beacons
              const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
              const currentTimestamp = await helpers.time.latest();
              const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
              await Promise.all(
                beacons.map(async (beacon, index) => {
                  await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
                })
              );
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              // Randomly omit one of the signatures for the Beacon value to be read from the chain
              const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
              const signatures = await Promise.all(
                beacons.map(async (beacon, index) => {
                  if (index === omitSignatureAtIndex) {
                    return '0x';
                  } else {
                    return await testUtils.signOevData(
                      dapiServer,
                      oevProxy.address,
                      roles.searcher.address,
                      bidAmount,
                      updateId,
                      beacons.length - 1,
                      beacons.length,
                      beacon.airnode.wallet,
                      beacon.templateId,
                      beaconTimestamps[index],
                      encodeData(beaconValues[index])
                    );
                  }
                })
              );
              // Change one of the signatures
              if (omitSignatureAtIndex === beacons.length - 1) {
                signatures[beacons.length - 2] = '0x12345678';
              } else {
                signatures[beacons.length - 1] = '0x12345678';
              }
              // Omit the data if the signature is omitted
              const signedData = signatures.map((signature, index) => {
                if (signature === '0x') {
                  return encodeSignedData(
                    beacons[index].airnode.wallet.address,
                    beacons[index].templateId,
                    0,
                    '0x',
                    signature
                  );
                } else {
                  return encodeSignedData(
                    beacons[index].airnode.wallet.address,
                    beacons[index].templateId,
                    beaconTimestamps[index],
                    encodeData(beaconValues[index]),
                    signature
                  );
                }
              });
              await expect(
                dapiServer
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, beacons.length - 1, signedData, {
                    value: bidAmount,
                  })
              ).to.be.revertedWith('ECDSA: invalid signature length');
            });
          });
        });
        context('Signed data with no signature has data', function () {
          it('reverts', async function () {
            const { roles, dapiServer, oevProxy, beacons } = await deploy();
            // Populate the Beacons
            const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
            const currentTimestamp = await helpers.time.latest();
            const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
            await Promise.all(
              beacons.map(async (beacon, index) => {
                await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
              })
            );
            const bidAmount = 10000;
            const updateId = testUtils.generateRandomBytes32();
            // Randomly omit one of the signatures for the Beacon value to be read from the chain
            const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
            const signatures = await Promise.all(
              beacons.map(async (beacon, index) => {
                if (index === omitSignatureAtIndex) {
                  return '0x';
                } else {
                  return await testUtils.signOevData(
                    dapiServer,
                    oevProxy.address,
                    roles.searcher.address,
                    bidAmount,
                    updateId,
                    beacons.length - 1,
                    beacons.length,
                    beacon.airnode.wallet,
                    beacon.templateId,
                    beaconTimestamps[index],
                    encodeData(beaconValues[index])
                  );
                }
              })
            );
            const signedData = signatures.map((signature, index) => {
              return encodeSignedData(
                beacons[index].airnode.wallet.address,
                beacons[index].templateId,
                beaconTimestamps[index],
                encodeData(beaconValues[index]),
                signature
              );
            });
            await expect(
              dapiServer
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, beacons.length - 1, signedData, {
                  value: bidAmount,
                })
            ).to.be.revertedWith('Missing signature');
          });
        });
      });
      context('All signed data is not decodable', function () {
        it('reverts', async function () {
          const { roles, dapiServer, oevProxy, beacons } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
            })
          );
          const bidAmount = 10000;
          const updateId = testUtils.generateRandomBytes32();
          // Randomly omit one of the signatures for the Beacon value to be read from the chain
          const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
          const signatures = await Promise.all(
            beacons.map(async (beacon, index) => {
              if (index === omitSignatureAtIndex) {
                return '0x';
              } else {
                return await testUtils.signOevData(
                  dapiServer,
                  oevProxy.address,
                  roles.searcher.address,
                  bidAmount,
                  updateId,
                  beacons.length - 1,
                  beacons.length,
                  beacon.airnode.wallet,
                  beacon.templateId,
                  beaconTimestamps[index],
                  encodeData(beaconValues[index])
                );
              }
            })
          );
          // Omit the data if the signature is omitted
          const signedData = signatures.map((signature, index) => {
            if (signature === '0x') {
              return encodeSignedData(
                beacons[index].airnode.wallet.address,
                beacons[index].templateId,
                0,
                '0x',
                signature
              );
            } else {
              return encodeSignedData(
                beacons[index].airnode.wallet.address,
                beacons[index].templateId,
                beaconTimestamps[index],
                encodeData(beaconValues[index]),
                signature
              );
            }
          });
          // Change one of the signedData
          if (omitSignatureAtIndex === beacons.length - 1) {
            signedData[beacons.length - 2] = '0x12345678';
          } else {
            signedData[beacons.length - 1] = '0x12345678';
          }
          await expect(
            dapiServer
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, beacons.length - 1, signedData, {
                value: bidAmount,
              })
          ).to.be.revertedWithoutReason;
        });
      });
    });
    context('One Beacon is specified', function () {
      context('Signed data is decodable', function () {
        context('Signature length is not zero', function () {
          context('Signature is valid', function () {
            context('Fulfillment data length is correct', function () {
              context('Decoded fulfillment data can be typecasted into int224', function () {
                context('Timestamp is valid', function () {
                  context('Updates timestamp', function () {
                    it('updates Beacon with signed data', async function () {
                      const { roles, dapiServer, oevProxy, beacons } = await deploy();
                      const beacon = beacons[0];
                      const beaconValue = Math.floor(Math.random() * 200 - 100);
                      const beaconTimestamp = await helpers.time.latest();
                      const bidAmount = 10000;
                      const updateId = testUtils.generateRandomBytes32();
                      const signature = await testUtils.signOevData(
                        dapiServer,
                        oevProxy.address,
                        roles.searcher.address,
                        bidAmount,
                        updateId,
                        1,
                        1,
                        beacon.airnode.wallet,
                        beacon.templateId,
                        beaconTimestamp,
                        encodeData(beaconValue)
                      );
                      const signedData = await encodeSignedData(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beaconTimestamp,
                        encodeData(beaconValue),
                        signature
                      );
                      const beaconBefore = await dapiServer.dataFeeds(beacon.beaconId);
                      expect(beaconBefore.value).to.equal(0);
                      expect(beaconBefore.timestamp).to.equal(0);
                      const oevProxyBeaconBefore = await dapiServer.oevProxyToIdToDataFeed(
                        oevProxy.address,
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconBefore.value).to.equal(0);
                      expect(oevProxyBeaconBefore.timestamp).to.equal(0);
                      await expect(
                        dapiServer
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                            value: bidAmount,
                          })
                      )
                        .to.emit(dapiServer, 'UpdatedOevProxyBeaconWithSignedData')
                        .withArgs(beacon.beaconId, oevProxy.address, updateId, beaconValue, beaconTimestamp);
                      const beaconAfter = await dapiServer.dataFeeds(beacon.beaconId);
                      expect(beaconAfter.value).to.equal(0);
                      expect(beaconAfter.timestamp).to.equal(0);
                      const oevProxyBeaconAfter = await dapiServer.oevProxyToIdToDataFeed(
                        oevProxy.address,
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconAfter.value).to.equal(beaconValue);
                      expect(oevProxyBeaconAfter.timestamp).to.equal(beaconTimestamp);
                    });
                  });
                  context('Does not update timestamp', function () {
                    it('reverts', async function () {
                      const { roles, dapiServer, oevProxy, beacons } = await deploy();
                      const beacon = beacons[0];
                      const beaconValue = Math.floor(Math.random() * 200 - 100);
                      const beaconTimestamp = await helpers.time.latest();
                      const bidAmount = 10000;
                      const updateId = testUtils.generateRandomBytes32();
                      const signature = await testUtils.signOevData(
                        dapiServer,
                        oevProxy.address,
                        roles.searcher.address,
                        bidAmount,
                        updateId,
                        1,
                        1,
                        beacon.airnode.wallet,
                        beacon.templateId,
                        beaconTimestamp,
                        encodeData(beaconValue)
                      );
                      const signedData = await encodeSignedData(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beaconTimestamp,
                        encodeData(beaconValue),
                        signature
                      );
                      await dapiServer
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                          value: bidAmount,
                        });
                      await expect(
                        dapiServer
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                            value: bidAmount,
                          })
                      ).to.be.revertedWith('Does not update timestamp');
                    });
                  });
                });
                context('Timestamp is not valid', function () {
                  it('reverts', async function () {
                    const { roles, dapiServer, oevProxy, beacons } = await deploy();
                    const beacon = beacons[0];
                    const beaconValue = Math.floor(Math.random() * 200 - 100);
                    const bidAmount = 10000;
                    const updateId = testUtils.generateRandomBytes32();
                    const nextTimestamp = (await helpers.time.latest()) + 1;
                    await helpers.time.setNextBlockTimestamp(nextTimestamp);
                    const beaconTimestampTooLate = nextTimestamp - 60 * 60;
                    const signatureTooLate = await testUtils.signOevData(
                      dapiServer,
                      oevProxy.address,
                      roles.searcher.address,
                      bidAmount,
                      updateId,
                      1,
                      1,
                      beacon.airnode.wallet,
                      beacon.templateId,
                      beaconTimestampTooLate,
                      encodeData(beaconValue)
                    );
                    const signedDataTooLate = await encodeSignedData(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beaconTimestampTooLate,
                      encodeData(beaconValue),
                      signatureTooLate
                    );
                    await expect(
                      dapiServer
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedDataTooLate], {
                          value: bidAmount,
                        })
                    ).to.be.revertedWith('Timestamp not valid');
                    const beaconTimestampFromFuture = nextTimestamp + 15 * 60 + 1;
                    const signatureFromFuture = await testUtils.signOevData(
                      dapiServer,
                      oevProxy.address,
                      roles.searcher.address,
                      bidAmount,
                      updateId,
                      1,
                      1,
                      beacon.airnode.wallet,
                      beacon.templateId,
                      beaconTimestampFromFuture,
                      encodeData(beaconValue)
                    );
                    const signedDataFromFuture = await encodeSignedData(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beaconTimestampFromFuture,
                      encodeData(beaconValue),
                      signatureFromFuture
                    );
                    await expect(
                      dapiServer
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedDataFromFuture], {
                          value: bidAmount,
                        })
                    ).to.be.revertedWith('Timestamp not valid');
                  });
                });
              });
              context('Decoded fulfillment data cannot be typecasted into int224', function () {
                it('reverts', async function () {
                  const { roles, dapiServer, oevProxy, beacons } = await deploy();
                  const beacon = beacons[0];
                  const beaconTimestamp = await helpers.time.latest();
                  const bidAmount = 10000;
                  const updateId = testUtils.generateRandomBytes32();
                  const beaconValueWithOverflow = ethers.BigNumber.from(2).pow(223);
                  const signatureWithOverflow = await testUtils.signOevData(
                    dapiServer,
                    oevProxy.address,
                    roles.searcher.address,
                    bidAmount,
                    updateId,
                    1,
                    1,
                    beacon.airnode.wallet,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithOverflow)
                  );
                  const signedDataWithOverflow = await encodeSignedData(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithOverflow),
                    signatureWithOverflow
                  );
                  await expect(
                    dapiServer
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedDataWithOverflow], {
                        value: bidAmount,
                      })
                  ).to.be.revertedWith('Value typecasting error');
                  const beaconValueWithUnderflow = ethers.BigNumber.from(-2).pow(223).sub(1);
                  const signatureWithUnderflow = await testUtils.signOevData(
                    dapiServer,
                    oevProxy.address,
                    roles.searcher.address,
                    bidAmount,
                    updateId,
                    1,
                    1,
                    beacon.airnode.wallet,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithUnderflow)
                  );
                  const signedDataWithUnderflow = await encodeSignedData(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValueWithUnderflow),
                    signatureWithUnderflow
                  );
                  await expect(
                    dapiServer
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedDataWithUnderflow], {
                        value: bidAmount,
                      })
                  ).to.be.revertedWith('Value typecasting error');
                });
              });
            });
            context('Fulfillment data length is not correct', function () {
              it('reverts', async function () {
                const { roles, dapiServer, oevProxy, beacons } = await deploy();
                const beacon = beacons[0];
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = await helpers.time.latest();
                const bidAmount = 10000;
                const updateId = testUtils.generateRandomBytes32();
                const signature = await testUtils.signOevData(
                  dapiServer,
                  oevProxy.address,
                  roles.searcher.address,
                  bidAmount,
                  updateId,
                  1,
                  1,
                  beacon.airnode.wallet,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue) + '00'
                );
                const signedData = await encodeSignedData(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue) + '00',
                  signature
                );
                await expect(
                  dapiServer
                    .connect(roles.searcher)
                    .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                      value: bidAmount,
                    })
                ).to.be.revertedWith('Data length not correct');
              });
            });
          });
          context('Signature is not valid', function () {
            it('reverts', async function () {
              const { roles, dapiServer, oevProxy, beacons } = await deploy();
              const beacon = beacons[0];
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signedData = await encodeSignedData(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue),
                '0x12345678'
              );
              await expect(
                dapiServer
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                    value: bidAmount,
                  })
              ).to.be.revertedWith('ECDSA: invalid signature length');
            });
          });
        });
        context('Signature length is zero', function () {
          context('Data length is not zero', function () {
            it('reverts', async function () {
              const { roles, dapiServer, oevProxy, beacons } = await deploy();
              const beacon = beacons[0];
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signedData = await encodeSignedData(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue),
                '0x'
              );
              await expect(
                dapiServer
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                    value: bidAmount,
                  })
              ).to.be.revertedWith('Missing signature');
            });
          });
          context('Data length is zero', function () {
            it('reverts', async function () {
              const { roles, dapiServer, oevProxy, beacons } = await deploy();
              const beacon = beacons[0];
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signedData = await encodeSignedData(
                beacon.airnode.wallet.address,
                beacon.templateId,
                0,
                '0x',
                '0x'
              );
              await expect(
                dapiServer
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                    value: bidAmount,
                  })
              ).to.be.revertedWith('Missing data');
            });
          });
        });
      });
      context('Signed data is not decodable', function () {
        it('reverts', async function () {
          const { roles, dapiServer, oevProxy } = await deploy();
          const bidAmount = 10000;
          const updateId = testUtils.generateRandomBytes32();
          await expect(
            dapiServer
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, ['0x12345678'], {
                value: bidAmount,
              })
          ).to.be.revertedWithoutReason;
        });
      });
    });
    context('No Beacon is specified', function () {
      it('reverts', async function () {
        const { roles, dapiServer, oevProxy } = await deploy();
        const bidAmount = 10000;
        const updateId = testUtils.generateRandomBytes32();
        await expect(
          dapiServer.connect(roles.searcher).updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 0, [], {
            value: bidAmount,
          })
        ).to.be.revertedWith('Specified no Beacons');
      });
    });
  });

  describe('withdraw', function () {
    context('OEV proxy announces a beneficiary address', function () {
      context('OEV proxy announces a non-zero beneficiary address', function () {
        context('OEV proxy balance is not zero', function () {
          context('Beneficiary does not revert the transfer', function () {
            it('withdraws the OEV proxy balance to the respective beneficiary', async function () {
              const { roles, dapiServer, oevProxy, beacons } = await deploy();
              const beacon = beacons[0];
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signature = await testUtils.signOevData(
                dapiServer,
                oevProxy.address,
                roles.searcher.address,
                bidAmount,
                updateId,
                1,
                1,
                beacon.airnode.wallet,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue)
              );
              const signedData = await encodeSignedData(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue),
                signature
              );
              await dapiServer
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, 1, [signedData], {
                  value: bidAmount,
                });
              const oevBeneficiaryBalanceBeforeWithdrawal = await ethers.provider.getBalance(
                roles.oevBeneficiary.address
              );
              await expect(dapiServer.connect(roles.randomPerson).withdraw(oevProxy.address))
                .to.emit(dapiServer, 'Withdrew')
                .withArgs(oevProxy.address, roles.oevBeneficiary.address, bidAmount);
              const oevBeneficiaryBalanceAfterWithdrawal = await ethers.provider.getBalance(
                roles.oevBeneficiary.address
              );
              expect(oevBeneficiaryBalanceAfterWithdrawal.sub(oevBeneficiaryBalanceBeforeWithdrawal)).to.equal(
                bidAmount
              );
            });
          });
          context('Beneficiary reverts the transfer', function () {
            it('reverts', async function () {
              const { roles, dapiServer, beacons } = await deploy();
              const beacon = beacons[0];
              const dataFeedProxyWithOevFactory = await ethers.getContractFactory(
                'DataFeedProxyWithOev',
                roles.deployer
              );
              const oevProxyWithRevertingBeneficiary = await dataFeedProxyWithOevFactory.deploy(
                dapiServer.address,
                beacon.beaconId,
                dapiServer.address
              );
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signature = await testUtils.signOevData(
                dapiServer,
                oevProxyWithRevertingBeneficiary.address,
                roles.searcher.address,
                bidAmount,
                updateId,
                1,
                1,
                beacon.airnode.wallet,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue)
              );
              const signedData = await encodeSignedData(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beaconTimestamp,
                encodeData(beaconValue),
                signature
              );
              await dapiServer
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(
                  oevProxyWithRevertingBeneficiary.address,
                  updateId,
                  1,
                  [signedData],
                  {
                    value: bidAmount,
                  }
                );
              await expect(
                dapiServer.connect(roles.randomPerson).withdraw(oevProxyWithRevertingBeneficiary.address)
              ).to.be.revertedWith('Withdrawal reverted');
            });
          });
        });
        context('OEV proxy balance is zero', function () {
          it('reverts', async function () {
            const { roles, dapiServer, oevProxy } = await deploy();
            await expect(dapiServer.connect(roles.randomPerson).withdraw(oevProxy.address)).to.be.revertedWith(
              'OEV proxy balance zero'
            );
          });
        });
      });
      context('OEV proxy announces a zero beneficiary address', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const dataFeedProxyWithOevFactory = await ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
          const oevProxyWithZeroBeneficiary = await dataFeedProxyWithOevFactory.deploy(
            dapiServer.address,
            beacon.beaconId,
            ethers.constants.AddressZero
          );
          await expect(
            dapiServer.connect(roles.randomPerson).withdraw(oevProxyWithZeroBeneficiary.address)
          ).to.be.revertedWith('Beneficiary address zero');
        });
      });
    });
    context('OEV proxy does not announce a beneficiary address', function () {
      it('reverts', async function () {
        const { roles, dapiServer } = await deploy();
        await expect(
          dapiServer.connect(roles.randomPerson).withdraw(roles.randomPerson.address)
        ).to.be.revertedWithoutReason;
        await expect(dapiServer.connect(roles.randomPerson).withdraw(dapiServer.address)).to.be.revertedWithoutReason;
      });
    });
  });

  describe('setDapiName', function () {
    context('dAPI name is not zero', function () {
      context('Data feed ID is not zero', function () {
        context('Sender is manager', function () {
          it('sets dAPI name', async function () {
            const { roles, dapiServer, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            await expect(dapiServer.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId))
              .to.emit(dapiServer, 'SetDapiName')
              .withArgs(beaconSet.beaconSetId, dapiName, roles.manager.address);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const { roles, dapiServer, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            await expect(dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId))
              .to.emit(dapiServer, 'SetDapiName')
              .withArgs(beaconSet.beaconSetId, dapiName, roles.dapiNameSetter.address);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const { roles, dapiServer, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await expect(
              dapiServer.connect(roles.randomPerson).setDapiName(dapiName, beaconSet.beaconSetId)
            ).to.be.revertedWith('Sender cannot set dAPI name');
          });
        });
      });
      context('Data feed ID is zero', function () {
        context('Sender is manager', function () {
          it('sets dAPI name', async function () {
            const { roles, dapiServer, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await dapiServer.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId);
            await expect(dapiServer.connect(roles.manager).setDapiName(dapiName, ethers.constants.HashZero))
              .to.emit(dapiServer, 'SetDapiName')
              .withArgs(ethers.constants.HashZero, dapiName, roles.manager.address);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            // Check if we can still set the dAPI name
            await dapiServer.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const { roles, dapiServer, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            await expect(dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, ethers.constants.HashZero))
              .to.emit(dapiServer, 'SetDapiName')
              .withArgs(ethers.constants.HashZero, dapiName, roles.dapiNameSetter.address);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            // Check if we can still set the dAPI name
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            expect(await dapiServer.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const { roles, dapiServer, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await expect(
              dapiServer.connect(roles.randomPerson).setDapiName(dapiName, beaconSet.beaconSetId)
            ).to.be.revertedWith('Sender cannot set dAPI name');
          });
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beaconSet } = await deploy();
        await expect(
          dapiServer.connect(roles.dapiNameSetter).setDapiName(ethers.constants.HashZero, beaconSet.beaconSetId)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('readDataFeedWithId', function () {
    context('Data feed is initialized', function () {
      it('reads data feed', async function () {
        const { roles, dapiServer, beacons } = await deploy();
        const beacon = beacons[0];
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const beaconTimestamp = await helpers.time.latest();
        await updateBeacon(roles, dapiServer, beacon, beaconValue, beaconTimestamp);
        const beaconAfter = await dapiServer.connect(roles.randomPerson).readDataFeedWithId(beacon.beaconId);
        expect(beaconAfter.value).to.equal(beaconValue);
        expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await deploy();
        const beacon = beacons[0];
        await expect(dapiServer.connect(roles.randomPerson).readDataFeedWithId(beacon.beaconId)).to.be.revertedWith(
          'Data feed not initialized'
        );
      });
    });
  });

  describe('readDataFeedWithDapiNameHash', function () {
    context('dAPI name set to Beacon', function () {
      context('Data feed is initialized', function () {
        it('reads Beacon', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await updateBeacon(roles, dapiServer, beacon, beaconValue, beaconTimestamp);
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          const dapiAfter = await dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash);
          expect(dapiAfter.value).to.be.equal(beaconValue);
          expect(dapiAfter.timestamp).to.be.equal(beaconTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          await expect(
            dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name set to Beacon set', function () {
      context('Data feed is initialized', function () {
        it('reads Beacon set', async function () {
          const { roles, dapiServer, beacons, beaconSet } = await deploy();
          const beaconSetValue = Math.floor(Math.random() * 200 - 100);
          const beaconSetTimestamp = await helpers.time.latest();
          await updateBeaconSet(roles, dapiServer, beacons, beaconSetValue, beaconSetTimestamp);
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          const dapiAfter = await dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash);
          expect(dapiAfter.value).to.be.equal(beaconSetValue);
          expect(dapiAfter.timestamp).to.be.equal(beaconSetTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beaconSet } = await deploy();
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          await expect(
            dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const { roles, dapiServer } = await deploy();
        const dapiName = ethers.utils.formatBytes32String('My dAPI');
        const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await expect(
          dapiServer.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });

  describe('readDataFeedWithIdAsOevProxy', function () {
    context('Data feed is initialized', function () {
      context('OEV proxy data feed is more up to date', function () {
        it('reads OEV proxy data feed', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          const bidAmount = 10000;
          const updateId = testUtils.generateRandomBytes32();
          const signature = await testUtils.signOevData(
            dapiServer,
            roles.mockOevProxy.address,
            roles.searcher.address,
            bidAmount,
            updateId,
            1,
            1,
            beacon.airnode.wallet,
            beacon.templateId,
            beaconTimestamp,
            encodeData(beaconValue)
          );
          const signedData = await encodeSignedData(
            beacon.airnode.wallet.address,
            beacon.templateId,
            beaconTimestamp,
            encodeData(beaconValue),
            signature
          );
          await dapiServer
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(roles.mockOevProxy.address, updateId, 1, [signedData], {
              value: bidAmount,
            });
          const beaconAfter = await dapiServer
            .connect(roles.mockOevProxy)
            .readDataFeedWithIdAsOevProxy(beacon.beaconId);
          expect(beaconAfter.value).to.equal(beaconValue);
          expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('Base data feed is more up to date', function () {
        it('reads base data feed', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await updateBeacon(roles, dapiServer, beacon, beaconValue, beaconTimestamp);
          const beaconAfter = await dapiServer
            .connect(roles.mockOevProxy)
            .readDataFeedWithIdAsOevProxy(beacon.beaconId);
          expect(beaconAfter.value).to.equal(beaconValue);
          expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
        });
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, dapiServer, beacons } = await deploy();
        const beacon = beacons[0];
        await expect(
          dapiServer.connect(roles.mockOevProxy).readDataFeedWithIdAsOevProxy(beacon.beaconId)
        ).to.be.revertedWith('Data feed not initialized');
      });
    });
  });

  describe('readDataFeedWithDapiNameHashAsOevProxy', function () {
    context('dAPI name set to Beacon', function () {
      context('Data feed is initialized', function () {
        context('OEV proxy data feed is more up to date', function () {
          it('reads OEV proxy data feed', async function () {
            const { roles, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            const bidAmount = 10000;
            const updateId = testUtils.generateRandomBytes32();
            const signature = await testUtils.signOevData(
              dapiServer,
              roles.mockOevProxy.address,
              roles.searcher.address,
              bidAmount,
              updateId,
              1,
              1,
              beacon.airnode.wallet,
              beacon.templateId,
              beaconTimestamp,
              encodeData(beaconValue)
            );
            const signedData = await encodeSignedData(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beaconTimestamp,
              encodeData(beaconValue),
              signature
            );
            await dapiServer
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(roles.mockOevProxy.address, updateId, 1, [signedData], {
                value: bidAmount,
              });
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
            const dapiAfter = await dapiServer
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconValue);
            expect(dapiAfter.timestamp).to.equal(beaconTimestamp);
          });
        });
        context('Base data feed is more up to date', function () {
          it('reads base data feed', async function () {
            const { roles, dapiServer, beacons } = await deploy();
            const beacon = beacons[0];
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            await updateBeacon(roles, dapiServer, beacon, beaconValue, beaconTimestamp);
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
            const dapiAfter = await dapiServer
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconValue);
            expect(dapiAfter.timestamp).to.equal(beaconTimestamp);
          });
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beacons } = await deploy();
          const beacon = beacons[0];
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          await expect(
            dapiServer.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name set to Beacon set', function () {
      context('Data feed is initialized', function () {
        context('OEV proxy data feed is more up to date', function () {
          it('reads OEV proxy data feed', async function () {
            const { roles, dapiServer, beacons, beaconSet } = await deploy();
            // Populate the Beacons
            const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
            const currentTimestamp = await helpers.time.latest();
            const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
            const beaconSetValue = median(beaconValues);
            const beaconSetTimestamp = Math.floor(
              beaconTimestamps.reduce((sum, beaconTimestamp) => {
                return sum + beaconTimestamp;
              }, 0) / beaconTimestamps.length
            );
            await Promise.all(
              beacons.map(async (beacon, index) => {
                await updateBeacon(roles, dapiServer, beacon, beaconValues[index], beaconTimestamps[index]);
              })
            );
            const bidAmount = 10000;
            const updateId = testUtils.generateRandomBytes32();
            // Randomly omit one of the signatures for the Beacon value to be read from the chain
            const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
            const signatures = await Promise.all(
              beacons.map(async (beacon, index) => {
                if (index === omitSignatureAtIndex) {
                  return '0x';
                } else {
                  return await testUtils.signOevData(
                    dapiServer,
                    roles.mockOevProxy.address,
                    roles.searcher.address,
                    bidAmount,
                    updateId,
                    beacons.length - 1,
                    beacons.length,
                    beacon.airnode.wallet,
                    beacon.templateId,
                    beaconTimestamps[index],
                    encodeData(beaconValues[index])
                  );
                }
              })
            );
            // Omit the data if the signature is omitted
            const signedData = signatures.map((signature, index) => {
              if (signature === '0x') {
                return encodeSignedData(
                  beacons[index].airnode.wallet.address,
                  beacons[index].templateId,
                  0,
                  '0x',
                  signature
                );
              } else {
                return encodeSignedData(
                  beacons[index].airnode.wallet.address,
                  beacons[index].templateId,
                  beaconTimestamps[index],
                  encodeData(beaconValues[index]),
                  signature
                );
              }
            });
            await dapiServer
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                roles.mockOevProxy.address,
                updateId,
                beacons.length - 1,
                signedData,
                { value: bidAmount }
              );
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            const dapiAfter = await dapiServer
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconSetValue);
            expect(dapiAfter.timestamp).to.equal(beaconSetTimestamp);
          });
        });
        context('Base data feed is more up to date', function () {
          it('reads base data feed', async function () {
            const { roles, dapiServer, beacons, beaconSet } = await deploy();
            const currentTimestamp = await helpers.time.latest();
            const beaconSetValue = Math.floor(Math.random() * 200 - 100);
            const beaconSetTimestamp = Math.floor(currentTimestamp - Math.random() * 5 * 60);
            await updateBeaconSet(roles, dapiServer, beacons, beaconSetValue, beaconSetTimestamp);
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            const dapiAfter = await dapiServer
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconSetValue);
            expect(dapiAfter.timestamp).to.equal(beaconSetTimestamp);
          });
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dapiServer, beaconSet } = await deploy();
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dapiServer.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          await expect(
            dapiServer.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const { roles, dapiServer } = await deploy();
        const dapiName = ethers.utils.formatBytes32String('My dAPI');
        const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await expect(
          dapiServer.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });
});
