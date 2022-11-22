const hre = require('hardhat');
const { expect } = require('chai');

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
});
