// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../Median.sol";

contract MockMedian is Median {
    function exposedMedian(
        int256[] memory array
    ) external pure returns (int256) {
        return median(array);
    }

    function exposedAverage(int256 x, int256 y) external pure returns (int256) {
        unchecked {
            int256 averageRoundedDownToNegativeInfinity = (x >> 1) +
                (y >> 1) +
                (x & y & 1);
            return
                averageRoundedDownToNegativeInfinity +
                (int256(
                    (uint256(averageRoundedDownToNegativeInfinity) >> 255)
                ) & (x ^ y));
        }
    }
}
