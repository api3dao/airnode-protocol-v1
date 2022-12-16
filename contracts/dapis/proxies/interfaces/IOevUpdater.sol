// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IOevUpdater {
    error WithdrawalReverted();

    function withdraw() external;

    function updateOevProxyDataFeedWithSignedData(
        address[] calldata airnodes,
        bytes32[] calldata templateIds,
        uint256[] calldata timestamps,
        bytes[] calldata data,
        bytes[] calldata signatures
    ) external payable;

    function oevBeneficiary() external view returns (address);
}
