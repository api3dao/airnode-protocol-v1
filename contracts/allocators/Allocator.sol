// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IAllocator.sol";

/// @title Abstract contract that temporarily allocates subscription slots for
/// Airnodes
/// @dev Airnodes that support PSP can be configured to periodically call
/// multiple Allocators to fetch information about multiple slots from each.
/// The Airnode must not serve expired slots or subscriptions with invalid IDs.
/// The Airnode operator is expected to communicate the required information to
/// the users through off-chain channels.
abstract contract Allocator is IAllocator {
    struct Slot {
        bytes32 subscriptionId;
        address setter;
        uint32 expirationTimestamp;
    }

    /// @notice Slot setter role description
    string public constant override SLOT_SETTER_ROLE_DESCRIPTION =
        "Slot setter";

    /// @notice Subscription slot of an Airnode addressed by the index
    mapping(address => mapping(uint256 => Slot))
        public
        override airnodeToSlotIndexToSlot;

    /// @notice Resets the slot
    /// @dev This will revert if the slot has been set before, and the sender
    /// is not the setter of the slot, and the slot has not expired and the
    /// setter of the slot is still authorized to set slots.
    /// The sender does not have to be authorized to set slots to use this.
    /// @param airnode Airnode address
    /// @param slotIndex Index of the subscription slot to be set
    function resetSlot(address airnode, uint256 slotIndex) external override {
        if (
            airnodeToSlotIndexToSlot[airnode][slotIndex].subscriptionId !=
            bytes32(0)
        ) {
            _resetSlot(airnode, slotIndex);
            emit ResetSlot(airnode, slotIndex, _msgSender());
        }
    }

    function slotCanBeResetByAccount(
        address airnode,
        uint256 slotIndex,
        address account
    ) public view virtual override returns (bool);

    /// @notice Called internally to set the slot with the given parameters
    /// @dev The set slot can be reset by its setter, or when it has expired,
    /// or when its setter is no longer authorized to set slots
    /// @param airnode Airnode address
    /// @param slotIndex Index of the subscription slot to be set
    /// @param subscriptionId Subscription ID
    /// @param expirationTimestamp Timestamp at which the slot allocation will
    /// expire
    function _setSlot(
        address airnode,
        uint256 slotIndex,
        bytes32 subscriptionId,
        uint32 expirationTimestamp
    ) internal {
        require(
            expirationTimestamp > block.timestamp,
            "Expiration not in future"
        );
        _resetSlot(airnode, slotIndex);
        airnodeToSlotIndexToSlot[airnode][slotIndex] = Slot({
            subscriptionId: subscriptionId,
            setter: _msgSender(),
            expirationTimestamp: expirationTimestamp
        });
        emit SetSlot(
            airnode,
            slotIndex,
            subscriptionId,
            expirationTimestamp,
            _msgSender()
        );
    }

    /// @notice Called privately to reset a slot
    /// @param airnode Airnode address
    /// @param slotIndex Index of the subscription slot to be reset
    function _resetSlot(address airnode, uint256 slotIndex) private {
        require(
            slotCanBeResetByAccount(airnode, slotIndex, _msgSender()),
            "Cannot reset slot"
        );
        delete airnodeToSlotIndexToSlot[airnode][slotIndex];
    }

    /// @dev See Context.sol
    function _msgSender() internal view virtual returns (address sender);
}
