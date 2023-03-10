// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IExternalMulticall.sol";

/// @title Contract that enables calls to external contracts to be batched
/// @notice This contract can be used for two use-cases: (1) In its current
/// state, it can be used to batch static calls to contracts that do not care
/// about who the sender is, (2) after extending it, to interact with trusted
/// contracts (see below for details). It implements two ways of batching, one
/// requires none of the calls to revert and the other tolerates individual
/// calls reverting.
/// @dev As mentioned above, this contract can be used to interact with trusted
/// contracts. Such interactions can leave this contract in a privileged
/// position (e.g., ExternalMulticall may be left with a non-zero balance of an
/// ERC20 token as a result of a transaction sent to it), which can be abused
/// by an attacker afterwards. In addition, attackers can frontrun interactions
/// to have the following interaction result in an unintended outcome. A
/// general solution to these attacks is overriding both multicall functions
/// behind an access control mechanism, such as an `onlyOwner` modifier.
/// Refer to MakerDAO's Multicall.sol for a similar implementation.
abstract contract ExternalMulticall is IExternalMulticall {
    /// @notice Batches calls to external contracts and reverts as soon as one
    /// of the batched calls reverts
    /// @param targets Array of target addresses of batched calls
    /// @param data Array of calldata of batched calls
    /// @return returndata Array of returndata of batched calls
    function externalMulticall(
        address[] calldata targets,
        bytes[] calldata data
    ) public virtual override returns (bytes[] memory returndata) {
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
        public
        virtual
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
            } else {
                returndata[ind] = abi.encodeWithSignature(
                    "Error(string)",
                    "Multicall target not contract"
                );
            }
            unchecked {
                ind++;
            }
        }
    }
}
