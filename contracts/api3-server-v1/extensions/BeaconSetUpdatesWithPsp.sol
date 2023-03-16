// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../DataFeedServer.sol";
import "./interfaces/IDataFeedUpdatesWithPsp.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Contract that updates Beacon sets using regular and relayed PSP
/// @dev BeaconSetUpdatesWithPsp is a PSP requester contract. Unlike RRP, which
/// is implemented as a central contract, PSP implementation is built into the
/// requester for optimization. Accordingly, the checks that are not required
/// are omitted. Some examples:
/// - PSP Beacon set update subscription IDs are not verified, as the
/// Airnode/relayer cannot be made to "misreport a Beacon set update" by
/// spoofing a subscription ID.
/// - While executing a PSP Beacon set update, even the signature is not
/// checked because this is a purely keeper job that does not require off-chain
/// data. Similar to Beacon updates, any Beacon set update is welcome.
contract BeaconSetUpdatesWithPsp is DataFeedServer, IBeaconSetUpdatesWithPsp {
    using ECDSA for bytes32;

    /// @notice Number that represents 100%
    /// @dev 10^8 (and not a larger number) is chosen to avoid overflows in
    /// `calculateUpdateInPercentage()`. Since the reported data needs to fit
    /// into 224 bits, its multiplication by 10^8 is guaranteed not to
    /// overflow.
    uint256 public constant override HUNDRED_PERCENT = 1e8;

    /// @notice Returns if the respective Beacon set needs to be updated based
    /// on the condition parameters
    /// @dev `endpointOrTemplateId` in the respective Subscription is expected
    /// to be zero, which means the `parameters` field of the Subscription will
    /// be forwarded to this function as `data`. This field should be the
    /// Beacon ID array encoded in contract ABI.
    /// Even if this function returns `true`, the respective Subscription
    /// fulfillment will fail if will not update the Beacon set value or
    /// timestamp.
    /// @param // subscriptionId Subscription ID
    /// @param data Fulfillment data (array of Beacon IDs, i.e., `bytes32[]`
    /// encoded in contract ABI)
    /// @param conditionParameters Subscription condition parameters. This
    /// includes multiple ABI-encoded values, see `checkUpdateCondition()`.
    /// @return If the Beacon set update subscription should be fulfilled
    function conditionPspBeaconSetUpdate(
        bytes32 /* subscriptionId */,
        bytes calldata data,
        bytes calldata conditionParameters
    ) public view virtual override returns (bool) {
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
    /// @param // subscriptionId Subscription ID
    /// @param // airnode Airnode address
    /// @param // relayer Relayer address
    /// @param // sponsor Sponsor address
    /// @param // timestamp Timestamp used in the signature
    /// @param data Fulfillment data (an `int256` encoded in contract ABI)
    /// @param // signature Subscription ID, timestamp, sponsor wallet address
    /// (and fulfillment data if the relayer is not the Airnode) signed by the
    /// Airnode wallet
    function fulfillPspBeaconSetUpdate(
        bytes32 /* subscriptionId */,
        address /* airnode */,
        address /* relayer */,
        address /* sponsor */,
        uint256 /* timestamp */,
        bytes calldata data,
        bytes calldata /* signature */
    ) external override {
        require(
            keccak256(data) ==
                updateBeaconSetWithBeacons(abi.decode(data, (bytes32[]))),
            "Data length not correct"
        );
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
    ) internal view returns (bool) {
        require(conditionParameters.length == 96, "Incorrect parameter length");
        (
            uint256 deviationThresholdInPercentage,
            int224 deviationReference,
            uint256 heartbeatInterval
        ) = abi.decode(conditionParameters, (uint256, int224, uint256));
        DataFeed storage dataFeed = _dataFeeds[dataFeedId];
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
}
