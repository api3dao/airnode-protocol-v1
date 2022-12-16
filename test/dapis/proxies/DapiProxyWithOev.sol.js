const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('DapiProxyWithOev', function () {
  let roles;
  let dapiServer, dapiProxyWithOev;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let airnodeAddress, airnodeWallet;
  let templateId, beaconSetTemplateIds;
  let beaconId, beaconValue, beaconTimestamp;
  let beaconSetBeaconIds = [],
    beaconSetId;
  const dapiName = hre.ethers.utils.formatBytes32String('My dAPI');
  const dapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [dapiName]);

  function encodeData(decodedData) {
    return hre.ethers.utils.defaultAbiCoder.encode(['uint256'], [decodedData]);
  }

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      dapiNameSetter: accounts[2],
      oevBeneficiary: accounts[3],
      searcher: accounts[4],
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
    const dapiProxyWithOevFactory = await hre.ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
    dapiProxyWithOev = await dapiProxyWithOevFactory.deploy(
      dapiServer.address,
      dapiNameHash,
      roles.oevBeneficiary.address
    );
    const airnodeData = testUtils.generateRandomAirnodeWallet();
    airnodeAddress = airnodeData.airnodeAddress;
    airnodeWallet = hre.ethers.Wallet.fromMnemonic(airnodeData.airnodeMnemonic, "m/44'/60'/0'/0/0");
    const endpointId = testUtils.generateRandomBytes32();
    const templateParameters = testUtils.generateRandomBytes();
    templateId = hre.ethers.utils.keccak256(
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
    beaconSetTemplateIds = [
      testUtils.generateRandomBytes32(),
      testUtils.generateRandomBytes32(),
      testUtils.generateRandomBytes32(),
    ];
    for (let ind = 0; ind < 3; ind++) {
      const beaconSetBeaconId = hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeAddress, beaconSetTemplateIds[ind]])
      );
      beaconSetBeaconIds[ind] = beaconSetBeaconId;
    }
    beaconSetId = hre.ethers.utils.keccak256(
      hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beaconSetBeaconIds])
    );
  });

  describe('constructor', function () {
    it('constructs', async function () {
      expect(await dapiProxyWithOev.dapiServer()).to.equal(dapiServer.address);
      expect(await dapiProxyWithOev.dapiNameHash()).to.equal(dapiNameHash);
      expect(await dapiProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
    });
  });

  describe('withdraw', function () {
    context('Beneficiary does not revert withdrawal', function () {
      it('withdraws', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        const bidAmount = hre.ethers.utils.parseEther('1');
        const metadata = hre.ethers.utils.solidityPack(
          ['uint256', 'address', 'address', 'uint256'],
          [
            (await hre.ethers.provider.getNetwork()).chainId,
            dapiProxyWithOev.address,
            roles.searcher.address,
            bidAmount,
          ]
        );
        const data = encodeData(123);
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
        await dapiProxyWithOev
          .connect(roles.searcher)
          .updateOevProxyDataFeedWithSignedData([airnodeAddress], [templateId], [timestamp], [data], [signature], {
            value: bidAmount,
          });
        const balanceBefore = await hre.ethers.provider.getBalance(roles.oevBeneficiary.address);
        await dapiProxyWithOev.connect(roles.oevBeneficiary).withdraw();
        const balanceAfter = await hre.ethers.provider.getBalance(roles.oevBeneficiary.address);
        // Some goes to withdrawal gas cost
        expect(balanceAfter.sub(balanceBefore)).to.gt(hre.ethers.utils.parseEther('0.99'));
      });
    });
    context('Beneficiary reverts withdrawal', function () {
      it('reverts', async function () {
        const mockOevBeneficiaryFactory = await hre.ethers.getContractFactory('MockOevBeneficiary', roles.deployer);
        const mockOevBeneficiary = await mockOevBeneficiaryFactory.deploy();
        const dapiProxyWithOevFactory = await hre.ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
        dapiProxyWithOev = await dapiProxyWithOevFactory.deploy(
          dapiServer.address,
          dapiNameHash,
          mockOevBeneficiary.address
        );
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        const bidAmount = 456;
        const metadata = hre.ethers.utils.solidityPack(
          ['uint256', 'address', 'address', 'uint256'],
          [
            (await hre.ethers.provider.getNetwork()).chainId,
            dapiProxyWithOev.address,
            roles.searcher.address,
            bidAmount,
          ]
        );
        const data = encodeData(123);
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
        await dapiProxyWithOev
          .connect(roles.searcher)
          .updateOevProxyDataFeedWithSignedData([airnodeAddress], [templateId], [timestamp], [data], [signature], {
            value: bidAmount,
          });
        await expect(mockOevBeneficiary.withdraw(dapiProxyWithOev.address)).to.be.revertedWith('WithdrawalReverted');
      });
    });
  });

  describe('updateOevProxyDataFeedWithSignedData', function () {
    context('Data feed is a Beacon', function () {
      context('Message value equals bid amount', function () {
        it('updates OEV proxy Beacon', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dapiProxyWithOev.address,
              roles.searcher.address,
              bidAmount,
            ]
          );
          const data = encodeData(123);
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
            dapiProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData([airnodeAddress], [templateId], [timestamp], [data], [signature], {
                value: bidAmount,
              })
          )
            .to.emit(dapiServer, 'UpdatedOevProxyBeaconWithSignedData')
            .withArgs(beaconId, dapiProxyWithOev.address, 123, timestamp);
          const beacon = await dapiProxyWithOev.read();
          expect(beacon.value).to.equal(123);
          expect(beacon.timestamp).to.equal(timestamp);
        });
      });
      context('Message value does not equal bid amount', function () {
        it('reverts', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dapiProxyWithOev.address,
              roles.searcher.address,
              bidAmount,
            ]
          );
          const data = encodeData(123);
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
            dapiProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData([airnodeAddress], [templateId], [timestamp], [data], [signature])
          ).to.be.revertedWith('Signature mismatch');
        });
      });
    });
    context('Data feed is a Beacon set', function () {
      context('Message value equals bid amount', function () {
        it('updates OEV proxy Beacon', async function () {
          await dapiServer.connect(roles.manager).setDapiName(dapiName, beaconSetId);
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dapiProxyWithOev.address,
              roles.searcher.address,
              bidAmount,
            ]
          );
          const data = encodeData(789);
          const signature0 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[0], timestamp, data, metadata]
                )
              )
            )
          );
          const signature1 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[1], timestamp, data, metadata]
                )
              )
            )
          );
          const signature2 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[2], timestamp, data, metadata]
                )
              )
            )
          );
          await expect(
            dapiProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                [airnodeAddress, airnodeAddress, airnodeAddress],
                beaconSetTemplateIds,
                [timestamp, timestamp, timestamp],
                [data, data, data],
                [signature0, signature1, signature2],
                {
                  value: bidAmount,
                }
              )
          )
            .to.emit(dapiServer, 'UpdatedOevProxyBeaconSetWithSignedData')
            .withArgs(beaconSetId, dapiProxyWithOev.address, 789, timestamp);
          const beaconSet = await dapiProxyWithOev.read();
          expect(beaconSet.value).to.equal(789);
          expect(beaconSet.timestamp).to.equal(timestamp);
        });
      });
      context('Message value does not equal bid amount', function () {
        it('reverts', async function () {
          await dapiServer.connect(roles.manager).setDapiName(dapiName, beaconSetId);
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dapiProxyWithOev.address,
              roles.searcher.address,
              bidAmount,
            ]
          );
          const data = encodeData(789);
          const signature0 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[0], timestamp, data, metadata]
                )
              )
            )
          );
          const signature1 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[1], timestamp, data, metadata]
                )
              )
            )
          );
          const signature2 = await airnodeWallet.signMessage(
            hre.ethers.utils.arrayify(
              hre.ethers.utils.keccak256(
                hre.ethers.utils.solidityPack(
                  ['bytes32', 'uint256', 'bytes', 'bytes'],
                  [beaconSetTemplateIds[2], timestamp, data, metadata]
                )
              )
            )
          );
          await expect(
            dapiProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyDataFeedWithSignedData(
                [airnodeAddress, airnodeAddress, airnodeAddress],
                beaconSetTemplateIds,
                [timestamp, timestamp, timestamp],
                [data, data, data],
                [signature0, signature1, signature2]
              )
          ).to.be.revertedWith('Signature mismatch');
        });
      });
    });
  });

  describe('read', function () {
    context('dAPI name is set', function () {
      context('Data feed is initialized', function () {
        it('reads', async function () {
          const dataFeed = await dapiProxyWithOev.read();
          expect(dataFeed.value).to.equal(beaconValue);
          expect(dataFeed.timestamp).to.equal(beaconTimestamp);
        });
      });
      context('Data feed is not initialized', function () {
        it('reverts', async function () {
          const uninitializedDapiName = hre.ethers.utils.formatBytes32String('My uninitialized dAPI');
          const uninitializedDapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [uninitializedDapiName]);
          await dapiServer.connect(roles.manager).setDapiName(uninitializedDapiName, testUtils.generateRandomBytes32());
          const dapiProxyWithOevFactory = await hre.ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
          dapiProxyWithOev = await dapiProxyWithOevFactory.deploy(
            dapiServer.address,
            uninitializedDapiNameHash,
            roles.oevBeneficiary.address
          );
          await expect(dapiProxyWithOev.read()).to.be.revertedWith('Data feed not initialized');
        });
      });
    });
    context('dAPI name is not set', function () {
      it('reverts', async function () {
        const unsetDapiName = hre.ethers.utils.formatBytes32String('My unset dAPI');
        const unsetDapiNameHash = hre.ethers.utils.solidityKeccak256(['bytes32'], [unsetDapiName]);
        const dapiProxyWithOevFactory = await hre.ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
        dapiProxyWithOev = await dapiProxyWithOevFactory.deploy(
          dapiServer.address,
          unsetDapiNameHash,
          roles.oevBeneficiary.address
        );
        await expect(dapiProxyWithOev.read()).to.be.revertedWith('dAPI name not set');
      });
    });
  });
});
