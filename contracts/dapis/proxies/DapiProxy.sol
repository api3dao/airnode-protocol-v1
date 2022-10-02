// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";

contract DapiProxy is IDapiProxy {
    address public immutable dapiServer;
    address public immutable reader;
    bytes32 public immutable dapiNameHash;
    bytes32 public immutable policyHash;
    address public immutable referral;

    constructor(
        address _dapiServer,
        address _reader,
        bytes32 _dapiName,
        bytes32 _policyHash,
        address _referral
    ) {
        reader = _reader;
        dapiServer = _dapiServer;
        dapiNameHash = keccak256(abi.encodePacked(_dapiName));
        policyHash = _policyHash;
        referral = _referral;
    }

    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        require(
            reader == address(0) || msg.sender == reader,
            "Sender cannot read"
        );
        return
            IDapiServer(dapiServer).readDataFeedWithDapiNameHash(dapiNameHash);
    }
}
