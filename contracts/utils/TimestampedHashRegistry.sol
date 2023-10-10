// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

// import "@api3/airnode-protocol-v1/contracts/utils/SelfMulticall.sol";
import "../utils/SelfMulticall.sol"; // Uncomment line above and remove this line once this is moved to @api3/dapi-management
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/ITimestampedHashRegistry.sol";

/// @title Contract that allows users to manage hashes by type which have been
/// signed by a set of pre-defined signer accounts
/// @notice This is intented to be a generic hash registry. These hashes must be
/// signed by all the signers of a specific hash type. The signatures are
/// validated and checked at the time a call to register the hash is made.
/// This contract enables uses cases like adding data to merkle tree and then
/// registering the root previously singed by a set of trusted accounts. Other
/// contracts can then use the data sent to them only if a root of the merkle tree
/// has been registered in this contract.
/// @dev This contract inherits SelfMulticall meaning that all external functions
/// can be called via multicall() or tryMulticall(). Hashes are expected to be
/// signed following the EIP-712 signature specification.
contract TimestampedHashRegistry is
    Ownable,
    EIP712,
    SelfMulticall,
    ITimestampedHashRegistry
{
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes32 => EnumerableSet.AddressSet) private _hashTypeToSigners;

    /// @notice Hashes by type (i.e. a merkle tree root, etc)
    mapping(bytes32 => bytes32) public hashTypeToHash;
    /// @notice Timestamps representing when each hash was signed
    mapping(bytes32 => uint256) public hashTypeToTimestamp;

    bytes32 private constant _SIGNED_HASH_TYPE_HASH =
        keccak256(
            "SignedHash(bytes32 hashType,bytes32 hash,uint256 timestamp)"
        );

    constructor() EIP712("TimestampedHashRegistry", "1.0.0") {}

    /// @notice Called by the owner to set the hash signers
    /// @param hashType Hash representing a hash type
    /// @param signers Hash signers
    function setupSigners(
        bytes32 hashType,
        address[] calldata signers
    ) external override onlyOwner {
        require(signers.length != 0, "Signers is empty");
        require(
            _hashTypeToSigners[hashType].length() == 0,
            "Hash type signers is not empty"
        );
        for (uint256 ind = 0; ind < signers.length; ind++) {
            _addSigner(hashType, signers[ind]);
        }
        emit SetupSigners(hashType, signers);
    }

    /// @notice Called privately to add a new signer to the set of addresses
    /// @param hashType Hash representing a hash type
    /// @param signer // Signer address
    function _addSigner(bytes32 hashType, address signer) private {
        require(hashType != bytes32(0), "Hash type is zero");
        require(signer != address(0), "Signer is zero");
        require(
            _hashTypeToSigners[hashType].add(signer),
            "Signer already exists"
        );
    }

    /// @notice Called by the owner to add a new signer to the address set
    /// @param hashType Hash representing a hash type
    /// @param signer // Signer address
    function addSigner(
        bytes32 hashType,
        address signer
    ) external override onlyOwner {
        _addSigner(hashType, signer);
        emit AddedSigner(hashType, signer);
    }

    /// @notice Called by the owner to remove a signer from the address set
    /// @dev This operation might change the order in the AddressSet and this
    /// must be considered when trying to register a new hash since signatures
    /// are expected to be received in the same order of the signers stored in
    /// the contract
    /// @param hashType Hash representing a hash type
    /// @param signer // Signer address
    function removeSigner(
        bytes32 hashType,
        address signer
    ) external override onlyOwner {
        require(hashType != bytes32(0), "Hash type is zero");
        require(signer != address(0), "Signer is zero");
        require(
            _hashTypeToSigners[hashType].remove(signer),
            "Signer does not exist"
        );
        emit RemovedSigner(hashType, signer);
    }

    /// @notice Returns the signers that are required to sign the hash for a type
    /// @param hashType Hash representing a hash type
    function getSigners(
        bytes32 hashType
    ) external view override returns (address[] memory signers) {
        signers = _hashTypeToSigners[hashType].values();
    }

    /// @notice Called to register a new hash for a type
    /// @param hashType Hash representing a hash type
    /// @param hash Signed hash
    /// @param timestamp Timestamp when the hash was signed
    /// @param signatures Hash signatures
    function registerHash(
        bytes32 hashType,
        bytes32 hash,
        uint256 timestamp,
        bytes[] calldata signatures
    ) external override {
        require(hashType != bytes32(0), "Hash type is zero");
        require(
            timestamp > hashTypeToTimestamp[hashType],
            "Timestamp is not newer"
        );
        EnumerableSet.AddressSet storage signers = _hashTypeToSigners[hashType];
        uint256 signersCount = signers.length();
        require(signersCount != 0, "Signers have not been set");
        require(
            signatures.length == signersCount,
            "Invalid number of signatures"
        );
        for (uint256 ind = 0; ind < signersCount; ind++) {
            require(
                _hashTypedDataV4(
                    keccak256(
                        abi.encode(
                            _SIGNED_HASH_TYPE_HASH,
                            hashType,
                            hash,
                            timestamp
                        )
                    )
                ).recover(signatures[ind]) == signers.at(ind),
                "Signature mismatch"
            );
        }
        hashTypeToHash[hashType] = hash;
        hashTypeToTimestamp[hashType] = timestamp;
        emit RegisteredHash(hashType, hash, timestamp);
    }
}
