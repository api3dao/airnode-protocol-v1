// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
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
    ERC2771Context,
    AccessControlRegistryAdminnedWithManager,
    IPrepaymentDepository
{
    using ECDSA for bytes32;

    /// @notice The address of the ERC20 token that this contract holds
    address public immutable token;

    /// @notice Withdrawal signer role description
    string public constant override WITHDRAWAL_SIGNER_ROLE_DESCRIPTION =
        "Withdrawal signer";

    /// @notice user withdrawal limit increaser role description
    string
        public constant
        override USER_WITHDRAWAL_LIMIT_INCREASER_ROLE_DESCRIPTION =
        "User withdrawal limit increaser";

    /// @notice user withdrawal limit decreaser role description
    string
        public constant
        override USER_WITHDRAWAL_LIMIT_DECREASER_ROLE_DESCRIPTION =
        "User withdrawal limit decreaser";

    /// @notice Token claimer role description
    string public constant override TOKEN_CLAIMER_ROLE_DESCRIPTION =
        "Token claimer";

    /// @notice Withdrawal Signer role
    bytes32 public immutable override withdrawalSignerRole;

    /// @notice user withdrawal limit increaser role
    bytes32 public immutable override userWithdrawalLimitIncreaserRole;

    /// @notice user withdrawal limit decreaser role
    bytes32 public immutable override userWithdrawalLimitDecreaserRole;

    /// @notice Token claimer role
    bytes32 public immutable override tokenClaimerRole;

    /// @notice mapping of the user to the withdrawal account
    mapping(address => address) public userToWithdrawalAccount;
    /// @notice mapping of the user to the withdrawal limit
    mapping(address => uint256) public userToWithdrawalLimit;
    /// @notice mapping of the withdrawal hash to whether the withdrawal has been executed
    mapping(bytes32 => bool) public withdrawalWithHashIsExecuted;

    /// @param _accessControlRegistry The address of the AccessControlRegistry contract
    /// @param _adminRoleDescription The description of the AdminRole
    /// @param _manager The address of the manager
    /// @param _token The address of the ERC20 token that this contract holds
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _token
    )
        ERC2771Context(_accessControlRegistry)
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

    /// @notice Called by the user to set its withdrawal account
    /// @dev If it was not set before, only the user can call this function
    /// if it was set before, only the withdrawal account can call this function
    /// @param user The address of the user
    /// @param withdrawalAccount The address of the withdrawal account
    function setWithdrawalAccount(
        address user,
        address withdrawalAccount
    ) external {
        if (userToWithdrawalAccount[user] == address(0)) {
            require(_msgSender() == user, "Not user");
        } else {
            require(
                _msgSender() == userToWithdrawalAccount[user],
                "Not withdrawal account"
            );
        }
        userToWithdrawalAccount[user] = withdrawalAccount;
    }

    /// @notice Called by the userWithdrawalLimitIncreaserRole or the manager
    /// to increase the withdrawal limit for the user
    /// @dev Will be used to revert faulty decreaseUserWithdrawalLimit() calls
    /// @param user The address of the user
    /// @param amount The amount to increase the withdrawal limit by
    function increaseUserWithdrawalLimit(
        address user,
        uint256 amount
    ) external {
        require(
            _msgSender() == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    userWithdrawalLimitIncreaserRole,
                    _msgSender()
                ),
            "Cannot increase withdrawal limit"
        );
        require(user != address(0), "User address zero");
        require(amount != 0, "Amount zero");
        uint256 withdrawalLimit = userToWithdrawalLimit[user] + amount;
        userToWithdrawalLimit[user] = withdrawalLimit;
        emit IncreasedUserWithdrawalLimit(user, amount, withdrawalLimit);
    }

    /// @notice Called by the userWithdrawalLimitDecreaserRole or the manager
    /// to decrease the withdrawal limit for the user
    /// @param user The address of the user
    /// @param amount The amount to decrease the withdrawal limit by
    function decreaseUserWithdrawalLimit(
        address user,
        uint256 amount
    ) external {
        require(
            _msgSender() == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    userWithdrawalLimitDecreaserRole,
                    _msgSender()
                ),
            "Cannot decrease withdrawal limit"
        );
        require(user != address(0), "User address zero");
        require(amount != 0, "Amount zero");
        uint256 oldWithdrawalLimit = userToWithdrawalLimit[user];
        require(amount <= oldWithdrawalLimit, "Amount exceeds limit");
        uint256 withdrawalLimit = oldWithdrawalLimit - amount;
        userToWithdrawalLimit[user] = withdrawalLimit;
        emit DecreasedUserWithdrawalLimit(user, amount, withdrawalLimit);
    }

    /// @notice Called by the TokenClaimerRole or the manager to claim tokens
    /// @param amount The amount of tokens to claim
    function claim(uint256 amount) external {
        require(
            _msgSender() == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    tokenClaimerRole,
                    _msgSender()
                ),
            "Cannot claim tokens"
        );
        require(amount != 0, "Amount zero");
        emit Claimed(amount);
        require(
            IERC20(token).transfer(_msgSender(), amount),
            "Transfer unsuccessful"
        );
    }

    /// @notice Called by the user to deposit tokens
    /// on behalf of another user
    /// @param user The address to deposit tokens on behalf of
    /// @param amount The amount of tokens to deposit
    /// @param deadline The deadline for the permit
    /// @param v The v component of the signature
    /// @param r The r component of the signature
    /// @param s The s component of the signature
    function deposit(
        address user,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(user != address(0), "User address zero");
        require(amount != 0, "Amount zero");
        userToWithdrawalLimit[user] += amount;
        emit Deposited(_msgSender(), user, amount);
        IERC20Permit(token).permit(
            _msgSender(),
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        require(
            IERC20(token).transferFrom(_msgSender(), address(this), amount),
            "Transfer unsuccessful"
        );
    }

    /// @notice Called by a depositor to withdraw tokens
    /// @param amount The amount of tokens to withdraw
    /// @param expirationTimestamp The expiration timestamp of the signature
    /// @param withdrawalSigner The address of the WithdrawalSignerRole or the manager
    /// @param signature The signature of the withdrawal signed by
    /// the WithdrawalSignerRole or the manager
    function withdraw(
        uint256 amount,
        uint256 expirationTimestamp,
        address withdrawalSigner,
        bytes calldata signature
    ) external returns (address withdrawalAccount) {
        require(amount != 0, "Amount zero");
        require(block.timestamp < expirationTimestamp, "Signature expired");
        require(
            _msgSender() == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    withdrawalSignerRole,
                    withdrawalSigner
                ),
            "Cannot sign withdrawal"
        );
        if (userToWithdrawalAccount[_msgSender()] == address(0)) {
            withdrawalAccount = _msgSender();
        } else {
            withdrawalAccount = userToWithdrawalAccount[_msgSender()];
        }
        bytes32 withdrawalHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(this),
                _msgSender(),
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
        uint256 withdrawalLimit = userToWithdrawalLimit[_msgSender()];
        require(amount <= withdrawalLimit, "Amount exceeds limit");
        userToWithdrawalLimit[_msgSender()] = withdrawalLimit - amount;
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
