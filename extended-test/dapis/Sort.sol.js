const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('Sort', function () {
  // Adapted from https://stackoverflow.com/a/37580979/14558682
  async function testSortWithAllPermutations(sort, arrayLength) {
    const array = Array.from(Array(arrayLength), (_, i) => i - Math.floor(arrayLength / 2));
    let length = array.length,
      c = new Array(length).fill(0),
      i = 1,
      k,
      p;

    while (i < length) {
      if (c[i] < i) {
        k = i % 2 && c[i];
        p = array[i];
        array[i] = array[k];
        array[k] = p;
        ++c[i];
        i = 1;
        const permutation = array.slice();
        const sortedArray = (await sort.exposedSort(permutation)).map((x) => x.toNumber());
        expect(sortedArray).to.deep.equal(
          permutation.sort(function (a, b) {
            return a - b;
          })
        );
      } else {
        c[i] = 0;
        ++i;
      }
    }
  }

  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
    };
    const mockSortFactory = await ethers.getContractFactory('MockSort', roles.deployer);
    const sort = await mockSortFactory.deploy();
    return {
      sort,
    };
  }

  describe('sort', function () {
    context('Array length is 1-9', function () {
      it('sorts all permutations of the array', async function () {
        const { sort } = await helpers.loadFixture(deploy);
        for (let arrayLength = 1; arrayLength <= 9; arrayLength++) {
          console.log(`Testing with array length ${arrayLength}`);
          await testSortWithAllPermutations(sort, arrayLength);
        }
      });
    });
    context('Array length is larger than 9', function () {
      it('reverts', async function () {
        const { sort } = await helpers.loadFixture(deploy);
        await expect(sort.exposedSort(Array(10).fill(0))).to.be.reverted;
        await expect(sort.exposedSort(Array(11).fill(0))).to.be.reverted;
        await expect(sort.exposedSort(Array(12).fill(0))).to.be.reverted;
      });
    });
  });
});
