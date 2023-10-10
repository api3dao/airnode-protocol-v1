// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface ITimestampedHashRegistry {
    event SetupSigners(bytes32 indexed hashType, address[] signers);

    event AddedSigner(bytes32 indexed hashType, address signer);

    event RemovedSigner(bytes32 indexed hashType, address signer);

    event RegisteredHash(
        bytes32 indexed hashType,
        bytes32 hash,
        uint256 timestamp
    );

    function setupSigners(
        bytes32 hashType,
        address[] calldata signers
    ) external;

    function addSigner(bytes32 hashType, address signer) external;

    function removeSigner(bytes32 hashType, address signer) external;

    function getSigners(
        bytes32 hashType
    ) external view returns (address[] memory signers);

    function registerHash(
        bytes32 hashType,
        bytes32 hash,
        uint256 timestamp,
        bytes[] calldata signatures
    ) external;

    function hashTypeToHash(
        bytes32 hashType
    ) external view returns (bytes32 hash);

    function hashTypeToTimestamp(
        bytes32 hashType
    ) external view returns (uint256 timestamp);
}
