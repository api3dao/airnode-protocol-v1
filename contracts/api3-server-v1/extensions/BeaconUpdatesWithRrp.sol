// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../DataFeedServer.sol";
import "./interfaces/IBeaconUpdatesWithRrp.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../../protocol/interfaces/IAirnodeProtocol.sol";

/// @title Contract that updates Beacons using regular and relayed RRP
contract BeaconUpdatesWithRrp is DataFeedServer, IBeaconUpdatesWithRrp {
    using ECDSA for bytes32;

    /// @notice AirnodeProtocol contract address
    address public immutable override airnodeProtocol;

    /// @notice If a sponsor has permitted an account to request RRP-based
    /// updates at this contract
    mapping(address => mapping(address => bool))
        public
        override sponsorToRrpBeaconUpdateRequesterToPermissionStatus;

    mapping(bytes32 => bytes32) private requestIdToBeaconId;

    /// @dev Reverts if the sender is not the AirnodeProtocol contract
    modifier onlyAirnodeProtocol() {
        require(
            msg.sender == address(airnodeProtocol),
            "Sender not Airnode protocol"
        );
        _;
    }

    /// @dev Reverts if the sender is not permitted to request an RRP-based
    /// update with the sponsor and is not the sponsor
    /// @param sponsor Sponsor address
    modifier onlyPermittedUpdateRequester(address sponsor) {
        require(
            sponsor == msg.sender ||
                sponsorToRrpBeaconUpdateRequesterToPermissionStatus[sponsor][
                    msg.sender
                ],
            "Sender not permitted"
        );
        _;
    }

    /// @param _airnodeProtocol AirnodeProtocol contract address
    constructor(address _airnodeProtocol) {
        require(_airnodeProtocol != address(0), "AirnodeProtocol address zero");
        airnodeProtocol = _airnodeProtocol;
    }

    /// @notice Called by the sponsor to set the update request permission
    /// status of an account
    /// @param rrpBeaconUpdateRequester RRP-based Beacon update requester
    /// address
    /// @param status Permission status
    function setRrpBeaconUpdatePermissionStatus(
        address rrpBeaconUpdateRequester,
        bool status
    ) external override {
        require(
            rrpBeaconUpdateRequester != address(0),
            "Update requester zero"
        );
        sponsorToRrpBeaconUpdateRequesterToPermissionStatus[msg.sender][
            rrpBeaconUpdateRequester
        ] = status;
        emit SetRrpBeaconUpdatePermissionStatus(
            msg.sender,
            rrpBeaconUpdateRequester,
            status
        );
    }

    /// @notice Creates an RRP request for the Beacon to be updated
    /// @dev In addition to the sponsor sponsoring this contract (by calling
    /// `setRrpSponsorshipStatus()`), the sponsor must also give update request
    /// permission to the sender (by calling
    /// `setRrpBeaconUpdatePermissionStatus()`) before this method is called.
    /// The template must specify a single point of data of type `int256` to be
    /// returned and for it to be small enough to be castable to `int224`
    /// because this is what `fulfillRrpBeaconUpdate()` expects.
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @param sponsor Sponsor address
    /// @return requestId Request ID
    function requestRrpBeaconUpdateWithTemplate(
        address airnode,
        bytes32 templateId,
        address sponsor
    )
        external
        override
        onlyPermittedUpdateRequester(sponsor)
        returns (bytes32 requestId)
    {
        bytes32 beaconId = deriveBeaconId(airnode, templateId);
        requestId = IAirnodeProtocol(airnodeProtocol).makeRequest(
            airnode,
            templateId,
            "",
            sponsor,
            this.fulfillRrpBeaconUpdate.selector
        );
        requestIdToBeaconId[requestId] = beaconId;
        emit RequestedRrpBeaconUpdate(
            beaconId,
            airnode,
            templateId,
            sponsor,
            requestId,
            msg.sender
        );
    }

    /// @notice Creates an RRP request for the Beacon to be updated
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param parameters Parameters
    /// @param sponsor Sponsor address
    /// @return requestId Request ID
    function requestRrpBeaconUpdateWithEndpoint(
        address airnode,
        bytes32 endpointId,
        bytes calldata parameters,
        address sponsor
    )
        external
        override
        onlyPermittedUpdateRequester(sponsor)
        returns (bytes32 requestId)
    {
        bytes32 templateId = keccak256(
            abi.encodePacked(endpointId, parameters)
        );
        bytes32 beaconId = deriveBeaconId(airnode, templateId);
        requestId = IAirnodeProtocol(airnodeProtocol).makeRequest(
            airnode,
            endpointId,
            parameters,
            sponsor,
            this.fulfillRrpBeaconUpdate.selector
        );
        requestIdToBeaconId[requestId] = beaconId;
        emit RequestedRrpBeaconUpdate(
            beaconId,
            airnode,
            templateId,
            sponsor,
            requestId,
            msg.sender
        );
    }

    /// @notice Creates an RRP request for the Beacon to be updated by the relayer
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @param relayer Relayer address
    /// @param sponsor Sponsor address
    /// @return requestId Request ID
    function requestRelayedRrpBeaconUpdateWithTemplate(
        address airnode,
        bytes32 templateId,
        address relayer,
        address sponsor
    )
        external
        override
        onlyPermittedUpdateRequester(sponsor)
        returns (bytes32 requestId)
    {
        bytes32 beaconId = deriveBeaconId(airnode, templateId);
        requestId = IAirnodeProtocol(airnodeProtocol).makeRequestRelayed(
            airnode,
            templateId,
            "",
            relayer,
            sponsor,
            this.fulfillRrpBeaconUpdate.selector
        );
        requestIdToBeaconId[requestId] = beaconId;
        emit RequestedRelayedRrpBeaconUpdate(
            beaconId,
            airnode,
            templateId,
            relayer,
            sponsor,
            requestId,
            msg.sender
        );
    }

    /// @notice Creates an RRP request for the Beacon to be updated by the relayer
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param parameters Parameters
    /// @param relayer Relayer address
    /// @param sponsor Sponsor address
    /// @return requestId Request ID
    function requestRelayedRrpBeaconUpdateWithEndpoint(
        address airnode,
        bytes32 endpointId,
        bytes calldata parameters,
        address relayer,
        address sponsor
    )
        external
        override
        onlyPermittedUpdateRequester(sponsor)
        returns (bytes32 requestId)
    {
        bytes32 templateId = keccak256(
            abi.encodePacked(endpointId, parameters)
        );
        bytes32 beaconId = deriveBeaconId(airnode, templateId);
        requestId = IAirnodeProtocol(airnodeProtocol).makeRequestRelayed(
            airnode,
            endpointId,
            parameters,
            relayer,
            sponsor,
            this.fulfillRrpBeaconUpdate.selector
        );
        requestIdToBeaconId[requestId] = beaconId;
        emit RequestedRelayedRrpBeaconUpdate(
            beaconId,
            airnode,
            templateId,
            relayer,
            sponsor,
            requestId,
            msg.sender
        );
    }

    /// @notice Called by the Airnode/relayer using the sponsor wallet through
    /// AirnodeProtocol to fulfill the request
    /// @param requestId Request ID
    /// @param timestamp Timestamp used in the signature
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    function fulfillRrpBeaconUpdate(
        bytes32 requestId,
        uint256 timestamp,
        bytes calldata data
    ) external override onlyAirnodeProtocol {
        bytes32 beaconId = requestIdToBeaconId[requestId];
        delete requestIdToBeaconId[requestId];
        int224 updatedValue = processBeaconUpdate(beaconId, timestamp, data);
        // Timestamp validity is already checked by `onlyValidTimestamp`, which
        // means it will be small enough to be typecast into `uint32`
        emit UpdatedBeaconWithRrp(
            beaconId,
            requestId,
            updatedValue,
            uint32(timestamp)
        );
    }
}
