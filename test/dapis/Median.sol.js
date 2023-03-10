const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('Median', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
    };
    const mockMedianFactory = await ethers.getContractFactory('MockMedian', roles.deployer);
    const median = await mockMedianFactory.deploy();
    return {
      median,
    };
  }

  describe('median', function () {
    context('Array length is 1-21', function () {
      it('computes median of randomly shuffled arrays', async function () {
        const { median } = await helpers.loadFixture(deploy);
        for (let arrayLength = 1; arrayLength <= 21; arrayLength++) {
          for (let iterationCount = 0; iterationCount <= 10; iterationCount++) {
            const array = Array.from(Array(arrayLength), (_, i) => i - Math.floor(arrayLength / 2));
            const shuffledArray = array
              .map((value) => ({ value, sort: Math.random() }))
              .sort((a, b) => a.sort - b.sort)
              .map(({ value }) => value);
            const computedMedian = (await median.exposedMedian(shuffledArray)).toNumber();
            let actualMedian;
            if (arrayLength % 2 === 1) {
              actualMedian = array[Math.floor(arrayLength / 2)];
            } else {
              const median1 = array[arrayLength / 2 - 1];
              const median2 = array[arrayLength / 2];
              actualMedian = Math.floor(Math.abs(median1 + median2) / 2) * Math.sign(median1 + median2);
            }
            expect(computedMedian).to.equal(actualMedian);
          }
        }
      });
    });
  });

  describe('average', function () {
    context('x and y are largest positive numbers', function () {
      it('computes average without overflowing', async function () {
        const { median } = await helpers.loadFixture(deploy);
        const x = ethers.BigNumber.from(2).pow(255).sub(1);
        const y = x;
        const computedAverage = await median.exposedAverage(x, y);
        const actualAverage = x;
        expect(computedAverage).to.equal(actualAverage);
      });
    });
    context('x and y are smallest negative numbers', function () {
      it('computes average without undeflowing', async function () {
        const { median } = await helpers.loadFixture(deploy);
        const x = ethers.BigNumber.from(-2).pow(255);
        const y = x;
        const computedAverage = await median.exposedAverage(x, y);
        const actualAverage = x;
        expect(computedAverage).to.equal(actualAverage);
      });
    });
    context('With various combinations of x and y', function () {
      it('computes average', async function () {
        const { median } = await helpers.loadFixture(deploy);
        for (let x = -2; x <= 2; x++) {
          for (let y = -2; y <= 2; y++) {
            const computedAverage = await median.exposedAverage(x, y);
            const actualAverage = parseInt((x + y) / 2);
            expect(computedAverage).to.equal(actualAverage);
          }
        }
      });
    });
  });
});
