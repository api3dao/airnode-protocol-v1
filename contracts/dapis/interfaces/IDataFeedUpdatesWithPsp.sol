// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IBeaconSetUpdatesWithPsp.sol";

interface IDataFeedUpdatesWithPsp is IBeaconSetUpdatesWithPsp {
    event RegisteredBeaconUpdateSubscription(
        bytes32 indexed beaconId,
        bytes32 subscriptionId,
        address airnode,
        bytes32 templateId,
        bytes conditions,
        address relayer,
        address sponsor
    );

    event UpdatedBeaconWithPsp(
        bytes32 indexed beaconId,
        bytes32 subscriptionId,
        int224 value,
        uint32 timestamp
    );

    function registerBeaconUpdateSubscription(
        address airnode,
        bytes32 templateId,
        bytes memory conditions,
        address relayer,
        address sponsor
    ) external returns (bytes32 subscriptionId);

    function conditionPspBeaconUpdate(
        bytes32 subscriptionId,
        bytes calldata data,
        bytes calldata conditionParameters
    ) external view returns (bool);

    function fulfillPspBeaconUpdate(
        bytes32 subscriptionId,
        address airnode,
        address relayer,
        address sponsor,
        uint256 timestamp,
        bytes calldata data,
        bytes calldata signature
    ) external;

    function subscriptionIdToBeaconId(
        bytes32 subscriptionId
    ) external view returns (bytes32);
}
