// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";

contract DapiProxy is IDapiProxy {
    address public immutable dapiServer;
    bytes32 public immutable dapiNameHash;
    bytes32 public immutable policyHash;

    constructor(
        address _dapiServer,
        bytes32 _dapiName,
        bytes32 _policyHash
    ) {
        dapiServer = _dapiServer;
        dapiNameHash = keccak256(abi.encodePacked(_dapiName));
        policyHash = _policyHash;
    }

    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        return
            IDapiServer(dapiServer).readDataFeedWithDapiNameHash(dapiNameHash);
    }
}
