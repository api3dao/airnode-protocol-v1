// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/ISelfMulticall.sol";

/// @notice Contract that enables calls to the inheriting contract to be
/// batched
/// @dev Refer to OpenZeppelin's Multicall.sol for a similar implementation
contract SelfMulticall is ISelfMulticall {
    /// @notice Batches calls to the inheriting contract and reverts if at
    /// least one of the batched calls reverts
    /// @dev Bubbles up the raw returndata if a call reverts, leaving decoding
    /// to the user
    /// @param data Array of calldata of batched calls
    /// @param returndata Array of returndata of batched calls
    function selfMulticall(bytes[] calldata data)
        external
        override
        returns (bytes[] memory returndata)
    {
        returndata = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            bool success;
            (success, returndata[i]) = address(this).delegatecall(data[i]); // solhint-disable-line avoid-low-level-calls
            require(
                success,
                string(abi.encodePacked("Multicall:", string(returndata[i])))
            );
        }
    }

    /// @notice Batches calls to the inheriting contract but does not revert if
    /// any of the batched calls reverts
    /// @param data Array of calldata of batched calls
    /// @param successes Array of success conditions of batched calls
    /// @param returndata Array of returndata of batched calls
    function trySelfMulticall(bytes[] calldata data)
        external
        override
        returns (bool[] memory successes, bytes[] memory returndata)
    {
        successes = new bool[](data.length);
        returndata = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (successes[i], returndata[i]) = address(this).delegatecall(data[i]); // solhint-disable-line avoid-low-level-calls
        }
    }
}