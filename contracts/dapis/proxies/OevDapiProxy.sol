// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DapiProxy.sol";
import "../Median.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract OevDapiProxy is DapiProxy, Median {
    using ECDSA for bytes32;

    struct DataFeed {
        int224 value;
        uint32 timestamp;
    }

    DataFeed public oevDataFeed;
    bytes32 public dataFeedIdAtLatestOevUpdate;

    modifier onlyValidTimestamp(uint256 timestamp) {
        require(timestampIsValid(timestamp), "Timestamp not valid");
        _;
    }

    constructor(
        address _dapiServer,
        bytes32 _dataFeedIdOrDapiNameHash,
        bytes32 _policyHash
    ) DapiProxy(_dapiServer, _dataFeedIdOrDapiNameHash, _policyHash) {}

    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer)
            .readDataFeedWithDapiNameHash(dapiNameHash);
        if (oevDataFeed.timestamp > timestamp) {
            if (
                IDapiServer(dapiServer).dapiNameHashToDataFeedId(
                    dapiNameHash
                ) == dataFeedIdAtLatestOevUpdate
            ) {
                value = oevDataFeed.value;
                timestamp = oevDataFeed.timestamp;
            }
        }
    }

    function oevBeaconUpdate(
        address airnode,
        bytes32 templateId,
        uint256 timestamp,
        bytes memory data,
        uint256 expireTimestamp,
        uint256 bidAmount,
        bytes memory signature
    ) external payable {
        require(
            (
                keccak256(
                    abi.encodePacked(
                        block.chainid,
                        address(this),
                        templateId,
                        timestamp,
                        data,
                        expireTimestamp,
                        bidAmount
                    )
                ).toEthSignedMessageHash()
            ).recover(signature) == airnode,
            "Signature mismatch"
        );
        require(msg.value >= bidAmount, "Insufficient Bid amount");
        dataFeedIdAtLatestOevUpdate = deriveBeaconId(airnode, templateId);
        require(
            IDapiServer(dapiServer).dapiNameHashToDataFeedId(dapiNameHash) ==
                dataFeedIdAtLatestOevUpdate,
            "Wrong data feed"
        );
        int224 updatedBeaconValue = decodeFulfillmentData(data);
        require(
            timestamp > oevDataFeed.timestamp,
            "Fulfillment older than Beacon"
        );
        // Timestamp validity is already checked by `onlyValidTimestamp`, which
        // means it will be small enough to be typecast into `uint32`
        oevDataFeed = DataFeed({
            value: int224(updatedBeaconValue),
            timestamp: uint32(timestamp)
        });
        //emit UpdatedBeaconWithSignedData(beaconId, decodedData, timestamp);
    }

    function oevBeaconSetUpdate(
        address[] memory airnodes,
        bytes32[] memory templateIds,
        uint256[] memory timestamps,
        bytes[] memory data,
        uint256[] memory expireTimestamps,
        uint256[] memory bidAmounts,
        bytes[] memory signatures
    ) external payable {
        uint256 beaconCount = airnodes.length;
        require(beaconCount > 1, "Specified less than two Beacons");
        uint256 totalBid = 0;
        for (uint256 ind = 0; ind < beaconCount; ind++) {
            require(
                (
                    keccak256(
                        abi.encodePacked(
                            block.chainid,
                            address(this),
                            templateIds[ind],
                            timestamps[ind],
                            data[ind],
                            expireTimestamps[ind],
                            bidAmounts[ind]
                        )
                    ).toEthSignedMessageHash()
                ).recover(signatures[ind]) == airnodes[ind],
                "Signature mismatch"
            );
            totalBid += bidAmounts[ind];
        }
        require(msg.value >= totalBid, "Insufficient Bid amount");
        bytes32[] memory beaconIds = new bytes32[](beaconCount);
        int256[] memory values = new int256[](beaconCount);
        uint256 accumulatedTimestamp = 0;
        for (uint256 ind = 0; ind < beaconCount; ind++) {
            if (signatures[ind].length != 0) {
                address airnode = airnodes[ind];
                uint256 timestamp = timestamps[ind];
                require(timestampIsValid(timestamp), "Timestamp not valid");
                values[ind] = decodeFulfillmentData(data[ind]);
                // Timestamp validity is already checked, which means it will
                // be small enough to be typecast into `uint32`
                accumulatedTimestamp += timestamp;
                beaconIds[ind] = deriveBeaconId(airnode, templateIds[ind]);
            } else {
                bytes32 beaconId = deriveBeaconId(
                    airnodes[ind],
                    templateIds[ind]
                );
                (int224 value, uint32 timestamp) = IDapiServer(dapiServer)
                    .dataFeeds(beaconId);
                values[ind] = value;
                accumulatedTimestamp += timestamp;
                beaconIds[ind] = beaconId;
            }
        }
        dataFeedIdAtLatestOevUpdate = deriveBeaconSetId(beaconIds);
        require(
            IDapiServer(dapiServer).dapiNameHashToDataFeedId(dapiNameHash) ==
                dataFeedIdAtLatestOevUpdate,
            "Wrong data feed"
        );
        uint32 updatedTimestamp = uint32(accumulatedTimestamp / beaconCount);
        require(
            updatedTimestamp >= oevDataFeed.timestamp,
            "Updated value outdated"
        );
        int224 updatedValue = int224(median(values));
        oevDataFeed = DataFeed({
            value: updatedValue,
            timestamp: updatedTimestamp
        });
        /*emit UpdatedBeaconSetWithSignedData(
            beaconSetId,
            updatedValue,
            updatedTimestamp
        );*/
    }

    function timestampIsValid(uint256 timestamp) internal view returns (bool) {
        return
            timestamp + 1 hours > block.timestamp &&
            timestamp < block.timestamp + 15 minutes;
    }

    function decodeFulfillmentData(bytes memory data)
        private
        pure
        returns (int224)
    {
        require(data.length == 32, "Data length not correct");
        int256 decodedData = abi.decode(data, (int256));
        require(
            decodedData >= type(int224).min && decodedData <= type(int224).max,
            "Value typecasting error"
        );
        return int224(decodedData);
    }

    function deriveBeaconId(address airnode, bytes32 templateId)
        private
        pure
        returns (bytes32 beaconId)
    {
        require(airnode != address(0), "Airnode address zero");
        require(templateId != bytes32(0), "Template ID zero");
        beaconId = keccak256(abi.encodePacked(airnode, templateId));
    }

    function deriveBeaconSetId(bytes32[] memory beaconIds)
        private
        pure
        returns (bytes32 beaconSetId)
    {
        beaconSetId = keccak256(abi.encode(beaconIds));
    }
}
