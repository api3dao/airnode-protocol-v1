// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/ISelfMulticall.sol";

/// @notice Contract that enables calls to the inheriting contract to be
/// batched
/// @dev Refer to OpenZeppelin's Multicall.sol for a similar implementation
contract SelfMulticall is ISelfMulticall {
    /// @notice Batches calls to the inheriting contract and reverts if at
    /// least one of the batched calls reverts
    /// @param data Array of calldata of batched calls
    /// @return returndata Array of returndata of batched calls
    function multicall(
        bytes[] calldata data
    ) external override returns (bytes[] memory returndata) {
        returndata = new bytes[](data.length);
        for (uint256 ind = 0; ind < data.length; ind++) {
            bool success;
            // solhint-disable-next-line avoid-low-level-calls
            (success, returndata[ind]) = address(this).delegatecall(data[ind]);
            if (!success) {
                bytes memory returndataWithRevertData = returndata[ind];
                if (returndataWithRevertData.length > 0) {
                    // Adapted from OpenZeppelin's Address.sol
                    // solhint-disable-next-line no-inline-assembly
                    assembly {
                        let returndata_size := mload(returndataWithRevertData)
                        revert(
                            add(32, returndataWithRevertData),
                            returndata_size
                        )
                    }
                } else {
                    revert("Multicall: No revert string");
                }
            }
        }
    }

    /// @notice Batches calls to the inheriting contract but does not revert if
    /// any of the batched calls reverts
    /// @param data Array of calldata of batched calls
    /// @return successes Array of success conditions of batched calls
    /// @return returndata Array of returndata of batched calls
    function tryMulticall(
        bytes[] calldata data
    )
        external
        override
        returns (bool[] memory successes, bytes[] memory returndata)
    {
        successes = new bool[](data.length);
        returndata = new bytes[](data.length);
        for (uint256 ind = 0; ind < data.length; ind++) {
            // solhint-disable-next-line avoid-low-level-calls
            (successes[ind], returndata[ind]) = address(this).delegatecall(
                data[ind]
            );
        }
    }
}
