// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./Funder.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract FunderFactory {
    address public immutable funderImplementation;

    constructor() {
        funderImplementation = address(new Funder());
    }

    function deployFunder(
        address owner,
        bytes32 root
    ) external returns (address funder) {
        funder = Clones.cloneDeterministic(
            funderImplementation,
            salt(owner, root)
        );
        Funder(payable(funder)).initialize(owner, root);
        // Emit event
    }

    function computeFunderAddress(
        address owner,
        bytes32 root
    ) external view returns (address funder) {
        funder = Clones.predictDeterministicAddress(
            funderImplementation,
            salt(owner, root)
        );
    }

    function salt(address owner, bytes32 root) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, root));
    }
}
