// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";

/// @title An immutable proxy contract that is used to read a specific dAPI of
/// a specific DapiServer contract
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
contract DapiProxy is IDapiProxy {
    /// @notice DapiServer address
    address public immutable override dapiServer;
    /// @notice Hash of the dAPI name
    bytes32 public immutable override dapiNameHash;

    /// @param _dapiServer DapiServer address
    /// @param _dapiName dAPI name
    constructor(address _dapiServer, bytes32 _dapiName) {
        dapiServer = _dapiServer;
        dapiNameHash = keccak256(abi.encodePacked(_dapiName));
    }

    /// @notice Reads the dAPI that this proxy maps to
    /// @return value dAPI value
    /// @return timestamp dAPI timestamp
    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer)
            .readDataFeedWithDapiNameHash(dapiNameHash);
        require(timestamp > 0, "dAPI not initialized");
    }
}
