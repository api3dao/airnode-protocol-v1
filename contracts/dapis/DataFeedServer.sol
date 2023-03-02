// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./BeaconServer.sol";
import "./Median.sol";
import "./interfaces/IDataFeedServer.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Contract that serves Beacons and Beacon sets
/// @notice Beacons can be seen as one-Airnode data feeds that can be used
/// individually or combined to build Beacon sets
contract DataFeedServer is BeaconServer, Median, IDataFeedServer {
    using ECDSA for bytes32;

    /// @notice Updates the Beacon set using the current values of its Beacons
    /// @dev As an oddity, this function still works if some of the IDs in
    /// `beaconIds` belong to Beacon sets rather than Beacons. This can be used
    /// to implement hierarchical Beacon sets.
    /// @param beaconIds Beacon IDs
    /// @return beaconSetId Beacon set ID
    function updateBeaconSetWithBeacons(
        bytes32[] memory beaconIds
    ) public override returns (bytes32 beaconSetId) {
        (int224 updatedValue, uint32 updatedTimestamp) = aggregateBeacons(
            beaconIds
        );
        beaconSetId = deriveBeaconSetId(beaconIds);
        DataFeed storage beaconSet = _dataFeeds[beaconSetId];
        if (beaconSet.timestamp == updatedTimestamp) {
            require(
                beaconSet.value != updatedValue,
                "Does not update Beacon set"
            );
        }
        _dataFeeds[beaconSetId] = DataFeed({
            value: updatedValue,
            timestamp: updatedTimestamp
        });
        emit UpdatedBeaconSetWithBeacons(
            beaconSetId,
            updatedValue,
            updatedTimestamp
        );
    }

    /// @notice Derives the Beacon set ID from the Beacon IDs
    /// @dev Notice that `abi.encode()` is used over `abi.encodePacked()`
    /// @param beaconIds Beacon IDs
    /// @return beaconSetId Beacon set ID
    function deriveBeaconSetId(
        bytes32[] memory beaconIds
    ) internal pure returns (bytes32 beaconSetId) {
        beaconSetId = keccak256(abi.encode(beaconIds));
    }

    /// @notice Called privately to aggregate the Beacons and return the result
    /// @param beaconIds Beacon IDs
    /// @return value Aggregation value
    /// @return timestamp Aggregation timestamp
    function aggregateBeacons(
        bytes32[] memory beaconIds
    ) internal view returns (int224 value, uint32 timestamp) {
        uint256 beaconCount = beaconIds.length;
        require(beaconCount > 1, "Specified less than two Beacons");
        int256[] memory values = new int256[](beaconCount);
        int256[] memory timestamps = new int256[](beaconCount);
        for (uint256 ind = 0; ind < beaconCount; ) {
            DataFeed storage dataFeed = _dataFeeds[beaconIds[ind]];
            values[ind] = dataFeed.value;
            timestamps[ind] = int256(uint256(dataFeed.timestamp));
            unchecked {
                ind++;
            }
        }
        value = int224(median(values));
        timestamp = uint32(uint256(median(timestamps)));
    }
}
