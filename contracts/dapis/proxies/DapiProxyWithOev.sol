// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DapiProxy.sol";
import "./interfaces/IOevProxy.sol";

/// @title An immutable proxy contract that is used to read a specific dAPI of
/// a specific DapiServer contract, execute OEV updates and let the beneficiary
/// withdraw the accumulated proceeds
/// @dev See DapiProxy.sol for comments about usage
contract DapiProxyWithOev is DapiProxy, IOevProxy {
    /// @notice OEV beneficiary address
    address public immutable override oevBeneficiary;

    /// @param _dapiServer DapiServer address
    /// @param _dapiNameHash Hash of the dAPI name
    /// @param _oevBeneficiary OEV beneficiary
    constructor(
        address _dapiServer,
        bytes32 _dapiNameHash,
        address _oevBeneficiary
    ) DapiProxy(_dapiServer, _dapiNameHash) {
        oevBeneficiary = _oevBeneficiary;
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
            .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
    }
}
