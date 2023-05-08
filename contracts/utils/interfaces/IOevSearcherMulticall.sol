// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IOevSearcherMulticall {
    function externalMulticallWithValue(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) external payable returns (bytes[] memory returndata);

    function withdrawBalance() external;
}
