const hre = require('hardhat');
const { expect } = require('chai');
const utils = require('../test-utils');

describe('ExtendedMulticall', function () {
  let roles;
  let extendedMulticall;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
    };
    const ExtendedMulticallFactory = await hre.ethers.getContractFactory('ExtendedMulticall', roles.deployer);
    extendedMulticall = await ExtendedMulticallFactory.deploy();
  });

  describe('getChainId', function () {
    it('gets chain ID', async function () {
      expect(await extendedMulticall.getChainId()).to.equal((await hre.ethers.provider.getNetwork()).chainId);
    });
  });

  describe('getBalance', function () {
    it('gets balance', async function () {
      expect(await extendedMulticall.getBalance(roles.deployer.address)).to.equal(
        await hre.ethers.provider.getBalance(roles.deployer.address)
      );
    });
  });

  describe('getBlockNumber', function () {
    it('gets block number', async function () {
      expect(await extendedMulticall.getBlockNumber()).to.equal(await hre.ethers.provider.getBlockNumber());
    });
  });

  describe('getBlockTimestamp', function () {
    it('gets block timestamp', async function () {
      expect(await extendedMulticall.getBlockTimestamp()).to.equal((await hre.ethers.provider.getBlock()).timestamp);
    });
  });

  describe('getBlockBasefee', function () {
    it('gets block basefee', async function () {
      // Commenting this out because it's not supported by Hardhat yet
      // https://github.com/nomiclabs/hardhat/issues/1688
      // expect(await extendedMulticall.getBlockBasefee()).to.equal((await hre.ethers.provider.getBlock()).baseFeePerGas);
    });
  });

  describe('tryMulticall', function () {
    it('tries calling all functions even when some fail', async function () {
      const data = [
        extendedMulticall.interface.encodeFunctionData('getChainId', []),
        extendedMulticall.interface.encodeFunctionData('multicall', [['0x']]),
        extendedMulticall.interface.encodeFunctionData('getBlockNumber', []),
      ];

      await expect(extendedMulticall.tryMulticall(data))
        .to.emit(extendedMulticall, 'FailedDelegatedcall')
        .withArgs(
          extendedMulticall.interface.encodeFunctionData('multicall', [['0x']]),
          (await hre.ethers.provider.getBlock()).timestamp + 1,
          'low-level delegate call failed',
          roles.deployer.address
        );

      const results = await extendedMulticall.callStatic.tryMulticall(data);
      expect(extendedMulticall.interface.decodeFunctionResult('getChainId', results[0].returnData).toString()).to.eq(
        hre.ethers.provider.network.chainId.toString()
      );
      expect(results[1].success).to.be.false;
      expect(utils.decodeRevertString(results[1].returnData)).to.have.string('low-level delegate call failed');
      expect(
        extendedMulticall.interface.decodeFunctionResult('getBlockNumber', results[2].returnData).toString()
      ).to.eq((await hre.ethers.provider.getBlockNumber()).toString());
    });
  });
});
