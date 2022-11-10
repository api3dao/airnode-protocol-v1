const hre = require('hardhat');
const { expect } = require('chai');
const utils = require('../test-utils');

describe('ExtendedSelfMulticall', function () {
  let roles;
  let extendedSelfMulticall;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
    };
    const ExtendedSelfMulticallFactory = await hre.ethers.getContractFactory('ExtendedSelfMulticall', roles.deployer);
    extendedSelfMulticall = await ExtendedSelfMulticallFactory.deploy();
  });

  describe('getChainId', function () {
    it('gets chain ID', async function () {
      expect(await extendedSelfMulticall.getChainId()).to.equal((await hre.ethers.provider.getNetwork()).chainId);
    });
  });

  describe('getBalance', function () {
    it('gets balance', async function () {
      expect(await extendedSelfMulticall.getBalance(roles.deployer.address)).to.equal(
        await hre.ethers.provider.getBalance(roles.deployer.address)
      );
    });
  });

  describe('getBlockNumber', function () {
    it('gets block number', async function () {
      expect(await extendedSelfMulticall.getBlockNumber()).to.equal(await hre.ethers.provider.getBlockNumber());
    });
  });

  describe('getBlockTimestamp', function () {
    it('gets block timestamp', async function () {
      expect(await extendedSelfMulticall.getBlockTimestamp()).to.equal(
        (await hre.ethers.provider.getBlock()).timestamp
      );
    });
  });

  describe('getBlockBasefee', function () {
    it('gets block basefee', async function () {
      // Commenting this out because it's not supported by Hardhat yet
      // https://github.com/nomiclabs/hardhat/issues/1688
      // expect(await extendedSelfMulticall.getBlockBasefee()).to.equal((await hre.ethers.provider.getBlock()).baseFeePerGas);
    });
  });

  describe('trySelfMulticall', function () {
    it('tries calling all functions even when some fail', async function () {
      const data = [
        extendedSelfMulticall.interface.encodeFunctionData('getChainId', []),
        extendedSelfMulticall.interface.encodeFunctionData('multicall', [['0x']]),
        extendedSelfMulticall.interface.encodeFunctionData('getBlockNumber', []),
      ];

      const [succeeded, returnData] = await extendedSelfMulticall.callStatic.tryMulticall(data);
      expect(succeeded[0]).to.be.true;
      expect(extendedSelfMulticall.interface.decodeFunctionResult('getChainId', returnData[0]).toString()).to.eq(
        hre.ethers.provider.network.chainId.toString()
      );
      expect(succeeded[1]).to.be.false;
      expect(utils.decodeRevertString(returnData[1])).to.have.string('No revert string');
      expect(succeeded[2]).to.be.true;
      expect(extendedSelfMulticall.interface.decodeFunctionResult('getBlockNumber', returnData[2]).toString()).to.eq(
        (await hre.ethers.provider.getBlockNumber()).toString()
      );
    });
  });
});
