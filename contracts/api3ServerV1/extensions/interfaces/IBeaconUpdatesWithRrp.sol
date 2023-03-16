// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../interfaces/IDataFeedServer.sol";

interface IBeaconUpdatesWithRrp is IDataFeedServer {
    event SetRrpBeaconUpdatePermissionStatus(
        address indexed sponsor,
        address indexed requester,
        bool status
    );

    event RequestedRrpBeaconUpdate(
        bytes32 indexed beaconId,
        address airnode,
        bytes32 templateId,
        address sponsor,
        bytes32 requestId,
        address requester
    );

    event RequestedRelayedRrpBeaconUpdate(
        bytes32 indexed beaconId,
        address airnode,
        bytes32 templateId,
        address relayer,
        address sponsor,
        bytes32 requestId,
        address requester
    );

    event UpdatedBeaconWithRrp(
        bytes32 indexed beaconId,
        bytes32 requestId,
        int224 value,
        uint32 timestamp
    );

    function setRrpBeaconUpdatePermissionStatus(
        address rrpBeaconUpdateRequester,
        bool status
    ) external;

    function requestRrpBeaconUpdateWithTemplate(
        address airnode,
        bytes32 templateId,
        address sponsor
    ) external returns (bytes32 requestId);

    function requestRrpBeaconUpdateWithEndpoint(
        address airnode,
        bytes32 endpointId,
        bytes calldata parameters,
        address sponsor
    ) external returns (bytes32 requestId);

    function requestRelayedRrpBeaconUpdateWithTemplate(
        address airnode,
        bytes32 templateId,
        address relayer,
        address sponsor
    ) external returns (bytes32 requestId);

    function requestRelayedRrpBeaconUpdateWithEndpoint(
        address airnode,
        bytes32 endpointId,
        bytes calldata parameters,
        address relayer,
        address sponsor
    ) external returns (bytes32 requestId);

    function fulfillRrpBeaconUpdate(
        bytes32 requestId,
        uint256 timestamp,
        bytes calldata data
    ) external;

    function airnodeProtocol() external view returns (address);

    function sponsorToRrpBeaconUpdateRequesterToPermissionStatus(
        address sponsor,
        address updateRequester
    ) external view returns (bool);
}
