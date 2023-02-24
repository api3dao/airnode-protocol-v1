// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./OevDapiServer.sol";
import "./BeaconUpdatesWithSignedData.sol";
import "./BeaconSetUpdatesWithPsp.sol";
import "./interfaces/IApi3ServerV1.sol";

/// @title First version of the contract that API3 uses to serve data feeds
/// @notice Api3ServerV1 serves data feeds in the form of Beacons, Beacon sets,
/// dAPIs, with optional OEV support for all of these.
/// The base Beacons are only updateable using signed data, and the Beacon sets
/// are updateable based on the Beacons, optionally using PSP. OEV proxy.
/// Beacons and Beacon sets are updateable using OEV-signed data.
/// Api3ServerV1 does not support Beacons to be updated using RRP or PSP.
contract Api3ServerV1 is
    OevDapiServer,
    BeaconUpdatesWithSignedData,
    BeaconSetUpdatesWithPsp,
    IApi3ServerV1
{
    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager
    ) OevDapiServer(_accessControlRegistry, _adminRoleDescription, _manager) {}
}
