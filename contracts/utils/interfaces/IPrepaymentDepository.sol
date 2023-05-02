// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access-control-registry/interfaces/IAccessControlRegistryAdminnedWithManager.sol";

interface IPrepaymentDepository is IAccessControlRegistryAdminnedWithManager {
    event IncreasedUserWithdrawalLimit(
        address indexed user,
        uint256 amount,
        uint256 withdrawalLimit
    );

    event DecreasedUserWithdrawalLimit(
        address indexed user,
        uint256 amount,
        uint256 withdrawalLimit
    );

    event Claimed(uint256 amount);

    event Deposited(
        address indexed depositor,
        address indexed user,
        uint256 amount
    );

    event Withdrew(
        address indexed user,
        bytes32 indexed withdrawalHash,
        uint256 amount,
        address withdrawalSigner
    );

    function setWithdrawalAccount(
        address user,
        address withdrawalAccount
    ) external;

    function increaseUserWithdrawalLimit(
        address user,
        uint256 amount
    ) external returns (uint256 withdrawalLimit);

    function decreaseUserWithdrawalLimit(
        address user,
        uint256 amount
    ) external returns (uint256 withdrawalLimit);

    function claim(uint256 amount) external;

    function deposit(
        address user,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 withdrawalLimit);

    function withdraw(
        uint256 amount,
        uint256 expirationTimestamp,
        address withdrawalSigner,
        bytes calldata signature
    ) external returns (address withdrawalAccount, uint256 withdrawalLimit);

    // solhint-disable-next-line func-name-mixedcase
    function WITHDRAWAL_SIGNER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    // solhint-disable-next-line func-name-mixedcase
    function USER_WITHDRAWAL_LIMIT_INCREASER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    // solhint-disable-next-line func-name-mixedcase
    function USER_WITHDRAWAL_LIMIT_DECREASER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    // solhint-disable-next-line func-name-mixedcase
    function TOKEN_CLAIMER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function withdrawalSignerRole() external view returns (bytes32);

    function userWithdrawalLimitIncreaserRole() external view returns (bytes32);

    function userWithdrawalLimitDecreaserRole() external view returns (bytes32);

    function tokenClaimerRole() external view returns (bytes32);

    function token() external view returns (address);
}
