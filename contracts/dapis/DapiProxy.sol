// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiServer.sol";

contract DapiProxy {
    address public immutable dapiServer;
    bytes32 public immutable dataFeedIdOrDapiNameHash;
    bytes32 public immutable policyHash;

    constructor(
        address _dapiServer,
        bytes32 _dataFeedIdOrDapiNameHash,
        bytes32 _policyHash
    ) {
        dapiServer = _dapiServer;
        dataFeedIdOrDapiNameHash = _dataFeedIdOrDapiNameHash;
        policyHash = _policyHash;
    }

    function read()
        external
        view
        virtual
        returns (int224 value, uint32 timestamp)
    {
        return IDapiServer(dapiServer).readDataFeed(dataFeedIdOrDapiNameHash);
    }
}
