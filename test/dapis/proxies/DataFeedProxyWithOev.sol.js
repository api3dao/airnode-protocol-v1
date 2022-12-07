const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../../test-utils');

describe('DataFeedProxyWithOev', function () {
  let roles;
  let dapiServer, dataFeedProxyWithOev;
  let dapiServerAdminRoleDescription = 'DapiServer admin';
  let airnodeAddress, airnodeWallet;
  let templateId, beaconSetTemplateIds;
  let beaconId, beaconValue, beaconTimestamp;
  let beaconSetBeaconIds = [],
    beaconSetId;

  function encodeData(decodedData) {
    return hre.ethers.utils.defaultAbiCoder.encode(['uint256'], [decodedData]);
  }

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      oevBeneficiary: accounts[2],
      searcher: accounts[3],
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
    const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
    dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
      dapiServer.address,
      beaconId,
      roles.oevBeneficiary.address
    );
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
      expect(await dataFeedProxyWithOev.dapiServer()).to.equal(dapiServer.address);
      expect(await dataFeedProxyWithOev.dataFeedId()).to.equal(beaconId);
      expect(await dataFeedProxyWithOev.oevBeneficiary()).to.equal(roles.oevBeneficiary.address);
    });
  });

  describe('withdraw', function () {
    context('Balance is not zero', function () {
      context('Beneficiary does not revert withdrawal', function () {
        it('withdraws', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const expirationTimestamp = timestamp + 3600;
          const bidAmount = hre.ethers.utils.parseEther('1');
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dataFeedProxyWithOev.address,
              roles.searcher.address,
              expirationTimestamp,
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
          await dataFeedProxyWithOev
            .connect(roles.searcher)
            .updateOevProxyBeaconWithSignedData(
              airnodeAddress,
              templateId,
              timestamp,
              data,
              expirationTimestamp,
              bidAmount,
              signature,
              {
                value: bidAmount,
              }
            );
          const balanceBefore = await hre.ethers.provider.getBalance(roles.oevBeneficiary.address);
          await dataFeedProxyWithOev.connect(roles.oevBeneficiary).withdraw();
          const balanceAfter = await hre.ethers.provider.getBalance(roles.oevBeneficiary.address);
          // Some goes to withdrawal gas cost
          expect(balanceAfter.sub(balanceBefore)).to.gt(hre.ethers.utils.parseEther('0.99'));
        });
      });
      context('Beneficiary reverts withdrawal', function () {
        it('reverts', async function () {
          const mockOevBeneficiaryFactory = await hre.ethers.getContractFactory('MockOevBeneficiary', roles.deployer);
          const mockOevBeneficiary = await mockOevBeneficiaryFactory.deploy();
          const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory('DapiProxyWithOev', roles.deployer);
          dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
            dapiServer.address,
            beaconId,
            mockOevBeneficiary.address
          );
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const expirationTimestamp = timestamp + 3600;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dataFeedProxyWithOev.address,
              roles.searcher.address,
              expirationTimestamp,
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
          await dataFeedProxyWithOev
            .connect(roles.searcher)
            .updateOevProxyBeaconWithSignedData(
              airnodeAddress,
              templateId,
              timestamp,
              data,
              expirationTimestamp,
              bidAmount,
              signature,
              {
                value: bidAmount,
              }
            );
          await expect(mockOevBeneficiary.withdraw(dataFeedProxyWithOev.address)).to.be.revertedWith(
            'Beneficiary reverted withdrawal'
          );
        });
      });
    });
    context('Balance is zero', function () {
      it('reverts', async function () {
        await expect(dataFeedProxyWithOev.connect(roles.oevBeneficiary).withdraw()).to.be.revertedWith('Zero balance');
      });
    });
  });

  describe('updateOevProxyBeacon', function () {
    context('Signature has not expired', function () {
      context('Message value equals bid amount', function () {
        it('updates OEV proxy Beacon', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const expirationTimestamp = timestamp + 3600;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dataFeedProxyWithOev.address,
              roles.searcher.address,
              expirationTimestamp,
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
            dataFeedProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyBeaconWithSignedData(
                airnodeAddress,
                templateId,
                timestamp,
                data,
                expirationTimestamp,
                bidAmount,
                signature,
                {
                  value: bidAmount,
                }
              )
          )
            .to.emit(dapiServer, 'UpdatedOevProxyBeaconWithSignedData')
            .withArgs(beaconId, dataFeedProxyWithOev.address, 123, timestamp);
          const beacon = await dataFeedProxyWithOev.read();
          expect(beacon.value).to.equal(123);
          expect(beacon.timestamp).to.equal(timestamp);
        });
      });
      context('Message value does not equal bid amount', function () {
        it('reverts', async function () {
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const expirationTimestamp = timestamp + 3600;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dataFeedProxyWithOev.address,
              roles.searcher.address,
              expirationTimestamp,
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
            dataFeedProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyBeaconWithSignedData(
                airnodeAddress,
                templateId,
                timestamp,
                data,
                expirationTimestamp,
                bidAmount,
                signature
              )
          ).to.be.revertedWith('Invalid bid amount');
        });
      });
    });
    context('Signature has expired', function () {
      it('reverts', async function () {
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        const expirationTimestamp = timestamp - 3600;
        const bidAmount = 456;
        const metadata = hre.ethers.utils.solidityPack(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            (await hre.ethers.provider.getNetwork()).chainId,
            dataFeedProxyWithOev.address,
            roles.searcher.address,
            expirationTimestamp,
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
          dataFeedProxyWithOev
            .connect(roles.searcher)
            .updateOevProxyBeaconWithSignedData(
              airnodeAddress,
              templateId,
              timestamp,
              data,
              expirationTimestamp,
              bidAmount,
              signature,
              {
                value: bidAmount,
              }
            )
        ).to.be.revertedWith('Expired signature');
      });
    });
  });

  describe('updateOevProxyBeaconSetWithSignedData', function () {
    context('Signature has not expired', function () {
      context('Message value equals bid amount', function () {
        it('updates OEV proxy Beacon', async function () {
          const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory(
            'DataFeedProxyWithOev',
            roles.deployer
          );
          dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
            dapiServer.address,
            beaconSetId,
            roles.oevBeneficiary.address
          );
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const expirationTimestamp = timestamp + 3600;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dataFeedProxyWithOev.address,
              roles.searcher.address,
              expirationTimestamp,
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
            dataFeedProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyBeaconSetWithSignedData(
                [airnodeAddress, airnodeAddress, airnodeAddress],
                beaconSetTemplateIds,
                [timestamp, timestamp, timestamp],
                [data, data, data],
                expirationTimestamp,
                bidAmount,
                [signature0, signature1, signature2],
                {
                  value: bidAmount,
                }
              )
          )
            .to.emit(dapiServer, 'UpdatedOevProxyBeaconSetWithSignedData')
            .withArgs(beaconSetId, dataFeedProxyWithOev.address, 789, timestamp);
          const beaconSet = await dataFeedProxyWithOev.read();
          expect(beaconSet.value).to.equal(789);
          expect(beaconSet.timestamp).to.equal(timestamp);
        });
      });
      context('Message value does not equal bid amount', function () {
        it('reverts', async function () {
          const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory(
            'DataFeedProxyWithOev',
            roles.deployer
          );
          dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
            dapiServer.address,
            beaconSetId,
            roles.oevBeneficiary.address
          );
          const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
          const expirationTimestamp = timestamp + 3600;
          const bidAmount = 456;
          const metadata = hre.ethers.utils.solidityPack(
            ['uint256', 'address', 'address', 'uint256', 'uint256'],
            [
              (await hre.ethers.provider.getNetwork()).chainId,
              dataFeedProxyWithOev.address,
              roles.searcher.address,
              expirationTimestamp,
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
            dataFeedProxyWithOev
              .connect(roles.searcher)
              .updateOevProxyBeaconSetWithSignedData(
                [airnodeAddress, airnodeAddress, airnodeAddress],
                beaconSetTemplateIds,
                [timestamp, timestamp, timestamp],
                [data, data, data],
                expirationTimestamp,
                bidAmount,
                [signature0, signature1, signature2]
              )
          ).to.be.revertedWith('Invalid bid amount');
        });
      });
    });
    context('Signature has expired', function () {
      it('reverts', async function () {
        const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
        dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
          dapiServer.address,
          beaconSetId,
          roles.oevBeneficiary.address
        );
        const timestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 1;
        const expirationTimestamp = timestamp - 3600;
        const bidAmount = 456;
        const metadata = hre.ethers.utils.solidityPack(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            (await hre.ethers.provider.getNetwork()).chainId,
            dataFeedProxyWithOev.address,
            roles.searcher.address,
            expirationTimestamp,
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
          dataFeedProxyWithOev
            .connect(roles.searcher)
            .updateOevProxyBeaconSetWithSignedData(
              [airnodeAddress, airnodeAddress, airnodeAddress],
              beaconSetTemplateIds,
              [timestamp, timestamp, timestamp],
              [data, data, data],
              expirationTimestamp,
              bidAmount,
              [signature0, signature1, signature2],
              {
                value: bidAmount,
              }
            )
        ).to.be.revertedWith('Expired signature');
      });
    });
  });

  describe('read', function () {
    context('Data feed is initialized', function () {
      it('reads', async function () {
        const dataFeed = await dataFeedProxyWithOev.read();
        expect(dataFeed.value).to.equal(beaconValue);
        expect(dataFeed.timestamp).to.equal(beaconTimestamp);
      });
    });
    context('Data feed is not initialized', function () {
      it('reverts', async function () {
        const dataFeedProxyWithOevFactory = await hre.ethers.getContractFactory('DataFeedProxyWithOev', roles.deployer);
        dataFeedProxyWithOev = await dataFeedProxyWithOevFactory.deploy(
          dapiServer.address,
          testUtils.generateRandomBytes32(),
          roles.oevBeneficiary.address
        );
        await expect(dataFeedProxyWithOev.read()).to.be.revertedWith('Data feed not initialized');
      });
    });
  });
});
