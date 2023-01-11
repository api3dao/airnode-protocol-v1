// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDataFeedProxy.sol";

/// @title An immutable proxy contract that is used to read a specific data
/// feed (Beacon or Beacon set) of a specific DapiServer contract
/// @dev See DapiProxy.sol for comments about usage
contract DataFeedProxy is IDataFeedProxy {
    /// @notice DapiServer address
    address public immutable override dapiServer;
    /// @notice Data feed ID
    bytes32 public immutable override dataFeedId;

    /// @param _dapiServer DapiServer address
    /// @param _dataFeedId Data feed (Beacon or Beacon set) ID
    constructor(address _dapiServer, bytes32 _dataFeedId) {
        dapiServer = _dapiServer;
        dataFeedId = _dataFeedId;
    }

    /// @notice Reads the data feed that this proxy maps to
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer).readDataFeedWithId(
            dataFeedId
        );
    }
}
