// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFunder {
    event DeployedFunderDepository(
        address indexed funderDepository,
        address owner,
        bytes32 root
    );

    event Funded(
        address indexed funderDepository,
        address recipient,
        uint256 amount
    );

    event Withdrew(
        address indexed funderDepository,
        address recipient,
        uint256 amount
    );

    function deployFunderDepository(
        address owner,
        bytes32 root
    ) external returns (address payable funderDepository);

    function fund(
        address owner,
        bytes32 root,
        bytes32[] calldata proof,
        address recipient,
        uint256 lowThreshold,
        uint256 highThreshold
    ) external;

    function withdraw(bytes32 root, address recipient, uint256 amount) external;

    function withdrawAll(bytes32 root, address recipient) external;

    function computeFunderDepositoryAddress(
        address owner,
        bytes32 root
    ) external view returns (address funderDepository);

    function ownerToRootToFunderDepositoryAddress(
        address owner,
        bytes32 root
    ) external view returns (address payable funderDepository);
}
