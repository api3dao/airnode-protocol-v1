// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Sort.sol";
import "./QuickSelect.sol";

/// @title Contract to be inherited by contracts that will calculate the median
/// of an array
/// @notice The operation will be in-place, i.e., the array provided as the
/// argument will be modified.
contract Median is Sort, Quickselect {
    /// @notice Returns the median of the array
    /// @dev Uses an unrolled sorting implementation for shorter arrays and
    /// quickselect for longer arrays for gas cost efficiency
    /// @param array Array whose median is to be calculated
    /// @return Median of the array
    function median(int256[] memory array) internal pure returns (int256) {
        uint256 arrayLength = array.length;
        if (arrayLength <= MAX_SORT_LENGTH) {
            sort(array);
            if (arrayLength % 2 == 1) {
                return array[arrayLength / 2];
            } else {
                assert(arrayLength != 0);
                unchecked {
                    return
                        average(
                            array[arrayLength / 2 - 1],
                            array[arrayLength / 2]
                        );
                }
            }
        } else {
            if (arrayLength % 2 == 1) {
                return array[quickselectK(array, arrayLength / 2)];
            } else {
                uint256 mid1;
                uint256 mid2;
                unchecked {
                    (mid1, mid2) = quickselectKPlusOne(
                        array,
                        arrayLength / 2 - 1
                    );
                }
                return average(array[mid1], array[mid2]);
            }
        }
    }

    /// @notice Averages two signed integers without overflowing
    /// @param x Integer x
    /// @param y Integer y
    /// @return Average of integers x and y
    function average(int256 x, int256 y) private pure returns (int256) {
        if (x > 0 != y > 0) {
            // No risk of overflow if the signs are different, add them and
            // divide by 2
            unchecked {
                return (x + y) / 2;
            }
        } else {
            // There is risk of overflow if the signs are the same, divide by 2
            // before adding and compensate for the gobbled bit
            unchecked {
                return x / 2 + y / 2 + ((x % 2) + (y % 2)) / 2;
            }
        }
    }
}
