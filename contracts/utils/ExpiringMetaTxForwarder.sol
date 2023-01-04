// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SelfMulticall.sol";
import "./interfaces/IExpiringMetaTxForwarder.sol";

/// @title Contract that forwards expiring meta-txes to ERC2771 contracts that
/// trust it
/// @notice `msg.value` is not supported. Target account must be a contract. This
/// implementation is not intended to be used with general-purpose relayer
/// networks. Instead, it is meant for use-cases where the relayer wants the
/// signer to send a tx, so they request a meta-tx and execute it themselves to
/// cover the gas cost.
/// @dev This implementation does not use signer-specific nonces for meta-txes
/// to be executable in an arbitrary order. For example, one can sign two
/// meta-txes that will whitelist an account each and deliver these to the
/// respective owners of the accounts. This implementation allows the account
/// owners to not care about if and when the other meta-tx is executed. The
/// signer is responsible not issuing signatures that may cause undesired race
/// conditions.
contract ExpiringMetaTxForwarder is
    EIP712,
    SelfMulticall,
    IExpiringMetaTxForwarder
{
    using ECDSA for bytes32;
    using Address for address;

    /// @notice If the meta-tx with hash is already executed
    mapping(bytes32 => bool) public override metaTxWithHashIsExecuted;

    bytes32 private constant _TYPEHASH =
        keccak256(
            "ExpiringMetaTx(address from,address to,bytes data,uint256 expirationTimestamp)"
        );

    constructor() EIP712("ExpiringMetaTxForwarder", "1.0.0") {}

    /// @notice Verifies the signature and executes the meta-tx
    /// @param metaTx Meta-tx
    /// @param signature Meta-tx hash signed by `from`
    /// @return returndata Returndata
    function execute(
        ExpiringMetaTx calldata metaTx,
        bytes calldata signature
    ) external override returns (bytes memory returndata) {
        bytes32 metaTxHash = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    _TYPEHASH,
                    metaTx.from,
                    metaTx.to,
                    keccak256(metaTx.data),
                    metaTx.expirationTimestamp
                )
            )
        );
        require(
            !metaTxWithHashIsExecuted[metaTxHash],
            "Meta-tx already executed"
        );
        require(
            metaTx.expirationTimestamp > block.timestamp,
            "Meta-tx expired"
        );
        require(
            metaTxHash.recover(signature) == metaTx.from,
            "Invalid signature"
        );
        metaTxWithHashIsExecuted[metaTxHash] = true;
        returndata = metaTx.to.functionCall(
            abi.encodePacked(metaTx.data, metaTx.from)
        );
    }
}
