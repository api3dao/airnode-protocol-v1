// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IOevDataFeedServer.sol";
import "./IDapiServer.sol";

interface IOevDapiServer is IOevDataFeedServer, IDapiServer {
    function readDataFeedWithDapiNameHashAsOevProxy(
        bytes32 dapiNameHash
    ) external view returns (int224 value, uint32 timestamp);
}
