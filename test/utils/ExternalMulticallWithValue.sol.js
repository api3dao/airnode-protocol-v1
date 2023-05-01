const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('ExternalMulticallWithValue', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
    };
    const ExternalMulticallWithValueFactory = await ethers.getContractFactory(
      'MockExternalMulticallWithValue',
      roles.deployer
    );
    const externalMulticallWithValue = await ExternalMulticallWithValueFactory.deploy();
    const MockMulticallTargetFactory = await ethers.getContractFactory('MockMulticallTarget', roles.deployer);
    const multicallTargets = {
      multicallTarget: await MockMulticallTargetFactory.deploy(),
      multicallTarget1: await MockMulticallTargetFactory.deploy(),
      multicallTarget2: await MockMulticallTargetFactory.deploy(),
    };
    return {
      roles,
      externalMulticallWithValue,
      multicallTargets,
    };
  }

  describe('externalMulticallWithValue', function () {
    context('Parameter lengths match', function () {
      context('Value sent with the call is sufficient', function () {
        context('None of the calls is to a non-contract account', function () {
          context('None of the calls reverts', function () {
            context('Call does not have any excess value', function () {
              it('multicall does not revert', async function () {
                const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets.multicallTarget;
                const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
                const data = [
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                const returndata = await externalMulticallWithValue.callStatic.externalMulticallWithValue(
                  targets,
                  data,
                  values,
                  {
                    value: totalValue,
                  }
                );
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
                await expect(
                  externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.not.be.reverted;
                expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 2, 3]);
                const etherReceiverBalance = await ethers.provider.getBalance(multicallTarget.address);
                expect(etherReceiverBalance).to.equal(totalValue);
              });
            });
            context('Calls multiple separate contracts', function () {
              it('multicall does not revert', async function () {
                const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets.multicallTarget;
                const multicallTarget1 = multicallTargets.multicallTarget1;
                const multicallTarget2 = multicallTargets.multicallTarget2;
                const targets = [multicallTarget.address, multicallTarget1.address, multicallTarget2.address];
                const data = [
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  multicallTarget1.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                  multicallTarget2.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                const returndata = await externalMulticallWithValue.callStatic.externalMulticallWithValue(
                  targets,
                  data,
                  values,
                  {
                    value: totalValue,
                  }
                );
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
                await expect(
                  externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.not.be.reverted;
                expect(await multicallTarget.argumentHistory()).to.deep.equal([1]);
                expect(await multicallTarget1.argumentHistory()).to.deep.equal([2]);
                expect(await multicallTarget2.argumentHistory()).to.deep.equal([3]);
                const etherReceiverBalance1 = await ethers.provider.getBalance(multicallTarget.address);
                const etherReceiverBalance2 = await ethers.provider.getBalance(multicallTarget1.address);
                const etherReceiverBalance3 = await ethers.provider.getBalance(multicallTarget2.address);
                expect(etherReceiverBalance1).to.equal(100);
                expect(etherReceiverBalance2).to.equal(200);
                expect(etherReceiverBalance3).to.equal(300);
              });
            });
            context('One of the calls reverts', function () {
              context('Call reverts with string', function () {
                it('multicall reverts by bubbling up the revert string', async function () {
                  const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
                  const multicallTarget = multicallTargets.multicallTarget;
                  const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
                  const data = [
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                    multicallTarget.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                  ];
                  const values = [100, 0, 300];
                  const totalValue = values.reduce((a, b) => a + b, 0);
                  await expect(
                    externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
                  ).to.be.revertedWith('Reverted with string');
                  expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
                });
              });
              context('Call reverts with custom error', function () {
                it('multicall reverts by bubbling up the custom error', async function () {
                  const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
                  const multicallTarget = multicallTargets.multicallTarget;
                  const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
                  const data = [
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                    multicallTarget.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                  ];
                  const values = [100, 0, 300];
                  const totalValue = values.reduce((a, b) => a + b, 0);
                  await expect(
                    externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
                  ).to.be.revertedWithCustomError(multicallTarget, 'MyError');
                  expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
                });
              });
              context('Call reverts with no data', function () {
                it('multicall reverts with no data', async function () {
                  const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
                  const multicallTarget = multicallTargets.multicallTarget;
                  const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
                  const data = [
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                    multicallTarget.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                  ];
                  const values = [100, 200, 300];
                  const totalValue = values.reduce((a, b) => a + b, 0);
                  await expect(
                    externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
                  ).to.be.revertedWith('Multicall: No revert string');
                  expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
                });
              });
            });
          });
        });
        context('Value sent with the call is insufficient', function () {
          it('multicall reverts', async function () {
            const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
            const multicallTarget = multicallTargets.multicallTarget;
            const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const values = [100, 200, 300];
            await expect(
              externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: 100 })
            ).to.be.revertedWith('Insufficient value');
            expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
          });
        });
        context('One of the calls is to a non-contract account', function () {
          it('multicall reverts', async function () {
            const { roles, externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
            const multicallTarget = multicallTargets.multicallTarget;
            const targets = [multicallTarget.address, roles.deployer.address, multicallTarget.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              '0x',
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const values = [100, 200, 300];
            const totalValue = values.reduce((a, b) => a + b, 0);
            await expect(
              externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
            ).to.be.revertedWith('Multicall target not contract');
            expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
          });
        });
      });
      context('Target and data parameter lengths do not match', function () {
        it('multicall reverts', async function () {
          const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
          const multicallTarget = multicallTargets.multicallTarget;
          const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
          const data = [
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const values = [100, 200, 300];
          const totalValue = values.reduce((a, b) => a + b, 0);
          await expect(
            externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
          ).to.be.revertedWith('Parameter length mismatch');
          expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
        });
      });
      context('Target and value parameter lengths do not match', function () {
        it('multicall reverts', async function () {
          const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
          const multicallTarget = multicallTargets.multicallTarget;
          const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
          const data = [
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const values = [100, 200];
          const totalValue = values.reduce((a, b) => a + b, 0);
          await expect(
            externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue })
          ).to.be.revertedWith('Parameter length mismatch');
          expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
        });
      });
    });
    context('Call have excess value', function () {
      it('multicall reverts', async function () {
        const { externalMulticallWithValue, multicallTargets } = await helpers.loadFixture(deploy);
        const multicallTarget = multicallTargets.multicallTarget;
        const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
        const data = [
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        const values = [100, 200, 300];
        const totalValue = values.reduce((a, b) => a + b, 0);
        await expect(
          externalMulticallWithValue.externalMulticallWithValue(targets, data, values, { value: totalValue + 1 })
        ).to.be.revertedWith('Excess value');
        expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
      });
    });
  });
});
