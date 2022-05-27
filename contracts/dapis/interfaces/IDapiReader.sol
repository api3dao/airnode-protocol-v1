// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IDapiServer.sol";

interface IDapiReader {
    function dapiServer() external view returns (address);
}
