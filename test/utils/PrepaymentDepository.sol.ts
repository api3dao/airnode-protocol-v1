import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumberish, BytesLike, Wallet } from 'ethers';
import { ethers } from 'hardhat';

import { AccessControlRegistry, getPermitSignature, MockToken, PrepaymentDepository } from '../src';

const Errors = {
  OwnerZeroAddress: 'Owner address zero',
  TokenZeroAddress: 'Token address zero',
  WithdrawalSignerZeroAddress: 'Withdrawal signer address zero',
  UserZeroAddress: 'User address zero',
  ZeroAmount: 'Amount zero',
  AmountExceedLimit: 'Amount exceeds limit',
  SignatureExpired: 'Signature expired',
  WithdrawalSignerInvalid: 'Withdrawal signer not valid',
  SignatureMismatch: 'Signature mismatch',
  RequestAlreadyExecuted: 'Request already executed',
  TransferUnsuccessful: 'Transfer unsuccessful',
  NotOwner: 'Ownable: caller is not the owner',
  ERC20ExceedsBalance: 'ERC20: transfer amount exceeds balance',
  DoesNotHaveUserWithdrawalLimitIncreaserRoleOrManager: 'Cannot increase withdrawal limit',
  DoesNotHaveUserWithdrawalLimitDecreaserRoleOrManager: 'Cannot decrease withdrawal limit',
  DoesNotHaveTokenClaimerRoleOrManager: 'Cannot claim tokens',
  DoesNotHaveWithdrawalSignerRoleOrManager: 'Cannot sign withdrawal',
  ManagerZeroAddress: 'Manager address zero',
  AdminRoleDescriptionEmpty: 'Admin role description empty',
  SenderIsNotRecipient: 'Sender not recipient',
  NotUser: 'Not user',
  NotWithdrawalAccount: 'Not withdrawal account',
};

const deriveRootRole = (managerAddress: string) => ethers.utils.solidityKeccak256(['address'], [managerAddress]);

const deriveRole = (adminRole: string, roleDescription: string) =>
  ethers.utils.solidityKeccak256(
    ['bytes32', 'bytes32'],
    [adminRole, ethers.utils.solidityKeccak256(['string'], [roleDescription])]
  );

describe('PrepaymentDepository', () => {
  let roles: {
    deployer: SignerWithAddress;
    manager: SignerWithAddress;
    withdrawalSigner: SignerWithAddress;
    increaseUserWithdrawalLimitSetter: SignerWithAddress;
    decreaseUserWithdrawalLimitSetter: SignerWithAddress;
    tokenClaimer: SignerWithAddress;
    user: SignerWithAddress;
    random: SignerWithAddress;
  };
  let mockToken: MockToken;
  let prepaymentDepository: PrepaymentDepository;
  let accessControlRegistry: AccessControlRegistry;
  let adminRoleDescription: string,
    userWithdrawalLimitIncreaserRoleDescription: string,
    userWithdrawalLimitDecreaserRoleDescription: string,
    tokenClaimerRoleDescription: string,
    withdrawalSignerRoleDescription: string;

  before(async () => {
    const accounts = await ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
      withdrawalSigner: accounts[2],
      increaseUserWithdrawalLimitSetter: accounts[3],
      decreaseUserWithdrawalLimitSetter: accounts[4],
      tokenClaimer: accounts[5],
      user: accounts[6],
      random: accounts[7],
    };
    const mockTokenFactory = await ethers.getContractFactory('MockToken', roles.deployer);
    mockToken = await mockTokenFactory.deploy();

    const accessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    accessControlRegistry = await accessControlRegistryFactory.deploy();

    adminRoleDescription = 'PrepaymentDepository admin';
    userWithdrawalLimitIncreaserRoleDescription = 'User withdrawal limit increaser';
    userWithdrawalLimitDecreaserRoleDescription = 'User withdrawal limit decreaser';
    tokenClaimerRoleDescription = 'Token claimer';
    withdrawalSignerRoleDescription = 'Withdrawal signer';

    const rootRole = deriveRootRole(roles.manager.address);
    const adminRole = deriveRole(rootRole, adminRoleDescription);
    const userWithdrawalLimitIncreaserRole = deriveRole(adminRole, userWithdrawalLimitIncreaserRoleDescription);
    const userWithdrawalLimitDecreaserRole = deriveRole(adminRole, userWithdrawalLimitDecreaserRoleDescription);
    const tokenClaimerRole = deriveRole(adminRole, tokenClaimerRoleDescription);
    const withdrawalSignerRole = deriveRole(adminRole, withdrawalSignerRoleDescription);

    await accessControlRegistry.connect(roles.manager).initializeRoleAndGrantToSender(rootRole, adminRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, userWithdrawalLimitIncreaserRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, userWithdrawalLimitDecreaserRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, tokenClaimerRoleDescription);
    await accessControlRegistry
      .connect(roles.manager)
      .initializeRoleAndGrantToSender(adminRole, withdrawalSignerRoleDescription);

    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(userWithdrawalLimitIncreaserRole, roles.increaseUserWithdrawalLimitSetter.address);
    await accessControlRegistry
      .connect(roles.manager)
      .grantRole(userWithdrawalLimitDecreaserRole, roles.decreaseUserWithdrawalLimitSetter.address);
    await accessControlRegistry.connect(roles.manager).grantRole(tokenClaimerRole, roles.tokenClaimer.address);
    await accessControlRegistry.connect(roles.manager).grantRole(withdrawalSignerRole, roles.withdrawalSigner.address);

    await accessControlRegistry.connect(roles.manager).renounceRole(adminRole, roles.manager.address);
    await accessControlRegistry
      .connect(roles.manager)
      .renounceRole(userWithdrawalLimitIncreaserRole, roles.manager.address);
    await accessControlRegistry
      .connect(roles.manager)
      .renounceRole(userWithdrawalLimitDecreaserRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(tokenClaimerRole, roles.manager.address);
    await accessControlRegistry.connect(roles.manager).renounceRole(withdrawalSignerRole, roles.manager.address);
  });

  describe('constructor', () => {
    it('should revert if AccessControlRegistry address is zero', async () => {
      const prepaymentDepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
      await expect(
        prepaymentDepositoryFactory.deploy(
          ethers.constants.AddressZero,
          adminRoleDescription,
          roles.manager.address,
          mockToken.address
        )
      ).to.be.revertedWithoutReason;
    });

    it('should revert if admin role description is empty', async () => {
      const prepaymentDepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
      await expect(
        prepaymentDepositoryFactory.deploy(accessControlRegistry.address, '', roles.manager.address, mockToken.address)
      ).to.be.revertedWith(Errors.AdminRoleDescriptionEmpty);
    });

    it('should revert if manager is zero address', async () => {
      const prepaymentDepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
      await expect(
        prepaymentDepositoryFactory.deploy(
          accessControlRegistry.address,
          adminRoleDescription,
          ethers.constants.AddressZero,
          mockToken.address
        )
      ).to.be.revertedWith(Errors.ManagerZeroAddress);
    });

    it('should revert if token is zero address', async () => {
      const prepaymentDepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
      await expect(
        prepaymentDepositoryFactory.deploy(
          accessControlRegistry.address,
          adminRoleDescription,
          roles.manager.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith(Errors.TokenZeroAddress);
    });

    it('constructs', async () => {
      const prepaymentDepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
      const prepaymentDepository = await prepaymentDepositoryFactory.deploy(
        accessControlRegistry.address,
        adminRoleDescription,
        roles.manager.address,
        mockToken.address
      );
      expect(await prepaymentDepository.accessControlRegistry()).to.equal(accessControlRegistry.address);
      expect(await prepaymentDepository.adminRoleDescription()).to.equal(adminRoleDescription);
      expect(await prepaymentDepository.manager()).to.equal(roles.manager.address);
      expect(await prepaymentDepository.token()).to.equal(mockToken.address);
    });
  });

  describe('post deployment', () => {
    before(async () => {
      await mockToken.transfer(roles.user.address, 50000);
    });

    beforeEach(async () => {
      const prepaymentDepositoryFactory = await ethers.getContractFactory('PrepaymentDepository', roles.deployer);
      prepaymentDepository = await prepaymentDepositoryFactory.deploy(
        accessControlRegistry.address,
        adminRoleDescription,
        roles.manager.address,
        mockToken.address
      );
    });

    describe('setWithdrawalAccount', () => {
      it('sets the withdrawal account if the caller is the user and is not already set', async () => {
        await prepaymentDepository.connect(roles.user).setWithdrawalAccount(roles.user.address, roles.random.address);
        expect(await prepaymentDepository.userToWithdrawalAccount(roles.user.address)).to.equal(roles.random.address);
        // reset
        await prepaymentDepository
          .connect(roles.random)
          .setWithdrawalAccount(roles.user.address, ethers.constants.AddressZero);
      });
      it('sets the withdrawal account if the caller is the withdrawl account and is already set ', async () => {
        await prepaymentDepository.connect(roles.user).setWithdrawalAccount(roles.user.address, roles.random.address);
        await prepaymentDepository
          .connect(roles.random)
          .setWithdrawalAccount(roles.user.address, roles.manager.address);
        expect(await prepaymentDepository.userToWithdrawalAccount(roles.user.address)).to.equal(roles.manager.address);
        // reset
        await prepaymentDepository
          .connect(roles.manager)
          .setWithdrawalAccount(roles.user.address, ethers.constants.AddressZero);
      });
      it('reverts if the user is not the caller and the withdrawal account is not set', async () => {
        await expect(
          prepaymentDepository.connect(roles.random).setWithdrawalAccount(roles.user.address, roles.random.address)
        ).to.be.revertedWith(Errors.NotUser);
      });
      it('reverts if user sets the withdrawal account and it is already set', async () => {
        await prepaymentDepository.connect(roles.user).setWithdrawalAccount(roles.user.address, roles.random.address);
        await expect(
          prepaymentDepository.connect(roles.user).setWithdrawalAccount(roles.user.address, roles.manager.address)
        ).to.be.revertedWith(Errors.NotWithdrawalAccount);
        // reset
        await prepaymentDepository
          .connect(roles.random)
          .setWithdrawalAccount(roles.random.address, ethers.constants.AddressZero);
      });
      it('reverts if the withdrawal account is already set and the caller is not the withdrawal account', async () => {
        await prepaymentDepository.connect(roles.user).setWithdrawalAccount(roles.user.address, roles.random.address);
        await expect(
          prepaymentDepository.connect(roles.user).setWithdrawalAccount(roles.user.address, roles.manager.address)
        ).to.be.revertedWith(Errors.NotWithdrawalAccount);
        // reset
        await prepaymentDepository
          .connect(roles.random)
          .setWithdrawalAccount(roles.user.address, ethers.constants.AddressZero);
      });
    });

    describe('increaseUserWithdrawalLimit', () => {
      it('should revert if user is zero address', async () => {
        await expect(
          prepaymentDepository
            .connect(roles.increaseUserWithdrawalLimitSetter)
            .increaseUserWithdrawalLimit(ethers.constants.AddressZero, 100)
        ).to.be.revertedWith(Errors.UserZeroAddress);
      });

      it('should revert if amount is zero', async () => {
        await expect(
          prepaymentDepository
            .connect(roles.increaseUserWithdrawalLimitSetter)
            .increaseUserWithdrawalLimit(roles.user.address, 0)
        ).to.be.revertedWith(Errors.ZeroAmount);
      });

      it('should increase user withdrawal limit', async () => {
        const amount = 100;
        const withdrawalLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        await prepaymentDepository
          .connect(roles.increaseUserWithdrawalLimitSetter)
          .increaseUserWithdrawalLimit(roles.user.address, amount);
        expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(
          withdrawalLimit.add(amount)
        );
      });

      it('should emit event', async () => {
        const amount = 100;
        const withdrawalLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        await expect(
          prepaymentDepository
            .connect(roles.increaseUserWithdrawalLimitSetter)
            .increaseUserWithdrawalLimit(roles.user.address, amount)
        )
          .to.emit(prepaymentDepository, 'IncreasedUserWithdrawalLimit')
          .withArgs(roles.user.address, amount, withdrawalLimit.add(amount));
      });

      it('should revert if sender does not have userWithdrawalLimitIncreaser role', async () => {
        await expect(
          prepaymentDepository.connect(roles.random).increaseUserWithdrawalLimit(roles.user.address, 100)
        ).to.be.revertedWith(Errors.DoesNotHaveUserWithdrawalLimitIncreaserRoleOrManager);
      });
    });

    describe('decreaseUserWithdrawalLimit', () => {
      beforeEach(async () => {
        await prepaymentDepository
          .connect(roles.increaseUserWithdrawalLimitSetter)
          .increaseUserWithdrawalLimit(roles.user.address, 200);
      });

      it('should revert if user is zero address', async () => {
        await expect(
          prepaymentDepository
            .connect(roles.decreaseUserWithdrawalLimitSetter)
            .decreaseUserWithdrawalLimit(ethers.constants.AddressZero, 100)
        ).to.be.revertedWith(Errors.UserZeroAddress);
      });

      it('should revert if amount is zero', async () => {
        await expect(
          prepaymentDepository
            .connect(roles.decreaseUserWithdrawalLimitSetter)
            .decreaseUserWithdrawalLimit(roles.user.address, 0)
        ).to.be.revertedWith(Errors.ZeroAmount);
      });

      it('should revert if amount is greater than withdrawal limit', async () => {
        await expect(
          prepaymentDepository
            .connect(roles.decreaseUserWithdrawalLimitSetter)
            .decreaseUserWithdrawalLimit(roles.user.address, 300)
        ).to.be.revertedWith(Errors.AmountExceedLimit);
      });

      it('should decrease user withdrawal limit', async () => {
        const amount = 100;
        const oldWithdrawalLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        await prepaymentDepository
          .connect(roles.decreaseUserWithdrawalLimitSetter)
          .decreaseUserWithdrawalLimit(roles.user.address, amount);
        expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(
          oldWithdrawalLimit.sub(amount)
        );
      });

      it('should emit event', async () => {
        const amount = 100;
        const oldWithdrawalLimit = await prepaymentDepository.userToWithdrawalLimit(roles.user.address);
        await expect(
          prepaymentDepository
            .connect(roles.decreaseUserWithdrawalLimitSetter)
            .decreaseUserWithdrawalLimit(roles.user.address, amount)
        )
          .to.emit(prepaymentDepository, 'DecreasedUserWithdrawalLimit')
          .withArgs(roles.user.address, 100, oldWithdrawalLimit.sub(amount));
      });

      it('should revert if sender does not have userWithdrawalLimitDecreaser role', async () => {
        await expect(
          prepaymentDepository.connect(roles.random).decreaseUserWithdrawalLimit(roles.user.address, 100)
        ).to.be.revertedWith(Errors.DoesNotHaveUserWithdrawalLimitDecreaserRoleOrManager);
      });
    });

    describe('deposit', () => {
      let amount: BigNumberish;
      let deadline: BigNumberish;
      let v: BigNumberish, r: BytesLike, s: BytesLike;

      beforeEach(async () => {
        amount = 100;
        deadline = ethers.constants.MaxUint256;
        ({ v, r, s } = await getPermitSignature(
          roles.user as unknown as Wallet,
          mockToken,
          prepaymentDepository.address,
          amount,
          deadline
        ));
      });

      it('should revert if amount is zero', async () => {
        await expect(
          prepaymentDepository.connect(roles.user).deposit(roles.user.address, 0, deadline, v, r, s)
        ).to.be.revertedWith(Errors.ZeroAmount);
      });

      it('should revert if user is zero address', async () => {
        await expect(
          prepaymentDepository.connect(roles.user).deposit(ethers.constants.AddressZero, amount, deadline, v, r, s)
        ).to.be.revertedWith(Errors.UserZeroAddress);
      });

      it('should deposit', async () => {
        await prepaymentDepository.connect(roles.user).deposit(roles.user.address, amount, deadline, v, r, s);
        expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(amount);
      });

      it('should emit event when deposited for the user', async () => {
        await expect(prepaymentDepository.connect(roles.user).deposit(roles.user.address, amount, deadline, v, r, s))
          .to.emit(prepaymentDepository, 'Deposited')
          .withArgs(roles.user.address, roles.user.address, amount);
        expect(await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).to.equal(amount);
      });
      it('should emit event when deposited for another user', async () => {
        await expect(prepaymentDepository.connect(roles.user).deposit(roles.random.address, amount, deadline, v, r, s))
          .to.emit(prepaymentDepository, 'Deposited')
          .withArgs(roles.user.address, roles.random.address, amount);
        expect(await prepaymentDepository.userToWithdrawalLimit(roles.random.address)).to.equal(amount);
      });
    });

    describe('claim', () => {
      beforeEach(async () => {
        const amount = 200;
        const deadline = ethers.constants.MaxUint256;
        const { v, r, s } = await getPermitSignature(
          roles.user as unknown as Wallet,
          mockToken,
          prepaymentDepository.address,
          amount,
          deadline
        );
        await prepaymentDepository.connect(roles.user).deposit(roles.user.address, amount, deadline, v, r, s);
      });

      it('should revert if sender does not have tokenClaimer role', async () => {
        await expect(prepaymentDepository.connect(roles.random).claim(100)).to.be.revertedWith(
          Errors.DoesNotHaveTokenClaimerRoleOrManager
        );
      });

      it('should revert if amount is zero', async () => {
        await expect(prepaymentDepository.connect(roles.tokenClaimer).claim(0)).to.be.revertedWith(Errors.ZeroAmount);
      });

      it('should revert if amount is greater than contract balance', async () => {
        await expect(prepaymentDepository.connect(roles.tokenClaimer).claim(300)).to.be.revertedWith(
          Errors.ERC20ExceedsBalance
        );
      });

      it('should claim', async () => {
        const amount = 100;
        const previousContractBalance = await mockToken.balanceOf(prepaymentDepository.address);
        await prepaymentDepository.connect(roles.tokenClaimer).claim(amount);
        expect(await mockToken.balanceOf(prepaymentDepository.address)).to.equal(previousContractBalance.sub(amount));
        expect(await mockToken.balanceOf(roles.tokenClaimer.address)).to.equal(amount);
      });

      it('should emit event', async () => {
        const amount = 100;
        await expect(prepaymentDepository.connect(roles.tokenClaimer).claim(amount))
          .to.emit(prepaymentDepository, 'Claimed')
          .withArgs(amount);
      });
    });

    describe('withdraws', () => {
      beforeEach(async () => {
        const amount = 1000;
        const deadline = ethers.constants.MaxUint256;
        const { v, r, s } = await getPermitSignature(
          roles.user as unknown as Wallet,
          mockToken,
          prepaymentDepository.address,
          amount,
          deadline
        );
        await prepaymentDepository.connect(roles.user).deposit(roles.user.address, amount, deadline, v, r, s);
      });

      it('should revert if amount is zero', async () => {
        await expect(
          prepaymentDepository.connect(roles.user).withdraw(0, 100000, roles.user.address, '0x')
        ).to.be.revertedWith(Errors.ZeroAmount);
      });

      it('should revert if the block timestamp is more than the expirationTimestamp', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;

        const expirationTimestamp = timestamp - 1000;
        await expect(
          prepaymentDepository
            .connect(roles.user)
            .withdraw(100, expirationTimestamp, roles.withdrawalSigner.address, '0x')
        ).to.be.revertedWith(Errors.SignatureExpired);
      });

      it('should revert if the signer does not have the WithdrawalSignerRole', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;

        await expect(
          prepaymentDepository.connect(roles.user).withdraw(100, timestamp + 1000, roles.user.address, '0x')
        ).to.be.revertedWith(Errors.DoesNotHaveWithdrawalSignerRoleOrManager);
      });

      it('should revert if the signature is not signed by the withdrawalSigner', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;

        const amount = 100;
        const hash = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            await ethers.provider.getNetwork().then((network) => network.chainId),
            prepaymentDepository.address,
            roles.user.address,
            amount,
            timestamp + 1000,
          ]
        );
        const signature = await roles.random.signMessage(ethers.utils.arrayify(hash));
        await expect(
          prepaymentDepository
            .connect(roles.user)
            .withdraw(amount, timestamp + 1000, roles.withdrawalSigner.address, signature)
        ).to.be.revertedWith(Errors.SignatureMismatch);
      });

      it('should revert if amount is greater than the user withdrawal limit', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;

        const amount = (await prepaymentDepository.userToWithdrawalLimit(roles.user.address)).add(1);
        const hash = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            await ethers.provider.getNetwork().then((network) => network.chainId),
            prepaymentDepository.address,
            roles.user.address,
            amount,
            timestamp + 1000,
          ]
        );
        const signature = await roles.withdrawalSigner.signMessage(ethers.utils.arrayify(hash));
        await expect(
          prepaymentDepository
            .connect(roles.user)
            .withdraw(amount, timestamp + 1000, roles.withdrawalSigner.address, signature)
        ).to.be.revertedWith(Errors.AmountExceedLimit);
      });

      it('withdraws', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;

        const amount = 100;
        const hash = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            await ethers.provider.getNetwork().then((network) => network.chainId),
            prepaymentDepository.address,
            roles.user.address,
            amount,
            timestamp + 1000,
          ]
        );
        const signature = await roles.withdrawalSigner.signMessage(ethers.utils.arrayify(hash));
        const previousContractBalance = await mockToken.balanceOf(prepaymentDepository.address);
        const previousUserBalance = await mockToken.balanceOf(roles.user.address);
        await prepaymentDepository
          .connect(roles.user)
          .withdraw(amount, timestamp + 1000, roles.withdrawalSigner.address, signature);
        expect(await mockToken.balanceOf(prepaymentDepository.address)).to.equal(previousContractBalance.sub(amount));
        expect(await mockToken.balanceOf(roles.user.address)).to.equal(previousUserBalance.add(amount));
      });

      it('withdraws to withdrawal account set by user', async () => {
        await prepaymentDepository.connect(roles.user).setWithdrawalAccount(roles.user.address, roles.random.address);
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;

        const amount = 100;
        const hash = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            await ethers.provider.getNetwork().then((network) => network.chainId),
            prepaymentDepository.address,
            roles.user.address,
            amount,
            timestamp + 1000,
          ]
        );
        const signature = await roles.withdrawalSigner.signMessage(ethers.utils.arrayify(hash));
        const previousContractBalance = await mockToken.balanceOf(prepaymentDepository.address);
        const previousUserBalance = await mockToken.balanceOf(roles.random.address);
        await prepaymentDepository
          .connect(roles.user)
          .withdraw(amount, timestamp + 1000, roles.withdrawalSigner.address, signature);
        expect(await mockToken.balanceOf(prepaymentDepository.address)).to.equal(previousContractBalance.sub(amount));
        expect(await mockToken.balanceOf(roles.random.address)).to.equal(previousUserBalance.add(amount));
      });

      it('withdraws with a meta-tx', async () => {
        const amount = 100;
        const previousContractBalance = await mockToken.balanceOf(prepaymentDepository.address);
        const previousUserBalance = await mockToken.balanceOf(roles.user.address);

        const metaTxExpirationTimestamp =
          (await ethers.provider.getBlock(ethers.provider.blockNumber)).timestamp + 3600;
        const chainId = (await ethers.provider.getNetwork()).chainId;

        const hash = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            await ethers.provider.getNetwork().then((network) => network.chainId),
            prepaymentDepository.address,
            roles.user.address,
            amount,
            metaTxExpirationTimestamp,
          ]
        );

        const withdrawalSignerSignature = await roles.withdrawalSigner.signMessage(ethers.utils.arrayify(hash));

        const domain = {
          name: 'ExpiringMetaTxForwarder',
          version: '1.0.0',
          chainId,
          verifyingContract: accessControlRegistry.address,
        };

        const types = {
          ExpiringMetaTx: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'data', type: 'bytes' },
            { name: 'expirationTimestamp', type: 'uint256' },
          ],
        };

        const value = {
          from: roles.user.address,
          to: prepaymentDepository.address,
          data: prepaymentDepository.interface.encodeFunctionData('withdraw', [
            amount,
            metaTxExpirationTimestamp,
            roles.withdrawalSigner.address,
            withdrawalSignerSignature,
          ]),
          expirationTimestamp: metaTxExpirationTimestamp,
        };

        const metaTxSignature = await roles.user._signTypedData(domain, types, value);

        await expect(accessControlRegistry.connect(roles.user).execute(value, metaTxSignature))
          .to.emit(prepaymentDepository, 'Withdrew')
          .withArgs(roles.user.address, hash, amount, roles.withdrawalSigner.address);
        expect(await mockToken.balanceOf(prepaymentDepository.address)).to.equal(previousContractBalance.sub(amount));
        expect(await mockToken.balanceOf(roles.user.address)).to.equal(previousUserBalance.add(amount));
      });

      it('should revert if the withdrawalWithHashIsExecuted status is true', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;
        const amount = 100;
        const hash = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            await ethers.provider.getNetwork().then((network) => network.chainId),
            prepaymentDepository.address,
            roles.user.address,
            amount,
            timestamp + 1000,
          ]
        );
        const signature = await roles.withdrawalSigner.signMessage(ethers.utils.arrayify(hash));
        await prepaymentDepository
          .connect(roles.user)
          .withdraw(amount, timestamp + 1000, roles.withdrawalSigner.address, signature);
        await expect(
          prepaymentDepository
            .connect(roles.user)
            .withdraw(amount, timestamp + 1000, roles.withdrawalSigner.address, signature)
        ).to.be.revertedWith(Errors.RequestAlreadyExecuted);
      });

      it('should revert if the amount is greater than the contract balance', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp;
        const amount = (await mockToken.balanceOf(prepaymentDepository.address)).add(1);
        //increase user withdrawal limit
        await prepaymentDepository
          .connect(roles.increaseUserWithdrawalLimitSetter)
          .increaseUserWithdrawalLimit(roles.user.address, amount);

        const hash = ethers.utils.solidityKeccak256(
          ['uint256', 'address', 'address', 'uint256', 'uint256'],
          [
            await ethers.provider.getNetwork().then((network) => network.chainId),
            prepaymentDepository.address,
            roles.user.address,
            amount,
            timestamp + 1000,
          ]
        );
        const signature = await roles.withdrawalSigner.signMessage(ethers.utils.arrayify(hash));
        await expect(
          prepaymentDepository
            .connect(roles.user)
            .withdraw(amount, timestamp + 1000, roles.withdrawalSigner.address, signature)
        ).to.be.revertedWith(Errors.ERC20ExceedsBalance);
      });
    });
  });
});
