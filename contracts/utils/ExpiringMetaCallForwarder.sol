// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./SelfMulticall.sol";

/// @notice Contract that forwards expiring meta-calls to ERC2771 contracts
/// that trust it
/// @dev The term "meta-call" is used as a subset of "meta-tx" where `value`
/// is zero and `to` is a contract.
/// Adapted from OpenZeppelin's MinimalForwarder.sol.
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
    /// @dev This implementation is intended for use-cases where both `from`
    /// and the meta-call executor benefit from the meta-call being executed
    /// directly (e.g., `from` wants to authorize the executor but does not
    /// have funds, so they give the executor a meta-call to execute on their
    /// behalf). This means a lot of the security considerations that apply in
    /// general relayer network implementations are irrelevant here.
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
            "Signature mismatch"
        );
        metaCallWithHashIsExecuted[metaCallHash] = true;
        returndata = metaCall.to.functionCall(
            abi.encodePacked(metaCall.data, metaCall.from)
        );
    }
}
