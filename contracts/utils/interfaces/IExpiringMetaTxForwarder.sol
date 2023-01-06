// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IExpiringMetaTxForwarder {
    event ExecutedMetaTx(bytes32 indexed metaTxHash);

    event NullifiedMetaTx(bytes32 indexed metaTxHash);

    struct ExpiringMetaTx {
        address from;
        address to;
        bytes data;
        uint256 expirationTimestamp;
    }

    function execute(
        ExpiringMetaTx calldata metaTx,
        bytes calldata signature
    ) external returns (bytes memory returndata);

    function nullify(ExpiringMetaTx calldata metaTx) external;

    function metaTxWithHashIsExecutedOrNullified(
        bytes32 metaTxHash
    ) external returns (bool);
}
