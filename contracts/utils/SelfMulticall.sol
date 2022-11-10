// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Contract that enables the calls to the inheriting contract to be
/// batched
/// @dev Refer to OpenZeppelin's Multicall.sol for a similar implementation
contract SelfMulticall {
    /// @notice Batches calls to the inheriting contract and reverts if at
    /// least one of the batched calls reverts
    /// @dev Bubbles up the raw returndata if a call reverts, leaving decoding
    /// to the user
    /// @param data Array of calldata of batched calls
    /// @param returndata Array of returndata of batched calls
    function multicall(bytes[] calldata data)
        external
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
    /// @param success Array of success conditions of batched calls
    /// @param returndata Array of returndata of batched calls
    function tryMulticall(bytes[] calldata data)
        external
        returns (bool[] memory success, bytes[] memory returndata)
    {
        success = new bool[](data.length);
        returndata = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (success[i], returndata[i]) = address(this).delegatecall(data[i]); // solhint-disable-line avoid-low-level-calls
        }
    }
}
