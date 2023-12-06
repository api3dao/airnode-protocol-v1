// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "../access-control-registry/AccessControlRegistryAdminned.sol";
import "./Allocator.sol";
import "./interfaces/IAllocatorWithAirnode.sol";

/// @title Contract that Airnode operators can use to temporarily
/// allocate subscription slots for the respective Airnodes
contract AllocatorWithAirnode is
    ERC2771Context,
    AccessControlRegistryAdminned,
    Allocator,
    IAllocatorWithAirnode
{
    bytes32 private constant SLOT_SETTER_ROLE_DESCRIPTION_HASH =
        keccak256(abi.encodePacked(SLOT_SETTER_ROLE_DESCRIPTION));

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription
    )
        ERC2771Context(_accessControlRegistry)
        AccessControlRegistryAdminned(
            _accessControlRegistry,
            _adminRoleDescription
        )
    {}

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
            hasSlotSetterRoleOrIsAirnode(airnode, _msgSender()),
            "Sender cannot set slot"
        );
        _setSlot(airnode, slotIndex, subscriptionId, expirationTimestamp);
    }

    /// @notice Returns if the account has the slot setter role or has the
    /// respective Airnode address
    /// @param airnode Airnode address
    /// @param account Account address
    function hasSlotSetterRoleOrIsAirnode(
        address airnode,
        address account
    ) public view override returns (bool) {
        return
            airnode == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                deriveSlotSetterRole(airnode),
                account
            );
    }

    /// @notice Derives the admin role for the specific Airnode address
    /// @param airnode Airnode address
    /// @return adminRole Admin role
    function deriveAdminRole(
        address airnode
    ) public view override returns (bytes32 adminRole) {
        adminRole = _deriveAdminRole(airnode);
    }

    /// @notice Derives the slot setter role for the specific Airnode address
    /// @param airnode Airnode address
    /// @return slotSetterRole Slot setter role
    function deriveSlotSetterRole(
        address airnode
    ) public view override returns (bytes32 slotSetterRole) {
        slotSetterRole = _deriveRole(
            _deriveAdminRole(airnode),
            SLOT_SETTER_ROLE_DESCRIPTION_HASH
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
            !hasSlotSetterRoleOrIsAirnode(
                airnode,
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
