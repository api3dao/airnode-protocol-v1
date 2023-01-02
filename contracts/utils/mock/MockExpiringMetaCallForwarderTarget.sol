// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockExpiringMetaCallForwarderTarget is ERC2771Context, Ownable {
    uint256 public counter = 0;

    constructor(
        address _trustedForwarder,
        address _owner
    ) ERC2771Context(_trustedForwarder) {
        _transferOwnership(_owner);
    }

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
