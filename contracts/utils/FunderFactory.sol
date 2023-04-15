// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./Funder.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract FunderFactory {
    address public immutable funderImplementation;

    constructor() {
        funderImplementation = address(new Funder());
    }

    // This is a bit awkward in that it doesn't allow one to deploy a clone
    // with the same parameters. However, this is a legit use-case because the
    // previously deployed Funder may have changed owner and/or root, and the
    // user needs a Funder with the old parameters again so they need to deploy
    // with the same parameters. I think the only way to handle this asking for
    // a salt from the user (as in, a salt to be put in the salt below).
    function deployFunder(
        address initialOwner,
        bytes32 initialRoot
    ) external returns (address funder) {
        funder = Clones.cloneDeterministic(
            funderImplementation,
            salt(initialOwner, initialRoot)
        );
        Funder(payable(funder)).initialize(initialOwner, initialRoot);
        // Emit event
    }

    function computeFunderAddress(
        address initialOwner,
        bytes32 initialRoot
    ) external view returns (address funder) {
        funder = Clones.predictDeterministicAddress(
            funderImplementation,
            salt(initialOwner, initialRoot)
        );
    }

    function salt(
        address initialOwner,
        bytes32 initialRoot
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(initialOwner, initialRoot));
    }
}
