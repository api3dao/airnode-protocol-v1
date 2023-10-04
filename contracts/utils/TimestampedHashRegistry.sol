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

    mapping(bytes32 => SignedHash) public hashTypeToSignedHash;

    bytes32 private constant _SIGNED_HASH_TYPE_HASH =
        keccak256(
            "SignedHash(bytes32 hashType,bytes32 hash,uint256 timestamp)"
        );

    constructor() EIP712("TimestampedHashRegistry", "1.0.0") {}

    function addSigner(bytes32 hashType, address signer) external onlyOwner {
        require(hashType != bytes32(0), "Hash type is zero");
        require(signer != address(0), "Signer is zero");
        require(
            _hashTypeToSigners[keccak256(abi.encodePacked(hashType))].add(
                signer
            ),
            "Signer already exists"
        );
        emit AddedSigner(hashType, signer);
    }

    function removeSigner(bytes32 hashType, address signer) external onlyOwner {
        require(hashType != bytes32(0), "Hash type is zero");
        require(signer != address(0), "Signer is zero");
        require(
            _hashTypeToSigners[keccak256(abi.encodePacked(hashType))].remove(
                signer
            ),
            "Signer does not exist"
        );
        emit RemovedSigner(hashType, signer);
    }

    function getSigners(
        bytes32 hashType
    ) external view returns (address[] memory signers) {
        signers = _hashTypeToSigners[keccak256(abi.encodePacked(hashType))]
            .values();
    }

    function registerSignedHash(
        bytes32 hashType,
        SignedHash calldata signedHash,
        bytes[] calldata signatures
    ) external {
        require(hashType != bytes32(0), "Hash type is zero");
        EnumerableSet.AddressSet storage signers = _hashTypeToSigners[
            keccak256(abi.encodePacked(hashType))
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
        hashTypeToSignedHash[
            keccak256(abi.encodePacked(hashType))
        ] = SignedHash(signedHash.hash, signedHash.timestamp);
        emit RegisteredSignedHash(
            hashType,
            signedHash.hash,
            signedHash.timestamp
        );
    }
}
