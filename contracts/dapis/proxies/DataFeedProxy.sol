// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";

contract DataFeedProxy is IDapiProxy {
    address public immutable dapiServer;
    bytes32 public immutable dataFeedId;
    bytes32 public immutable policyHash;

    constructor(
        address _dapiServer,
        bytes32 _dataFeedId,
        bytes32 _policyHash
    ) {
        dapiServer = _dapiServer;
        dataFeedId = _dataFeedId;
        policyHash = _policyHash;
    }

    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        return IDapiServer(dapiServer).readDataFeedWithId(dataFeedId);
    }
}
