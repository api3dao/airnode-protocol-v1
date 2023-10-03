// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface ITimestampedHashRegistry {
    event SetHashTypeSigners(bytes32 indexed typeName, address[] signers);

    event RegisteredSignedHash(
        bytes32 indexed typeName,
        bytes32 hash,
        uint256 timestamp,
        bytes[] signatures
    );

    struct SignedHash {
        bytes32 hash; // i.e. merkle tree root
        uint256 timestamp;
    }

    function setHashTypeSigners(
        bytes32 typeName,
        address[] calldata signers
    ) external;

    function registerSignedHash(
        bytes32 typeName,
        SignedHash calldata signedHash,
        bytes[] calldata signatures
    ) external;

    function getSigners(
        bytes32 typeName
    ) external view returns (address[] memory signers);

    function hashTypeToSignedHash(
        bytes32 typeName
    ) external view returns (bytes32 hash, uint256 timestamp);
}
