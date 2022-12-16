const hre = require('hardhat');
const { expect } = require('chai');
const utils = require('../test-utils');

describe('ExternalMulticall', function () {
  let roles;
  let externalMulticall, multicallTarget;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
    };
    const ExternalMulticallFactory = await hre.ethers.getContractFactory('ExternalMulticall', roles.deployer);
    externalMulticall = await ExternalMulticallFactory.deploy();
    const MockMulticallTargetFactory = await hre.ethers.getContractFactory('MockMulticallTarget', roles.deployer);
    multicallTarget = await MockMulticallTargetFactory.deploy();
  });

  describe('externalMulticall', function () {
    context('Parameter lengths match', function () {
      context('None of the calls is to a non-contract account', function () {
        context('None of the calls reverts', function () {
          it('does not revert', async function () {
            const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            await expect(externalMulticall.externalMulticall(targets, data)).to.not.be.reverted;
            const returndata = await externalMulticall.callStatic.externalMulticall(targets, data);
            expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
            expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
            expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
          });
        });
        context('One of the calls reverts', function () {
          context('Call reverts with string', function () {
            it('reverts by bubbling up the revert string', async function () {
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              await expect(externalMulticall.externalMulticall(targets, data)).to.be.revertedWith(
                'Reverted with string'
              );
            });
          });
          context('Call reverts with custom error', function () {
            it('reverts by bubbling up the custom error', async function () {
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              await expect(externalMulticall.externalMulticall(targets, data)).to.be.revertedWith(
                'MyError(123, "Foo")'
              );
            });
          });
          context('Call reverts with no data', function () {
            it('reverts with no data', async function () {
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              await expect(externalMulticall.externalMulticall(targets, data)).to.be.revertedWith(
                'Multicall: No revert string'
              );
            });
          });
        });
      });
      context('One of the calls is to a non-contract account', function () {
        it('reverts', async function () {
          const targets = [multicallTarget.address, roles.deployer.address, multicallTarget.address];
          const data = [
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            '0x',
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(externalMulticall.externalMulticall(targets, data)).to.be.revertedWith(
            'Multicall target not contract'
          );
        });
      });
    });
    context('Parameter lengths do not match', function () {
      it('reverts', async function () {
        const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
        const data = [
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
          multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
        ];
        await expect(externalMulticall.externalMulticall(targets, data)).to.be.revertedWith(
          'Parameter length mismatch'
        );
      });
    });
  });

  describe('tryExternalMulticall', function () {
    context('Parameter lengths match', function () {
      context('None of the calls is to a non-contract account', function () {
        context('None of the calls reverts', function () {
          it('does not revert', async function () {
            const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
            const data = [
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [2]),
              multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
            ];
            await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
            const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
            expect(successes).to.deep.equal([true, true, true]);
            expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
            expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[1])[0]).to.equal(-2);
            expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
          });
        });
        context('One of the calls reverts', function () {
          context('Call reverts with string', function () {
            it('reverts by bubbling up the revert string', async function () {
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithString', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
              const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
              expect(successes).to.deep.equal([true, false, true]);
              expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
              expect(utils.decodeRevertString(returndata[1])).to.equal('Reverted with string');
              expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
            });
          });
          context('Call reverts with custom error', function () {
            it('reverts by bubbling up the custom error', async function () {
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithCustomError', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
              const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
              expect(successes).to.deep.equal([true, false, true]);
              expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
              expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
            });
          });
          context('Call reverts with no data', function () {
            it('reverts with no data', async function () {
              const targets = [multicallTarget.address, multicallTarget.address, multicallTarget.address];
              const data = [
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
                multicallTarget.interface.encodeFunctionData('alwaysRevertsWithNoData', [1, -1]),
                multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
              ];
              await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
              const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
              expect(successes).to.deep.equal([true, false, true]);
              expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
              expect(returndata[1]).to.equal('0x');
              expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
            });
          });
        });
      });
      context('One of the calls is to a non-contract account', function () {
        it('does not revert', async function () {
          const targets = [multicallTarget.address, roles.deployer.address, multicallTarget.address];
          const data = [
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [1]),
            '0x',
            multicallTarget.interface.encodeFunctionData('convertsPositiveArgumentToNegative', [3]),
          ];
          await expect(externalMulticall.tryExternalMulticall(targets, data)).to.not.be.reverted;
          const { successes, returndata } = await externalMulticall.callStatic.tryExternalMulticall(targets, data);
          expect(successes).to.deep.equal([true, false, true]);
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[0])[0]).to.equal(-1);
          expect(returndata[1]).to.equal('0x');
          expect(hre.ethers.utils.defaultAbiCoder.decode(['int256'], returndata[2])[0]).to.equal(-3);
        });
      });
    });
    context('Parameter lengths do not match', function () {
      it('reverts', async function () {
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
