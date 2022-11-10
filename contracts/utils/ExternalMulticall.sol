// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IExternalMulticall.sol";

/// @notice Contract that enables calls to external contracts to be batched
/// @dev Refer to MakerDAO's Multicall.sol for a similar implementation
contract ExternalMulticall is IExternalMulticall {
    /// @notice Batches calls to external contracts and reverts if at
    /// least one of the batched calls reverts
    /// @dev Bubbles up the raw returndata if a call reverts, leaving decoding
    /// to the user
    /// @param targets Array of target addresses of batched calls
    /// @param data Array of calldata of batched calls
    /// @param returndata Array of returndata of batched calls
    function externalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    ) external override returns (bytes[] memory returndata) {
        returndata = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            require(
                targets[i].code.length > 0,
                "Multicall target not contract"
            );
            bool success;
            (success, returndata[i]) = targets[i].call(data[i]); // solhint-disable-line avoid-low-level-calls
            require(
                success,
                string(abi.encodePacked("Multicall:", string(returndata[i])))
            );
        }
    }

    /// @notice Batches calls to external contracts but does not revert if any
    /// of the batched calls reverts
    /// @param targets Array of target addresses of batched calls
    /// @param data Array of calldata of batched calls
    /// @param successes Array of success conditions of batched calls
    /// @param returndata Array of returndata of batched calls
    function tryExternalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    )
        external
        override
        returns (bool[] memory successes, bytes[] memory returndata)
    {
        successes = new bool[](data.length);
        returndata = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            if (targets[i].code.length > 0) {
                (successes[i], returndata[i]) = targets[i].call(data[i]); // solhint-disable-line avoid-low-level-calls
            }
        }
    }
}
