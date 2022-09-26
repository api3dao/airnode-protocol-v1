// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy.sol";

contract PolicyDataFeedProxy is DataFeedProxy {
    constructor(
        address _dapiServer,
        bytes32 _dataFeedId,
        bytes32 _policyHash
    ) DataFeedProxy(_dapiServer, _dataFeedId, _policyHash) {}

    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        return
            IDapiServer(dapiServer).readPolicyDataFeedWithId(
                policyHash,
                dataFeedId
            );
    }
}
