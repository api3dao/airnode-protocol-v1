// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../ExternalMulticallWithValue.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// This contract overrides the multicall functions to demonstrate how they can
// be extended to only allow the owner to execute multicalls. However, we
// only do that in comments because we want to test the vanilla contract.
contract MockExternalMulticallWithValue is ExternalMulticallWithValue, Ownable {
    function externalMulticallWithValue(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) public payable virtual override returns (bytes[] memory returndata) {
        // _checkOwner();
        return super.externalMulticallWithValue(targets, data, values);
    }
}
