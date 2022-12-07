// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IProxy.sol";

contract DapiProxy is IProxy {
    address public immutable dapiServer;
    bytes32 public immutable dapiNameHash;

    constructor(address _dapiServer, bytes32 _dapiName) {
        dapiServer = _dapiServer;
        dapiNameHash = keccak256(abi.encodePacked(_dapiName));
    }

    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer)
            .readDataFeedWithDapiNameHash(dapiNameHash);
        require(timestamp > 0, "dAPI not initialized");
    }
}