// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";

contract DataFeedProxy is IDapiProxy {
    address public immutable dapiServer;
    address public immutable reader;
    bytes32 public immutable dataFeedId;
    bytes32 public immutable policyHash;
    address public immutable referral;

    constructor(
        address _dapiServer,
        address _reader,
        bytes32 _dataFeedId,
        bytes32 _policyHash,
        address _referral
    ) {
        dapiServer = _dapiServer;
        reader = _reader;
        dataFeedId = _dataFeedId;
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
        return IDapiServer(dapiServer).readDataFeedWithId(dataFeedId);
    }
}
