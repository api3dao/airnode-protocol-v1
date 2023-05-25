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

    const adminRoleDescription = 'OrderPayable admin';
    const orderSignerDescription = 'Order signer';
    const withdrawerDescription = 'Withdrawer';

    const AccessControlRegistry = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await AccessControlRegistry.deploy();

    const OrderPayable = await ethers.getContractFactory('OrderPayable', roles.deployer);
    const orderPayable = await OrderPayable.deploy(
      accessControlRegistry.address,
      adminRoleDescription,
      roles.manager.address
    );

    const rootRole = testUtils.deriveRootRole(roles.manager.address);
    const adminRole = testUtils.deriveRole(rootRole, adminRoleDescription);
    const orderSignerRole = testUtils.deriveRole(adminRole, orderSignerDescription);
    const withdrawerRole = testUtils.deriveRole(adminRole, withdrawerDescription);

    await accessControlRegistry.connect(roles.manager).initializeRoleAndGrantToSender(rootRole, adminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, orderSignerDescription);
    await accessControlRegistry.connect(roles.manager).initializeRoleAndGrantToSender(adminRole, withdrawerDescription);

    await accessControlRegistry.connect(roles.manager).grantRole(orderSignerRole, roles.orderSigner.address);
    await accessControlRegistry.connect(roles.manager).grantRole(withdrawerRole, roles.withdrawer.address);

    await accessControlRegistry.connect(roles.manager).renounceRole(adminRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(orderSignerRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(withdrawerRole, roles.manager.address);

    return {
      roles,
      adminRole,
      orderSignerRole,
      withdrawerRole,
      accessControlRegistry,
      adminRoleDescription,
      orderPayable,
    };
  }

  async function signAndEncodeOrder({ orderPayable, orderId, expirationTimestamp, paymentAmount, orderSigner }) {
    const chainId = (await orderPayable.provider.getNetwork()).chainId;
    const hashedMessage = ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
      [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
    );
    const hash = ethers.utils.arrayify(hashedMessage);
    const signature = await orderSigner.signMessage(ethers.utils.arrayify(hash));
    return ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'address', 'bytes'],
      [orderId, expirationTimestamp, orderSigner.address, signature]
    );
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const { roles, orderSignerRole, withdrawerRole, orderPayable, accessControlRegistry, adminRoleDescription } =
        await helpers.loadFixture(deploy);
      expect(await orderPayable.accessControlRegistry()).to.equal(accessControlRegistry.address);
      expect(await orderPayable.adminRoleDescription()).to.equal(adminRoleDescription);
      expect(await orderPayable.manager()).to.equal(roles.manager.address);
      expect(await orderPayable.orderSignerRole()).to.equal(orderSignerRole);
      expect(await orderPayable.withdrawerRole()).to.equal(withdrawerRole);
      expect(await orderPayable.orderIdToPaymentStatus(testUtils.generateRandomBytes32())).to.equal(false);
      expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.constants.Zero);
    });
  });

  describe('payForOrder', function () {
    context('Order id is not zero', function () {
      context('Order did not expired', function () {
        context('Order signer is manager', function () {
          context('Payment amount is not zero', function () {
            context('Order did not paid before', function () {
              context('Signatures match', function () {
                it('pays for order', async function () {
                  const { roles, orderPayable } = await deploy();

                  const orderId = testUtils.generateRandomBytes32();
                  const timestamp = await helpers.time.latest();
                  const expirationTimestamp = timestamp + 60;
                  const paymentAmount = ethers.utils.parseEther('1');
                  const orderSigner = roles.manager;

                  const encodedData = await signAndEncodeOrder({
                    orderPayable,
                    orderId,
                    expirationTimestamp,
                    paymentAmount,
                    orderSigner,
                  });

                  await expect(orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount }))
                    .to.emit(orderPayable, 'PaidForOrder')
                    .withArgs(orderId, expirationTimestamp, orderSigner.address, paymentAmount, roles.manager.address);
                  expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(paymentAmount);
                  expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(true);
                });
                it('pays for order', async function () {
                  const { roles, orderPayable } = await deploy();

                  const orderId = testUtils.generateRandomBytes32();
                  const timestamp = await helpers.time.latest();
                  const expirationTimestamp = timestamp + 60;
                  const paymentAmount = ethers.utils.parseEther('1');
                  const orderSigner = roles.manager;

                  const encodedData = await signAndEncodeOrder({
                    orderPayable,
                    orderId,
                    expirationTimestamp,
                    paymentAmount,
                    orderSigner,
                  });

                  await expect(
                    orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount })
                  )
                    .to.emit(orderPayable, 'PaidForOrder')
                    .withArgs(
                      orderId,
                      expirationTimestamp,
                      orderSigner.address,
                      paymentAmount,
                      roles.orderSigner.address
                    );
                  expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(paymentAmount);
                  expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(true);
                });
              });
              context('Signatures mismatch', function () {
                it('target function reverts', async function () {
                  const { roles, orderPayable } = await deploy();

                  const orderId = testUtils.generateRandomBytes32();
                  const timestamp = await helpers.time.latest();
                  const expirationTimestamp = timestamp + 60;
                  const paymentAmount = ethers.utils.parseEther('1');
                  const orderSignerAddress = roles.manager.address;

                  const chainId = (await orderPayable.provider.getNetwork()).chainId;

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
            context('Order paid before', function () {
              it('target function reverts', async function () {
                const { roles, orderPayable } = await deploy();

                const orderId = testUtils.generateRandomBytes32();
                const timestamp = await helpers.time.latest();
                const expirationTimestamp = timestamp + 60;
                const paymentAmount = ethers.utils.parseEther('1');
                const orderSigner = roles.manager;

                const encodedData = await signAndEncodeOrder({
                  orderPayable,
                  orderId,
                  expirationTimestamp,
                  paymentAmount,
                  orderSigner,
                });

                await expect(orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount }))
                  .to.emit(orderPayable, 'PaidForOrder')
                  .withArgs(orderId, expirationTimestamp, orderSigner.address, paymentAmount, roles.manager.address);
                expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('1'));
                expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(true);

                await expect(
                  orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
                ).to.be.revertedWith('Order already paid for');
                expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('1'));
              });
            });
          });
          context('Payment amount is zero', function () {
            it('target function reverts', async function () {
              const { roles, orderPayable } = await deploy();

              const orderId = testUtils.generateRandomBytes32();
              const timestamp = await helpers.time.latest();
              const expirationTimestamp = timestamp + 60;
              const paymentAmount = ethers.utils.parseEther('0');
              const orderSigner = roles.manager;

              const encodedData = await signAndEncodeOrder({
                orderPayable,
                orderId,
                expirationTimestamp,
                paymentAmount,
                orderSigner,
              });

              await expect(
                orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
              ).to.be.revertedWith('Payment amount zero');
              expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
              expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
            });
          });
        });
        context('Order signer is an order signer', function () {
          context('Payment amount is not zero', function () {
            context('Order did not paid before', function () {
              context('Signatures match', function () {
                it('pays for order', async function () {
                  const { roles, orderPayable } = await deploy();

                  const orderId = testUtils.generateRandomBytes32();
                  const timestamp = await helpers.time.latest();
                  const expirationTimestamp = timestamp + 60;
                  const paymentAmount = ethers.utils.parseEther('1');
                  const orderSigner = roles.orderSigner;

                  const encodedData = await signAndEncodeOrder({
                    orderPayable,
                    orderId,
                    expirationTimestamp,
                    paymentAmount,
                    orderSigner,
                  });

                  await expect(
                    orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount })
                  )
                    .to.emit(orderPayable, 'PaidForOrder')
                    .withArgs(
                      orderId,
                      expirationTimestamp,
                      orderSigner.address,
                      paymentAmount,
                      roles.orderSigner.address
                    );
                  expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(paymentAmount);
                  expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(true);
                });
              });
              context('Signatures mismatch', function () {
                it('target function reverts', async function () {
                  const { roles, orderPayable } = await deploy();

                  const orderId = testUtils.generateRandomBytes32();
                  const timestamp = await helpers.time.latest();
                  const expirationTimestamp = timestamp + 60;
                  const paymentAmount = ethers.utils.parseEther('1');
                  const orderSignerAddress = roles.orderSigner.address;

                  const chainId = (await orderPayable.provider.getNetwork()).chainId;

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
                    orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount })
                  ).to.be.revertedWith('Signature mismatch');
                  expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
                  expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
                });
              });
            });
            context('Order paid before', function () {
              it('target function reverts', async function () {
                const { roles, orderPayable } = await deploy();

                const orderId = testUtils.generateRandomBytes32();
                const timestamp = await helpers.time.latest();
                const expirationTimestamp = timestamp + 60;
                const paymentAmount = ethers.utils.parseEther('1');
                const orderSigner = roles.orderSigner;

                const encodedData = await signAndEncodeOrder({
                  orderPayable,
                  orderId,
                  expirationTimestamp,
                  paymentAmount,
                  orderSigner,
                });

                await expect(orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount }))
                  .to.emit(orderPayable, 'PaidForOrder')
                  .withArgs(
                    orderId,
                    expirationTimestamp,
                    orderSigner.address,
                    paymentAmount,
                    roles.orderSigner.address
                  );
                expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('1'));
                expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(true);

                await expect(
                  orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount })
                ).to.be.revertedWith('Order already paid for');
                expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('1'));
              });
            });
          });
          context('Payment amount is zero', function () {
            it('target function reverts', async function () {
              const { roles, orderPayable } = await deploy();

              const orderId = testUtils.generateRandomBytes32();
              const timestamp = await helpers.time.latest();
              const expirationTimestamp = timestamp + 60;
              const paymentAmount = ethers.utils.parseEther('0');
              const orderSigner = roles.orderSigner;

              const encodedData = await signAndEncodeOrder({
                orderPayable,
                orderId,
                expirationTimestamp,
                paymentAmount,
                orderSigner,
              });

              await expect(
                orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount })
              ).to.be.revertedWith('Payment amount zero');
              expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
              expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
            });
          });
          context('Order expired', function () {
            it('target function reverts', async function () {
              const { roles, orderPayable } = await deploy();

              const orderId = testUtils.generateRandomBytes32();
              const timestamp = await helpers.time.latest();
              const expirationTimestamp = timestamp - 60;
              const paymentAmount = ethers.utils.parseEther('1');
              const orderSigner = roles.orderSigner;

              const encodedData = await signAndEncodeOrder({
                orderPayable,
                orderId,
                expirationTimestamp,
                paymentAmount,
                orderSigner,
              });

              await expect(
                orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount })
              ).to.be.revertedWith('Order expired');
              expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
              expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
            });
          });
          context('Order id is zero', function () {
            it('target function reverts', async function () {
              const { roles, orderPayable } = await deploy();

              const orderId = ethers.constants.HashZero;
              const timestamp = await helpers.time.latest();
              const expirationTimestamp = timestamp + 60;
              const paymentAmount = ethers.utils.parseEther('1');
              const orderSigner = roles.orderSigner;

              const encodedData = await signAndEncodeOrder({
                orderPayable,
                orderId,
                expirationTimestamp,
                paymentAmount,
                orderSigner,
              });

              await expect(
                orderPayable.connect(roles.orderSigner).payForOrder(encodedData, { value: paymentAmount })
              ).to.be.revertedWith('Order ID zero');
              expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
              expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
            });
          });
        });
        context('Order signer is invalid', function () {
          it('target function reverts', async function () {
            const { roles, orderPayable } = await deploy();

            const orderId = testUtils.generateRandomBytes32();
            const timestamp = await helpers.time.latest();
            const expirationTimestamp = timestamp + 60;
            const paymentAmount = ethers.utils.parseEther('1');
            const orderSignerAddress = roles.randomPerson.address;

            const chainId = (await orderPayable.provider.getNetwork()).chainId;

            const hashedMessage = ethers.utils.solidityKeccak256(
              ['uint256', 'address', 'bytes32', 'uint256', 'uint256'],
              [chainId, orderPayable.address, orderId, expirationTimestamp, paymentAmount]
            );

            const hash = ethers.utils.arrayify(hashedMessage);

            const signature = await roles.randomPerson.signMessage(ethers.utils.arrayify(hash));

            const encodedData = ethers.utils.defaultAbiCoder.encode(
              ['bytes32', 'uint256', 'address', 'bytes'],
              [orderId, expirationTimestamp, orderSignerAddress, signature]
            );

            await expect(
              orderPayable.connect(roles.randomPerson).payForOrder(encodedData, { value: paymentAmount })
            ).to.be.revertedWith('Invalid order signer');
            expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
            expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
          });
        });
      });
      context('Order expired', function () {
        it('target function reverts', async function () {
          const { roles, orderPayable } = await deploy();

          const orderId = testUtils.generateRandomBytes32();
          const timestamp = await helpers.time.latest();
          const expirationTimestamp = timestamp - 60;
          const paymentAmount = ethers.utils.parseEther('1');
          const orderSigner = roles.manager;

          const encodedData = await signAndEncodeOrder({
            orderPayable,
            orderId,
            expirationTimestamp,
            paymentAmount,
            orderSigner,
          });

          await expect(
            orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
          ).to.be.revertedWith('Order expired');
          expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
          expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
        });
      });
    });
    context('Order id is zero', function () {
      it('target function reverts', async function () {
        const { roles, orderPayable } = await deploy();

        const orderId = ethers.constants.HashZero;
        const timestamp = await helpers.time.latest();
        const expirationTimestamp = timestamp + 60;
        const paymentAmount = ethers.utils.parseEther('1');
        const orderSigner = roles.manager;

        const encodedData = await signAndEncodeOrder({
          orderPayable,
          orderId,
          expirationTimestamp,
          paymentAmount,
          orderSigner,
        });

        await expect(
          orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount })
        ).to.be.revertedWith('Order ID zero');
        expect(await ethers.provider.getBalance(orderPayable.address)).to.equal(ethers.utils.parseEther('0'));
        expect(await orderPayable.orderIdToPaymentStatus(orderId)).to.equal(false);
      });
    });
  });

  describe('withdraw', function () {
    context('Caller is manager', function () {
      it('emits Withdrew event and transfers balance to recipient', async function () {
        const { roles, orderPayable } = await deploy();

        const orderId = ethers.utils.id('testOrder');
        const timestamp = await helpers.time.latest();
        const expirationTimestamp = timestamp + 60;
        const paymentAmount = ethers.utils.parseEther('1');
        const orderSigner = roles.manager;

        const encodedData = await signAndEncodeOrder({
          orderPayable,
          orderId,
          expirationTimestamp,
          paymentAmount,
          orderSigner,
        });

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
    context('Caller is withdrawer', function () {
      it('emits Withdrew event and transfers balance to recipient', async function () {
        const { roles, orderPayable } = await deploy();

        const orderId = ethers.utils.id('testOrder');
        const timestamp = await helpers.time.latest();
        const expirationTimestamp = timestamp + 60;
        const paymentAmount = ethers.utils.parseEther('1');
        const orderSigner = roles.manager;

        const encodedData = await signAndEncodeOrder({
          orderPayable,
          orderId,
          expirationTimestamp,
          paymentAmount,
          orderSigner,
        });

        await orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount });

        const initialRecipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const initialContractBalance = await ethers.provider.getBalance(orderPayable.address);

        await expect(orderPayable.connect(roles.withdrawer).withdraw(roles.recipient.address))
          .to.emit(orderPayable, 'Withdrew')
          .withArgs(roles.recipient.address, initialContractBalance);

        const finalRecipientBalance = await ethers.provider.getBalance(roles.recipient.address);
        const finalContractBalance = await ethers.provider.getBalance(orderPayable.address);

        expect(finalRecipientBalance).to.equal(initialRecipientBalance.add(initialContractBalance));
        expect(finalContractBalance).to.equal(0);
      });
    });
    context('Caller is not manager or withdrawer', function () {
      it('target function reverts', async function () {
        const { roles, orderPayable } = await deploy();

        const orderId = ethers.utils.id('testOrder');
        const timestamp = await helpers.time.latest();
        const expirationTimestamp = timestamp + 60;
        const paymentAmount = ethers.utils.parseEther('1');
        const orderSigner = roles.manager;

        const encodedData = await signAndEncodeOrder({
          orderPayable,
          orderId,
          expirationTimestamp,
          paymentAmount,
          orderSigner,
        });

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
    context('Recipient does not accept value', function () {
      it('target function reverts', async function () {
        const { roles, orderPayable, accessControlRegistry } = await deploy();

        const orderId = ethers.utils.id('testOrder');
        const timestamp = await helpers.time.latest();
        const expirationTimestamp = timestamp + 60;
        const paymentAmount = ethers.utils.parseEther('1');
        const orderSigner = roles.manager;

        const encodedData = await signAndEncodeOrder({
          orderPayable,
          orderId,
          expirationTimestamp,
          paymentAmount,
          orderSigner,
        });

        await orderPayable.connect(roles.manager).payForOrder(encodedData, { value: paymentAmount });

        const initialRecipientBalance = await ethers.provider.getBalance(accessControlRegistry.address);
        const initialContractBalance = await ethers.provider.getBalance(orderPayable.address);

        await expect(orderPayable.connect(roles.withdrawer).withdraw(accessControlRegistry.address)).to.be.revertedWith(
          'Transfer unsuccessful'
        );

        const finalRecipientBalance = await ethers.provider.getBalance(accessControlRegistry.address);
        const finalContractBalance = await ethers.provider.getBalance(orderPayable.address);

        expect(finalRecipientBalance).to.equal(initialRecipientBalance);
        expect(finalContractBalance).to.equal(initialContractBalance);
        expect(finalRecipientBalance).to.equal(0);
      });
    });
  });
});
