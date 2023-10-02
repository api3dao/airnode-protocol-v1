// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/ITimestampedHashRegistry.sol";

// TODO: would SelfMulticall be useful?
contract TimestampedHashRegistry is Ownable, EIP712, ITimestampedHashRegistry {
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes32 => EnumerableSet.AddressSet) private _hashTypeHashToSigners;

    mapping(bytes32 => SignedHash) public hashTypeToSignedHash;

    bytes32 private constant _SIGNED_HASH_TYPE_HASH =
        keccak256(
            "SignedHash(bytes32 hashType,bytes32 hash,uint256 timestamp)"
        );

    constructor() EIP712("TimestampedHashRegistry", "1.0.0") {}

    function setHashTypeSigners(
        bytes32 hashType,
        address[] calldata signers
    ) external onlyOwner {
        require(hashType != bytes32(0), "Hash is zero");
        require(signers.length != 0, "Signers length is empty");
        for (uint256 ind = 0; ind < signers.length; ind++) {
            _hashTypeHashToSigners[hashType].add(signers[ind]);
        }
        emit HashTypeSignersSet(hashType, signers);
    }

    function registerSignedHash(
        bytes32 hashType,
        SignedHash calldata signedHash,
        bytes[] calldata signatures
    ) external {
        require(hashType != bytes32(0), "Hash type is zero");
        EnumerableSet.AddressSet storage signers = _hashTypeHashToSigners[
            hashType
        ];
        require(signers.length() != 0, "Signers have not been set");
        require(
            signatures.length == signers.length(),
            "Signatures length mismatch"
        );
        for (uint256 ind = 0; ind < signatures.length; ind++) {
            require(
                signers.contains(
                    _hashTypedDataV4(
                        keccak256(
                            abi.encode(
                                _SIGNED_HASH_TYPE_HASH,
                                hashType,
                                signedHash.hash,
                                signedHash.timestamp
                            )
                        )
                    ).recover(signatures[ind])
                ),
                "Signature mismatch"
            );
        }
        hashTypeToSignedHash[hashType] = SignedHash(
            signedHash.hash,
            signedHash.timestamp
        );
        emit SignedHashRegistered(
            hashType,
            signedHash.hash,
            signedHash.timestamp,
            signatures
        );
    }

    function getSigners(
        bytes32 hashType
    ) external view returns (address[] memory signers) {
        signers = _hashTypeHashToSigners[hashType].values();
    }
}
