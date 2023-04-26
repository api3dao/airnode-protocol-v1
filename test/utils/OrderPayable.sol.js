const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('OrderPayable', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      manager: accounts[1],
      orderSigner: accounts[2],
      withdrawer: accounts[3],
      recipient: accounts[4],
      randomPerson: accounts[9],
    };

    const AccessControlRegistry = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await AccessControlRegistry.deploy();

    const adminRoleDescription = 'OrderPayable admin';

    const OrderPayable = await ethers.getContractFactory('OrderPayable', roles.deployer);
    const orderPayable = await OrderPayable.deploy(
      accessControlRegistry.address,
      adminRoleDescription,
      roles.manager.address
    );
    return {
      roles,
      accessControlRegistry,
      adminRoleDescription,
      orderPayable,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { roles, orderPayable, accessControlRegistry, adminRoleDescription } = await helpers.loadFixture(deploy);
      expect(await orderPayable.accessControlRegistry()).to.equal(accessControlRegistry.address);
      expect(await orderPayable.adminRoleDescription()).to.equal(adminRoleDescription);
      expect(await orderPayable.manager()).to.equal(roles.manager.address);

      const derivedRootRole = ethers.utils.keccak256(
        ethers.utils.solidityPack(['address'], [await orderPayable.manager()])
      );
      const adminRoleDescriptionHash = ethers.utils.keccak256(
        ethers.utils.solidityPack(['string'], [await orderPayable.adminRoleDescription()])
      );
      const derivedAdminRole = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'bytes32'], [derivedRootRole, adminRoleDescriptionHash])
      );
      const hashedSignerRoleDescription = ethers.utils.keccak256(
        ethers.utils.solidityPack(['string'], [await orderPayable.ORDER_SIGNER_ROLE_DESCRIPTION()])
      );
      const derivedSignerRole = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'bytes32'], [derivedAdminRole, hashedSignerRoleDescription])
      );
      const hashedWithdrawerRoleDescription = ethers.utils.keccak256(
        ethers.utils.solidityPack(['string'], [await orderPayable.WITHDRAWER_ROLE_DESCRIPTION()])
      );
      const derivedWithdrawerRole = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'bytes32'], [derivedAdminRole, hashedWithdrawerRoleDescription])
      );
      expect(await orderPayable.orderSignerRole()).to.equal(derivedSignerRole);
      expect(await orderPayable.withdrawerRole()).to.equal(derivedWithdrawerRole);
    });
  });

  describe('payForOrder', function () {
    context('Order signer valid', function () {
      context('Order Id not zero', function () {
        context('Order not expired', function () {
          context('Payment amount not zero', function () {
            context('Order didnt paid before', function () {
              context('Signiture match', function () {
                it('Pays for order', async function () {
                  const { roles, orderPayable } = await deploy();

                  const orderId = testUtils.generateRandomBytes32();
                  const timestamp = await helpers.time.latest();
                  const expirationTimestamp = timestamp + 60;
                  const paymentAmount = ethers.utils.parseEther('1');
                  const orderSignerAddress = roles.manager.address;

                  const network = await orderPayable.provider.getNetwork();
                  const chainId = network.chainId;

                  const hashedMessage = ethers.utils.solidityKeccak256(
                    ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
                    [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
                  );

                  const hash = ethers.utils.arrayify(hashedMessage);

                  const signature = await roles.manager.signMessage(ethers.utils.arrayify(hash));

                  const encodedData = ethers.utils.defaultAbiCoder.encode(
                    ['bytes32', 'uint256', 'address', 'bytes'],
                    [orderId, expirationTimestamp, orderSignerAddress, signature]
                  );

                  await expect(orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount }))
                    .to.emit(orderPayable, 'PaidForOrder')
                    .withArgs(orderId, expirationTimestamp, orderSignerAddress, paymentAmount, roles.manager.address);
                  expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(paymentAmount);
                  expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(true);
                });
              });
              context('Signiture mismatch', function () {
                it('Target function reverts', async function () {
                  const { roles, orderPayable } = await deploy();

                  const orderId = testUtils.generateRandomBytes32();
                  const timestamp = await helpers.time.latest();
                  const expirationTimestamp = timestamp + 60;
                  const paymentAmount = ethers.utils.parseEther('1');
                  const orderSignerAddress = roles.manager.address;

                  const network = await orderPayable.provider.getNetwork();
                  const chainId = network.chainId;

                  const hashedMessage = ethers.utils.solidityKeccak256(
                    ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
                    [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
                  );

                  const hash = ethers.utils.arrayify(hashedMessage);

                  const signature = await roles.orderSigner.signMessage(ethers.utils.arrayify(hash));

                  const encodedData = ethers.utils.defaultAbiCoder.encode(
                    ['bytes32', 'uint256', 'address', 'bytes'],
                    [orderId, expirationTimestamp, orderSignerAddress, signature]
                  );

                  await expect(
                    orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
                  ).to.be.revertedWith('Signature mismatch');
                  expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
                  expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
                });
              });
            });
          });
          context('Payment amount zero', function () {
            it('Target function reverts', async function () {
              const { roles, orderPayable } = await deploy();

              const orderId = testUtils.generateRandomBytes32();
              const timestamp = await helpers.time.latest();
              const expirationTimestamp = timestamp + 60;
              const paymentAmount = ethers.utils.parseEther('0');
              const orderSignerAddress = roles.manager.address;

              const network = await orderPayable.provider.getNetwork();
              const chainId = network.chainId;

              const hashedMessage = ethers.utils.solidityKeccak256(
                ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
                [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
              );

              const hash = ethers.utils.arrayify(hashedMessage);

              const signature = await roles.manager.signMessage(ethers.utils.arrayify(hash));

              const encodedData = ethers.utils.defaultAbiCoder.encode(
                ['bytes32', 'uint256', 'address', 'bytes'],
                [orderId, expirationTimestamp, orderSignerAddress, signature]
              );

              await expect(
                orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
              ).to.be.revertedWith('Payment amount zero');
              expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
              expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
            });
          });
        });
        context('Order expired', function () {
          it('Target function reverts', async function () {
            const { roles, orderPayable } = await deploy();

            const orderId = testUtils.generateRandomBytes32();
            const timestamp = await helpers.time.latest();
            const expirationTimestamp = timestamp - 60;
            const paymentAmount = ethers.utils.parseEther('1');
            const orderSignerAddress = roles.manager.address;

            const network = await orderPayable.provider.getNetwork();
            const chainId = network.chainId;

            const hashedMessage = ethers.utils.solidityKeccak256(
              ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
              [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
            );

            const hash = ethers.utils.arrayify(hashedMessage);

            const signature = await roles.manager.signMessage(ethers.utils.arrayify(hash));

            const encodedData = ethers.utils.defaultAbiCoder.encode(
              ['bytes32', 'uint256', 'address', 'bytes'],
              [orderId, expirationTimestamp, orderSignerAddress, signature]
            );

            await expect(
              orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
            ).to.be.revertedWith('Order expired');
            expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
            expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
          });
        });
      });
      context('Order Id zero', function () {
        it('Target function reverts', async function () {
          const { roles, orderPayable } = await deploy();

          const orderId = ethers.constants.HashZero;
          const timestamp = await helpers.time.latest();
          const expirationTimestamp = timestamp + 60;
          const paymentAmount = ethers.utils.parseEther('1');
          const orderSignerAddress = roles.manager.address;

          const network = await orderPayable.provider.getNetwork();
          const chainId = network.chainId;

          const hashedMessage = ethers.utils.solidityKeccak256(
            ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
            [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
          );

          const hash = ethers.utils.arrayify(hashedMessage);

          const signature = await roles.manager.signMessage(ethers.utils.arrayify(hash));

          const encodedData = ethers.utils.defaultAbiCoder.encode(
            ['bytes32', 'uint256', 'address', 'bytes'],
            [orderId, expirationTimestamp, orderSignerAddress, signature]
          );

          await expect(
            orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
          ).to.be.revertedWith('Order ID zero');
          expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
          expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
        });
      });
    });
  });

  describe('withdraw', function () {
    context('Caller is manager or withdrawer', function () {
      it('emits Withdrew event and transfers balance to recipient', async function () {
        const { roles, orderPayable } = await deploy();

        const orderId = ethers.utils.id('testOrder');
        const timestamp = await helpers.time.latest();
        const expirationTimestamp = timestamp + 60;
        const paymentAmount = ethers.utils.parseEther('1');
        const orderSignerAddress = roles.manager.address;

        const network = await orderPayable.provider.getNetwork();
        const chainId = network.chainId;

        const hashedMessage = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
          [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
        );

        const hash = ethers.utils.arrayify(hashedMessage);

        const signature = await roles.manager.signMessage(ethers.utils.arrayify(hash));

        const encodedData = ethers.utils.defaultAbiCoder.encode(
          ['bytes32', 'uint256', 'address', 'bytes'],
          [orderId, expirationTimestamp, orderSignerAddress, signature]
        );

        await orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount });

        const initialRecipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const initialContractBalance = await ethers.provider.getBalance(orderPayable.address);

        await expect(orderPayable.connect(roles.manager).withdraw(roles.recipient.address))
          .to.emit(orderPayable, 'Withdrew')
          .withArgs(roles.recipient.address, initialContractBalance);

        const finalRecipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const finalContractBalance = await ethers.provider.getBalance(orderPayable.address);

        expect(finalRecipientBalance).to.equal(initialRecipientBalance.add(initialContractBalance));
        expect(finalContractBalance).to.equal(0);
      });
    });
    context('Caller is not manager or withdrawer', function () {
      it('Target function reverts', async function () {
        const { roles, orderPayable } = await deploy();

        const orderId = ethers.utils.id('testOrder');
        const timestamp = await helpers.time.latest();
        const expirationTimestamp = timestamp + 60;
        const paymentAmount = ethers.utils.parseEther('1');
        const orderSignerAddress = roles.manager.address;

        const network = await orderPayable.provider.getNetwork();
        const chainId = network.chainId;

        const hashedMessage = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
          [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
        );

        const hash = ethers.utils.arrayify(hashedMessage);

        const signature = await roles.manager.signMessage(ethers.utils.arrayify(hash));

        const encodedData = ethers.utils.defaultAbiCoder.encode(
          ['bytes32', 'uint256', 'address', 'bytes'],
          [orderId, expirationTimestamp, orderSignerAddress, signature]
        );

        await orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount });

        const initialRecipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const initialContractBalance = await ethers.provider.getBalance(orderPayable.address);

        await expect(orderPayable.connect(roles.randomPerson).withdraw(roles.recipient.address)).to.be.revertedWith(
          'Sender cannot withdraw'
        );

        const finalRecipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const finalContractBalance = await ethers.provider.getBalance(orderPayable.address);

        expect(finalRecipientBalance).to.equal(initialRecipientBalance);
        expect(finalContractBalance).to.equal(initialContractBalance);
      });
    });
  });
});
