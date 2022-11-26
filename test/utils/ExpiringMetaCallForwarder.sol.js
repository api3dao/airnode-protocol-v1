const hre = require('hardhat');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('ExpiringMetaCallForwarder', function () {
  let roles;
  let expiringMetaCallForwarder, expiringMetaCallForwarderTarget;

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      randomPerson: accounts[9],
    };
    const expiringMetaCallForwarderFactory = await hre.ethers.getContractFactory(
      'ExpiringMetaCallForwarder',
      roles.deployer
    );
    expiringMetaCallForwarder = await expiringMetaCallForwarderFactory.deploy();
    const expiringMetaCallForwarderTargetFactory = await hre.ethers.getContractFactory(
      'MockExpiringMetaCallForwarderTarget',
      roles.deployer
    );
    expiringMetaCallForwarderTarget = await expiringMetaCallForwarderTargetFactory.deploy(
      expiringMetaCallForwarder.address
    );
  });

  describe('execute', function () {
    context('Meta-call with hash is not executed', function () {
      context('Meta-call has not expired', function () {
        context('Signature is valid', function () {
          it('executes', async function () {
            const from = roles.deployer.address;
            const to = expiringMetaCallForwarderTarget.address;
            const data = expiringMetaCallForwarderTarget.interface.encodeFunctionData('incrementCounter', []);
            const expirationTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 3600;

            const domainName = 'ExpiringMetaCallForwarder';
            const domainVersion = '1.0.0';
            const domainChainId = (await hre.ethers.provider.getNetwork()).chainId;
            const domainAddress = expiringMetaCallForwarder.address;
            /*
            // Domain separator derivation
            const domainTypeHash = hre.ethers.utils.keccak256(
              hre.ethers.utils.toUtf8Bytes(
                'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
              )
            );
            const nameHash = hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(domainName));
            const versionHash = hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(domainVersion));
            const domainSeparator = hre.ethers.utils.keccak256(
              hre.ethers.utils.defaultAbiCoder.encode(
                ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
                [domainTypeHash, nameHash, versionHash, domainChainId, domainAddress]
              )
            );

            // Struct hash derivation
            const structTypeHash = hre.ethers.utils.keccak256(
              hre.ethers.utils.toUtf8Bytes(
                'ExpiringMetaCall(address from,address to,bytes data,uint256 expirationTimestamp)'
              )
            );
            const structHash = hre.ethers.utils.keccak256(
              hre.ethers.utils.defaultAbiCoder.encode(
                ['bytes32', 'address', 'address', 'bytes32', 'uint256'],
                [structTypeHash, from, to, hre.ethers.utils.keccak256(data), expirationTimestamp]
              )
            );

            // Typed data hash derivation
            const typedDataHash = hre.ethers.utils.keccak256(
              hre.ethers.utils.solidityPack(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
            );
            */

            const domain = {
              name: domainName,
              version: domainVersion,
              chainId: domainChainId,
              verifyingContract: domainAddress,
            };
            const types = {
              ExpiringMetaCall: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'data', type: 'bytes' },
                { name: 'expirationTimestamp', type: 'uint256' },
              ],
            };
            const value = {
              from,
              to,
              data,
              expirationTimestamp,
            };
            const signature = await roles.deployer._signTypedData(domain, types, value);
            const counterBefore = await expiringMetaCallForwarderTarget.counter();
            await expect(
              expiringMetaCallForwarder
                .connect(roles.randomPerson)
                .execute({ from, to, data, expirationTimestamp }, signature)
            ).to.not.be.reverted;
            expect(await expiringMetaCallForwarderTarget.counter()).to.be.equal(counterBefore.add(1));
          });
        });
        context('Signature is not valid', function () {
          it('reverts', async function () {
            const from = roles.deployer.address;
            const to = expiringMetaCallForwarderTarget.address;
            const data = expiringMetaCallForwarderTarget.interface.encodeFunctionData('incrementCounter', []);
            const expirationTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 3600;

            const domainName = 'ExpiringMetaCallForwarder';
            const domainVersion = '1.0.0';
            const domainChainId = (await hre.ethers.provider.getNetwork()).chainId;
            const domainAddress = expiringMetaCallForwarder.address;

            const domain = {
              name: domainName,
              version: domainVersion,
              chainId: domainChainId,
              verifyingContract: domainAddress,
            };
            const types = {
              ExpiringMetaCall: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'data', type: 'bytes' },
                { name: 'expirationTimestamp', type: 'uint256' },
              ],
            };
            const value = {
              from,
              to,
              data,
              expirationTimestamp,
            };
            const signature = await roles.randomPerson._signTypedData(domain, types, value);
            await expect(
              expiringMetaCallForwarder
                .connect(roles.randomPerson)
                .execute({ from, to, data, expirationTimestamp }, signature)
            ).to.be.revertedWith('Invalid signature');
          });
        });
      });
      context('Meta-call has expired', function () {
        it('reverts', async function () {
          const from = roles.deployer.address;
          const to = expiringMetaCallForwarderTarget.address;
          const data = expiringMetaCallForwarderTarget.interface.encodeFunctionData('incrementCounter', []);
          const expirationTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) - 3600;

          const domainName = 'ExpiringMetaCallForwarder';
          const domainVersion = '1.0.0';
          const domainChainId = (await hre.ethers.provider.getNetwork()).chainId;
          const domainAddress = expiringMetaCallForwarder.address;

          const domain = {
            name: domainName,
            version: domainVersion,
            chainId: domainChainId,
            verifyingContract: domainAddress,
          };
          const types = {
            ExpiringMetaCall: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'data', type: 'bytes' },
              { name: 'expirationTimestamp', type: 'uint256' },
            ],
          };
          const value = {
            from,
            to,
            data,
            expirationTimestamp,
          };
          const signature = await roles.deployer._signTypedData(domain, types, value);
          await expect(
            expiringMetaCallForwarder
              .connect(roles.randomPerson)
              .execute({ from, to, data, expirationTimestamp }, signature)
          ).to.be.revertedWith('Meta-call expired');
        });
      });
    });
    context('Meta-call with hash is already executed', function () {
      it('reverts', async function () {
        const from = roles.deployer.address;
        const to = expiringMetaCallForwarderTarget.address;
        const data = expiringMetaCallForwarderTarget.interface.encodeFunctionData('incrementCounter', []);
        const expirationTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 3600;

        const domainName = 'ExpiringMetaCallForwarder';
        const domainVersion = '1.0.0';
        const domainChainId = (await hre.ethers.provider.getNetwork()).chainId;
        const domainAddress = expiringMetaCallForwarder.address;

        const domain = {
          name: domainName,
          version: domainVersion,
          chainId: domainChainId,
          verifyingContract: domainAddress,
        };
        const types = {
          ExpiringMetaCall: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'data', type: 'bytes' },
            { name: 'expirationTimestamp', type: 'uint256' },
          ],
        };
        const value = {
          from,
          to,
          data,
          expirationTimestamp,
        };
        const signature = await roles.deployer._signTypedData(domain, types, value);
        await expiringMetaCallForwarder
          .connect(roles.randomPerson)
          .execute({ from, to, data, expirationTimestamp }, signature);
        await expect(
          expiringMetaCallForwarder
            .connect(roles.randomPerson)
            .execute({ from, to, data, expirationTimestamp }, signature)
        ).to.be.revertedWith('Meta-call already executed');
      });
    });
  });

  describe('multicall', function () {
    it('executes multiple calls', async function () {
      const from = roles.deployer.address;
      const to = expiringMetaCallForwarderTarget.address;
      const data = expiringMetaCallForwarderTarget.interface.encodeFunctionData('incrementCounter', []);
      const expirationTimestamp = (await testUtils.getCurrentTimestamp(hre.ethers.provider)) + 3600;

      const domainName = 'ExpiringMetaCallForwarder';
      const domainVersion = '1.0.0';
      const domainChainId = (await hre.ethers.provider.getNetwork()).chainId;
      const domainAddress = expiringMetaCallForwarder.address;

      const domain = {
        name: domainName,
        version: domainVersion,
        chainId: domainChainId,
        verifyingContract: domainAddress,
      };
      const types = {
        ExpiringMetaCall: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'data', type: 'bytes' },
          { name: 'expirationTimestamp', type: 'uint256' },
        ],
      };
      const value1 = {
        from,
        to,
        data,
        expirationTimestamp,
      };
      const value2 = {
        from,
        to,
        data,
        expirationTimestamp: expirationTimestamp + 1,
      };
      const signature1 = await roles.deployer._signTypedData(domain, types, value1);
      const signature2 = await roles.deployer._signTypedData(domain, types, value2);
      const multicallData = [
        expiringMetaCallForwarder.interface.encodeFunctionData('execute', [value1, signature1]),
        expiringMetaCallForwarder.interface.encodeFunctionData('execute', [value2, signature2]),
      ];

      const counterBefore = await expiringMetaCallForwarderTarget.counter();
      await expect(expiringMetaCallForwarder.connect(roles.randomPerson).multicall(multicallData)).to.not.be.reverted;
      expect(await expiringMetaCallForwarderTarget.counter()).to.be.equal(counterBefore.add(2));
    });
  });
});
