// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IAllocator.sol";

/// @title Abstract contract to be inherited by Allocator contracts that
/// temporarily allocate subscription slots for Airnodes
/// @notice Airnode operators need to opt in to using each Allocator by
/// configuring their Airnode to do so
/// @dev Airnodes that support PSP can be configured to periodically call
/// multiple Allocators to fetch information about multiple slots from each.
/// The Airnode must not serve expired slots or subscriptions with invalid IDs.
/// The Airnode operator is expected to communicate required information with
/// the users through off-chain channels.
abstract contract Allocator is IAllocator {
    struct Slot {
        bytes32 subscriptionId;
        address setter;
        uint64 expirationTimestamp;
    }

    /// @notice Slot setter role description
    string public constant override SLOT_SETTER_ROLE_DESCRIPTION =
        "Slot setter";

    /// @notice Subscription slot of an Airnode addressed by the index
    mapping(address => mapping(uint256 => Slot))
        public
        override airnodeToSlotIndexToSlot;

    bytes32 internal constant SLOT_SETTER_ROLE_DESCRIPTION_HASH =
        keccak256(abi.encodePacked(SLOT_SETTER_ROLE_DESCRIPTION));

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
        uint64 expirationTimestamp
    ) internal {
        require(
            expirationTimestamp >= block.timestamp,
            "Expiration is in past"
        );
        _resetSlot(airnode, slotIndex);
        airnodeToSlotIndexToSlot[airnode][slotIndex] = Slot({
            subscriptionId: subscriptionId,
            setter: _msgSender(),
            expirationTimestamp: expirationTimestamp
        });
        emit SetSlot(airnode, slotIndex, subscriptionId, expirationTimestamp);
    }

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
            emit ResetSlot(airnode, slotIndex);
        }
    }

    /// @notice Returns if the setter of the slot can still set slots
    /// @param airnode Airnode address
    /// @param slotIndex Index of the subscription slot that was set
    /// @return If the setter of the slot can still set slots
    function setterOfSlotIsCanStillSet(
        address airnode,
        uint256 slotIndex
    ) public view virtual override returns (bool);

    /// @notice Called privately to reset a slot
    /// @param airnode Airnode address
    /// @param slotIndex Index of the subscription slot to be reset
    function _resetSlot(address airnode, uint256 slotIndex) private {
        Slot storage slot = airnodeToSlotIndexToSlot[airnode][slotIndex];
        require(
            slot.setter == _msgSender() ||
                slot.expirationTimestamp < block.timestamp ||
                !setterOfSlotIsCanStillSet(airnode, slotIndex),
            "Cannot reset slot"
        );
        delete airnodeToSlotIndexToSlot[airnode][slotIndex];
    }

    /// @dev See Context.sol
    function _msgSender() internal view virtual returns (address sender);
}
