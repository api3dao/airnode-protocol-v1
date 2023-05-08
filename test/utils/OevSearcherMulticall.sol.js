const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

describe.only('OevSearcherMulticall', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      randomUser: accounts[1],
    };
    const OevSearcherMulticallFactory = await ethers.getContractFactory('MockOevSearcherMulticall', roles.deployer);
    const oevSearcherMulticall = await OevSearcherMulticallFactory.deploy();
    const MockMulticallTargetFactory = await ethers.getContractFactory('MockMulticallTarget', roles.deployer);
    const multicallTargets = {
      multicallTarget: await MockMulticallTargetFactory.deploy(),
      multicallTarget1: await MockMulticallTargetFactory.deploy(),
      multicallTarget2: await MockMulticallTargetFactory.deploy(),
    };
    return {
      roles,
      oevSearcherMulticall,
      multicallTargets,
    };
  }

  describe('externalMulticallWithValue', function () {
    context('Caller is the owner', function () {
      context('Parameter lengths match', function () {
        context('Value sent with the call is sufficient', function () {
          context('None of the calls is to a non-contract account', function () {
            context('None of the calls reverts', function () {
              context('Call does not have any excess value', function () {
                it('multicall does not revert', async function () {
                  const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
                  const multicallTarget = multicallTargets.multicallTarget;
                  const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
                  const data = [
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                    multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
                  ];
                  const values = [100, 200, 300];
                  const totalValue = values.reduce((a, b) => a + b, 0);
                  const returndata = await oevSearcherMulticall
                    .connect(roles.deployer)
                    .callStatic.externalMulticallWithValue(targets, data, values, {
                      value: totalValue,
                    });
                  expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
                  expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
                  expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
                  await expect(
                    oevSearcherMulticall
                      .connect(roles.deployer)
                      .externalMulticallWithValue(targets, data, values, { value: totalValue })
                  ).to.not.be.reverted;
                  expect(await multicallTarget.argumentHistory()).to.deep.equal([1, 2, 3]);
                  const etherReceiverBalance = await ethers.provider.getBalance(multicallTarget.address);
                  expect(etherReceiverBalance).to.equal(totalValue);
                });
              });
              context('Calls multiple separate contracts', function () {
                it('multicall does not revert', async function () {
                  const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
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
                  const returndata = await oevSearcherMulticall
                    .connect(roles.deployer)
                    .callStatic.externalMulticallWithValue(targets, data, values, {
                      value: totalValue,
                    });
                  expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
                  expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
                  expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
                  await expect(
                    oevSearcherMulticall
                      .connect(roles.deployer)
                      .externalMulticallWithValue(targets, data, values, { value: totalValue })
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
                    const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
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
                      oevSearcherMulticall
                        .connect(roles.deployer)
                        .externalMulticallWithValue(targets, data, values, { value: totalValue })
                    ).to.be.revertedWith('Reverted with string');
                    expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
                  });
                });
                context('Call reverts with custom error', function () {
                  it('multicall reverts by bubbling up the custom error', async function () {
                    const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
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
                      oevSearcherMulticall
                        .connect(roles.deployer)
                        .externalMulticallWithValue(targets, data, values, { value: totalValue })
                    ).to.be.revertedWithCustomError(multicallTarget, 'MyError');
                    expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
                  });
                });
                context('Call reverts with no data', function () {
                  it('multicall reverts with no data', async function () {
                    const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
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
                      oevSearcherMulticall
                        .connect(roles.deployer)
                        .externalMulticallWithValue(targets, data, values, { value: totalValue })
                    ).to.be.revertedWith('Multicall: No revert string');
                    expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
                  });
                });
              });
            });
          });
          context('Value sent with the call is insufficient', function () {
            it('multicall reverts', async function () {
              const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
              const multicallTarget = multicallTargets.multicallTarget;
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              const values = [100, 200, 300];
              await expect(
                oevSearcherMulticall
                  .connect(roles.deployer)
                  .externalMulticallWithValue(targets, data, values, { value: 100 })
              ).to.be.revertedWith('Insufficient value');
              expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
            });
          });
          context('One of the calls is to a non-contract account', function () {
            it('multicall reverts', async function () {
              const { roles, oevSearcherMulticall, multicallTargets } = await helpers.loadFixture(deploy);
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
                oevSearcherMulticall
                  .connect(roles.deployer)
                  .externalMulticallWithValue(targets, data, values, { value: totalValue })
              ).to.be.revertedWith('Multicall target not contract');
              expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
            });
          });
        });
        context('Target and data parameter lengths do not match', function () {
          it('multicall reverts', async function () {
            const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
            const multicallTarget = multicallTargets.multicallTarget;
            const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            const values = [100, 200, 300];
            const totalValue = values.reduce((a, b) => a + b, 0);
            await expect(
              oevSearcherMulticall
                .connect(roles.deployer)
                .externalMulticallWithValue(targets, data, values, { value: totalValue })
            ).to.be.revertedWith('Parameter length mismatch');
            expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
          });
        });
        context('Target and value parameter lengths do not match', function () {
          it('multicall reverts', async function () {
            const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
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
              oevSearcherMulticall
                .connect(roles.deployer)
                .externalMulticallWithValue(targets, data, values, { value: totalValue })
            ).to.be.revertedWith('Parameter length mismatch');
            expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
          });
        });
      });
      context('Call have excess value', function () {
        it('multicall reverts', async function () {
          const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
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
            oevSearcherMulticall
              .connect(roles.deployer)
              .externalMulticallWithValue(targets, data, values, { value: totalValue + 1 })
          ).to.be.revertedWith('Excess value');
          expect(await ethers.provider.getBalance(multicallTarget.address)).to.equal(0);
        });
      });
    });
    context('Caller is not the owner', function () {
      it('multicall reverts', async function () {
        const { oevSearcherMulticall, multicallTargets, roles } = await helpers.loadFixture(deploy);
        const multicallTarget = multicallTargets.multicallTarget;
        const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
        const data = [
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        const values = [100, 200, 300];
        const totalValue = values.reduce((a, b) => a + b, 0);
        const returndata = await oevSearcherMulticall.callStatic.externalMulticallWithValue(targets, data, values, {
          value: totalValue,
        });
        expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
        expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
        expect(ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
        await expect(
          oevSearcherMulticall
            .connect(roles.randomUser)
            .externalMulticallWithValue(targets, data, values, { value: totalValue })
        ).to.be.revertedWith('Ownable: caller is not the owner');
        expect(await multicallTarget.argumentHistory()).to.deep.equal([]);
        const etherReceiverBalance = await ethers.provider.getBalance(multicallTarget.address);
        expect(etherReceiverBalance).to.equal('0');
      });
    });
  });

  describe('withdrawBalance', function () {
    context('Caller is the owner', async function () {
      context('Contract holds balance', async function () {
        it('withdraw does not revert', async function () {
          const { oevSearcherMulticall, roles } = await helpers.loadFixture(deploy);
          await roles.deployer.sendTransaction({
            to: oevSearcherMulticall.address,
            value: ethers.utils.parseEther('5'),
          });
          expect(await ethers.provider.getBalance(oevSearcherMulticall.address)).to.equal(ethers.utils.parseEther('5'));
          await expect(oevSearcherMulticall.connect(roles.deployer).withdrawBalance()).to.not.be.reverted;
          expect(await ethers.provider.getBalance(oevSearcherMulticall.address)).to.equal('0');
        });
      });
      context('Withdraw transaction fails', async function () {
        it('withdraw reverts', async function () {
          const { oevSearcherMulticall, roles } = await helpers.loadFixture(deploy);
          const FallbackReverter = await ethers.getContractFactory('FallbackReverter');
          const fallbackReverter = await FallbackReverter.deploy();
          await oevSearcherMulticall.connect(roles.deployer).transferOwnership(fallbackReverter.address);
          await roles.deployer.sendTransaction({
            to: oevSearcherMulticall.address,
            value: ethers.utils.parseEther('5'),
          });
          expect(await ethers.provider.getBalance(oevSearcherMulticall.address)).to.equal(ethers.utils.parseEther('5'));
          await expect(
            fallbackReverter.connect(roles.deployer).withdrawFrom(oevSearcherMulticall.address)
          ).to.be.revertedWith('Withdraw failed');
          expect(await ethers.provider.getBalance(oevSearcherMulticall.address)).to.equal(ethers.utils.parseEther('5'));
        });
      });
      context('Contract does not hold any balance', async function () {
        it('withdraw reverts', async function () {
          const { oevSearcherMulticall, roles } = await helpers.loadFixture(deploy);
          expect(await ethers.provider.getBalance(oevSearcherMulticall.address)).to.equal('0');
          const initialBalanceofOwner = await ethers.provider.getBalance(roles.deployer.address);
          await expect(oevSearcherMulticall.connect(roles.deployer).withdrawBalance()).to.be.revertedWith(
            'No funds to withdraw'
          );
          const finalBalanceofOwner = await ethers.provider.getBalance(roles.deployer.address);
          await expect(initialBalanceofOwner).is.greaterThanOrEqual(finalBalanceofOwner);
        });
      });
    });
    context('Caller is not the owner', async function () {
      it('withdraw reverts', async function () {
        const { oevSearcherMulticall, roles } = await helpers.loadFixture(deploy);
        await roles.deployer.sendTransaction({
          to: oevSearcherMulticall.address,
          value: ethers.utils.parseEther('5'),
        });
        expect(await ethers.provider.getBalance(oevSearcherMulticall.address)).to.equal(ethers.utils.parseEther('5'));
        expect(oevSearcherMulticall.connect(roles.randomUser).withdrawBalance()).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
        expect(await ethers.provider.getBalance(oevSearcherMulticall.address)).to.equal(ethers.utils.parseEther('5'));
      });
    });
  });
});
