// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IExpiringMetaTxForwarder.sol";

/// @title Contract that forwards expiring meta-txes to ERC2771 contracts that
/// trust it
/// @notice `msg.value` is not supported. Identical meta-txes are not
/// supported. Target account must be a contract. Signer of the meta-tx is
/// allowed to cancel it before execution, effectively rendering the signature
/// useless.
/// This implementation is not intended to be used with general-purpose relayer
/// networks. Instead, it is meant for use-cases where the relayer wants the
/// signer to send a tx, so they request a meta-tx and execute it themselves to
/// cover the gas cost.
/// @dev This implementation does not use signer-specific nonces for meta-txes
/// to be executable in an arbitrary order. For example, one can sign two
/// meta-txes that will whitelist an account each and deliver these to the
/// respective owners of the accounts. This implementation allows the account
/// owners to not care about if and when the other meta-tx is executed. The
/// signer is responsible for not issuing signatures that may cause undesired
/// race conditions.
contract ExpiringMetaTxForwarder is Context, EIP712, IExpiringMetaTxForwarder {
    using ECDSA for bytes32;
    using Address for address;

    /// @notice If the meta-tx with hash is executed or canceled
    /// @dev We track this on a meta-tx basis and not by using nonces to avoid
    /// requiring users keep track of nonces
    mapping(bytes32 => bool) public override metaTxWithHashIsExecutedOrCanceled;

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
        bytes32 metaTxHash = processMetaTx(metaTx);
        require(
            metaTxHash.recover(signature) == metaTx.from,
            "Invalid signature"
        );
        emit ExecutedMetaTx(metaTxHash);
        returndata = metaTx.to.functionCall(
            abi.encodePacked(metaTx.data, metaTx.from)
        );
    }

    /// @notice Called by a meta-tx source to prevent it from being executed
    /// @dev This can be used to cancel meta-txes that were issued
    /// accidentally, e.g., with an unreasonably large expiration timestamp,
    /// which may create a dangling liability
    /// @param metaTx Meta-tx
    function cancel(ExpiringMetaTx calldata metaTx) external override {
        require(_msgSender() == metaTx.from, "Sender not meta-tx source");
        emit CanceledMetaTx(processMetaTx(metaTx));
    }

    /// @notice Checks if the meta-tx is valid, invalidates it for future
    /// execution or nullification, and returns the meta-tx hash
    /// @param metaTx Meta-tx
    /// @return metaTxHash Meta-tx hash
    function processMetaTx(
        ExpiringMetaTx calldata metaTx
    ) private returns (bytes32 metaTxHash) {
        metaTxHash = _hashTypedDataV4(
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
            !metaTxWithHashIsExecutedOrCanceled[metaTxHash],
            "Meta-tx executed or canceled"
        );
        require(
            metaTx.expirationTimestamp > block.timestamp,
            "Meta-tx expired"
        );
        metaTxWithHashIsExecutedOrCanceled[metaTxHash] = true;
    }
}
