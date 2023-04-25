const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('ExternalMulticall', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
    };
    const ExternalMulticallFactory = await ethers.getContractFactory('MockExternalMulticall', roles.deployer);
    const externalMulticall = await ExternalMulticallFactory.deploy();
    const MockMulticallTargetFactory = await ethers.getContractFactory('MockMulticallTarget', roles.deployer);
    const multicallTarget = await MockMulticallTargetFactory.deploy();
    return {
      roles,
      externalMulticall,
      multicallTarget,
      MockMulticallTargetFactory,
    };
  }

  describe('externalMulticall', function () {
    context('Parameter lengths match', function () {
      context('None of the calls is to a non-contract account', function () {
        context('None of the calls reverts', function () {
          it('multicall does not revert', async function () {
            const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
            const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const values = [100, 200, 300];
            const totalValue = values.reduce((a, b) => a + b, 0);
            const returndata = await externalMulticall.callStatic.externalMulticall(targets, data, values, {
              value: totalValue,
            });
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
            await expect(
              externalMulticall.externalMulticall(targets, data, values, { value: totalValue })
            ).to.not.be.reverted;
            expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 2, 3]);
            const etherReceiverBalance = await ethers.provider.getBalance(multicallTarget.address);
            expect(etherReceiverBalance).to.equal(totalValue);
          });
        });
        context('Calls multiple separate contracts', function () {
          it('multicall does not revert', async function () {
            const { externalMulticall, multicallTarget, MockMulticallTargetFactory } = await helpers.loadFixture(
              deploy
            );
            const multicallTarget2 = await MockMulticallTargetFactory.deploy();
            const multicallTarget3 = await MockMulticallTargetFactory.deploy();
            const targets = [multicallTarget.address, multicallTarget2.address, multicallTarget3.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget2.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              multicallTarget3.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const values = [100, 200, 300];
            const totalValue = values.reduce((a, b) => a + b, 0);
            const returndata = await externalMulticall.callStatic.externalMulticall(targets, data, values, {
              value: totalValue,
            });
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
            await expect(
              externalMulticall.externalMulticall(targets, data, values, { value: totalValue })
            ).to.not.be.reverted;
            expect(await multicallTarget.argumentHistory()).to.deep.equal([1]);
            expect(await multicallTarget2.argumentHistory()).to.deep.equal([2]);
            expect(await multicallTarget3.argumentHistory()).to.deep.equal([3]);
            const etherReceiverBalance1 = await ethers.provider.getBalance(multicallTarget.address);
            const etherReceiverBalance2 = await ethers.provider.getBalance(multicallTarget2.address);
            const etherReceiverBalance3 = await ethers.provider.getBalance(multicallTarget3.address);
            expect(etherReceiverBalance1).to.equal(100);
            expect(etherReceiverBalance2).to.equal(200);
            expect(etherReceiverBalance3).to.equal(300);
          });
        });
        context('One of the calls reverts', function () {
          context('Call reverts with string', function () {
            it('multicall reverts by bubbling up the revert string', async function () {
              const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              const values = [0, 0, 0];
              const totalValue = values.reduce((a, b) => a + b, 0);
              await expect(
                externalMulticall.externalMulticall(targets, data, values, { value: totalValue })
              ).to.be.revertedWith('Reverted with string');
            });
          });
          context('Call reverts with custom error', function () {
            it('multicall reverts by bubbling up the custom error', async function () {
              const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              const values = [0, 0, 0];
              const totalValue = values.reduce((a, b) => a + b, 0);
              await expect(
                externalMulticall.externalMulticall(targets, data, values, { value: totalValue })
              ).to.be.revertedWithCustomError(multicallTarget, 'MyError');
            });
          });
          context('Call reverts with no data', function () {
            it('multicall reverts with no data', async function () {
              const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              const values = [0, 0, 0];
              const totalValue = values.reduce((a, b) => a + b, 0);
              await expect(
                externalMulticall.externalMulticall(targets, data, values, { value: totalValue })
              ).to.be.revertedWith('Multicall: No revert string');
            });
          });
        });
      });
      context('One of the calls is to a non-contract account', function () {
        it('multicall reverts', async function () {
          const { roles, externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
          const targets = [multicallTarget.address, roles.deployer.address, multicallTarget.address];
          const data = [
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            '0x',
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const values = [0, 0, 0];
          const totalValue = values.reduce((a, b) => a + b, 0);
          await expect(
            externalMulticall.externalMulticall(targets, data, values, { value: totalValue })
          ).to.be.revertedWith('Multicall target not contract');
        });
      });
    });
    context('Parameter lengths do not match', function () {
      it('multicall reverts', async function () {
        const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
        const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
        const data = [
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        const values = [0, 0, 0];
        const totalValue = values.reduce((a, b) => a + b, 0);
        await expect(
          externalMulticall.externalMulticall(targets, data, values, { value: totalValue })
        ).to.be.revertedWith('Parameter length mismatch');
      });
    });
  });

  describe('tryExternalMulticall', function () {
    context('Parameter lengths match', function () {
      context('None of the calls is to a non-contract account', function () {
        context('None of the calls reverts', function () {
          it('multicall does not revert', async function () {
            const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
            const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
            expect(successes).to.deep.equal([true, true, true]);
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
            expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
            await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
          });
        });
        context('One of the calls reverts', function () {
          context('Call reverts with string', function () {
            it('multicall does not revert', async function () {
              const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
              expect(successes).to.deep.equal([true, false, true]);
              expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
              expect(testUtils.decodeRevertString(returndata[1])).to.equal('Reverted with string');
              expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
              await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
              expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 3]);
            });
          });
          context('Call reverts with custom error', function () {
            it('multicall does not revert', async function () {
              const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
              expect(successes).to.deep.equal([true, false, true]);
              expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
              expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
              await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
              expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 3]);
            });
          });
          context('Call reverts with no data', function () {
            it('multicall does not revert', async function () {
              const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
              expect(successes).to.deep.equal([true, false, true]);
              expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
              expect(returndata[1]).to.equal('0x');
              expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
              await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
              expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 3]);
            });
          });
        });
      });
      context('One of the calls is to a non-contract account', function () {
        it('multicall does not revert', async function () {
          const { roles, externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
          const targets = [multicallTarget.address, roles.deployer.address, multicallTarget.address];
          const data = [
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            '0x',
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
          expect(testUtils.decodeRevertString(returndata[1])).to.equal('Multicall target not contract');
          expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
          await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
          expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 3]);
        });
      });
    });
    context('Parameter lengths do not match', function () {
      it('multicall reverts', async function () {
        const { externalMulticall, multicallTarget } = await helpers.loadFixture(deploy);
        const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
        const data = [
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        await expect(externalMulticall.tryExternalMulticall(targets, data)).to.be.revertedWith(
          'Parameter length mismatch'
        );
      });
    });
  });
});
