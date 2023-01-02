// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SelfMulticall.sol";

/// @notice Contract that forwards expiring meta-calls to ERC2771 contracts
/// that trust it
/// @dev The term "meta-call" is used as a subset of "meta-tx" where
/// `msg.value` is zero and `to` is a contract.
/// The contract does not implement a signer-specific nonce for meta-calls to
/// be executable in an arbitrary order. For example, one can sign two
/// meta-calls that will whitelist an account each, and deliver these to the
/// respective owners of the accounts. This implementation allows the parties
/// to not care about if and when the meta-calls are executed. The signer is
/// responsible with not issuing signatures that may cause undesired race
/// conditions.
/// This implementation is not intended for general-purpose relayer networks.
contract ExpiringMetaCallForwarder is EIP712, SelfMulticall {
    using ECDSA for bytes32;
    using Address for address;

    struct ExpiringMetaCall {
        address from;
        address to;
        bytes data;
        uint256 expirationTimestamp;
    }

    /// @notice If the meta-call with hash is already executed
    mapping(bytes32 => bool) public metaCallWithHashIsExecuted;

    bytes32 private constant _TYPEHASH =
        keccak256(
            "ExpiringMetaCall(address from,address to,bytes data,uint256 expirationTimestamp)"
        );

    constructor() EIP712("ExpiringMetaCallForwarder", "1.0.0") {}

    /// @notice Verifies the signature and executes the meta-call
    /// @param metaCall Meta-call
    /// @param signature Meta-call hash signed by `from`
    /// @return returndata Returndata
    function execute(
        ExpiringMetaCall calldata metaCall,
        bytes calldata signature
    ) external returns (bytes memory returndata) {
        bytes32 metaCallHash = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    _TYPEHASH,
                    metaCall.from,
                    metaCall.to,
                    keccak256(metaCall.data),
                    metaCall.expirationTimestamp
                )
            )
        );
        require(
            !metaCallWithHashIsExecuted[metaCallHash],
            "Meta-call already executed"
        );
        require(
            metaCall.expirationTimestamp > block.timestamp,
            "Meta-call expired"
        );
        require(
            metaCallHash.recover(signature) == metaCall.from,
            "Invalid signature"
        );
        metaCallWithHashIsExecuted[metaCallHash] = true;
        returndata = metaCall.to.functionCall(
            abi.encodePacked(metaCall.data, metaCall.from)
        );
    }
}
