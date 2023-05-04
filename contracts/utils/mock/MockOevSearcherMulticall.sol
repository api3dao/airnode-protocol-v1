// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../OevSearcherMulticall.sol";

// This contract overrides the multicall functions to demonstrate how they can
// be extended to only allow the owner to execute multicalls. However, we
// only do that in comments because we want to test the vanilla contract.
contract MockOevSearcherMulticall is OevSearcherMulticall {
    function externalMulticallWithValue(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) public payable virtual override returns (bytes[] memory returndata) {
        // _checkOwner();
        return super.externalMulticallWithValue(targets, data, values);
    }
}
