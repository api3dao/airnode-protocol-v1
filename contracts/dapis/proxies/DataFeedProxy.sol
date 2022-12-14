// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDataFeedProxy.sol";

contract DataFeedProxy is IDataFeedProxy {
    address public immutable override dapiServer;
    bytes32 public immutable override dataFeedId;

    constructor(address _dapiServer, bytes32 _dataFeedId) {
        dapiServer = _dapiServer;
        dataFeedId = _dataFeedId;
    }

    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer).dataFeeds(dataFeedId);
        require(timestamp > 0, "Data feed not initialized");
    }
}
