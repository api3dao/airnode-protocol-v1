// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract MockExpiringMetaCallForwarderTarget is ERC2771Context {
    address public immutable deployer;
    uint256 public counter = 0;

    /// @param _trustedForwarder Trusted forwarder that verifies and executes
    /// signed meta-calls
    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {
        deployer = msg.sender;
    }

    function incrementCounter() external {
        require(_msgSender() == deployer, "Sender not deployer");
        counter++;
    }
}
