// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IProxy.sol";

interface IDapiProxy2 is IProxy {
    function dapiNameHash() external view returns (bytes32);

    function initialize(bytes32 dapiName) external;
}
