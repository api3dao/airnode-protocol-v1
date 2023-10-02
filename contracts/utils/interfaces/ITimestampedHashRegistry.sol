// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface ITimestampedHashRegistry {
    event HashTypeSignersSet(bytes32 indexed hashType, address[] signers);

    event SignedHashRegistered(
        bytes32 indexed hashType,
        bytes32 hash,
        uint256 timestamp,
        bytes[] signatures
    );

    struct SignedHash {
        bytes32 hash; // i.e. merkle tree root
        uint256 timestamp;
    }

    function setHashTypeSigners(
        bytes32 hashType,
        address[] calldata signers
    ) external;

    function registerSignedHash(
        bytes32 hashType,
        SignedHash calldata signedHash,
        bytes[] calldata signatures
    ) external;

    function getSigners(
        bytes32 hashType
    ) external view returns (address[] memory signers);

    function hashTypeToSignedHash(
        bytes32 hashType
    ) external view returns (bytes32 hash, uint256 timestamp);
}
