// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

interface IPrepaymentDepository {
    event UpdatedSigner(address indexed depositor, address indexed signer);
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

    function WITHDRAWAL_SIGNER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function USER_WITHDRAWAL_LIMIT_INCREASER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function USER_WITHDRAWAL_LIMIT_DECREASER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function TOKEN_CLAIMER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function withdrawalSignerRole() external view returns (bytes32);

    function userWithdrawalLimitIncreaserRole() external view returns (bytes32);

    function userWithdrawalLimitDecreaserRole() external view returns (bytes32);

    function tokenClaimerRole() external view returns (bytes32);
}