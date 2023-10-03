// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface ITimestampedHashRegistry {
    event AddedSigner(bytes32 indexed typeName, address signer);

    event RemovedSigner(bytes32 indexed typeName, address signer);

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

    function addSigner(bytes32 typeName, address signer) external;

    function removeSigner(bytes32 typeName, address signer) external;

    function getSigners(
        bytes32 typeName
    ) external view returns (address[] memory signers);

    function registerSignedHash(
        bytes32 typeName,
        SignedHash calldata signedHash,
        bytes[] calldata signatures
    ) external;

    function hashTypeToSignedHash(
        bytes32 typeName
    ) external view returns (bytes32 hash, uint256 timestamp);
}
