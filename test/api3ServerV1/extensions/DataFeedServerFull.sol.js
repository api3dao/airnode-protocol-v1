const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('DataFeedServerFull', function () {
  const HUNDRED_PERCENT = 1e8;

  function encodeData(decodedData) {
    return ethers.utils.defaultAbiCoder.encode(['int256'], [decodedData]);
  }

  function packOevUpdateSignature(airnodeAddress, templateId, signature) {
    return ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'bytes'],
      [airnodeAddress, templateId, signature]
    );
  }

  async function updateBeacon(roles, dataFeedServerFull, beacon, decodedData, timestamp) {
    if (!timestamp) {
      timestamp = await helpers.time.latest();
    }
    const data = encodeData(decodedData);
    const signature = await testUtils.signData(beacon.airnode.wallet, beacon.templateId, timestamp, data);
    await dataFeedServerFull
      .connect(roles.randomPerson)
      .updateBeaconWithSignedData(beacon.airnode.wallet.address, beacon.templateId, timestamp, data, signature);
    return timestamp;
  }

  async function updateBeaconSet(roles, dataFeedServerFull, beacons, decodedData, timestamp) {
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
      return dataFeedServerFull.interface.encodeFunctionData('updateBeaconWithSignedData', [
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
      dataFeedServerFull.interface.encodeFunctionData('updateBeaconSetWithBeacons', [beaconIds]),
    ];
    await dataFeedServerFull.connect(roles.randomPerson).multicall(updateBeaconSetCalldata);
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
    dataFeedServerFull,
    conditionFunctionId,
    updateSubscriptionConditionParameters
  ) {
    // Using Airnode ABI
    return ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'bytes32', 'address', 'bytes32', 'bytes32', 'bytes32', 'bytes'],
      [
        ethers.utils.formatBytes32String('1uabB'),
        ethers.utils.formatBytes32String('_conditionChainId'),
        (await dataFeedServerFull.provider.getNetwork()).chainId,
        ethers.utils.formatBytes32String('_conditionAddress'),
        dataFeedServerFull.address,
        ethers.utils.formatBytes32String('_conditionFunctionId'),
        ethers.utils.defaultAbiCoder.encode(['bytes4'], [conditionFunctionId]),
        ethers.utils.formatBytes32String('_conditionParameters'),
        updateSubscriptionConditionParameters,
      ]
    );
  }

  async function deriveUpdateSubscriptionId(
    dataFeedServerFull,
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
          (await dataFeedServerFull.provider.getNetwork()).chainId,
          airnodeAddress,
          templateId,
          parameters,
          updateSubscriptionConditions,
          relayerAddress,
          sponsorAddress,
          dataFeedServerFull.address,
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

    const dataFeedServerFullAdminRoleDescription = 'DataFeedServerFull admin';
    const dapiNameSetterRoleDescription = 'dAPI name setter';
    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await accessControlRegistryFactory.deploy();
    const airnodeProtocolFactory = await ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const dataFeedServerFullFactory = await ethers.getContractFactory('DataFeedServerFull', roles.deployer);
    const dataFeedServerFull = await dataFeedServerFullFactory.deploy(
      accessControlRegistry.address,
      dataFeedServerFullAdminRoleDescription,
      roles.manager.address,
      airnodeProtocol.address
    );

    const managerRootRole = testUtils.deriveRootRole(roles.manager.address);
    const adminRole = testUtils.deriveRole(managerRootRole, dataFeedServerFullAdminRoleDescription);
    const dapiNameSetterRole = testUtils.deriveRole(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(managerRootRole, dataFeedServerFullAdminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, dapiNameSetterRoleDescription);
    await accessControlRegistry.connect(roles.manager).grantRole(dapiNameSetterRole, roles.dapiNameSetter.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(dapiNameSetterRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(adminRole, roles.manager.address);

    await dataFeedServerFull
      .connect(roles.sponsor)
      .setRrpBeaconUpdatePermissionStatus(roles.updateRequester.address, true);

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
        dataFeedServerFull,
        dataFeedServerFull.interface.getSighash('conditionPspBeaconUpdate'),
        beaconUpdateSubscriptionConditionParameters
      );
      const beaconUpdateSubscriptionId = await deriveUpdateSubscriptionId(
        dataFeedServerFull,
        airnode.wallet.address,
        templateId,
        beaconUpdateSubscriptionConditions,
        airnode.wallet.address,
        roles.sponsor.address,
        dataFeedServerFull.interface.getSighash('fulfillPspBeaconUpdate')
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
      dataFeedServerFull,
      dataFeedServerFull.interface.getSighash('conditionPspBeaconSetUpdate'),
      beaconSetUpdateSubscriptionConditionParameters
    );
    const beaconSetUpdateSubscriptionId = await deriveUpdateSubscriptionId(
      dataFeedServerFull,
      beacons[0].airnode.wallet.address,
      ethers.constants.HashZero,
      beaconSetUpdateSubscriptionConditions,
      beacons[0].airnode.wallet.address,
      roles.sponsor.address,
      dataFeedServerFull.interface.getSighash('fulfillPspBeaconSetUpdate'),
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
      dataFeedServerFull.address,
      beacons[0].beaconId,
      roles.oevBeneficiary.address
    );

    return {
      roles,
      accessControlRegistry,
      airnodeProtocol,
      dataFeedServerFull,
      oevProxy,
      dataFeedServerFullAdminRoleDescription,
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
          dataFeedServerFull,
          dataFeedServerFullAdminRoleDescription,
          dapiNameSetterRole,
        } = await helpers.loadFixture(deploy);
        expect(await dataFeedServerFull.DAPI_NAME_SETTER_ROLE_DESCRIPTION()).to.equal('dAPI name setter');
        expect(await dataFeedServerFull.HUNDRED_PERCENT()).to.equal(HUNDRED_PERCENT);
        expect(await dataFeedServerFull.accessControlRegistry()).to.equal(accessControlRegistry.address);
        expect(await dataFeedServerFull.adminRoleDescription()).to.equal(dataFeedServerFullAdminRoleDescription);
        expect(await dataFeedServerFull.manager()).to.equal(roles.manager.address);
        expect(await dataFeedServerFull.airnodeProtocol()).to.equal(airnodeProtocol.address);
        expect(await dataFeedServerFull.dapiNameSetterRole()).to.equal(dapiNameSetterRole);
      });
    });
    context('AirnodeProtocol address is zero', function () {
      it('reverts', async function () {
        const { roles, accessControlRegistry, dataFeedServerFullAdminRoleDescription } = await helpers.loadFixture(
          deploy
        );
        const dataFeedServerFullFactory = await ethers.getContractFactory('DataFeedServerFull', roles.deployer);
        await expect(
          dataFeedServerFullFactory.deploy(
            accessControlRegistry.address,
            dataFeedServerFullAdminRoleDescription,
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
        const { roles, dataFeedServerFull } = await helpers.loadFixture(deploy);
        expect(
          await dataFeedServerFull.sponsorToRrpBeaconUpdateRequesterToPermissionStatus(
            roles.sponsor.address,
            roles.randomPerson.address
          )
        ).to.equal(false);
        await expect(
          dataFeedServerFull.connect(roles.sponsor).setRrpBeaconUpdatePermissionStatus(roles.randomPerson.address, true)
        )
          .to.emit(dataFeedServerFull, 'SetRrpBeaconUpdatePermissionStatus')
          .withArgs(roles.sponsor.address, roles.randomPerson.address, true);
        expect(
          await dataFeedServerFull.sponsorToRrpBeaconUpdateRequesterToPermissionStatus(
            roles.sponsor.address,
            roles.randomPerson.address
          )
        ).to.equal(true);
        await expect(
          dataFeedServerFull
            .connect(roles.sponsor)
            .setRrpBeaconUpdatePermissionStatus(roles.randomPerson.address, false)
        )
          .to.emit(dataFeedServerFull, 'SetRrpBeaconUpdatePermissionStatus')
          .withArgs(roles.sponsor.address, roles.randomPerson.address, false);
        expect(
          await dataFeedServerFull.sponsorToRrpBeaconUpdateRequesterToPermissionStatus(
            roles.sponsor.address,
            roles.randomPerson.address
          )
        ).to.equal(false);
      });
    });
    context('Update requester is zero address', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull } = await helpers.loadFixture(deploy);
        await expect(
          dataFeedServerFull
            .connect(roles.sponsor)
            .setRrpBeaconUpdatePermissionStatus(ethers.constants.AddressZero, false)
        ).to.be.revertedWith('Update requester zero');
      });
    });
  });

  describe('requestRrpBeaconUpdateWithTemplate', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
            .connect(roles.sponsor)
            .callStatic.requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dataFeedServerFull
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithTemplate(beacon.airnode.wallet.address, beacon.templateId, roles.sponsor.address)
        )
          .to.emit(dataFeedServerFull, 'RequestedRrpBeaconUpdate')
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
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
            .connect(roles.updateRequester)
            .callStatic.requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dataFeedServerFull
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithTemplate(beacon.airnode.wallet.address, beacon.templateId, roles.sponsor.address)
        )
          .to.emit(dataFeedServerFull, 'RequestedRrpBeaconUpdate')
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
        const { roles, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dataFeedServerFull
            .connect(roles.randomPerson)
            .requestRrpBeaconUpdateWithTemplate(beacon.airnode.wallet.address, beacon.templateId, roles.sponsor.address)
        ).to.be.revertedWith('Sender not permitted');
      });
    });
  });

  describe('requestRrpBeaconUpdateWithEndpoint', function () {
    context('Request updater is the sponsor', function () {
      it('requests RRP Beacon update', async function () {
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
            .connect(roles.sponsor)
            .callStatic.requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dataFeedServerFull
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        )
          .to.emit(dataFeedServerFull, 'RequestedRrpBeaconUpdate')
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
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
            .connect(roles.updateRequester)
            .callStatic.requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dataFeedServerFull
            .connect(roles.updateRequester)
            .requestRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              roles.sponsor.address
            )
        )
          .to.emit(dataFeedServerFull, 'RequestedRrpBeaconUpdate')
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
        const { roles, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dataFeedServerFull
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
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
            .connect(roles.sponsor)
            .callStatic.requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dataFeedServerFull
            .connect(roles.sponsor)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dataFeedServerFull, 'RequestedRelayedRrpBeaconUpdate')
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
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.templateId,
          '0x',
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
            .connect(roles.updateRequester)
            .callStatic.requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        ).to.equal(requestId);
        await expect(
          dataFeedServerFull
            .connect(roles.updateRequester)
            .requestRelayedRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dataFeedServerFull, 'RequestedRelayedRrpBeaconUpdate')
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
        const { roles, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dataFeedServerFull
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
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
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
          dataFeedServerFull
            .connect(roles.sponsor)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dataFeedServerFull, 'RequestedRelayedRrpBeaconUpdate')
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
        const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        const requestId = await testUtils.deriveRelayedRequestId(
          airnodeProtocol,
          dataFeedServerFull.address,
          beacon.airnode.wallet.address,
          beacon.endpointId,
          beacon.templateParameters,
          beacon.relayer.wallet.address,
          roles.sponsor.address,
          dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
        );
        expect(
          await dataFeedServerFull
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
          dataFeedServerFull
            .connect(roles.updateRequester)
            .requestRelayedRrpBeaconUpdateWithEndpoint(
              beacon.airnode.wallet.address,
              beacon.endpointId,
              beacon.templateParameters,
              beacon.relayer.wallet.address,
              roles.sponsor.address
            )
        )
          .to.emit(dataFeedServerFull, 'RequestedRelayedRrpBeaconUpdate')
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
        const { roles, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
        const beacon = beacons[0];
        await expect(
          dataFeedServerFull
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
                  const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
                  const beacon = beacons[0];
                  const requestId = await testUtils.deriveRequestId(
                    airnodeProtocol,
                    dataFeedServerFull.address,
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    '0x',
                    roles.sponsor.address,
                    dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
                  );
                  await dataFeedServerFull
                    .connect(roles.sponsor)
                    .requestRrpBeaconUpdateWithTemplate(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      roles.sponsor.address
                    );
                  const beaconBefore = await dataFeedServerFull.dataFeeds(beacon.beaconId);
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
                        dataFeedServerFull.address,
                        dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp')
                    .withArgs(beacon.beaconId, requestId, decodedData, timestamp);
                  const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
              context('Request is relayed', function () {
                it('updates Beacon', async function () {
                  const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await helpers.loadFixture(deploy);
                  const beacon = beacons[0];
                  const requestId = await testUtils.deriveRelayedRequestId(
                    airnodeProtocol,
                    dataFeedServerFull.address,
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    '0x',
                    beacon.relayer.wallet.address,
                    roles.sponsor.address,
                    dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
                  );
                  await dataFeedServerFull
                    .connect(roles.sponsor)
                    .requestRelayedRrpBeaconUpdateWithTemplate(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  const beaconBefore = await dataFeedServerFull.dataFeeds(beacon.beaconId);
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
                        dataFeedServerFull.address,
                        beacon.relayer.wallet.address,
                        dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                        timestamp,
                        data,
                        signature,
                        { gasLimit: 500000 }
                      )
                  )
                    .to.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp')
                    .withArgs(beacon.beaconId, requestId, decodedData, timestamp);
                  const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
            });
            context('Data is not fresher than Beacon', function () {
              it('does not update Beacon', async function () {
                const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
                const beacon = beacons[0];
                const requestId = await testUtils.deriveRequestId(
                  airnodeProtocol,
                  dataFeedServerFull.address,
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  '0x',
                  roles.sponsor.address,
                  dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
                );
                await dataFeedServerFull
                  .connect(roles.sponsor)
                  .requestRrpBeaconUpdateWithTemplate(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    roles.sponsor.address
                  );
                const beaconBefore = await dataFeedServerFull.dataFeeds(beacon.beaconId);
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
                const updatedTimestamp = await updateBeacon(roles, dataFeedServerFull, beacon, updatedDecodedData);
                const staticCallResult = await airnodeProtocol
                  .connect(beacon.airnode.rrpSponsorWallet)
                  .callStatic.fulfillRequest(
                    requestId,
                    beacon.airnode.wallet.address,
                    dataFeedServerFull.address,
                    dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
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
                      dataFeedServerFull.address,
                      dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp');
                const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(updatedDecodedData);
                expect(beaconAfter.timestamp).to.equal(updatedTimestamp);
              });
            });
          });
          context('Data is not typecast successfully', function () {
            context('Data larger than maximum int224', function () {
              it('does not update Beacon', async function () {
                const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
                const beacon = beacons[0];
                const requestId = await testUtils.deriveRequestId(
                  airnodeProtocol,
                  dataFeedServerFull.address,
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  '0x',
                  roles.sponsor.address,
                  dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
                );
                await dataFeedServerFull
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
                    dataFeedServerFull.address,
                    dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
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
                      dataFeedServerFull.address,
                      dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp');
                const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(0);
                expect(beaconAfter.timestamp).to.equal(0);
              });
            });
            context('Data smaller than minimum int224', function () {
              it('does not update Beacon', async function () {
                const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
                const beacon = beacons[0];
                const requestId = await testUtils.deriveRequestId(
                  airnodeProtocol,
                  dataFeedServerFull.address,
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  '0x',
                  roles.sponsor.address,
                  dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
                );
                await dataFeedServerFull
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
                    dataFeedServerFull.address,
                    dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
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
                      dataFeedServerFull.address,
                      dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                      timestamp,
                      data,
                      signature,
                      { gasLimit: 500000 }
                    )
                ).to.not.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp');
                const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(0);
                expect(beaconAfter.timestamp).to.equal(0);
              });
            });
          });
        });
        context('Encoded data length is too long', function () {
          it('does not update Beacon', async function () {
            const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];
            const requestId = await testUtils.deriveRequestId(
              airnodeProtocol,
              dataFeedServerFull.address,
              beacon.airnode.wallet.address,
              beacon.templateId,
              '0x',
              roles.sponsor.address,
              dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
            );
            await dataFeedServerFull
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
                dataFeedServerFull.address,
                dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
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
                  dataFeedServerFull.address,
                  dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                  timestamp,
                  data,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.not.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp');
            const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
            expect(beaconAfter.value).to.equal(0);
            expect(beaconAfter.timestamp).to.equal(0);
          });
        });
        context('Encoded data length is too short', function () {
          it('reverts', async function () {
            const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];
            const requestId = await testUtils.deriveRequestId(
              airnodeProtocol,
              dataFeedServerFull.address,
              beacon.airnode.wallet.address,
              beacon.templateId,
              '0x',
              roles.sponsor.address,
              dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
            );
            await dataFeedServerFull
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
                dataFeedServerFull.address,
                dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
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
                  dataFeedServerFull.address,
                  dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                  timestamp,
                  data,
                  signature,
                  { gasLimit: 500000 }
                )
            ).to.not.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp');
            const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
            expect(beaconAfter.value).to.equal(0);
            expect(beaconAfter.timestamp).to.equal(0);
          });
        });
      });
      context('Timestamp is more than 1 hour from the future', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const requestId = await testUtils.deriveRequestId(
            airnodeProtocol,
            dataFeedServerFull.address,
            beacon.airnode.wallet.address,
            beacon.templateId,
            '0x',
            roles.sponsor.address,
            dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
          );
          await dataFeedServerFull
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            );
          const decodedData = 123;
          const data = encodeData(decodedData);
          const timestamp = (await helpers.time.latest()) + 60 * 60 + 1;
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
              dataFeedServerFull.address,
              dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
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
                dataFeedServerFull.address,
                dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          ).to.not.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp');
          const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
          expect(beaconAfter.value).to.equal(0);
          expect(beaconAfter.timestamp).to.equal(0);
        });
      });
      context('Timestamp is zero', function () {
        it('reverts', async function () {
          const { roles, airnodeProtocol, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const requestId = await testUtils.deriveRequestId(
            airnodeProtocol,
            dataFeedServerFull.address,
            beacon.airnode.wallet.address,
            beacon.templateId,
            '0x',
            roles.sponsor.address,
            dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate')
          );
          await dataFeedServerFull
            .connect(roles.sponsor)
            .requestRrpBeaconUpdateWithTemplate(
              beacon.airnode.wallet.address,
              beacon.templateId,
              roles.sponsor.address
            );
          const decodedData = 123;
          const data = encodeData(decodedData);
          const timestamp = 0;
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
              dataFeedServerFull.address,
              dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
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
                dataFeedServerFull.address,
                dataFeedServerFull.interface.getSighash('fulfillRrpBeaconUpdate'),
                timestamp,
                data,
                signature,
                { gasLimit: 500000 }
              )
          ).to.not.emit(dataFeedServerFull, 'UpdatedBeaconWithRrp');
          const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
          expect(beaconAfter.value).to.equal(0);
          expect(beaconAfter.timestamp).to.equal(0);
        });
      });
    });
    context('Sender is not AirnodeProtocol', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull } = await deploy();
        await expect(
          dataFeedServerFull.connect(roles.randomPerson).fulfillRrpBeaconUpdate(ethers.constants.HashZero, 0, '0x')
        ).to.be.revertedWith('Sender not Airnode protocol');
      });
    });
  });

  describe('registerBeaconUpdateSubscription', function () {
    context('Relayer address is not zero', function () {
      context('Sponsor address is not zero', function () {
        context('Subscription is not registered', function () {
          it('registers beacon update subscription', async function () {
            const { roles, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];
            await expect(
              dataFeedServerFull
                .connect(roles.randomPerson)
                .registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beacon.beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                )
            )
              .to.emit(dataFeedServerFull, 'RegisteredBeaconUpdateSubscription')
              .withArgs(
                beacon.beaconId,
                beacon.beaconUpdateSubscriptionId,
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            expect(await dataFeedServerFull.subscriptionIdToBeaconId(beacon.beaconUpdateSubscriptionId)).to.equal(
              beacon.beaconId
            );
          });
        });
        context('Subscription is already registered', function () {
          it('reverts', async function () {
            const { roles, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];
            await dataFeedServerFull
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await expect(
              dataFeedServerFull
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
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          await expect(
            dataFeedServerFull
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
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        await expect(
          dataFeedServerFull
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
              const { roles, dataFeedServerFull, beacons } = await deploy();
              const beacon = beacons[0];
              // Even if the deviation and heartbeat interval are zero, since the Beacon timestamp
              // is zero, the condition will return true
              const beaconUpdateSubscriptionConditionParameters = encodeUpdateSubscriptionConditionParameters(0, 0, 0);
              const beaconUpdateSubscriptionConditions = await encodeUpdateSubscriptionConditions(
                dataFeedServerFull,
                dataFeedServerFull.interface.getSighash('conditionPspBeaconUpdate'),
                beaconUpdateSubscriptionConditionParameters
              );
              const beaconUpdateSubscriptionId = await dataFeedServerFull
                .connect(roles.randomPerson)
                .callStatic.registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                );
              await dataFeedServerFull
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
                await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
                    const { roles, dataFeedServerFull, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dataFeedServerFull
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    const timestamp = await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(120);
                    // It has been 1 day since the Beacon timestamp
                    await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                    await helpers.mine();
                    expect(
                      await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('It has not been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    const { roles, dataFeedServerFull, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dataFeedServerFull
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(120);
                    expect(
                      await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
                    const { roles, dataFeedServerFull, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dataFeedServerFull
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    const timestamp = await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(80);
                    // It has been 1 day since the Beacon timestamp
                    await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                    await helpers.mine();
                    expect(
                      await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
                        beacon.beaconUpdateSubscriptionId,
                        data,
                        beacon.beaconUpdateSubscriptionConditionParameters
                      )
                    ).to.equal(true);
                  });
                });
                context('It has not been at least heartbeat interval seconds since the last update', function () {
                  it('returns true', async function () {
                    const { roles, dataFeedServerFull, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dataFeedServerFull
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to 100 first
                    await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                    const data = encodeData(80);
                    expect(
                      await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
                    const { roles, dataFeedServerFull, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dataFeedServerFull
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to -100 first (deviation reference)
                    await updateBeacon(roles, dataFeedServerFull, beacon, -100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // Any value satisfies the condition
                    const data = encodeData(-99);
                    expect(
                      await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
                      const { roles, dataFeedServerFull, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dataFeedServerFull
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      const timestamp = await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(119);
                      // It has been 1 day since the Beacon timestamp
                      await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                      await helpers.mine();
                      expect(
                        await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
                          beacon.beaconUpdateSubscriptionId,
                          data,
                          beacon.beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(true);
                    });
                  });
                  context('It has not been at least heartbeat interval seconds since the last update', function () {
                    it('returns false', async function () {
                      const { roles, dataFeedServerFull, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dataFeedServerFull
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 120 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(119);
                      expect(
                        await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
                    const { roles, dataFeedServerFull, beacons } = await deploy();
                    const beacon = beacons[0];
                    await dataFeedServerFull
                      .connect(roles.randomPerson)
                      .registerBeaconUpdateSubscription(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        beacon.beaconUpdateSubscriptionConditions,
                        beacon.airnode.wallet.address,
                        roles.sponsor.address
                      );
                    // Set the Beacon to -100 first (deviation reference)
                    await updateBeacon(roles, dataFeedServerFull, beacon, -100);
                    // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                    // Any value satisfies the condition
                    const data = encodeData(-101);
                    expect(
                      await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
                      const { roles, dataFeedServerFull, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dataFeedServerFull
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      const timestamp = await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(81);
                      // It has been 1 day since the Beacon timestamp
                      await helpers.time.setNextBlockTimestamp(timestamp + 24 * 60 * 60);
                      await helpers.mine();
                      expect(
                        await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
                          beacon.beaconUpdateSubscriptionId,
                          data,
                          beacon.beaconUpdateSubscriptionConditionParameters
                        )
                      ).to.equal(true);
                    });
                  });
                  context('It has not been at least heartbeat interval seconds since the last update', function () {
                    it('returns false', async function () {
                      const { roles, dataFeedServerFull, beacons } = await deploy();
                      const beacon = beacons[0];
                      await dataFeedServerFull
                        .connect(roles.randomPerson)
                        .registerBeaconUpdateSubscription(
                          beacon.airnode.wallet.address,
                          beacon.templateId,
                          beacon.beaconUpdateSubscriptionConditions,
                          beacon.airnode.wallet.address,
                          roles.sponsor.address
                        );
                      // Set the Beacon to 100 first
                      await updateBeacon(roles, dataFeedServerFull, beacon, 100);
                      // beaconUpdateSubscriptionConditionParameters is 10%, -100 and 1 day
                      // 100 -> 80 satisfies the condition (note that deviation reference is -100)
                      const data = encodeData(81);
                      expect(
                        await dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
            const { roles, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];

            const longConditionParameters = beacon.beaconUpdateSubscriptionConditionParameters + '00';
            const longConditions = await encodeUpdateSubscriptionConditions(
              dataFeedServerFull,
              dataFeedServerFull.interface.getSighash('conditionPspBeaconUpdate'),
              longConditionParameters
            );
            const subscriptionIdWithLongConditionParameters = await dataFeedServerFull
              .connect(roles.randomPerson)
              .callStatic.registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                longConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await dataFeedServerFull
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
              dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
              dataFeedServerFull,
              dataFeedServerFull.interface.getSighash('conditionPspBeaconUpdate'),
              shortConditionParameters
            );
            const subscriptionIdWithShortConditionParameters = await dataFeedServerFull
              .connect(roles.randomPerson)
              .callStatic.registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                shortConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await dataFeedServerFull
              .connect(roles.randomPerson)
              .registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                shortConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await expect(
              dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          await dataFeedServerFull
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
            dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
              beacon.beaconUpdateSubscriptionId,
              shortData,
              beacon.beaconUpdateSubscriptionConditionParameters
            )
          ).to.be.revertedWith('Data length not correct');
          await expect(
            dataFeedServerFull.callStatic.conditionPspBeaconUpdate(
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
        const { dataFeedServerFull } = await deploy();
        const data = encodeData(123);
        await expect(
          dataFeedServerFull.callStatic.conditionPspBeaconUpdate(testUtils.generateRandomBytes32(), data, '0x')
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
                  const { roles, dataFeedServerFull, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dataFeedServerFull
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.airnode.wallet.address,
                      roles.sponsor.address
                    );
                  await dataFeedServerFull
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
                    dataFeedServerFull
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
                    .to.emit(dataFeedServerFull, 'UpdatedBeaconWithPsp')
                    .withArgs(beacon.beaconId, subscriptionId, decodedData, timestamp);
                  const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
              context('Signature is not valid', function () {
                it('reverts', async function () {
                  const { roles, dataFeedServerFull, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dataFeedServerFull
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.airnode.wallet.address,
                      roles.sponsor.address
                    );
                  await dataFeedServerFull
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
                    dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dataFeedServerFull
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  await dataFeedServerFull
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
                    dataFeedServerFull
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
                    .to.emit(dataFeedServerFull, 'UpdatedBeaconWithPsp')
                    .withArgs(beacon.beaconId, subscriptionId, decodedData, timestamp);
                  const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                  expect(beaconAfter.value).to.equal(decodedData);
                  expect(beaconAfter.timestamp).to.equal(timestamp);
                });
              });
              context('Signature is not valid', function () {
                it('reverts', async function () {
                  const { roles, dataFeedServerFull, beacons } = await deploy();
                  const beacon = beacons[0];
                  const subscriptionId = await dataFeedServerFull
                    .connect(roles.randomPerson)
                    .callStatic.registerBeaconUpdateSubscription(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beacon.beaconUpdateSubscriptionConditions,
                      beacon.relayer.wallet.address,
                      roles.sponsor.address
                    );
                  await dataFeedServerFull
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
                    dataFeedServerFull
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
              const { roles, dataFeedServerFull, beacons } = await deploy();
              const beacon = beacons[0];
              const subscriptionId = await dataFeedServerFull
                .connect(roles.randomPerson)
                .callStatic.registerBeaconUpdateSubscription(
                  beacon.airnode.wallet.address,
                  beacon.templateId,
                  beacon.beaconUpdateSubscriptionConditions,
                  beacon.airnode.wallet.address,
                  roles.sponsor.address
                );
              await dataFeedServerFull
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
              await updateBeacon(roles, dataFeedServerFull, beacon, updatedDecodedData);
              await expect(
                dataFeedServerFull
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
            const { roles, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];
            const subscriptionId = await dataFeedServerFull
              .connect(roles.randomPerson)
              .callStatic.registerBeaconUpdateSubscription(
                beacon.airnode.wallet.address,
                beacon.templateId,
                beacon.beaconUpdateSubscriptionConditions,
                beacon.airnode.wallet.address,
                roles.sponsor.address
              );
            await dataFeedServerFull
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
              dataFeedServerFull
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
              dataFeedServerFull
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
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const subscriptionId = await dataFeedServerFull
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
            dataFeedServerFull
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
    context('Timestamp is more than 1 hour from the future', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        const subscriptionId = await dataFeedServerFull
          .connect(roles.randomPerson)
          .callStatic.registerBeaconUpdateSubscription(
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.beaconUpdateSubscriptionConditions,
            beacon.airnode.wallet.address,
            roles.sponsor.address
          );
        await dataFeedServerFull
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
        const timestamp = nextTimestamp + 60 * 60 + 1;
        const signature = testUtils.signPspFulfillment(
          beacon.airnode.wallet,
          subscriptionId,
          timestamp,
          beacon.airnode.pspSponsorWallet.address
        );
        await expect(
          dataFeedServerFull
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
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
    context('Timestamp is zero', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        const subscriptionId = await dataFeedServerFull
          .connect(roles.randomPerson)
          .callStatic.registerBeaconUpdateSubscription(
            beacon.airnode.wallet.address,
            beacon.templateId,
            beacon.beaconUpdateSubscriptionConditions,
            beacon.airnode.wallet.address,
            roles.sponsor.address
          );
        await dataFeedServerFull
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
        const timestamp = 0;
        const signature = testUtils.signPspFulfillment(
          beacon.airnode.wallet,
          subscriptionId,
          timestamp,
          beacon.airnode.pspSponsorWallet.address
        );
        await expect(
          dataFeedServerFull
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

  describe('updateBeaconSetWithBeacons', function () {
    context('Did not specify less than two Beacons', function () {
      context('Beacons update Beacon set timestamp', function () {
        it('updates Beacon set', async function () {
          const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, dataFeedServerFull, beacon, beaconValues[index], beaconTimestamps[index]);
            })
          );
          const beaconSetValue = median(beaconValues);
          const beaconSetTimestamp = median(beaconTimestamps);
          const beaconSetBefore = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetBefore.value).to.equal(0);
          expect(beaconSetBefore.timestamp).to.equal(0);
          expect(
            await dataFeedServerFull
              .connect(roles.randomPerson)
              .callStatic.updateBeaconSetWithBeacons(beaconSet.beaconIds)
          ).to.equal(beaconSet.beaconSetId);
          await expect(dataFeedServerFull.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds))
            .to.emit(dataFeedServerFull, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSet.beaconSetId, beaconSetValue, beaconSetTimestamp);
          const beaconSetAfter = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetAfter.value).to.equal(beaconSetValue);
          expect(beaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
        });
      });
      context('Beacons do not update Beacon set timestamp', function () {
        context('Beacons update Beacon set value', function () {
          it('updates Beacon set', async function () {
            const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
            // Populate the Beacons
            const beaconValues = [100, 80, 120];
            const currentTimestamp = await helpers.time.latest();
            const beaconTimestamps = [currentTimestamp, currentTimestamp, currentTimestamp];
            await Promise.all(
              beacons.map(async (beacon, index) => {
                await updateBeacon(roles, dataFeedServerFull, beacon, beaconValues[index], beaconTimestamps[index]);
              })
            );
            const beaconIds = beacons.map((beacon) => {
              return beacon.beaconId;
            });
            await dataFeedServerFull.updateBeaconSetWithBeacons(beaconIds);
            await updateBeacon(roles, dataFeedServerFull, beacons[0], 110, currentTimestamp + 10);
            const beaconSetBefore = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
            expect(beaconSetBefore.value).to.equal(100);
            expect(beaconSetBefore.timestamp).to.equal(currentTimestamp);
            expect(
              await dataFeedServerFull
                .connect(roles.randomPerson)
                .callStatic.updateBeaconSetWithBeacons(beaconSet.beaconIds)
            ).to.equal(beaconSet.beaconSetId);
            await expect(dataFeedServerFull.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds))
              .to.emit(dataFeedServerFull, 'UpdatedBeaconSetWithBeacons')
              .withArgs(beaconSet.beaconSetId, 110, currentTimestamp);
            const beaconSetAfter = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
            expect(beaconSetAfter.value).to.equal(110);
            expect(beaconSetAfter.timestamp).to.equal(currentTimestamp);
          });
        });
        context('Beacons do not update Beacon set value', function () {
          it('reverts', async function () {
            const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
            // Update Beacon set with recent timestamp
            await updateBeaconSet(roles, dataFeedServerFull, beacons, 123);
            await expect(
              dataFeedServerFull.connect(roles.randomPerson).updateBeaconSetWithBeacons(beaconSet.beaconIds)
            ).to.be.revertedWith('Does not update Beacon set');
          });
        });
      });
    });
    context('Specified less than two Beacons', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        await expect(
          dataFeedServerFull.connect(roles.randomPerson).updateBeaconSetWithBeacons([beacons[0].beaconId])
        ).to.be.revertedWith('Specified less than two Beacons');
        await expect(dataFeedServerFull.connect(roles.randomPerson).updateBeaconSetWithBeacons([])).to.be.revertedWith(
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
              const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
              // Populate the Beacons
              const beaconValues = beacons.map(() => 0);
              const currentTimestamp = await helpers.time.latest();
              const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
              await Promise.all(
                beacons.map(async (beacon, index) => {
                  await updateBeacon(roles, dataFeedServerFull, beacon, beaconValues[index], beaconTimestamps[index]);
                })
              );
              // Even if the Beacon values are zero, since their timestamps are not zero,
              // the condition will return true
              expect(
                await dataFeedServerFull
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
              const { roles, dataFeedServerFull, beaconSet } = await deploy();
              expect(
                await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 110 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 110);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 110 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 110);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 90 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 90);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 90 satisfies the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 90);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 109 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 109);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 109 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 109);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // Fast forward to after the heartbeat interval
                  await helpers.time.increase(2 * 24 * 60 * 60);
                  // 100 -> 91 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 91);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
                  const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
                  // Set the Beacon set to 100 first
                  await updateBeaconSet(roles, dataFeedServerFull, beacons, 100);
                  // beaconSetUpdateSubscriptionConditionParameters is 5%, -100 and 2 days
                  // 100 -> 91 does not satisfy the condition (note that deviation reference is -100)
                  await Promise.all(
                    beacons.map(async (beacon) => {
                      await updateBeacon(roles, dataFeedServerFull, beacon, 91);
                    })
                  );
                  expect(
                    await dataFeedServerFull
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
          const { roles, dataFeedServerFull, beaconSet } = await deploy();
          await expect(
            dataFeedServerFull
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
        const { roles, dataFeedServerFull, beaconSet } = await deploy();
        await expect(
          dataFeedServerFull
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
          const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, dataFeedServerFull, beacon, beaconValues[index], beaconTimestamps[index]);
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
          const beaconSetBefore = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetBefore.value).to.equal(0);
          expect(beaconSetBefore.timestamp).to.equal(0);
          await expect(
            dataFeedServerFull
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
            .to.emit(dataFeedServerFull, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSet.beaconSetId, beaconSetValue, beaconSetTimestamp);
          const beaconSetAfter = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetAfter.value).to.equal(beaconSetValue);
          expect(beaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
        });
      });
      context('Subscription is relayed', function () {
        it('updates Beacon set', async function () {
          // Note that updating a Beacon set with a relayed subscription makes no sense
          // We are testing this for the sake of completeness
          const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
          // Populate the Beacons
          const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
          const currentTimestamp = await helpers.time.latest();
          const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
          await Promise.all(
            beacons.map(async (beacon, index) => {
              await updateBeacon(roles, dataFeedServerFull, beacon, beaconValues[index], beaconTimestamps[index]);
            })
          );
          const beaconSetValue = median(beaconValues);
          const beaconSetTimestamp = median(beaconTimestamps);
          const beaconSetUpdateSubscriptionId = await deriveUpdateSubscriptionId(
            dataFeedServerFull,
            beacons[0].airnode.wallet.address,
            ethers.constants.HashZero,
            beaconSet.beaconSetUpdateSubscriptionConditions,
            beacons[0].relayer.wallet.address,
            roles.sponsor.address,
            dataFeedServerFull.interface.getSighash('fulfillPspBeaconSetUpdate'),
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
          const beaconSetBefore = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetBefore.value).to.equal(0);
          expect(beaconSetBefore.timestamp).to.equal(0);
          await expect(
            dataFeedServerFull
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
            .to.emit(dataFeedServerFull, 'UpdatedBeaconSetWithBeacons')
            .withArgs(beaconSet.beaconSetId, beaconSetValue, beaconSetTimestamp);
          const beaconSetAfter = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
          expect(beaconSetAfter.value).to.equal(beaconSetValue);
          expect(beaconSetAfter.timestamp).to.equal(beaconSetTimestamp);
        });
      });
    });
    context('Data length is not correct', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
        // Populate the Beacons
        const beaconValues = beacons.map(() => Math.floor(Math.random() * 200 - 100));
        const currentTimestamp = await helpers.time.latest();
        const beaconTimestamps = beacons.map(() => Math.floor(currentTimestamp - Math.random() * 5 * 60));
        await Promise.all(
          beacons.map(async (beacon, index) => {
            await updateBeacon(roles, dataFeedServerFull, beacon, beaconValues[index], beaconTimestamps[index]);
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
          dataFeedServerFull
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
    context('Timestamp is valid', function () {
      context('Signature is valid', function () {
        context('Fulfillment data length is correct', function () {
          context('Decoded fulfillment data can be typecasted into int224', function () {
            context('Updates timestamp', function () {
              it('updates Beacon with signed data', async function () {
                const { roles, dataFeedServerFull, beacons } = await deploy();
                const beacon = beacons[0];
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = await helpers.time.latest();
                const signature = await testUtils.signData(
                  beacon.airnode.wallet,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue)
                );
                const beaconBefore = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                expect(beaconBefore.value).to.equal(0);
                expect(beaconBefore.timestamp).to.equal(0);
                await expect(
                  dataFeedServerFull
                    .connect(roles.randomPerson)
                    .updateBeaconWithSignedData(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      beaconTimestamp,
                      encodeData(beaconValue),
                      signature
                    )
                )
                  .to.emit(dataFeedServerFull, 'UpdatedBeaconWithSignedData')
                  .withArgs(beacon.beaconId, beaconValue, beaconTimestamp);
                const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                expect(beaconAfter.value).to.equal(beaconValue);
                expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
              });
            });
            context('Does not update timestamp', function () {
              it('reverts', async function () {
                const { roles, dataFeedServerFull, beacons } = await deploy();
                const beacon = beacons[0];
                const beaconValue = Math.floor(Math.random() * 200 - 100);
                const beaconTimestamp = await helpers.time.latest();
                const signature = await testUtils.signData(
                  beacon.airnode.wallet,
                  beacon.templateId,
                  beaconTimestamp,
                  encodeData(beaconValue)
                );
                await dataFeedServerFull
                  .connect(roles.randomPerson)
                  .updateBeaconWithSignedData(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    beaconTimestamp,
                    encodeData(beaconValue),
                    signature
                  );
                await expect(
                  dataFeedServerFull
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
              const { roles, dataFeedServerFull, beacons } = await deploy();
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
                dataFeedServerFull
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
                dataFeedServerFull
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
            const { roles, dataFeedServerFull, beacons } = await deploy();
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
              dataFeedServerFull
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
      context('Signature is not valid', function () {
        it('reverts', async function () {
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await expect(
            dataFeedServerFull
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
    context('Timestamp is more than 1 hour from the future', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const beaconTimestamp = nextTimestamp + 60 * 60 + 1;
        const signature = await testUtils.signData(
          beacon.airnode.wallet,
          beacon.templateId,
          beaconTimestamp,
          encodeData(beaconValue)
        );
        await expect(
          dataFeedServerFull
            .connect(roles.randomPerson)
            .updateBeaconWithSignedData(
              beacon.airnode.wallet.address,
              beacon.templateId,
              beaconTimestamp,
              encodeData(beaconValue),
              signature
            )
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
    context('Timestamp is zero', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const beaconTimestamp = 0;
        const signature = await testUtils.signData(
          beacon.airnode.wallet,
          beacon.templateId,
          beaconTimestamp,
          encodeData(beaconValue)
        );
        await expect(
          dataFeedServerFull
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

  describe('updateOevProxyDataFeedWithSignedData', function () {
    context('Timestamp is valid', function () {
      context('Updates timestamp', function () {
        context('Fulfillment data length is correct', function () {
          context('Decoded fulfillment data can be typecasted into int224', function () {
            context('More than one Beacon is specified', function () {
              context('There are no invalid signatures', function () {
                context('There are enough signatures to constitute an absolute majority', function () {
                  context('Data in packed signatures is consistent with the data feed ID', function () {
                    it('updates OEV proxy Beacon set with signed data', async function () {
                      const { roles, dataFeedServerFull, oevProxy, beacons, beaconSet } = await deploy();
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10000;
                      const updateId = testUtils.generateRandomBytes32();
                      // Randomly omit one of the signatures
                      const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                      const signatures = await Promise.all(
                        beacons.map(async (beacon, index) => {
                          if (index === omitSignatureAtIndex) {
                            return '0x';
                          } else {
                            return await testUtils.signOevData(
                              dataFeedServerFull,
                              oevProxy.address,
                              beaconSet.beaconSetId,
                              updateId,
                              oevUpdateTimestamp,
                              encodeData(oevUpdateValue),
                              roles.searcher.address,
                              bidAmount,
                              beacon.airnode.wallet,
                              beacon.templateId
                            );
                          }
                        })
                      );
                      const packedOevUpdateSignatures = signatures.map((signature, index) => {
                        return packOevUpdateSignature(
                          beacons[index].airnode.wallet.address,
                          beacons[index].templateId,
                          signature
                        );
                      });
                      const beaconSetBefore = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
                      expect(beaconSetBefore.value).to.equal(0);
                      expect(beaconSetBefore.timestamp).to.equal(0);
                      const oevProxyBeaconSetBefore = await dataFeedServerFull.oevProxyToIdToDataFeed(
                        oevProxy.address,
                        beaconSet.beaconSetId
                      );
                      expect(oevProxyBeaconSetBefore.value).to.equal(0);
                      expect(oevProxyBeaconSetBefore.timestamp).to.equal(0);
                      await expect(
                        dataFeedServerFull
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            oevProxy.address,
                            beaconSet.beaconSetId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            packedOevUpdateSignatures,
                            { value: bidAmount }
                          )
                      )
                        .to.emit(dataFeedServerFull, 'UpdatedOevProxyBeaconSetWithSignedData')
                        .withArgs(
                          beaconSet.beaconSetId,
                          oevProxy.address,
                          updateId,
                          oevUpdateValue,
                          oevUpdateTimestamp
                        );
                      const beaconSetAfter = await dataFeedServerFull.dataFeeds(beaconSet.beaconSetId);
                      expect(beaconSetAfter.value).to.equal(0);
                      expect(beaconSetAfter.timestamp).to.equal(0);
                      const oevProxyBeaconSetAfter = await dataFeedServerFull.oevProxyToIdToDataFeed(
                        oevProxy.address,
                        beaconSet.beaconSetId
                      );
                      expect(oevProxyBeaconSetAfter.value).to.equal(oevUpdateValue);
                      expect(oevProxyBeaconSetAfter.timestamp).to.equal(oevUpdateTimestamp);
                    });
                  });
                  context('Data in packed signatures is not consistent with the data feed ID', function () {
                    it('reverts', async function () {
                      const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10000;
                      const updateId = testUtils.generateRandomBytes32();
                      // Randomly omit one of the signatures
                      const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                      const spoofedDataFeedId = testUtils.generateRandomBytes32();
                      const signatures = await Promise.all(
                        beacons.map(async (beacon, index) => {
                          if (index === omitSignatureAtIndex) {
                            return '0x';
                          } else {
                            return await testUtils.signOevData(
                              dataFeedServerFull,
                              oevProxy.address,
                              spoofedDataFeedId,
                              updateId,
                              oevUpdateTimestamp,
                              encodeData(oevUpdateValue),
                              roles.searcher.address,
                              bidAmount,
                              beacon.airnode.wallet,
                              beacon.templateId
                            );
                          }
                        })
                      );
                      const packedOevUpdateSignatures = signatures.map((signature, index) => {
                        return packOevUpdateSignature(
                          beacons[index].airnode.wallet.address,
                          beacons[index].templateId,
                          signature
                        );
                      });
                      await expect(
                        dataFeedServerFull
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            oevProxy.address,
                            spoofedDataFeedId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            packedOevUpdateSignatures,
                            { value: bidAmount }
                          )
                      ).to.be.revertedWith('Beacon set ID mismatch');
                    });
                  });
                });
                context('There are not enough signatures to constitute an absolute majority', function () {
                  it('reverts', async function () {
                    const { roles, dataFeedServerFull, oevProxy, beacons, beaconSet } = await deploy();
                    const oevUpdateValue = 105;
                    const currentTimestamp = await helpers.time.latest();
                    const oevUpdateTimestamp = currentTimestamp + 1;
                    const bidAmount = 10000;
                    const updateId = testUtils.generateRandomBytes32();
                    // Randomly omit two of the signatures
                    const includeSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                    const signatures = await Promise.all(
                      beacons.map(async (beacon, index) => {
                        if (index !== includeSignatureAtIndex) {
                          return '0x';
                        } else {
                          return await testUtils.signOevData(
                            dataFeedServerFull,
                            oevProxy.address,
                            beaconSet.beaconSetId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            roles.searcher.address,
                            bidAmount,
                            beacon.airnode.wallet,
                            beacon.templateId
                          );
                        }
                      })
                    );
                    const packedOevUpdateSignatures = signatures.map((signature, index) => {
                      return packOevUpdateSignature(
                        beacons[index].airnode.wallet.address,
                        beacons[index].templateId,
                        signature
                      );
                    });
                    await expect(
                      dataFeedServerFull
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(
                          oevProxy.address,
                          beaconSet.beaconSetId,
                          updateId,
                          oevUpdateTimestamp,
                          encodeData(oevUpdateValue),
                          packedOevUpdateSignatures,
                          { value: bidAmount }
                        )
                    ).to.be.revertedWith('Not enough signatures');
                  });
                });
              });
              context('There are invalid signatures', function () {
                it('reverts', async function () {
                  const { roles, dataFeedServerFull, oevProxy, beacons, beaconSet } = await deploy();
                  const oevUpdateValue = 105;
                  const currentTimestamp = await helpers.time.latest();
                  const oevUpdateTimestamp = currentTimestamp + 1;
                  const bidAmount = 10000;
                  const updateId = testUtils.generateRandomBytes32();
                  // Randomly omit one of the signatures
                  const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
                  const signatures = await Promise.all(
                    beacons.map(async (beacon, index) => {
                      if (index === omitSignatureAtIndex) {
                        return '0x';
                      } else {
                        return '0x123456';
                      }
                    })
                  );
                  const packedOevUpdateSignatures = signatures.map((signature, index) => {
                    return packOevUpdateSignature(
                      beacons[index].airnode.wallet.address,
                      beacons[index].templateId,
                      signature
                    );
                  });
                  await expect(
                    dataFeedServerFull
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(
                        oevProxy.address,
                        beaconSet.beaconSetId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        packedOevUpdateSignatures,
                        { value: bidAmount }
                      )
                  ).to.be.revertedWith('ECDSA: invalid signature length');
                });
              });
            });
            context('One Beacon is specified', function () {
              context('The signature is not invalid', function () {
                context('The signature is not omitted', function () {
                  context('Data in the packed signature is consistent with the data feed ID', function () {
                    it('updates OEV proxy Beacon with signed data', async function () {
                      const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
                      const beacon = beacons[0];
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10000;
                      const updateId = testUtils.generateRandomBytes32();
                      const signature = await testUtils.signOevData(
                        dataFeedServerFull,
                        oevProxy.address,
                        beacon.beaconId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        roles.searcher.address,
                        bidAmount,
                        beacon.airnode.wallet,
                        beacon.templateId
                      );
                      const packedOevUpdateSignature = packOevUpdateSignature(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        signature
                      );
                      const beaconBefore = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                      expect(beaconBefore.value).to.equal(0);
                      expect(beaconBefore.timestamp).to.equal(0);
                      const oevProxyBeaconBefore = await dataFeedServerFull.oevProxyToIdToDataFeed(
                        oevProxy.address,
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconBefore.value).to.equal(0);
                      expect(oevProxyBeaconBefore.timestamp).to.equal(0);
                      await expect(
                        dataFeedServerFull
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            oevProxy.address,
                            beacon.beaconId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            [packedOevUpdateSignature],
                            { value: bidAmount }
                          )
                      )
                        .to.emit(dataFeedServerFull, 'UpdatedOevProxyBeaconWithSignedData')
                        .withArgs(beacon.beaconId, oevProxy.address, updateId, oevUpdateValue, oevUpdateTimestamp);
                      const beaconAfter = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                      expect(beaconAfter.value).to.equal(0);
                      expect(beaconAfter.timestamp).to.equal(0);
                      const oevProxyBeaconAfter = await dataFeedServerFull.oevProxyToIdToDataFeed(
                        oevProxy.address,
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconAfter.value).to.equal(oevUpdateValue);
                      expect(oevProxyBeaconAfter.timestamp).to.equal(oevUpdateTimestamp);
                    });
                  });
                  context('Data in the packed signature is not consistent with the data feed ID', function () {
                    it('reverts', async function () {
                      const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
                      const beacon = beacons[0];
                      const oevUpdateValue = 105;
                      const currentTimestamp = await helpers.time.latest();
                      const oevUpdateTimestamp = currentTimestamp + 1;
                      const bidAmount = 10000;
                      const updateId = testUtils.generateRandomBytes32();
                      const spoofedDataFeedId = testUtils.generateRandomBytes32();
                      const signature = await testUtils.signOevData(
                        dataFeedServerFull,
                        oevProxy.address,
                        spoofedDataFeedId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        roles.searcher.address,
                        bidAmount,
                        beacon.airnode.wallet,
                        beacon.templateId
                      );
                      const packedOevUpdateSignature = packOevUpdateSignature(
                        beacon.airnode.wallet.address,
                        beacon.templateId,
                        signature
                      );
                      const beaconBefore = await dataFeedServerFull.dataFeeds(beacon.beaconId);
                      expect(beaconBefore.value).to.equal(0);
                      expect(beaconBefore.timestamp).to.equal(0);
                      const oevProxyBeaconBefore = await dataFeedServerFull.oevProxyToIdToDataFeed(
                        oevProxy.address,
                        beacon.beaconId
                      );
                      expect(oevProxyBeaconBefore.value).to.equal(0);
                      expect(oevProxyBeaconBefore.timestamp).to.equal(0);
                      await expect(
                        dataFeedServerFull
                          .connect(roles.searcher)
                          .updateOevProxyDataFeedWithSignedData(
                            oevProxy.address,
                            spoofedDataFeedId,
                            updateId,
                            oevUpdateTimestamp,
                            encodeData(oevUpdateValue),
                            [packedOevUpdateSignature],
                            { value: bidAmount }
                          )
                      ).to.be.revertedWith('Beacon ID mismatch');
                    });
                  });
                });
                context('The signature is omitted', function () {
                  it('reverts', async function () {
                    const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
                    const beacon = beacons[0];
                    const oevUpdateValue = 105;
                    const currentTimestamp = await helpers.time.latest();
                    const oevUpdateTimestamp = currentTimestamp + 1;
                    const bidAmount = 10000;
                    const updateId = testUtils.generateRandomBytes32();
                    const packedOevUpdateSignature = packOevUpdateSignature(
                      beacon.airnode.wallet.address,
                      beacon.templateId,
                      '0x'
                    );
                    await expect(
                      dataFeedServerFull
                        .connect(roles.searcher)
                        .updateOevProxyDataFeedWithSignedData(
                          oevProxy.address,
                          beacon.beaconId,
                          updateId,
                          oevUpdateTimestamp,
                          encodeData(oevUpdateValue),
                          [packedOevUpdateSignature],
                          { value: bidAmount }
                        )
                    ).to.be.revertedWith('Missing signature');
                  });
                });
              });
              context('The signature is invalid', function () {
                it('reverts', async function () {
                  const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
                  const beacon = beacons[0];
                  const oevUpdateValue = 105;
                  const currentTimestamp = await helpers.time.latest();
                  const oevUpdateTimestamp = currentTimestamp + 1;
                  const bidAmount = 10000;
                  const updateId = testUtils.generateRandomBytes32();
                  const packedOevUpdateSignature = packOevUpdateSignature(
                    beacon.airnode.wallet.address,
                    beacon.templateId,
                    '0x123456'
                  );
                  await expect(
                    dataFeedServerFull
                      .connect(roles.searcher)
                      .updateOevProxyDataFeedWithSignedData(
                        oevProxy.address,
                        beacon.beaconId,
                        updateId,
                        oevUpdateTimestamp,
                        encodeData(oevUpdateValue),
                        [packedOevUpdateSignature],
                        { value: bidAmount }
                      )
                  ).to.be.revertedWith('ECDSA: invalid signature length');
                });
              });
            });
            context('No Beacon is specified', function () {
              it('reverts', async function () {
                const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
                const beacon = beacons[0];
                const oevUpdateValue = 105;
                const currentTimestamp = await helpers.time.latest();
                const oevUpdateTimestamp = currentTimestamp + 1;
                const bidAmount = 10000;
                const updateId = testUtils.generateRandomBytes32();
                await expect(
                  dataFeedServerFull
                    .connect(roles.searcher)
                    .updateOevProxyDataFeedWithSignedData(
                      oevProxy.address,
                      beacon.beaconId,
                      updateId,
                      oevUpdateTimestamp,
                      encodeData(oevUpdateValue),
                      [],
                      { value: bidAmount }
                    )
                ).to.be.revertedWith('Did not specify any Beacons');
              });
            });
          });
          context('Decoded fulfillment data cannot be typecasted into int224', function () {
            it('reverts', async function () {
              const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
              const beacon = beacons[0];
              const oevUpdateValueWithUnderflow = ethers.BigNumber.from(-2).pow(223).sub(1);
              const currentTimestamp = await helpers.time.latest();
              const oevUpdateTimestamp = currentTimestamp + 1;
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signatureWithUnderflow = await testUtils.signOevData(
                dataFeedServerFull,
                oevProxy.address,
                beacon.beaconId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValueWithUnderflow),
                roles.searcher.address,
                bidAmount,
                beacon.airnode.wallet,
                beacon.templateId
              );
              const packedOevUpdateSignatureWithUnderflow = packOevUpdateSignature(
                beacon.airnode.wallet.address,
                beacon.templateId,
                signatureWithUnderflow
              );
              await expect(
                dataFeedServerFull
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(
                    oevProxy.address,
                    beacon.beaconId,
                    updateId,
                    oevUpdateTimestamp,
                    encodeData(oevUpdateValueWithUnderflow),
                    [packedOevUpdateSignatureWithUnderflow],
                    { value: bidAmount }
                  )
              ).to.be.revertedWith('Value typecasting error');
              const oevUpdateValueWithOverflow = ethers.BigNumber.from(2).pow(223);
              const signatureWithOverflow = await testUtils.signOevData(
                dataFeedServerFull,
                oevProxy.address,
                beacon.beaconId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValueWithOverflow),
                roles.searcher.address,
                bidAmount,
                beacon.airnode.wallet,
                beacon.templateId
              );
              const packedOevUpdateSignatureWithOverflow = packOevUpdateSignature(
                beacon.airnode.wallet.address,
                beacon.templateId,
                signatureWithOverflow
              );
              await expect(
                dataFeedServerFull
                  .connect(roles.searcher)
                  .updateOevProxyDataFeedWithSignedData(
                    oevProxy.address,
                    beacon.beaconId,
                    updateId,
                    oevUpdateTimestamp,
                    encodeData(oevUpdateValueWithOverflow),
                    [packedOevUpdateSignatureWithOverflow],
                    { value: bidAmount }
                  )
              ).to.be.revertedWith('Value typecasting error');
            });
          });
        });
        context('Fulfillment data length is not correct', function () {
          it('reverts', async function () {
            const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
            const beacon = beacons[0];
            const oevUpdateValue = 105;
            const currentTimestamp = await helpers.time.latest();
            const oevUpdateTimestamp = currentTimestamp + 1;
            const bidAmount = 10000;
            const updateId = testUtils.generateRandomBytes32();
            const signature = await testUtils.signOevData(
              dataFeedServerFull,
              oevProxy.address,
              beacon.beaconId,
              updateId,
              oevUpdateTimestamp,
              encodeData(oevUpdateValue) + '00',
              roles.searcher.address,
              bidAmount,
              beacon.airnode.wallet,
              beacon.templateId
            );
            const packedOevUpdateSignature = packOevUpdateSignature(
              beacon.airnode.wallet.address,
              beacon.templateId,
              signature
            );
            await expect(
              dataFeedServerFull
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(
                  oevProxy.address,
                  beacon.beaconId,
                  updateId,
                  oevUpdateTimestamp,
                  encodeData(oevUpdateValue) + '00',
                  [packedOevUpdateSignature],
                  { value: bidAmount }
                )
            ).to.be.revertedWith('Data length not correct');
          });
        });
      });
      context('Does not update timestamp', function () {
        it('reverts', async function () {
          const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
          const beacon = beacons[0];
          const oevUpdateValue = 105;
          const currentTimestamp = await helpers.time.latest();
          const oevUpdateTimestamp = currentTimestamp + 1;
          const bidAmount = 10000;
          const updateId = testUtils.generateRandomBytes32();
          const signature = await testUtils.signOevData(
            dataFeedServerFull,
            oevProxy.address,
            beacon.beaconId,
            updateId,
            oevUpdateTimestamp,
            encodeData(oevUpdateValue),
            roles.searcher.address,
            bidAmount,
            beacon.airnode.wallet,
            beacon.templateId
          );
          const packedOevUpdateSignature = packOevUpdateSignature(
            beacon.airnode.wallet.address,
            beacon.templateId,
            signature
          );
          await dataFeedServerFull
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(
              oevProxy.address,
              beacon.beaconId,
              updateId,
              oevUpdateTimestamp,
              encodeData(oevUpdateValue),
              [packedOevUpdateSignature],
              { value: bidAmount }
            );
          await expect(
            dataFeedServerFull
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                oevProxy.address,
                beacon.beaconId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValue),
                [packedOevUpdateSignature],
                { value: bidAmount }
              )
          ).to.be.revertedWith('Does not update timestamp');
        });
      });
    });
    context('Timestamp is more than 1 hour from the future', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
        const bidAmount = 10000;
        const updateId = testUtils.generateRandomBytes32();
        const nextTimestamp = (await helpers.time.latest()) + 1;
        await helpers.time.setNextBlockTimestamp(nextTimestamp);
        const beaconTimestampFromFuture = nextTimestamp + 60 * 60 + 1;
        await expect(
          dataFeedServerFull
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(
              oevProxy.address,
              updateId,
              beacons[0].beaconId,
              beaconTimestampFromFuture,
              '0x',
              ['0x'],
              {
                value: bidAmount,
              }
            )
        ).to.be.revertedWith('Timestamp not valid');
      });
    });
    context('Timestamp is zero', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
        const bidAmount = 10000;
        const updateId = testUtils.generateRandomBytes32();
        await expect(
          dataFeedServerFull
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(oevProxy.address, updateId, beacons[0].beaconId, 0, '0x', ['0x'], {
              value: bidAmount,
            })
        ).to.be.revertedWith('Does not update timestamp');
      });
    });
  });

  describe('withdraw', function () {
    context('OEV proxy announces a beneficiary address', function () {
      context('OEV proxy announces a non-zero beneficiary address', function () {
        context('OEV proxy balance is not zero', function () {
          context('Beneficiary does not revert the transfer', function () {
            it('withdraws the OEV proxy balance to the respective beneficiary', async function () {
              const { roles, dataFeedServerFull, oevProxy, beacons } = await deploy();
              const beacon = beacons[0];
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signature = await testUtils.signOevData(
                dataFeedServerFull,
                oevProxy.address,
                beacon.beaconId,
                updateId,
                beaconTimestamp,
                encodeData(beaconValue),
                roles.searcher.address,
                bidAmount,
                beacon.airnode.wallet,
                beacon.templateId
              );
              const packedOevUpdateSignature = await packOevUpdateSignature(
                beacon.airnode.wallet.address,
                beacon.templateId,
                signature
              );
              await dataFeedServerFull
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(
                  oevProxy.address,
                  beacon.beaconId,
                  updateId,
                  beaconTimestamp,
                  encodeData(beaconValue),
                  [packedOevUpdateSignature],
                  {
                    value: bidAmount,
                  }
                );
              const oevBeneficiaryBalanceBeforeWithdrawal = await ethers.provider.getBalance(
                roles.oevBeneficiary.address
              );
              await expect(dataFeedServerFull.connect(roles.randomPerson).withdraw(oevProxy.address))
                .to.emit(dataFeedServerFull, 'Withdrew')
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
              const { roles, dataFeedServerFull, beacons } = await deploy();
              const beacon = beacons[0];
              const dataFeedProxyWithOevFactory = await ethers.getContractFactory(
                'DataFeedProxyWithOev',
                roles.deployer
              );
              const oevProxyWithRevertingBeneficiary = await dataFeedProxyWithOevFactory.deploy(
                dataFeedServerFull.address,
                beacon.beaconId,
                dataFeedServerFull.address
              );
              const beaconValue = Math.floor(Math.random() * 200 - 100);
              const beaconTimestamp = await helpers.time.latest();
              const bidAmount = 10000;
              const updateId = testUtils.generateRandomBytes32();
              const signature = await testUtils.signOevData(
                dataFeedServerFull,
                oevProxyWithRevertingBeneficiary.address,
                beacon.beaconId,
                updateId,
                beaconTimestamp,
                encodeData(beaconValue),
                roles.searcher.address,
                bidAmount,
                beacon.airnode.wallet,
                beacon.templateId
              );
              const packedOevUpdateSignature = await packOevUpdateSignature(
                beacon.airnode.wallet.address,
                beacon.templateId,
                signature
              );
              await dataFeedServerFull
                .connect(roles.searcher)
                .updateOevProxyDataFeedWithSignedData(
                  oevProxyWithRevertingBeneficiary.address,
                  beacon.beaconId,
                  updateId,
                  beaconTimestamp,
                  encodeData(beaconValue),
                  [packedOevUpdateSignature],
                  {
                    value: bidAmount,
                  }
                );
              await expect(
                dataFeedServerFull.connect(roles.randomPerson).withdraw(oevProxyWithRevertingBeneficiary.address)
              ).to.be.revertedWith('Withdrawal reverted');
            });
          });
        });
        context('OEV proxy balance is zero', function () {
          it('reverts', async function () {
            const { roles, dataFeedServerFull, oevProxy } = await deploy();
            await expect(dataFeedServerFull.connect(roles.randomPerson).withdraw(oevProxy.address)).to.be.revertedWith(
              'OEV proxy balance zero'
            );
          });
        });
      });
      context('OEV proxy announces a zero beneficiary address', function () {
        it('reverts', async function () {
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const dataFeedProxyWithOevFactory = await ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
          const oevProxyWithZeroBeneficiary = await dataFeedProxyWithOevFactory.deploy(
            dataFeedServerFull.address,
            beacon.beaconId,
            ethers.constants.AddressZero
          );
          await expect(
            dataFeedServerFull.connect(roles.randomPerson).withdraw(oevProxyWithZeroBeneficiary.address)
          ).to.be.revertedWith('Beneficiary address zero');
        });
      });
    });
    context('OEV proxy does not announce a beneficiary address', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull } = await deploy();
        await expect(
          dataFeedServerFull.connect(roles.randomPerson).withdraw(roles.randomPerson.address)
        ).to.be.revertedWithoutReason;
        await expect(
          dataFeedServerFull.connect(roles.randomPerson).withdraw(dataFeedServerFull.address)
        ).to.be.revertedWithoutReason;
      });
    });
  });

  describe('setDapiName', function () {
    context('dAPI name is not zero', function () {
      context('Data feed ID is not zero', function () {
        context('Sender is manager', function () {
          it('sets dAPI name', async function () {
            const { roles, dataFeedServerFull, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            await expect(dataFeedServerFull.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId))
              .to.emit(dataFeedServerFull, 'SetDapiName')
              .withArgs(beaconSet.beaconSetId, dapiName, roles.manager.address);
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const { roles, dataFeedServerFull, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            await expect(dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId))
              .to.emit(dataFeedServerFull, 'SetDapiName')
              .withArgs(beaconSet.beaconSetId, dapiName, roles.dapiNameSetter.address);
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const { roles, dataFeedServerFull, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await expect(
              dataFeedServerFull.connect(roles.randomPerson).setDapiName(dapiName, beaconSet.beaconSetId)
            ).to.be.revertedWith('Sender cannot set dAPI name');
          });
        });
      });
      context('Data feed ID is zero', function () {
        context('Sender is manager', function () {
          it('sets dAPI name', async function () {
            const { roles, dataFeedServerFull, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await dataFeedServerFull.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId);
            await expect(dataFeedServerFull.connect(roles.manager).setDapiName(dapiName, ethers.constants.HashZero))
              .to.emit(dataFeedServerFull, 'SetDapiName')
              .withArgs(ethers.constants.HashZero, dapiName, roles.manager.address);
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            // Check if we can still set the dAPI name
            await dataFeedServerFull.connect(roles.manager).setDapiName(dapiName, beaconSet.beaconSetId);
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is dAPI name setter', function () {
          it('sets dAPI name', async function () {
            const { roles, dataFeedServerFull, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            await expect(
              dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, ethers.constants.HashZero)
            )
              .to.emit(dataFeedServerFull, 'SetDapiName')
              .withArgs(ethers.constants.HashZero, dapiName, roles.dapiNameSetter.address);
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(ethers.constants.HashZero);
            // Check if we can still set the dAPI name
            await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            expect(await dataFeedServerFull.dapiNameToDataFeedId(dapiName)).to.equal(beaconSet.beaconSetId);
          });
        });
        context('Sender is not dAPI name setter', function () {
          it('reverts', async function () {
            const { roles, dataFeedServerFull, beaconSet } = await deploy();
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            await expect(
              dataFeedServerFull.connect(roles.randomPerson).setDapiName(dapiName, beaconSet.beaconSetId)
            ).to.be.revertedWith('Sender cannot set dAPI name');
          });
        });
      });
    });
    context('dAPI name is zero', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beaconSet } = await deploy();
        await expect(
          dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(ethers.constants.HashZero, beaconSet.beaconSetId)
        ).to.be.revertedWith('dAPI name zero');
      });
    });
  });

  describe('readDataFeedWithId', function () {
    context('Data feed is initialized', function () {
      it('reads data feed', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        const beaconValue = Math.floor(Math.random() * 200 - 100);
        const beaconTimestamp = await helpers.time.latest();
        await updateBeacon(roles, dataFeedServerFull, beacon, beaconValue, beaconTimestamp);
        const beaconAfter = await dataFeedServerFull.connect(roles.randomPerson).readDataFeedWithId(beacon.beaconId);
        expect(beaconAfter.value).to.equal(beaconValue);
        expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        await expect(
          dataFeedServerFull.connect(roles.randomPerson).readDataFeedWithId(beacon.beaconId)
        ).to.be.revertedWith('Data feed not initialized');
      });
    });
  });

  describe('readDataFeedWithDapiNameHash', function () {
    context('dAPI name set to Beacon', function () {
      context('Data feed is initialized', function () {
        it('reads Beacon', async function () {
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await updateBeacon(roles, dataFeedServerFull, beacon, beaconValue, beaconTimestamp);
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          const dapiAfter = await dataFeedServerFull
            .connect(roles.randomPerson)
            .readDataFeedWithDapiNameHash(dapiNameHash);
          expect(dapiAfter.value).to.be.equal(beaconValue);
          expect(dapiAfter.timestamp).to.be.equal(beaconTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          await expect(
            dataFeedServerFull.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name set to Beacon set', function () {
      context('Data feed is initialized', function () {
        it('reads Beacon set', async function () {
          const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
          const beaconSetValue = Math.floor(Math.random() * 200 - 100);
          const beaconSetTimestamp = await helpers.time.latest();
          await updateBeaconSet(roles, dataFeedServerFull, beacons, beaconSetValue, beaconSetTimestamp);
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          const dapiAfter = await dataFeedServerFull
            .connect(roles.randomPerson)
            .readDataFeedWithDapiNameHash(dapiNameHash);
          expect(dapiAfter.value).to.be.equal(beaconSetValue);
          expect(dapiAfter.timestamp).to.be.equal(beaconSetTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dataFeedServerFull, beaconSet } = await deploy();
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          await expect(
            dataFeedServerFull.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull } = await deploy();
        const dapiName = ethers.utils.formatBytes32String('My dAPI');
        const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await expect(
          dataFeedServerFull.connect(roles.randomPerson).readDataFeedWithDapiNameHash(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });

  describe('readDataFeedWithIdAsOevProxy', function () {
    context('Data feed is initialized', function () {
      context('OEV proxy data feed is more up to date', function () {
        it('reads OEV proxy data feed', async function () {
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          const bidAmount = 10000;
          const updateId = testUtils.generateRandomBytes32();
          const signature = await testUtils.signOevData(
            dataFeedServerFull,
            roles.mockOevProxy.address,
            beacon.beaconId,
            updateId,
            beaconTimestamp,
            encodeData(beaconValue),
            roles.searcher.address,
            bidAmount,
            beacon.airnode.wallet,
            beacon.templateId
          );
          const packedOevUpdateSignature = await packOevUpdateSignature(
            beacon.airnode.wallet.address,
            beacon.templateId,
            signature
          );
          await dataFeedServerFull
            .connect(roles.searcher)
            .updateOevProxyDataFeedWithSignedData(
              roles.mockOevProxy.address,
              beacon.beaconId,
              updateId,
              beaconTimestamp,
              encodeData(beaconValue),
              [packedOevUpdateSignature],
              {
                value: bidAmount,
              }
            );
          const beaconAfter = await dataFeedServerFull
            .connect(roles.mockOevProxy)
            .readDataFeedWithIdAsOevProxy(beacon.beaconId);
          expect(beaconAfter.value).to.equal(beaconValue);
          expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('Base data feed is more up to date', function () {
        it('reads base data feed', async function () {
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const beaconValue = Math.floor(Math.random() * 200 - 100);
          const beaconTimestamp = await helpers.time.latest();
          await updateBeacon(roles, dataFeedServerFull, beacon, beaconValue, beaconTimestamp);
          const beaconAfter = await dataFeedServerFull
            .connect(roles.mockOevProxy)
            .readDataFeedWithIdAsOevProxy(beacon.beaconId);
          expect(beaconAfter.value).to.equal(beaconValue);
          expect(beaconAfter.timestamp).to.equal(beaconTimestamp);
        });
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull, beacons } = await deploy();
        const beacon = beacons[0];
        await expect(
          dataFeedServerFull.connect(roles.mockOevProxy).readDataFeedWithIdAsOevProxy(beacon.beaconId)
        ).to.be.revertedWith('Data feed not initialized');
      });
    });
  });

  describe('readDataFeedWithDapiNameHashAsOevProxy', function () {
    context('dAPI name set to Beacon', function () {
      context('Data feed is initialized', function () {
        context('OEV proxy data feed is more up to date', function () {
          it('reads OEV proxy data feed', async function () {
            const { roles, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            const bidAmount = 10000;
            const updateId = testUtils.generateRandomBytes32();
            const signature = await testUtils.signOevData(
              dataFeedServerFull,
              roles.mockOevProxy.address,
              beacon.beaconId,
              updateId,
              beaconTimestamp,
              encodeData(beaconValue),
              roles.searcher.address,
              bidAmount,
              beacon.airnode.wallet,
              beacon.templateId
            );
            const packedOevUpdateSignature = await packOevUpdateSignature(
              beacon.airnode.wallet.address,
              beacon.templateId,
              signature
            );
            await dataFeedServerFull
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                roles.mockOevProxy.address,
                beacon.beaconId,
                updateId,
                beaconTimestamp,
                encodeData(beaconValue),
                [packedOevUpdateSignature],
                {
                  value: bidAmount,
                }
              );
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
            const dapiAfter = await dataFeedServerFull
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconValue);
            expect(dapiAfter.timestamp).to.equal(beaconTimestamp);
          });
        });
        context('Base data feed is more up to date', function () {
          it('reads base data feed', async function () {
            const { roles, dataFeedServerFull, beacons } = await deploy();
            const beacon = beacons[0];
            const beaconValue = Math.floor(Math.random() * 200 - 100);
            const beaconTimestamp = await helpers.time.latest();
            await updateBeacon(roles, dataFeedServerFull, beacon, beaconValue, beaconTimestamp);
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
            const dapiAfter = await dataFeedServerFull
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconValue);
            expect(dapiAfter.timestamp).to.equal(beaconTimestamp);
          });
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dataFeedServerFull, beacons } = await deploy();
          const beacon = beacons[0];
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beacon.beaconId);
          await expect(
            dataFeedServerFull.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name set to Beacon set', function () {
      context('Data feed is initialized', function () {
        context('OEV proxy data feed is more up to date', function () {
          it('reads OEV proxy data feed', async function () {
            const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
            // Populate the Beacons
            const beaconValues = [100, 80, 120];
            const currentTimestamp = await helpers.time.latest();
            const beaconTimestamps = [currentTimestamp, currentTimestamp, currentTimestamp];
            await Promise.all(
              beacons.map(async (beacon, index) => {
                await updateBeacon(roles, dataFeedServerFull, beacon, beaconValues[index], beaconTimestamps[index]);
              })
            );
            const beaconIds = beacons.map((beacon) => {
              return beacon.beaconId;
            });
            await dataFeedServerFull.updateBeaconSetWithBeacons(beaconIds);

            const oevUpdateValue = 105;
            const oevUpdateTimestamp = currentTimestamp + 1;
            const bidAmount = 10000;
            const updateId = testUtils.generateRandomBytes32();
            // Randomly omit one of the signatures
            const omitSignatureAtIndex = Math.floor(Math.random() * beacons.length);
            const signatures = await Promise.all(
              beacons.map(async (beacon, index) => {
                if (index === omitSignatureAtIndex) {
                  return '0x';
                } else {
                  return await testUtils.signOevData(
                    dataFeedServerFull,
                    roles.mockOevProxy.address,
                    beaconSet.beaconSetId,
                    updateId,
                    oevUpdateTimestamp,
                    encodeData(oevUpdateValue),
                    roles.searcher.address,
                    bidAmount,
                    beacon.airnode.wallet,
                    beacon.templateId
                  );
                }
              })
            );
            const packedOevUpdateSignatures = signatures.map((signature, index) => {
              return packOevUpdateSignature(
                beacons[index].airnode.wallet.address,
                beacons[index].templateId,
                signature
              );
            });
            await dataFeedServerFull
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                roles.mockOevProxy.address,
                beaconSet.beaconSetId,
                updateId,
                oevUpdateTimestamp,
                encodeData(oevUpdateValue),
                packedOevUpdateSignatures,
                { value: bidAmount }
              );
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            const dapiAfter = await dataFeedServerFull
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(oevUpdateValue);
            expect(dapiAfter.timestamp).to.equal(oevUpdateTimestamp);
          });
        });
        context('Base data feed is more up to date', function () {
          it('reads base data feed', async function () {
            const { roles, dataFeedServerFull, beacons, beaconSet } = await deploy();
            const currentTimestamp = await helpers.time.latest();
            const beaconSetValue = Math.floor(Math.random() * 200 - 100);
            const beaconSetTimestamp = Math.floor(currentTimestamp - Math.random() * 5 * 60);
            await updateBeaconSet(roles, dataFeedServerFull, beacons, beaconSetValue, beaconSetTimestamp);
            const dapiName = ethers.utils.formatBytes32String('My dAPI');
            const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
            await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
            const dapiAfter = await dataFeedServerFull
              .connect(roles.mockOevProxy)
              .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
            expect(dapiAfter.value).to.equal(beaconSetValue);
            expect(dapiAfter.timestamp).to.equal(beaconSetTimestamp);
          });
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const { roles, dataFeedServerFull, beaconSet } = await deploy();
          const dapiName = ethers.utils.formatBytes32String('My dAPI');
          const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
          await dataFeedServerFull.connect(roles.dapiNameSetter).setDapiName(dapiName, beaconSet.beaconSetId);
          await expect(
            dataFeedServerFull.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
          ).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name not set', function () {
      it('reverts', async function () {
        const { roles, dataFeedServerFull } = await deploy();
        const dapiName = ethers.utils.formatBytes32String('My dAPI');
        const dapiNameHash = ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);
        await expect(
          dataFeedServerFull.connect(roles.mockOevProxy).readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash)
        ).to.be.revertedWith('dAPI name not set');
      });
    });
  });
});
