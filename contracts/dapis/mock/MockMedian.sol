// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../Median.sol";

contract MockMedian is Median {
    function exposedMedian(uint256[] memory array)
        external
        pure
        returns (uint256)
    {
        return median(array);
    }
}
