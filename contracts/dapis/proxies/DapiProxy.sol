// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";

contract DapiProxy is IDapiProxy {
    address public immutable override dapiServer;
    bytes32 public immutable override dapiNameHash;

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
