const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe('OevSearcherMulticallV1', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      owner: accounts[1],
      targetAccount: accounts[2],
      randomPerson: accounts[9],
    };
    const OevSearcherMulticallV1Factory = await ethers.getContractFactory('OevSearcherMulticallV1', roles.deployer);
    const oevSearcherMulticallV1 = await OevSearcherMulticallV1Factory.deploy();
    await oevSearcherMulticallV1.connect(roles.deployer).transferOwnership(roles.owner.address);
    const MockMulticallTargetFactory = await ethers.getContractFactory('MockMulticallTarget', roles.deployer);
    const multicallTargets = [
      await MockMulticallTargetFactory.deploy(),
      await MockMulticallTargetFactory.deploy(),
      roles.targetAccount,
    ];
    return {
      roles,
      oevSearcherMulticallV1,
      multicallTargets,
    };
  }

  describe('externalMulticallWithValue', function () {
    context('Sender is the owner', function () {
      context('Parameter lengths match', function () {
        context('Balance is sufficient', function () {
          context('None of the calls reverts', function () {
            context('There is a single target account', function () {
              it('multicalls target account with value', async function () {
                const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0];
                const targets = Array(3).fill(multicallTarget.address);
                const data = [
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                const returndata = await oevSearcherMulticallV1
                  .connect(roles.owner)
                  .callStatic.externalMulticallWithValue(targets, data, values, {
                    value: totalValue,
                  });
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.not.be.reverted;
                expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 2, 3]);
                expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(totalValue);
              });
            });
            context('There are multiple target accounts', function () {
              it('multicalls target accounts with value', async function () {
                const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
                const targets = multicallTargets.map((multicallTarget) => multicallTarget.address);
                const data = [
                  multicallTargets[0].interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  multicallTargets[1].interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                  '0x12345678',
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                const returndata = await oevSearcherMulticallV1
                  .connect(roles.owner)
                  .callStatic.externalMulticallWithValue(targets, data, values, {
                    value: totalValue,
                  });
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
                expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
                expect(returndata[2]).to.equal('0x');
                const multicallTarget2Balance = await ethers.provider.getBalance(multicallTargets[2].address);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.not.be.reverted;
                expect(await multicallTargets[0].argumentHistory()).to.deep.equal([1]);
                expect(await multicallTargets[1].argumentHistory()).to.deep.equal([2]);
                expect(await ethers.provider.getBalance(multicallTargets[0].address)).to.equal(100);
                expect(await ethers.provider.getBalance(multicallTargets[1].address)).to.equal(200);
                expect(
                  (await ethers.provider.getBalance(multicallTargets[2].address)).sub(multicallTarget2Balance)
                ).to.equal(300);
              });
            });
          });
          context('One of the calls reverts', function () {
            context('Call reverts with string', function () {
              it('multicall reverts by bubbling up the revert string', async function () {
                const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0];
                const targets = Array(3).fill(multicallTarget.address);
                const data = [
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  multicallTarget.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 0, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.be.revertedWith('Reverted with string');
              });
            });
            context('Call reverts with custom error', function () {
              it('multicall reverts by bubbling up the custom error', async function () {
                const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0];
                const targets = Array(3).fill(multicallTarget.address);
                const data = [
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  multicallTarget.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 0, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.be.revertedWithCustomError(multicallTarget, 'MyError');
              });
            });
            context('Call reverts with no data', function () {
              it('multicall reverts with no data', async function () {
                const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
                const multicallTarget = multicallTargets[0];
                const targets = Array(3).fill(multicallTarget.address);
                const data = [
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                  multicallTarget.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
                  multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                ];
                const values = [100, 200, 300];
                const totalValue = values.reduce((a, b) => a + b, 0);
                await expect(
                  oevSearcherMulticallV1
                    .connect(roles.owner)
                    .externalMulticallWithValue(targets, data, values, { value: totalValue })
                ).to.be.revertedWith('Multicall: No revert string');
              });
            });
          });
        });
        context('Balance is not sufficient', function () {
          it('multicall reverts', async function () {
            const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
            const multicallTarget = multicallTargets[0];
            const targets = Array(3).fill(multicallTarget.address);
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const values = [100, 200, 300];
            await expect(
              oevSearcherMulticallV1
                .connect(roles.owner)
                .externalMulticallWithValue(targets, data, values, { value: values[0] })
            ).to.be.revertedWith('Multicall: Insufficient balance');
          });
        });
      });
      context('Parameter lengths do not match', function () {
        it('multicall reverts', async function () {
          const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
          const multicallTarget = multicallTargets[0];
          const targets = Array(3).fill(multicallTarget.address);
          const data = [
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          const values = [100, 200, 300];
          const totalValue = values.reduce((a, b) => a + b, 0);
          await expect(
            oevSearcherMulticallV1
              .connect(roles.owner)
              .externalMulticallWithValue(targets, data, values, { value: totalValue })
          ).to.be.revertedWith('Parameter length mismatch');
        });
      });
    });
    context('Sender is not the owner', function () {
      it('reverts', async function () {
        const { oevSearcherMulticallV1, multicallTargets, roles } = await helpers.loadFixture(deploy);
        const multicallTarget = multicallTargets[0];
        const targets = Array(3).fill(multicallTarget.address);
        const data = [
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        const values = [100, 200, 300];
        const totalValue = values.reduce((a, b) => a + b, 0);
        await expect(
          oevSearcherMulticallV1
            .connect(roles.randomPerson)
            .externalMulticallWithValue(targets, data, values, { value: totalValue })
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });
});
