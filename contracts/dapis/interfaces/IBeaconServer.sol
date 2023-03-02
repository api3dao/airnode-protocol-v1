// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../utils/interfaces/IExtendedSelfMulticall.sol";

interface IBeaconServer is IExtendedSelfMulticall {
    event UpdatedBeaconWithSignedData(
        bytes32 indexed beaconId,
        int224 value,
        uint32 timestamp
    );
}
