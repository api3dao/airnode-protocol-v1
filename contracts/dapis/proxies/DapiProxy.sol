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
/// In the case that the data feed is from a single source, `timestamp` is the
/// system time of the Airnode when it signed the data. In the case that the
/// data feed is from multiple sources, `timestamp` is the median of system
/// times of the respective Airnodes when they signed the data. There are two
/// points to consider while using `timestamp` in your contract logic: (1) It
/// is based on the system time of the Airnodes, and not the block timestamp.
/// This may be relevant when either of them drifts. (2) `timestamp` is an
/// off-chain value that is being reported, similar to `value`. Both should
/// only be trusted as much as the Airnode(s) that report them.
contract DapiProxy is IDapiProxy {
    /// @notice DapiServer address
    address public immutable override dapiServer;
    /// @notice Hash of the dAPI name
    bytes32 public immutable override dapiNameHash;

    /// @param _dapiServer DapiServer address
    /// @param _dapiNameHash Hash of the dAPI name
    constructor(address _dapiServer, bytes32 _dapiNameHash) {
        dapiServer = _dapiServer;
        dapiNameHash = _dapiNameHash;
    }

    /// @notice Reads the dAPI that this proxy maps to
    /// @return value dAPI value
    /// @return timestamp dAPI timestamp
    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer)
            .readDataFeedWithDapiNameHash(dapiNameHash);
    }
}
