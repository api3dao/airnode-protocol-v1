// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "./interfaces/IPrepaymentDepository.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";

/// @title Contract that enables micropayments to be prepaid in batch
/// @notice `manager` represents the payment recipient, and its various
/// privileges can be delegated to other accounts through respective roles.
/// `manager`, `userWithdrawalLimitIncreaser` and `tokenClaimer` roles should
/// only be granted to a multisig or an equivalently decentralized account.
/// `withdrawalSigner` issues ERC191 signatures, and thus has to be an EOA. It
/// being compromised poses a risk in proportion to the redundancy in user
/// withdrawal limits. Have a `userWithdrawalLimitDecreaser` decrease user
/// withdrawal limits as necessary to mitigate this risk.
/// The `userWithdrawalLimitDecreaser` role can be granted to an EOA, as it
/// cannot cause irreversible harm.
contract PrepaymentDepository is
    AccessControlRegistryAdminnedWithManager,
    IPrepaymentDepository
{
    using ECDSA for bytes32;

    /// @notice Withdrawal signer role description
    string public constant override WITHDRAWAL_SIGNER_ROLE_DESCRIPTION =
        "Withdrawal signer";
    /// @notice User withdrawal limit increaser role description
    string
        public constant
        override USER_WITHDRAWAL_LIMIT_INCREASER_ROLE_DESCRIPTION =
        "User withdrawal limit increaser";
    /// @notice User withdrawal limit decreaser role description
    string
        public constant
        override USER_WITHDRAWAL_LIMIT_DECREASER_ROLE_DESCRIPTION =
        "User withdrawal limit decreaser";
    /// @notice Token claimer role description
    string public constant override TOKEN_CLAIMER_ROLE_DESCRIPTION =
        "Token claimer";

    /// @notice Withdrawal signer role
    bytes32 public immutable override withdrawalSignerRole;
    /// @notice User withdrawal limit increaser role
    bytes32 public immutable override userWithdrawalLimitIncreaserRole;
    /// @notice User withdrawal limit decreaser role
    bytes32 public immutable override userWithdrawalLimitDecreaserRole;
    /// @notice Token claimer role
    bytes32 public immutable override tokenClaimerRole;

    /// @notice Contract address of the ERC20 token that prepayments can be
    /// made in
    address public immutable override token;

    /// @notice Returns the withdrawal account address of the user
    mapping(address => address) public userToWithdrawalAccount;

    /// @notice Returns the withdrawal limit of the user
    mapping(address => uint256) public userToWithdrawalLimit;

    /// @notice Returns if the withdrawal with the hash is executed
    mapping(bytes32 => bool) public withdrawalWithHashIsExecuted;

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    /// @param _token Contract address of the ERC20 token that prepayments are
    /// made in
    /// @dev ERC20 token contract must implement ERC2612
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _token
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
    {
        require(_token != address(0), "Token address zero");
        token = _token;
        withdrawalSignerRole = _deriveRole(
            _deriveAdminRole(manager),
            WITHDRAWAL_SIGNER_ROLE_DESCRIPTION
        );
        userWithdrawalLimitIncreaserRole = _deriveRole(
            _deriveAdminRole(manager),
            USER_WITHDRAWAL_LIMIT_INCREASER_ROLE_DESCRIPTION
        );
        userWithdrawalLimitDecreaserRole = _deriveRole(
            _deriveAdminRole(manager),
            USER_WITHDRAWAL_LIMIT_DECREASER_ROLE_DESCRIPTION
        );
        tokenClaimerRole = _deriveRole(
            _deriveAdminRole(manager),
            TOKEN_CLAIMER_ROLE_DESCRIPTION
        );
    }

    /// @notice Called by the user that has not set a withdrawal account to set
    /// a withdrawal account, or called by the withdrawal account of a user to
    /// set a new withdrawal account
    /// @param user User address
    /// @param withdrawalAccount Withdrawal account address
    function setWithdrawalAccount(
        address user,
        address withdrawalAccount
    ) external override {
        if (userToWithdrawalAccount[user] == address(0)) {
            require(msg.sender == user, "Not user");
        } else {
            require(
                msg.sender == userToWithdrawalAccount[user],
                "Not withdrawal account"
            );
        }
        userToWithdrawalAccount[user] = withdrawalAccount;
    }

    /// @notice Called to increase the withdrawal limit of the user
    /// @dev This function is intended to be used to revert faulty
    /// `decreaseUserWithdrawalLimit()` calls
    /// @param user User address
    /// @param amount Amount to increase the withdrawal limit by
    /// @return withdrawalLimit Increased withdrawal limit
    function increaseUserWithdrawalLimit(
        address user,
        uint256 amount
    ) external override returns (uint256 withdrawalLimit) {
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    userWithdrawalLimitIncreaserRole,
                    msg.sender
                ),
            "Cannot increase withdrawal limit"
        );
        require(user != address(0), "User address zero");
        require(amount != 0, "Amount zero");
        withdrawalLimit = userToWithdrawalLimit[user] + amount;
        userToWithdrawalLimit[user] = withdrawalLimit;
        emit IncreasedUserWithdrawalLimit(user, amount, withdrawalLimit);
    }

    /// @notice Called to decrease the withdrawal limit of the user
    /// @param user User address
    /// @param amount Amount to decrease the withdrawal limit by
    /// @return withdrawalLimit Decreased withdrawal limit
    function decreaseUserWithdrawalLimit(
        address user,
        uint256 amount
    ) external override returns (uint256 withdrawalLimit) {
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    userWithdrawalLimitDecreaserRole,
                    msg.sender
                ),
            "Cannot decrease withdrawal limit"
        );
        require(user != address(0), "User address zero");
        require(amount != 0, "Amount zero");
        uint256 oldWithdrawalLimit = userToWithdrawalLimit[user];
        require(amount <= oldWithdrawalLimit, "Amount exceeds limit");
        withdrawalLimit = oldWithdrawalLimit - amount;
        userToWithdrawalLimit[user] = withdrawalLimit;
        emit DecreasedUserWithdrawalLimit(user, amount, withdrawalLimit);
    }

    /// @notice Called to claim tokens
    /// @param amount Amount of tokens to claim
    function claim(uint256 amount) external override {
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    tokenClaimerRole,
                    msg.sender
                ),
            "Cannot claim tokens"
        );
        require(amount != 0, "Amount zero");
        emit Claimed(amount);
        require(
            IERC20(token).transfer(msg.sender, amount),
            "Transfer unsuccessful"
        );
    }

    /// @notice Called to deposit tokens on behalf of a user
    /// @dev Sender needs to have used ERC2612 to approve the transfer
    /// @param user User address
    /// @param amount Amount of tokens to deposit
    /// @param deadline Deadline of the permit
    /// @param v v component of the signature
    /// @param r r component of the signature
    /// @param s s component of the signature
    /// @return withdrawalLimit Increased withdrawal limit
    function deposit(
        address user,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint256 withdrawalLimit) {
        require(user != address(0), "User address zero");
        require(amount != 0, "Amount zero");
        withdrawalLimit = userToWithdrawalLimit[user] + amount;
        userToWithdrawalLimit[user] = withdrawalLimit;
        emit Deposited(msg.sender, user, amount);
        IERC20Permit(token).permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Transfer unsuccessful"
        );
    }

    /// @notice Called by a user to withdraw tokens
    /// @param amount Amount of tokens to withdraw
    /// @param expirationTimestamp Expiration timestamp of the signature
    /// @param withdrawalSigner Address of the account that signed the withdrawal
    /// @param signature Withdrawal signature
    /// @return withdrawalAccount Withdrawal account address
    /// @return withdrawalLimit Decreased withdrawal limit
    function withdraw(
        uint256 amount,
        uint256 expirationTimestamp,
        address withdrawalSigner,
        bytes calldata signature
    )
        external
        override
        returns (address withdrawalAccount, uint256 withdrawalLimit)
    {
        require(amount != 0, "Amount zero");
        require(block.timestamp < expirationTimestamp, "Signature expired");
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    withdrawalSignerRole,
                    withdrawalSigner
                ),
            "Cannot sign withdrawal"
        );
        if (userToWithdrawalAccount[msg.sender] == address(0)) {
            withdrawalAccount = msg.sender;
        } else {
            withdrawalAccount = userToWithdrawalAccount[msg.sender];
        }
        bytes32 withdrawalHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(this),
                msg.sender,
                amount,
                expirationTimestamp
            )
        );
        require(
            (withdrawalHash.toEthSignedMessageHash()).recover(signature) ==
                withdrawalSigner,
            "Signature mismatch"
        );
        require(
            !withdrawalWithHashIsExecuted[withdrawalHash],
            "Request already executed"
        );
        withdrawalWithHashIsExecuted[withdrawalHash] = true;
        uint256 oldWithdrawalLimit = userToWithdrawalLimit[msg.sender];
        require(amount <= oldWithdrawalLimit, "Amount exceeds limit");
        withdrawalLimit = oldWithdrawalLimit - amount;
        userToWithdrawalLimit[msg.sender] = withdrawalLimit;
        emit Withdrew(
            withdrawalAccount,
            withdrawalHash,
            amount,
            withdrawalSigner
        );
        require(
            IERC20(token).transfer(withdrawalAccount, amount),
            "Transfer unsuccessful"
        );
    }
}
