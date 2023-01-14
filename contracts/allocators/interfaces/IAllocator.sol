// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAllocator {
    event SetSlot(
        address indexed airnode,
        uint256 indexed slotIndex,
        bytes32 subscriptionId,
        uint32 expirationTimestamp,
        address sender
    );

    event ResetSlot(
        address indexed airnode,
        uint256 indexed slotIndex,
        address sender
    );

    function setSlot(
        address airnode,
        uint256 slotIndex,
        bytes32 subscriptionId,
        uint32 expirationTimestamp
    ) external;

    function resetSlot(address airnode, uint256 slotIndex) external;

    function slotCanBeResetByAccount(
        address airnode,
        uint256 slotIndex,
        address account
    ) external view returns (bool);

    // solhint-disable-next-line func-name-mixedcase
    function SLOT_SETTER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function airnodeToSlotIndexToSlot(
        address airnode,
        uint256 slotIndex
    )
        external
        view
        returns (
            bytes32 subscriptionId,
            address setter,
            uint32 expirationTimestamp
        );
}
