const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('Funder', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      funder: accounts[0],
      owner: accounts[1],
      randomPerson: accounts[9],
    };

    const root = testUtils.generateRandomBytes32();

    const FunderDepository = await ethers.getContractFactory('FunderDepository', roles.deployer);
    const funderDepository = await FunderDepository.connect(roles.funder).deploy(roles.owner.address, root);

    return {
      roles,
      root,
      funderDepository,
    };
  }

  // Assert that the FunderDepository constructor does not validate its arguments
  describe('constructor', function () {
    context('Owner is not zero address', function () {
      context('Root is not zero', function () {
        it('constructs', async function () {
          const { roles, root, funderDepository } = await helpers.loadFixture(deploy);
          expect(await funderDepository.funder()).to.equal(roles.funder.address);
          expect(await funderDepository.owner()).to.equal(roles.owner.address);
          expect(await funderDepository.root()).to.equal(root);
        });
      });
      context('Root is zero', function () {
        it('constructs', async function () {
          const { roles } = await helpers.loadFixture(deploy);
          const FunderDepository = await ethers.getContractFactory('FunderDepository', roles.deployer);
          const funderDepository = await FunderDepository.deploy(roles.owner.address, ethers.constants.HashZero);
          expect(await funderDepository.funder()).to.equal(roles.funder.address);
          expect(await funderDepository.owner()).to.equal(roles.owner.address);
          expect(await funderDepository.root()).to.equal(ethers.constants.HashZero);
        });
      });
    });
    context('Owner is zero address', function () {
      it('constructs', async function () {
        const { roles, root } = await helpers.loadFixture(deploy);
        const FunderDepository = await ethers.getContractFactory('FunderDepository', roles.deployer);
        const funderDepository = await FunderDepository.deploy(ethers.constants.AddressZero, root);
        expect(await funderDepository.funder()).to.equal(roles.funder.address);
        expect(await funderDepository.owner()).to.equal(ethers.constants.AddressZero);
        expect(await funderDepository.root()).to.equal(root);
      });
    });
  });

  describe('receive', function () {
    it('receives', async function () {
      const { roles, funderDepository } = await helpers.loadFixture(deploy);
      const amount = ethers.utils.parseEther('1');
      await roles.randomPerson.sendTransaction({ to: funderDepository.address, value: amount });
      expect(await ethers.provider.getBalance(funderDepository.address)).to.equal(amount);
    });
  });

  describe('withdraw', function () {
    context('Sender is Funder', function () {
      context('Transfer is successful', function () {
        it('withdraws', async function () {
          const { roles, funderDepository } = await helpers.loadFixture(deploy);
          const amount = ethers.utils.parseEther('1');
          await roles.randomPerson.sendTransaction({ to: funderDepository.address, value: amount });
          const balanceBefore = await ethers.provider.getBalance(roles.randomPerson.address);
          await funderDepository.connect(roles.funder).withdraw(roles.randomPerson.address, amount);
          const balanceAfter = await ethers.provider.getBalance(roles.randomPerson.address);
          expect(balanceAfter.sub(balanceBefore)).to.equal(amount);
        });
      });
      context('Transfer is not successful', function () {
        it('reverts', async function () {
          const { roles, funderDepository } = await helpers.loadFixture(deploy);
          const amount = ethers.utils.parseEther('1');
          await expect(
            funderDepository.connect(roles.funder).withdraw(roles.randomPerson.address, amount)
          ).to.be.revertedWith('Transfer unsuccessful');
        });
      });
    });
    context('Sender is not Funder', function () {
      it('reverts', async function () {
        const { roles, funderDepository } = await helpers.loadFixture(deploy);
        const amount = ethers.utils.parseEther('1');
        await expect(
          funderDepository.connect(roles.randomPerson).withdraw(roles.randomPerson.address, amount)
        ).to.be.revertedWith('Sender not Funder');
      });
    });
  });
});
