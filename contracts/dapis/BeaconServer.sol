// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../utils/ExtendedSelfMulticall.sol";
import "./interfaces/IBeaconServer.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Contract that serves Beacons
/// @notice A Beacon is a live data feed addressed by an ID, which is derived
/// from an Airnode address and a template ID. This is suitable where the more
/// recent data point is always more favorable, e.g., in the context of an
/// asset price data feed. Beacons can also be seen as one-Airnode data feeds
/// that can be used individually.
contract BeaconServer is ExtendedSelfMulticall, IBeaconServer {
    using ECDSA for bytes32;

    // Airnodes serve their fulfillment data along with timestamps. This
    // contract casts the reported data to `int224` and the timestamp to
    // `uint32`, which works until year 2106.
    struct DataFeed {
        int224 value;
        uint32 timestamp;
    }

    /// @notice Data feed with ID
    mapping(bytes32 => DataFeed) internal _dataFeeds;

    /// @dev Reverts if the timestamp is from more than 1 hour in the future
    modifier onlyValidTimestamp(uint256 timestamp) virtual {
        unchecked {
            require(
                timestamp < block.timestamp + 1 hours,
                "Timestamp not valid"
            );
        }
        _;
    }

    /// @notice Reads the data feed with ID
    /// @param dataFeedId Data feed ID
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function _readDataFeedWithId(
        bytes32 dataFeedId
    ) internal view returns (int224 value, uint32 timestamp) {
        DataFeed storage dataFeed = _dataFeeds[dataFeedId];
        (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
        require(timestamp > 0, "Data feed not initialized");
    }

    /// @notice Derives the Beacon ID from the Airnode address and template ID
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @return beaconId Beacon ID
    function deriveBeaconId(
        address airnode,
        bytes32 templateId
    ) internal pure returns (bytes32 beaconId) {
        beaconId = keccak256(abi.encodePacked(airnode, templateId));
    }

    /// @notice Called privately to process the Beacon update
    /// @param beaconId Beacon ID
    /// @param timestamp Timestamp used in the signature
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    /// @return updatedBeaconValue Updated Beacon value
    function processBeaconUpdate(
        bytes32 beaconId,
        uint256 timestamp,
        bytes calldata data
    )
        internal
        onlyValidTimestamp(timestamp)
        returns (int224 updatedBeaconValue)
    {
        updatedBeaconValue = decodeFulfillmentData(data);
        require(
            timestamp > _dataFeeds[beaconId].timestamp,
            "Does not update timestamp"
        );
        _dataFeeds[beaconId] = DataFeed({
            value: updatedBeaconValue,
            timestamp: uint32(timestamp)
        });
    }

    /// @notice Called privately to decode the fulfillment data
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    /// @return decodedData Decoded fulfillment data
    function decodeFulfillmentData(
        bytes memory data
    ) internal pure returns (int224) {
        require(data.length == 32, "Data length not correct");
        int256 decodedData = abi.decode(data, (int256));
        require(
            decodedData >= type(int224).min && decodedData <= type(int224).max,
            "Value typecasting error"
        );
        return int224(decodedData);
    }
}
