// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiServer.sol";

contract DapiProxy {
    address public immutable dapiServer;
    bytes32 public immutable dataFeedIdOrDapiNameHash;
    string public metadata;

    constructor(
        address _dapiServer,
        bytes32 _dataFeedIdOrDapiNameHash,
        string memory _metadata
    ) {
        dapiServer = _dapiServer;
        dataFeedIdOrDapiNameHash = _dataFeedIdOrDapiNameHash;
        metadata = _metadata; // Includes policy hash
    }

    function readDataFeed()
        external
        view
        virtual
        returns (int224 value, uint32 timestamp)
    {
        return IDapiServer(dapiServer).readDataFeed(dataFeedIdOrDapiNameHash);
    }
}
