// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../interfaces/IDapiServer.sol";

interface IProxy {
    function read() external view returns (int224 value, uint32 timestamp);

    function dapiServer() external view returns (address);
}
