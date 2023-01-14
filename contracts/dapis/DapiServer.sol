// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "../utils/ExtendedSelfMulticall.sol";
import "../protocol/AirnodeRequester.sol";
import "./Median.sol";
import "./interfaces/IDapiServer.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./proxies/interfaces/IOevProxy.sol";

/// @title Contract that serves Beacons, Beacon sets and dAPIs based on the
/// Airnode protocol
/// @notice A Beacon is a live data feed addressed by an ID, which is derived
/// from an Airnode address and a template ID. This is suitable where the more
/// recent data point is always more favorable, e.g., in the context of an
/// asset price data feed. Beacons can also be seen as one-Airnode data feeds
/// that can be used individually or combined to build Beacon sets. dAPIs are
/// an abstraction layer over Beacons and Beacon sets.
/// In addition, this contract allows winners of OEV auctions to pay their bids
/// to update the specific data feed.
/// @dev DapiServer is a PSP requester contract. Unlike RRP, which is
/// implemented as a central contract, PSP implementation is built into the
/// requester for optimization. Accordingly, the checks that are not required
/// are omitted. Some examples:
/// - While executing a PSP Beacon update, the condition is not verified
/// because Beacon updates where the condition returns `false` (e.g., the
/// on-chain value is already close to the actual value) are not harmful, and
/// are even desirable ("any update is a good update").
/// - PSP Beacon set update subscription IDs are not verified, as the
/// Airnode/relayer cannot be made to "misreport a Beacon set update" by
/// spoofing a subscription ID.
/// - While executing a PSP Beacon set update, even the signature is not
/// checked because this is a purely keeper job that does not require off-chain
/// data. Similar to Beacon updates, any Beacon set update is welcome.
contract DapiServer is
    AccessControlRegistryAdminnedWithManager,
    ExtendedSelfMulticall,
    AirnodeRequester,
    Median,
    IDapiServer
{
    using ECDSA for bytes32;

    // Airnodes serve their fulfillment data along with timestamps. This
    // contract casts the reported data to `int224` and the timestamp to
    // `uint32`, which works until year 2106.
    struct DataFeed {
        int224 value;
        uint32 timestamp;
    }

    /// @notice dAPI name setter role description
    string public constant override DAPI_NAME_SETTER_ROLE_DESCRIPTION =
        "dAPI name setter";

    /// @notice Number that represents 100%
    /// @dev 10^8 (and not a larger number) is chosen to avoid overflows in
    /// `calculateUpdateInPercentage()`. Since the reported data needs to fit
    /// into 224 bits, its multiplication by 10^8 is guaranteed not to
    /// overflow.
    uint256 public constant override HUNDRED_PERCENT = 1e8;

    /// @notice dAPI name setter role
    bytes32 public immutable override dapiNameSetterRole;

    /// @notice If a sponsor has permitted an account to request RRP-based
    /// updates at this contract
    mapping(address => mapping(address => bool))
        public
        override sponsorToRrpBeaconUpdateRequesterToPermissionStatus;

    /// @notice ID of the Beacon that the subscription is registered to update
    mapping(bytes32 => bytes32) public override subscriptionIdToBeaconId;

    /// @notice Data feed with ID
    mapping(bytes32 => DataFeed) public override dataFeeds;

    /// @notice Data feed with ID specific to the OEV proxy
    /// @dev This implies that an update as a result of an OEV auction only
    /// affects contracts that read through the respective proxy that the
    /// auction was being held for
    mapping(address => mapping(bytes32 => DataFeed))
        public
        override oevProxyToIdToDataFeed;

    /// @notice dAPI name hash mapped to the data feed ID
    mapping(bytes32 => bytes32) public override dapiNameHashToDataFeedId;

    /// @notice Accumulated OEV auction proceeds for the specific proxy
    mapping(address => uint256) public override oevProxyToBalance;

    mapping(bytes32 => bytes32) private requestIdToBeaconId;

    mapping(bytes32 => bytes32) private subscriptionIdToHash;

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

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    /// @param _airnodeProtocol AirnodeProtocol contract address
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _airnodeProtocol
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
        AirnodeRequester(_airnodeProtocol)
    {
        dapiNameSetterRole = _deriveRole(
            _deriveAdminRole(manager),
            DAPI_NAME_SETTER_ROLE_DESCRIPTION
        );
    }

    ///                     ~~~RRP Beacon updates~~~

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
    ) external override onlyAirnodeProtocol onlyValidTimestamp(timestamp) {
        bytes32 beaconId = requestIdToBeaconId[requestId];
        delete requestIdToBeaconId[requestId];
        int224 decodedData = processBeaconUpdate(beaconId, timestamp, data);
        // Timestamp validity is already checked by `onlyValidTimestamp`, which
        // means it will be small enough to be typecast into `uint32`
        emit UpdatedBeaconWithRrp(
            beaconId,
            requestId,
            decodedData,
            uint32(timestamp)
        );
    }

    ///                     ~~~PSP Beacon updates~~~

    /// @notice Registers the Beacon update subscription
    /// @dev Similar to how one needs to call `requestRrpBeaconUpdate()` for
    /// this contract to recognize the incoming RRP fulfillment, this needs to
    /// be called before the subscription fulfillments.
    /// In addition to the subscription being registered, the sponsor must use
    /// `setPspSponsorshipStatus()` to give permission for its sponsor wallet
    /// to be used for the specific subscription.
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @param conditions Conditions under which the subscription is requested
    /// to be fulfilled
    /// @param relayer Relayer address
    /// @param sponsor Sponsor address
    /// @return subscriptionId Subscription ID
    function registerBeaconUpdateSubscription(
        address airnode,
        bytes32 templateId,
        bytes calldata conditions,
        address relayer,
        address sponsor
    ) external override returns (bytes32 subscriptionId) {
        require(relayer != address(0), "Relayer address zero");
        require(sponsor != address(0), "Sponsor address zero");
        subscriptionId = keccak256(
            abi.encode(
                block.chainid,
                airnode,
                templateId,
                "",
                conditions,
                relayer,
                sponsor,
                address(this),
                this.fulfillPspBeaconUpdate.selector
            )
        );
        require(
            subscriptionIdToHash[subscriptionId] == bytes32(0),
            "Subscription already registered"
        );
        subscriptionIdToHash[subscriptionId] = keccak256(
            abi.encodePacked(airnode, relayer, sponsor)
        );
        bytes32 beaconId = deriveBeaconId(airnode, templateId);
        subscriptionIdToBeaconId[subscriptionId] = beaconId;
        emit RegisteredBeaconUpdateSubscription(
            beaconId,
            subscriptionId,
            airnode,
            templateId,
            conditions,
            relayer,
            sponsor
        );
    }

    /// @notice Returns if the respective Beacon needs to be updated based on
    /// the fulfillment data and the condition parameters
    /// @dev `conditionParameters` are specified within the `conditions` field
    /// of a Subscription
    /// @param subscriptionId Subscription ID
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    /// @param conditionParameters Subscription condition parameters. This
    /// includes multiple ABI-encoded values, see `checkUpdateCondition()`.
    /// @return If the Beacon update subscription should be fulfilled
    function conditionPspBeaconUpdate(
        bytes32 subscriptionId,
        bytes calldata data,
        bytes calldata conditionParameters
    ) external view override returns (bool) {
        bytes32 beaconId = subscriptionIdToBeaconId[subscriptionId];
        require(beaconId != bytes32(0), "Subscription not registered");
        // Assuming that the update value will be signed after this condition
        // returns true, the update timestamp will be larger than
        // `block.timestamp`, which will still satisfy the update condition.
        return
            checkUpdateCondition(
                beaconId,
                decodeFulfillmentData(data),
                uint32(block.timestamp),
                conditionParameters
            );
    }

    /// @notice Called by the Airnode/relayer using the sponsor wallet to
    /// fulfill the Beacon update subscription
    /// @dev There is no need to verify that `conditionPspBeaconUpdate()`
    /// returns `true` because any Beacon update is a good Beacon update
    /// @param subscriptionId Subscription ID
    /// @param airnode Airnode address
    /// @param relayer Relayer address
    /// @param sponsor Sponsor address
    /// @param timestamp Timestamp used in the signature
    /// @param data Fulfillment data (a single `int256` encoded in contract
    /// ABI)
    /// @param signature Subscription ID, timestamp, sponsor wallet address
    /// (and fulfillment data if the relayer is not the Airnode) signed by the
    /// Airnode wallet
    function fulfillPspBeaconUpdate(
        bytes32 subscriptionId,
        address airnode,
        address relayer,
        address sponsor,
        uint256 timestamp,
        bytes calldata data,
        bytes calldata signature
    ) external override onlyValidTimestamp(timestamp) {
        require(
            subscriptionIdToHash[subscriptionId] ==
                keccak256(abi.encodePacked(airnode, relayer, sponsor)),
            "Subscription not registered"
        );
        if (airnode == relayer) {
            require(
                (
                    keccak256(
                        abi.encodePacked(subscriptionId, timestamp, msg.sender)
                    ).toEthSignedMessageHash()
                ).recover(signature) == airnode,
                "Signature mismatch"
            );
        } else {
            require(
                (
                    keccak256(
                        abi.encodePacked(
                            subscriptionId,
                            timestamp,
                            msg.sender,
                            data
                        )
                    ).toEthSignedMessageHash()
                ).recover(signature) == airnode,
                "Signature mismatch"
            );
        }
        bytes32 beaconId = subscriptionIdToBeaconId[subscriptionId];
        // Beacon ID is guaranteed to not be zero because the subscription is
        // registered
        int224 decodedData = processBeaconUpdate(beaconId, timestamp, data);
        // Timestamp validity is already checked by `onlyValidTimestamp`, which
        // means it will be small enough to be typecast into `uint32`
        emit UpdatedBeaconWithPsp(
            beaconId,
            subscriptionId,
            decodedData,
            uint32(timestamp)
        );
    }

    ///                     ~~~PSP Beacon set updates~~~

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
        require(
            updatedTimestamp > dataFeeds[beaconSetId].timestamp,
            "Does not update timestamp"
        );
        dataFeeds[beaconSetId] = DataFeed({
            value: updatedValue,
            timestamp: updatedTimestamp
        });
        emit UpdatedBeaconSetWithBeacons(
            beaconSetId,
            updatedValue,
            updatedTimestamp
        );
    }

    /// @notice Returns if the respective Beacon set needs to be updated based
    /// on the condition parameters
    /// @dev `endpointOrTemplateId` in the respective Subscription is expected
    /// to be zero, which means the `parameters` field of the Subscription will
    /// be forwarded to this function as `data`. This field should be the
    /// Beacon ID array encoded in contract ABI.
    /// @param subscriptionId Subscription ID
    /// @param data Fulfillment data (array of Beacon IDs, i.e., `bytes32[]`
    /// encoded in contract ABI)
    /// @param conditionParameters Subscription condition parameters. This
    /// includes multiple ABI-encoded values, see `checkUpdateCondition()`.
    /// @return If the Beacon set update subscription should be fulfilled
    function conditionPspBeaconSetUpdate(
        bytes32 subscriptionId, // solhint-disable-line no-unused-vars
        bytes calldata data,
        bytes calldata conditionParameters
    ) external view override returns (bool) {
        bytes32[] memory beaconIds = abi.decode(data, (bytes32[]));
        require(
            keccak256(abi.encode(beaconIds)) == keccak256(data),
            "Data length not correct"
        );
        (int224 updatedValue, uint32 updatedTimestamp) = aggregateBeacons(
            beaconIds
        );
        return
            checkUpdateCondition(
                deriveBeaconSetId(beaconIds),
                updatedValue,
                updatedTimestamp,
                conditionParameters
            );
    }

    /// @notice Called by the Airnode/relayer using the sponsor wallet to
    /// fulfill the Beacon set update subscription
    /// @dev Similar to `conditionPspBeaconSetUpdate()`, if
    /// `endpointOrTemplateId` of the Subscription is zero, its `parameters`
    /// field will be forwarded to `data` here, which is expect to be contract
    /// ABI-encoded array of Beacon IDs.
    /// It does not make sense for this subscription to be relayed, as there is
    /// no external data being delivered. Nevertheless, this is allowed for the
    /// lack of a reason to prevent it.
    /// Even though the consistency of the arguments are not being checked, if
    /// a standard implementation of Airnode is being used, these can be
    /// expected to be correct. Either way, the assumption is that it does not
    /// matter for the purposes of a Beacon set update subscription.
    /// @param subscriptionId Subscription ID
    /// @param airnode Airnode address
    /// @param relayer Relayer address
    /// @param sponsor Sponsor address
    /// @param timestamp Timestamp used in the signature
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    /// @param signature Subscription ID, timestamp, sponsor wallet address
    /// (and fulfillment data if the relayer is not the Airnode) signed by the
    /// Airnode wallet
    function fulfillPspBeaconSetUpdate(
        bytes32 subscriptionId, // solhint-disable-line no-unused-vars
        address airnode, // solhint-disable-line no-unused-vars
        address relayer, // solhint-disable-line no-unused-vars
        address sponsor, // solhint-disable-line no-unused-vars
        uint256 timestamp, // solhint-disable-line no-unused-vars
        bytes calldata data,
        bytes calldata signature // solhint-disable-line no-unused-vars
    ) external override {
        require(
            keccak256(data) ==
                updateBeaconSetWithBeacons(abi.decode(data, (bytes32[]))),
            "Data length not correct"
        );
    }

    ///                     ~~~Signed data feed updates~~~

    /// @notice Updates a data feed using data signed by the respective
    /// Airnodes without requiring a request or subscription. The Beacons for
    /// which the fulfillment data and signature is omitted will be read from
    /// storage.
    /// @dev The signed data here is intentionally very general for practical
    /// reasons. It is less demanding on the signer to have data signed once
    /// and use that everywhere.
    /// @param signedData Array of contract ABI-encoded Airnode address,
    /// template ID, timestamp and fulfillment data that is signed by the
    /// respective Airnode
    function updateDataFeedWithSignedData(
        bytes[] calldata signedData
    ) external override {
        uint256 beaconCount = signedData.length;
        if (beaconCount > 1) {
            bytes32[] memory beaconIds = new bytes32[](beaconCount);
            int256[] memory values = new int256[](beaconCount);
            uint256 accumulatedTimestamp = 0;
            for (uint256 ind = 0; ind < beaconCount; ) {
                (
                    bytes32 beaconId,
                    int224 beaconValue,
                    uint32 beaconTimestamp
                ) = decodeSignedData(signedData[ind]);
                beaconIds[ind] = beaconId;
                if (beaconTimestamp != 0) {
                    values[ind] = beaconValue;
                    // Will not overflow assuming less than 2^224 Beacons
                    unchecked {
                        accumulatedTimestamp += beaconTimestamp;
                    }
                } else {
                    DataFeed storage beacon = dataFeeds[beaconId];
                    values[ind] = beacon.value;
                    unchecked {
                        accumulatedTimestamp += beacon.timestamp;
                    }
                }
                unchecked {
                    ind++;
                }
            }
            bytes32 beaconSetId = deriveBeaconSetId(beaconIds);
            uint32 updatedTimestamp = uint32(
                accumulatedTimestamp / beaconCount
            );
            require(
                updatedTimestamp > dataFeeds[beaconSetId].timestamp,
                "Does not update timestamp"
            );
            int224 updatedValue = int224(median(values));
            dataFeeds[beaconSetId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
            emit UpdatedBeaconSetWithSignedData(
                beaconSetId,
                updatedValue,
                updatedTimestamp
            );
        } else if (beaconCount == 1) {
            (
                bytes32 beaconId,
                int224 updatedValue,
                uint32 updatedTimestamp
            ) = decodeSignedData(signedData[0]);
            require(updatedTimestamp != 0, "Missing data");
            require(
                updatedTimestamp > dataFeeds[beaconId].timestamp,
                "Does not update timestamp"
            );
            dataFeeds[beaconId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
            emit UpdatedBeaconWithSignedData(
                beaconId,
                updatedValue,
                updatedTimestamp
            );
        } else {
            revert("Specified no Beacons");
        }
    }

    /// @notice Updates a data feed using data domain-signed by the respective
    /// Airnodes without requiring a request or subscription. The Beacons for
    /// which the fulfillment data and signature is omitted will be read from
    /// storage.
    /// @dev This signed data here is specific to this contract, which is to be
    /// used when the signer does not want to provide the more general
    /// signature. EIP712 may feel relevant here, but we avoided it for the
    /// sake of consistency among signed data implementations and clarity.
    /// @param signedData Array of contract ABI-encoded Airnode address,
    /// template ID, timestamp and fulfillment data that is signed by the
    /// respective Airnode for this specific contract
    function updateDataFeedWithDomainSignedData(
        bytes[] calldata signedData
    ) external override {
        uint256 beaconCount = signedData.length;
        if (beaconCount > 1) {
            bytes32[] memory beaconIds = new bytes32[](beaconCount);
            int256[] memory values = new int256[](beaconCount);
            uint256 accumulatedTimestamp = 0;
            for (uint256 ind = 0; ind < beaconCount; ) {
                (
                    bytes32 beaconId,
                    int224 beaconValue,
                    uint32 beaconTimestamp
                ) = decodeDomainSignedData(signedData[ind]);
                beaconIds[ind] = beaconId;
                if (beaconTimestamp != 0) {
                    values[ind] = beaconValue;
                    unchecked {
                        accumulatedTimestamp += beaconTimestamp;
                    }
                } else {
                    DataFeed storage beacon = dataFeeds[beaconId];
                    values[ind] = beacon.value;
                    unchecked {
                        accumulatedTimestamp += beacon.timestamp;
                    }
                }
                unchecked {
                    ind++;
                }
            }
            bytes32 beaconSetId = deriveBeaconSetId(beaconIds);
            uint32 updatedTimestamp = uint32(
                accumulatedTimestamp / beaconCount
            );
            require(
                updatedTimestamp > dataFeeds[beaconSetId].timestamp,
                "Does not update timestamp"
            );
            int224 updatedValue = int224(median(values));
            dataFeeds[beaconSetId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
            emit UpdatedBeaconSetWithDomainSignedData(
                beaconSetId,
                updatedValue,
                updatedTimestamp
            );
        } else if (beaconCount == 1) {
            (
                bytes32 beaconId,
                int224 updatedValue,
                uint32 updatedTimestamp
            ) = decodeDomainSignedData(signedData[0]);
            require(updatedTimestamp != 0, "Missing data");
            require(
                updatedTimestamp > dataFeeds[beaconId].timestamp,
                "Does not update timestamp"
            );
            dataFeeds[beaconId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
            emit UpdatedBeaconWithDomainSignedData(
                beaconId,
                updatedValue,
                updatedTimestamp
            );
        } else {
            revert("Specified no Beacons");
        }
    }

    ///                     ~~~OEV~~~

    /// @notice Updates a data feed that the OEV proxy reads using data signed
    /// by the respective Airnodes for the specific bid. The Beacons for which
    /// the fulfillment data and signature is omitted will be read from
    /// storage.
    /// @dev Even though data for Beacons are signed individually, the caller
    /// is only allowed to use the signatures as a bundle. They cannot omit
    /// individual signatures or mix-and-match among bundles.
    /// @param oevProxy OEV proxy that reads the data feed
    /// @param updateId Update ID
    /// @param signatureCount Number of signatures in `signedData`
    /// @param signedData Array of ABI-encoded Airnode address, template ID,
    /// timestamp, fulfillment data and bid metadata that is signed by the
    /// respective Airnode for the specific bid
    function updateOevProxyDataFeedWithSignedData(
        address oevProxy,
        bytes32 updateId,
        uint256 signatureCount,
        bytes[] calldata signedData
    ) external payable override {
        uint256 beaconCount = signedData.length;
        bytes32 metadataHash = keccak256(
            abi.encodePacked(
                block.chainid,
                address(this),
                address(oevProxy),
                msg.sender,
                msg.value,
                updateId,
                signatureCount,
                beaconCount
            )
        );
        if (beaconCount > 1) {
            bytes32[] memory beaconIds = new bytes32[](beaconCount);
            int256[] memory values = new int256[](beaconCount);
            uint256 accumulatedTimestamp = 0;
            for (uint256 ind = 0; ind < beaconCount; ) {
                (
                    bytes32 beaconId,
                    int224 beaconValue,
                    uint32 beaconTimestamp
                ) = decodeOevSignedData(metadataHash, signedData[ind]);
                beaconIds[ind] = beaconId;
                if (beaconTimestamp != 0) {
                    values[ind] = beaconValue;
                    unchecked {
                        accumulatedTimestamp += beaconTimestamp;
                    }
                    require(signatureCount != 0, "More signatures than stated");
                    unchecked {
                        signatureCount--;
                    }
                } else {
                    DataFeed storage beacon = dataFeeds[beaconId];
                    values[ind] = beacon.value;
                    unchecked {
                        accumulatedTimestamp += beacon.timestamp;
                    }
                }
                unchecked {
                    ind++;
                }
            }
            require(signatureCount == 0, "Less signatures than stated");
            bytes32 beaconSetId = deriveBeaconSetId(beaconIds);
            uint32 updatedTimestamp = uint32(
                accumulatedTimestamp / beaconCount
            );
            require(
                updatedTimestamp >
                    oevProxyToIdToDataFeed[oevProxy][beaconSetId].timestamp,
                "Does not update timestamp"
            );
            int224 updatedValue = int224(median(values));
            oevProxyToIdToDataFeed[oevProxy][beaconSetId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
            oevProxyToBalance[oevProxy] += msg.value;
            emit UpdatedOevProxyBeaconSetWithSignedData(
                beaconSetId,
                oevProxy,
                updateId,
                updatedValue,
                updatedTimestamp
            );
        } else if (beaconCount == 1) {
            (
                bytes32 beaconId,
                int224 updatedValue,
                uint32 updatedTimestamp
            ) = decodeOevSignedData(metadataHash, signedData[0]);
            require(updatedTimestamp != 0, "Missing data");
            require(
                updatedTimestamp >
                    oevProxyToIdToDataFeed[oevProxy][beaconId].timestamp,
                "Does not update timestamp"
            );
            oevProxyToIdToDataFeed[oevProxy][beaconId] = DataFeed({
                value: updatedValue,
                timestamp: updatedTimestamp
            });
            oevProxyToBalance[oevProxy] += msg.value;
            emit UpdatedOevProxyBeaconWithSignedData(
                beaconId,
                oevProxy,
                updateId,
                updatedValue,
                updatedTimestamp
            );
        } else {
            revert("Specified no Beacons");
        }
    }

    /// @notice Withdraws the balance of the OEV proxy to the respective
    /// beneficiary account
    /// @dev This does not require the caller to be the beneficiary because we
    /// expect that in most cases, the OEV beneficiary will be a contract that
    /// will not be able to make arbitrary calls. Our choice can be worked
    /// around by implementing a beneficiary proxy.
    /// @param oevProxy OEV proxy
    function withdraw(address oevProxy) external override {
        address oevBeneficiary = IOevProxy(oevProxy).oevBeneficiary();
        require(oevBeneficiary != address(0), "Beneficiary address zero");
        uint256 balance = oevProxyToBalance[oevProxy];
        require(balance != 0, "OEV proxy balance zero");
        oevProxyToBalance[oevProxy] = 0;
        emit Withdrew(oevProxy, balance);
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = oevBeneficiary.call{value: balance}("");
        require(success, "Withdrawal reverted");
    }

    /// @notice Sets the data feed ID the dAPI name points to
    /// @dev While a data feed ID refers to a specific Beacon or Beacon set,
    /// dAPI names provide a more abstract interface for convenience. This
    /// means a dAPI name that was pointing to a Beacon can be pointed to a
    /// Beacon set, then another Beacon set, etc.
    /// @param dapiName Human-readable dAPI name
    /// @param dataFeedId Data feed ID the dAPI name will point to
    function setDapiName(
        bytes32 dapiName,
        bytes32 dataFeedId
    ) external override {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    dapiNameSetterRole,
                    msg.sender
                ),
            "Sender cannot set dAPI name"
        );
        dapiNameHashToDataFeedId[
            keccak256(abi.encodePacked(dapiName))
        ] = dataFeedId;
        emit SetDapiName(dapiName, dataFeedId, msg.sender);
    }

    /// @notice Returns the data feed ID the dAPI name is set to
    /// @param dapiName dAPI name
    /// @return Data feed ID
    function dapiNameToDataFeedId(
        bytes32 dapiName
    ) external view override returns (bytes32) {
        return dapiNameHashToDataFeedId[keccak256(abi.encodePacked(dapiName))];
    }

    /// @notice Reads the data feed with ID
    /// @param dataFeedId Data feed ID
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function readDataFeedWithId(
        bytes32 dataFeedId
    ) external view override returns (int224 value, uint32 timestamp) {
        DataFeed storage dataFeed = dataFeeds[dataFeedId];
        (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
        require(timestamp > 0, "Data feed not initialized");
    }

    /// @notice Reads the data feed with dAPI name hash
    /// @param dapiNameHash dAPI name hash
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function readDataFeedWithDapiNameHash(
        bytes32 dapiNameHash
    ) external view override returns (int224 value, uint32 timestamp) {
        bytes32 dataFeedId = dapiNameHashToDataFeedId[dapiNameHash];
        require(dataFeedId != bytes32(0), "dAPI name not set");
        DataFeed storage dataFeed = dataFeeds[dataFeedId];
        (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
        require(timestamp > 0, "Data feed not initialized");
    }

    /// @notice Reads the data feed as the OEV proxy with ID
    /// @param dataFeedId Data feed ID
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function readDataFeedWithIdAsOevProxy(
        bytes32 dataFeedId
    ) external view override returns (int224 value, uint32 timestamp) {
        DataFeed storage oevDataFeed = oevProxyToIdToDataFeed[msg.sender][
            dataFeedId
        ];
        DataFeed storage dataFeed = dataFeeds[dataFeedId];
        if (oevDataFeed.timestamp > dataFeed.timestamp) {
            (value, timestamp) = (oevDataFeed.value, oevDataFeed.timestamp);
        } else {
            (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
        }
        require(timestamp > 0, "Data feed not initialized");
    }

    /// @notice Reads the data feed as the OEV proxy with dAPI name hash
    /// @param dapiNameHash dAPI name hash
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function readDataFeedWithDapiNameHashAsOevProxy(
        bytes32 dapiNameHash
    ) external view override returns (int224 value, uint32 timestamp) {
        bytes32 dataFeedId = dapiNameHashToDataFeedId[dapiNameHash];
        require(dataFeedId != bytes32(0), "dAPI name not set");
        DataFeed storage oevDataFeed = oevProxyToIdToDataFeed[msg.sender][
            dataFeedId
        ];
        DataFeed storage dataFeed = dataFeeds[dataFeedId];
        if (oevDataFeed.timestamp > dataFeed.timestamp) {
            (value, timestamp) = (oevDataFeed.value, oevDataFeed.timestamp);
        } else {
            (value, timestamp) = (dataFeed.value, dataFeed.timestamp);
        }
        require(timestamp > 0, "Data feed not initialized");
    }

    /// @notice Aggregates the Beacons and returns the result
    /// @dev Tha aggregation of Beacons may have a different value than the
    /// respective Beacon set, e.g., because the Beacon set has been updated
    /// using signed data
    /// @param beaconIds Beacon IDs
    /// @return value Aggregation value
    /// @return timestamp Aggregation timestamp
    function aggregateBeacons(
        bytes32[] memory beaconIds
    ) public view override returns (int224 value, uint32 timestamp) {
        uint256 beaconCount = beaconIds.length;
        require(beaconCount > 1, "Specified less than two Beacons");
        int256[] memory values = new int256[](beaconCount);
        uint256 accumulatedTimestamp = 0;
        for (uint256 ind = 0; ind < beaconCount; ) {
            DataFeed storage dataFeed = dataFeeds[beaconIds[ind]];
            values[ind] = dataFeed.value;
            unchecked {
                accumulatedTimestamp += dataFeed.timestamp;
                ind++;
            }
        }
        value = int224(median(values));
        timestamp = uint32(accumulatedTimestamp / beaconCount);
    }

    /// @notice Derives the Beacon ID from the Airnode address and template ID
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @return beaconId Beacon ID
    function deriveBeaconId(
        address airnode,
        bytes32 templateId
    ) private pure returns (bytes32 beaconId) {
        beaconId = keccak256(abi.encodePacked(airnode, templateId));
    }

    /// @notice Derives the Beacon set ID from the Beacon IDs
    /// @dev Notice that `abi.encode()` is used over `abi.encodePacked()`
    /// @param beaconIds Beacon IDs
    /// @return beaconSetId Beacon set ID
    function deriveBeaconSetId(
        bytes32[] memory beaconIds
    ) private pure returns (bytes32 beaconSetId) {
        beaconSetId = keccak256(abi.encode(beaconIds));
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
    ) private returns (int224 updatedBeaconValue) {
        updatedBeaconValue = decodeFulfillmentData(data);
        require(
            timestamp > dataFeeds[beaconId].timestamp,
            "Does not update timestamp"
        );
        // Timestamp validity is already checked by `onlyValidTimestamp`, which
        // means it will be small enough to be typecast into `uint32`
        dataFeeds[beaconId] = DataFeed({
            value: updatedBeaconValue,
            timestamp: uint32(timestamp)
        });
    }

    /// @notice Called privately to decode the fulfillment data
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    /// @return decodedData Decoded fulfillment data
    function decodeFulfillmentData(
        bytes memory data
    ) private pure returns (int224) {
        require(data.length == 32, "Data length not correct");
        int256 decodedData = abi.decode(data, (int256));
        require(
            decodedData >= type(int224).min && decodedData <= type(int224).max,
            "Value typecasting error"
        );
        return int224(decodedData);
    }

    /// @notice Called privately to check the update condition
    /// @param dataFeedId Data feed ID
    /// @param updatedValue Value the data feed will be updated with
    /// @param updatedTimestamp Timestamp the data feed will be updated with
    /// @param conditionParameters Subscription condition parameters. This
    /// includes multiple ABI-encoded values, see `checkUpdateCondition()`.
    /// @return If the update should be executed
    function checkUpdateCondition(
        bytes32 dataFeedId,
        int224 updatedValue,
        uint32 updatedTimestamp,
        bytes calldata conditionParameters
    ) private view returns (bool) {
        require(conditionParameters.length == 96, "Incorrect parameter length");
        (
            uint256 deviationThresholdInPercentage,
            int224 deviationReference,
            uint256 heartbeatInterval
        ) = abi.decode(conditionParameters, (uint256, int224, uint256));
        DataFeed storage dataFeed = dataFeeds[dataFeedId];
        unchecked {
            return
                (dataFeed.timestamp == 0 && updatedTimestamp != 0) ||
                (deviationThresholdInPercentage != 0 &&
                    calculateUpdateInPercentage(
                        dataFeed.value,
                        updatedValue,
                        deviationReference
                    ) >=
                    deviationThresholdInPercentage) ||
                (heartbeatInterval != 0 &&
                    dataFeed.timestamp + heartbeatInterval <= updatedTimestamp);
        }
    }

    /// @notice Called privately to calculate the update magnitude in
    /// percentages where 100% is represented as `HUNDRED_PERCENT`
    /// @dev The percentage changes will be more pronounced when the initial
    /// value is closer to the deviation reference. Therefore, while deciding
    /// on the subscription conditions, one should choose a deviation reference
    /// that will produce the desired update behavior. In general, the
    /// deviation reference should not be close to the operational range of the
    /// data feed (e.g., if the value is expected to change between -10 and 10,
    /// a deviation reference of -30 may be suitable.)
    /// @param initialValue Initial value
    /// @param updatedValue Updated value
    /// @param deviationReference Reference value that deviation will be
    /// calculated against
    /// @return updateInPercentage Update in percentage
    function calculateUpdateInPercentage(
        int224 initialValue,
        int224 updatedValue,
        int224 deviationReference
    ) private pure returns (uint256 updateInPercentage) {
        int256 delta;
        unchecked {
            delta = int256(updatedValue) - int256(initialValue);
        }
        if (delta == 0) {
            return 0;
        }
        uint256 absoluteInitialValue;
        unchecked {
            absoluteInitialValue = initialValue > deviationReference
                ? uint256(int256(initialValue) - int256(deviationReference))
                : uint256(int256(deviationReference) - int256(initialValue));
        }
        if (absoluteInitialValue == 0) {
            return type(uint256).max;
        }
        uint256 absoluteDelta = delta > 0 ? uint256(delta) : uint256(-delta);
        updateInPercentage =
            (absoluteDelta * HUNDRED_PERCENT) /
            absoluteInitialValue;
    }

    /// @notice Decodes data signed to update a Beacon by the respective
    /// Airnode
    /// @param signedData Contract ABI-encoded Airnode address, template ID,
    /// timestamp and fulfillment data that is signed by the respective Airnode
    /// @return beaconId Beacon ID
    /// @return beaconValue Beacon value
    /// @return beaconTimestamp Beacon timestamp
    function decodeSignedData(
        bytes calldata signedData
    )
        private
        view
        returns (bytes32 beaconId, int224 beaconValue, uint32 beaconTimestamp)
    {
        (
            address airnode,
            bytes32 templateId,
            uint256 timestamp,
            bytes memory data,
            bytes memory signature
        ) = abi.decode(signedData, (address, bytes32, uint256, bytes, bytes));
        beaconId = deriveBeaconId(airnode, templateId);
        if (signature.length == 0) {
            require(data.length == 0, "Missing signature");
        } else {
            require(
                (
                    keccak256(abi.encodePacked(templateId, timestamp, data))
                        .toEthSignedMessageHash()
                ).recover(signature) == airnode,
                "Signature mismatch"
            );
            beaconValue = decodeFulfillmentData(data);
            require(timestampIsValid(timestamp), "Timestamp not valid");
            beaconTimestamp = uint32(timestamp);
        }
    }

    /// @notice Decodes data domain-signed to update a Beacon by the respective
    /// Airnode
    /// @param signedData ABI-encoded Airnode address, template ID, timestamp
    /// and fulfillment data that is signed by the respective Airnode for this
    /// specific contract
    /// @return beaconId Beacon ID
    /// @return beaconValue Beacon value
    /// @return beaconTimestamp Beacon timestamp
    function decodeDomainSignedData(
        bytes calldata signedData
    )
        private
        view
        returns (bytes32 beaconId, int224 beaconValue, uint32 beaconTimestamp)
    {
        (
            address airnode,
            bytes32 templateId,
            uint256 timestamp,
            bytes memory data,
            bytes memory signature
        ) = abi.decode(signedData, (address, bytes32, uint256, bytes, bytes));
        beaconId = deriveBeaconId(airnode, templateId);
        if (signature.length == 0) {
            require(data.length == 0, "Missing signature");
        } else {
            require(
                (
                    keccak256(
                        abi.encodePacked(
                            block.chainid,
                            address(this),
                            templateId,
                            timestamp,
                            data
                        )
                    ).toEthSignedMessageHash()
                ).recover(signature) == airnode,
                "Signature mismatch"
            );
            beaconValue = decodeFulfillmentData(data);
            require(timestampIsValid(timestamp), "Timestamp not valid");
            beaconTimestamp = uint32(timestamp);
        }
    }

    /// @notice Decodes data signed by the respective Airnode for the specific
    /// bid to update the Beacon that a OEV proxy reads
    /// @param metadataHash Hash of the metadata of the bid that won the OEV
    /// auction
    /// @param signedData ABI-encoded Airnode address, template ID, timestamp,
    /// fulfillment data and bid metadata that is signed by the respective
    /// Airnode for the specific bid
    /// @return beaconId Beacon ID
    /// @return beaconValue Beacon value
    /// @return beaconTimestamp Beacon timestamp
    function decodeOevSignedData(
        bytes32 metadataHash,
        bytes calldata signedData
    )
        private
        view
        returns (bytes32 beaconId, int224 beaconValue, uint32 beaconTimestamp)
    {
        (
            address airnode,
            bytes32 templateId,
            uint256 timestamp,
            bytes memory data,
            bytes memory signature
        ) = abi.decode(signedData, (address, bytes32, uint256, bytes, bytes));
        beaconId = deriveBeaconId(airnode, templateId);
        if (signature.length == 0) {
            require(data.length == 0, "Missing signature");
        } else {
            require(
                (
                    keccak256(
                        abi.encodePacked(
                            metadataHash,
                            templateId,
                            timestamp,
                            data
                        )
                    ).toEthSignedMessageHash()
                ).recover(signature) == airnode,
                "Signature mismatch"
            );
            beaconValue = decodeFulfillmentData(data);
            require(timestampIsValid(timestamp), "Timestamp not valid");
            beaconTimestamp = uint32(timestamp);
        }
    }
}
