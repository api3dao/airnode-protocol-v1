// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "./Allocator.sol";
import "./interfaces/IAllocatorWithManager.sol";

/// @title Contract that Airnode operators can use to temporarily
/// allocate subscription slots for Airnodes
contract AllocatorWithManager is
    ERC2771Context,
    AccessControlRegistryAdminnedWithManager,
    Allocator,
    IAllocatorWithManager
{
    /// @notice Slot setter role
    bytes32 public immutable override slotSetterRole;

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager
    )
        ERC2771Context(_accessControlRegistry)
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
    {
        slotSetterRole = _deriveRole(
            adminRole,
            keccak256(abi.encodePacked(SLOT_SETTER_ROLE_DESCRIPTION))
        );
    }

    /// @notice Sets a slot with the given parameters
    /// @param airnode Airnode address
    /// @param slotIndex Index of the subscription slot to be set
    /// @param subscriptionId Subscription ID
    /// @param expirationTimestamp Timestamp at which the slot allocation will
    /// expire
    function setSlot(
        address airnode,
        uint256 slotIndex,
        bytes32 subscriptionId,
        uint32 expirationTimestamp
    ) external override {
        require(
            hasSlotSetterRoleOrIsManager(_msgSender()),
            "Sender cannot set slot"
        );
        _setSlot(airnode, slotIndex, subscriptionId, expirationTimestamp);
    }

    /// @notice Returns if the account has the slot setter role or is the
    /// manager
    /// @param account Account address
    function hasSlotSetterRoleOrIsManager(
        address account
    ) public view override returns (bool) {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                slotSetterRole,
                account
            );
    }

    function slotCanBeResetByAccount(
        address airnode,
        uint256 slotIndex,
        address account
    ) public view override(IAllocator, Allocator) returns (bool) {
        Slot storage slot = airnodeToSlotIndexToSlot[airnode][slotIndex];
        return
            slot.setter == account ||
            slot.expirationTimestamp <= block.timestamp ||
            !hasSlotSetterRoleOrIsManager(
                airnodeToSlotIndexToSlot[airnode][slotIndex].setter
            );
    }

    /// @dev See Context.sol
    function _msgSender()
        internal
        view
        virtual
        override(Allocator, ERC2771Context)
        returns (address)
    {
        return ERC2771Context._msgSender();
    }
}
