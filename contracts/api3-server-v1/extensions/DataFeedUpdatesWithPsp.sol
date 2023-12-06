// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./BeaconSetUpdatesWithPsp.sol";
import "./interfaces/IDataFeedUpdatesWithPsp.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Contract that updates Beacons and Beacon sets using regular and
/// relayed PSP
/// @dev DataFeedUpdatesWithPsp is a PSP requester contract. Unlike RRP, which
/// is implemented as a central contract, PSP implementation is built into the
/// requester for optimization. Accordingly, the checks that are not required
/// are omitted. An example:
/// - While executing a PSP Beacon update, the condition is not verified
/// because Beacon updates where the condition returns `false` (e.g., the
/// on-chain value is already close to the actual value) are not harmful, and
/// are even desirable ("any update is a good update").
contract DataFeedUpdatesWithPsp is
    BeaconSetUpdatesWithPsp,
    IDataFeedUpdatesWithPsp
{
    using ECDSA for bytes32;

    /// @notice ID of the Beacon that the subscription is registered to update
    mapping(bytes32 => bytes32) public override subscriptionIdToBeaconId;

    mapping(bytes32 => bytes32) private subscriptionIdToHash;

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
    /// of a Subscription.
    /// Even if this function returns `true`, the respective Subscription
    /// fulfillment will fail if the Beacon is updated with a larger timestamp
    /// in the meantime.
    /// @param subscriptionId Subscription ID
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    /// @param conditionParameters Subscription condition parameters. This
    /// includes multiple ABI-encoded values, see `checkUpdateCondition()`.
    /// @return If the Beacon update subscription should be fulfilled
    function conditionPspBeaconUpdate(
        bytes32 subscriptionId,
        bytes calldata data,
        bytes calldata conditionParameters
    ) public view virtual override returns (bool) {
        bytes32 beaconId = subscriptionIdToBeaconId[subscriptionId];
        require(beaconId != bytes32(0), "Subscription not registered");
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
    /// returns `true` because any Beacon update is a good Beacon update as
    /// long as it increases the timestamp
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
    ) external override {
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
        int224 updatedValue = processBeaconUpdate(beaconId, timestamp, data);
        // Timestamp validity is already checked by `onlyValidTimestamp`, which
        // means it will be small enough to be typecast into `uint32`
        emit UpdatedBeaconWithPsp(
            beaconId,
            subscriptionId,
            updatedValue,
            uint32(timestamp)
        );
    }
}
