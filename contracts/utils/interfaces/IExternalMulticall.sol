// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IExternalMulticall {
    function externalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    ) external returns (bytes[] memory returndata);

    function externalMulticallWithValue(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) external payable returns (bytes[] memory returndata);

    function tryExternalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    ) external returns (bool[] memory success, bytes[] memory returndata);
}
