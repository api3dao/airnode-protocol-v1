// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IOevUpdater {
    error WithdrawalReverted();

    function withdraw() external;

    function updateOevProxyDataFeedWithSignedData(
        address[] memory airnodes,
        bytes32[] memory templateIds,
        uint256[] memory timestamps,
        bytes[] memory data,
        bytes[] memory signatures
    ) external payable;

    function oevBeneficiary() external view returns (address);
}
