// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ISelfMulticall.sol";

interface IExpiringMetaTxForwarder is ISelfMulticall {
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

    function metaTxWithHashIsExecuted(
        bytes32 metaTxHash
    ) external returns (bool);
}