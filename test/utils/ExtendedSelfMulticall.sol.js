const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('ExtendedSelfMulticall', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
    };
    const ExtendedSelfMulticallFactory = await ethers.getContractFactory('ExtendedSelfMulticall', roles.deployer);
    const extendedSelfMulticall = await ExtendedSelfMulticallFactory.deploy();
    return {
      roles,
      extendedSelfMulticall,
    };
  }

  describe('getChainId', function () {
    it('gets chain ID', async function () {
      const { extendedSelfMulticall } = await helpers.loadFixture(deploy);
      expect(await extendedSelfMulticall.getChainId()).to.equal((await ethers.provider.getNetwork()).chainId);
    });
  });

  describe('containsBytecode', function () {
    it('returns if account contains bytecode', async function () {
      const { roles, extendedSelfMulticall } = await helpers.loadFixture(deploy);
      expect(await extendedSelfMulticall.containsBytecode(roles.deployer.address)).to.equal(false);
      expect(await extendedSelfMulticall.containsBytecode(extendedSelfMulticall.address)).to.equal(true);
    });
  });

  describe('getBalance', function () {
    it('gets balance', async function () {
      const { roles, extendedSelfMulticall } = await helpers.loadFixture(deploy);
      expect(await extendedSelfMulticall.getBalance(roles.deployer.address)).to.equal(
        await ethers.provider.getBalance(roles.deployer.address)
      );
    });
  });

  describe('getBlockNumber', function () {
    it('gets block number', async function () {
      const { extendedSelfMulticall } = await helpers.loadFixture(deploy);
      expect(await extendedSelfMulticall.getBlockNumber()).to.equal(await ethers.provider.getBlockNumber());
    });
  });

  describe('getBlockTimestamp', function () {
    it('gets block timestamp', async function () {
      const { extendedSelfMulticall } = await helpers.loadFixture(deploy);
      expect(await extendedSelfMulticall.getBlockTimestamp()).to.equal((await ethers.provider.getBlock()).timestamp);
    });
  });

  describe('getBlockBasefee', function () {
    it('gets block basefee', async function () {
      // Commenting this out because it's not supported by Hardhat yet
      // https://github.com/nomiclabs/hardhat/issues/1688
      // const { extendedSelfMulticall } = await helpers.loadFixture(deploy);
      // expect(await extendedSelfMulticall.getBlockBasefee()).to.equal((await ethers.provider.getBlock()).baseFeePerGas);
    });
  });
});
