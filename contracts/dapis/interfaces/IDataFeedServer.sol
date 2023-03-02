// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IBeaconServer.sol";

interface IDataFeedServer is IBeaconServer {
    event UpdatedBeaconSetWithBeacons(
        bytes32 indexed beaconSetId,
        int224 value,
        uint32 timestamp
    );

    function updateBeaconSetWithBeacons(
        bytes32[] memory beaconIds
    ) external returns (bytes32 beaconSetId);
}
