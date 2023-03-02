// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../ExternalMulticall.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// This contract overrides the multicall functions to demonstrate how they can
// be extended to only allow the owner to execute multicalls. However, we
// only do that in comments because we want to test the vanilla contract.
contract MockExternalMulticall is ExternalMulticall, Ownable {
    function externalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    ) public virtual override returns (bytes[] memory returndata) {
        // _checkOwner();
        return super.externalMulticall(targets, data);
    }

    function tryExternalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    )
        public
        virtual
        override
        returns (bool[] memory successes, bytes[] memory returndata)
    {
        // _checkOwner();
        return super.tryExternalMulticall(targets, data);
    }
}
