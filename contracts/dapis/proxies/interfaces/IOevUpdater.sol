// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IOevUpdater {
    error WithdrawalReverted();

    function withdraw() external;

    function updateOevProxyDataFeedWithEncodedSignedData(
        bytes calldata encodedSignedData
    ) external payable;

    function oevBeneficiary() external view returns (address);
}
