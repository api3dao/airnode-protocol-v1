// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// import "@api3/airnode-protocol-v1/contracts/utils/SelfMulticall.sol";
import "../utils/SelfMulticall.sol"; // Uncomment line above and remove this line once this is moved to @api3/dapi-management
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/ITimestampedHashRegistry.sol";

contract TimestampedHashRegistry is
    Ownable,
    EIP712,
    SelfMulticall,
    ITimestampedHashRegistry
{
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes32 => EnumerableSet.AddressSet) private _hashTypeToSigners;

    mapping(bytes32 => bytes32) public hashTypeToHash;

    mapping(bytes32 => uint256) public hashTypeToTimestamp;

    bytes32 private constant _SIGNED_HASH_TYPE_HASH =
        keccak256(
            "SignedHash(bytes32 hashType,bytes32 hash,uint256 timestamp)"
        );

    constructor() EIP712("TimestampedHashRegistry", "1.0.0") {}

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

    function _addSigner(bytes32 hashType, address signer) private {
        require(hashType != bytes32(0), "Hash type is zero");
        require(signer != address(0), "Signer is zero");
        require(
            _hashTypeToSigners[hashType].add(signer),
            "Signer already exists"
        );
    }

    function addSigner(
        bytes32 hashType,
        address signer
    ) external override onlyOwner {
        _addSigner(hashType, signer);
        emit AddedSigner(hashType, signer);
    }

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

    function getSigners(
        bytes32 hashType
    ) external view override returns (address[] memory signers) {
        signers = _hashTypeToSigners[hashType].values();
    }

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
