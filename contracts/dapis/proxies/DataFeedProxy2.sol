// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDataFeedProxy2.sol";

/// @title An immutable proxy contract that is used to read a specific data
/// feed (Beacon or Beacon set) of a specific DapiServer contract
/// @dev The proxy contracts are generalized to support most types of numerical
/// data feeds. This means that the user of this proxy is expected to validate
/// the read values according to the specific use-case. For example, `value` is
/// a signed integer, yet it being negative may not make sense in the case that
/// the data feed represents the spot price of an asset. In that case, the user
/// is responsible with ensuring that `value` is not negative.
/// `timestamp` is derived from the system times of the Airnodes that signed
/// the data that contributed to the most recent update (which is not equal to
/// the block time of the most recent update). Its main function is to prevent
/// out of date values from being used to update data feeds. If you will be
/// implementing a contract that uses `timestamp` in the contract logic in any
/// way (e.g., reject readings with `timestamp` that is more than 1 day old),
/// make sure to refer to DapiServer.sol and understand how this number is
/// derived.
contract DataFeedProxy2 is IDataFeedProxy2 {
    /// @notice DapiServer address
    address public immutable override dapiServer;
    /// @notice Data feed ID
    bytes32 public override dataFeedId;

    /// @param _dapiServer DapiServer address
    constructor(address _dapiServer) {
        dapiServer = _dapiServer;
    }

    function initialize(bytes32 _dataFeedId) external override {
        require(dataFeedId == bytes32(0), "Already initialized");
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
        (value, timestamp) = IDapiServer(dapiServer).dataFeeds(dataFeedId);
        require(timestamp > 0, "Data feed not initialized");
    }
}
