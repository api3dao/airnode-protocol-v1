// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IOevUpdater.sol";

contract MockOevBeneficiary {
    receive() external payable {
        revert("Always reverts");
    }

    function withdraw(address proxyWithOev) external {
        IOevUpdater(proxyWithOev).withdraw();
    }
}
