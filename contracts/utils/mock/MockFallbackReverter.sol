// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../OevSearcherMulticall.sol";

contract FallbackReverter {
    function withdrawFrom(address payable oevSearcherMulticall) public {
        OevSearcherMulticall(oevSearcherMulticall).withdrawBalance();
    }

    // Revert on receiving Ether
    receive() external payable {
        revert("Cannot receive Ether");
    }
}
