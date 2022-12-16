// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/// @dev The multicall target functions are pure for simplicity. This does not
/// necessarily have to be the case in practice.
contract MockMulticallTarget {
    error MyError(uint256 fieldAlways123, string fieldAlwaysFoo);

    function alwaysRevertsWithString(
        int256 argPositive,
        int256 argNegative
    ) external {
        require(argPositive > 0 && argNegative < 0, "Invalid argument");
        revert("Reverted with string");
    }

    function alwaysRevertsWithCustomError(
        int256 argPositive,
        int256 argNegative
    ) external pure {
        require(argPositive > 0 && argNegative < 0, "Invalid argument");
        revert MyError(123, "Foo");
    }

    function alwaysRevertsWithNoData(
        int256 argPositive,
        int256 argNegative
    ) external pure {
        require(argPositive > 0 && argNegative < 0, "Invalid argument");
        revert(); // solhint-disable-line reason-string
    }

    function convertsPositiveArgumentToNegative(
        int256 argPositive
    ) external pure returns (int256) {
        require(argPositive > 0, "Argument not positive");
        return -argPositive;
    }
}
