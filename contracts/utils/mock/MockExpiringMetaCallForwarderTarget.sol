// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockExpiringMetaCallForwarderTarget is ERC2771Context, Ownable {
    uint256 public counter = 0;

    /// @param _trustedForwarder Trusted forwarder that verifies and executes
    /// signed meta-calls
    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    function incrementCounter() external onlyOwner {
        counter++;
    }

    function _msgSender()
        internal
        view
        virtual
        override(Context, ERC2771Context)
        returns (address sender)
    {
        return ERC2771Context._msgSender();
    }

    function _msgData()
        internal
        view
        virtual
        override(Context, ERC2771Context)
        returns (bytes calldata)
    {
        return ERC2771Context._msgData();
    }
}
