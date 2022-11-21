const hre = require('hardhat');
const { expect } = require('chai');

describe('SelfMulticall', function () {
  let roles;
  let selfMulticall;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
    };
    const MockSelfMulticallTargetFactory = await hre.ethers.getContractFactory(
      'MockSelfMulticallTarget',
      roles.deployer
    );
    selfMulticall = await MockSelfMulticallTargetFactory.deploy();
  });

  describe('multicall', function () {
    context('None of the calls reverts', function () {
      it('does not revert', async function () {
        const data = [
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        await expect(selfMulticall.multicall(data)).to.not.be.reverted;
        const returndata = await selfMulticall.callStatic.multicall(data);
        expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
        expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
        expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
      });
    });
    context('One of the calls reverts', function () {
      context('Call reverts with string', function () {
        it('reverts by bubbling up the revert string', async function () {
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.multicall(data)).to.be.revertedWith('Reverted with string');
        });
      });
      context('Call reverts with custom error', function () {
        it('reverts by bubbling up the custom error', async function () {
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.multicall(data)).to.be.revertedWith('MyError(123, "Foo")');
        });
      });
      context('Call reverts with no data', function () {
        it('reverts with no data', async function () {
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.multicall(data)).to.be.revertedWith('Multicall: No revert string');
        });
      });
    });
  });

  describe('tryMulticall', function () {
    context('None of the calls reverts', function () {
      it('does not revert', async function () {
        const data = [
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
        const { successes, returndata } = await selfMulticall.callStatic.tryMulticall(data);
        expect(successes).to.deep.equal([true, true, true]);
        expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
        expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
        expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
      });
    });
    context('One of the calls reverts', function () {
      context('Call reverts with string', function () {
        it('reverts by bubbling up the revert string', async function () {
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
          const { successes, returndata } = await selfMulticall.callStatic.tryMulticall(data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
        });
      });
      context('Call reverts with custom error', function () {
        it('reverts by bubbling up the custom error', async function () {
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
          const { successes, returndata } = await selfMulticall.callStatic.tryMulticall(data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
        });
      });
      context('Call reverts with no data', function () {
        it('reverts with no data', async function () {
          const data = [
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            selfMulticall.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
            selfMulticall.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(selfMulticall.tryMulticall(data)).to.not.be.reverted;
          const { successes, returndata } = await selfMulticall.callStatic.tryMulticall(data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
        });
      });
    });
  });
});
