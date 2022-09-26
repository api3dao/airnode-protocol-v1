// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DapiProxy.sol";

contract PolicyDapiProxy is DapiProxy {
    constructor(
        address _dapiServer,
        bytes32 _dataFeedIdOrDapiNameHash,
        bytes32 _policyHash
    ) DapiProxy(_dapiServer, _dataFeedIdOrDapiNameHash, _policyHash) {}

    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        return
            IDapiServer(dapiServer).readPolicyDataFeedWithDapiNameHash(
                policyHash,
                dapiNameHash
            );
    }
}
