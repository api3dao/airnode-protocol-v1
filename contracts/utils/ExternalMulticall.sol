// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./interfaces/IExternalMulticall.sol";

/// @title Contract that enables calls to external contracts to be batched
/// @notice This contract can be used to batch static calls or to interact with
/// trusted contracts. Implements two ways of batching, one requires none of
/// the calls to revert and the other tolerates individual calls reverting.
/// @dev Refer to MakerDAO's Multicall.sol for a similar implementation
contract ExternalMulticall is IExternalMulticall {
    /// @notice Batches calls to external contracts and reverts if at
    /// least one of the batched calls reverts
    /// @param targets Array of target addresses of batched calls
    /// @param data Array of calldata of batched calls
    /// @return returndata Array of returndata of batched calls
    function externalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    ) external override returns (bytes[] memory returndata) {
        uint256 callCount = targets.length;
        require(callCount == data.length, "Parameter length mismatch");
        returndata = new bytes[](callCount);
        for (uint256 ind = 0; ind < callCount; ) {
            require(
                targets[ind].code.length > 0,
                "Multicall target not contract"
            );
            bool success;
            // solhint-disable-next-line avoid-low-level-calls
            (success, returndata[ind]) = targets[ind].call(data[ind]);
            if (!success) {
                bytes memory returndataWithRevertData = returndata[ind];
                // Adapted from OpenZeppelin's Address.sol
                if (returndataWithRevertData.length > 0) {
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
            unchecked {
                ind++;
            }
        }
    }

    /// @notice Batches calls to external contracts but does not revert if any
    /// of the batched calls reverts
    /// @param targets Array of target addresses of batched calls
    /// @param data Array of calldata of batched calls
    /// @return successes Array of success conditions of batched calls
    /// @return returndata Array of returndata of batched calls
    function tryExternalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    )
        external
        override
        returns (bool[] memory successes, bytes[] memory returndata)
    {
        uint256 callCount = targets.length;
        require(callCount == data.length, "Parameter length mismatch");
        successes = new bool[](callCount);
        returndata = new bytes[](callCount);
        for (uint256 ind = 0; ind < callCount; ) {
            if (targets[ind].code.length > 0) {
                // solhint-disable-next-line avoid-low-level-calls
                (successes[ind], returndata[ind]) = targets[ind].call(
                    data[ind]
                );
            }
            unchecked {
                ind++;
            }
        }
    }
}
