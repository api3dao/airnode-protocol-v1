// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./interfaces/IOevSearcherMulticall.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Contract that enables batched calls to external contracts with value
/// @notice This contract can be used for two use-cases: (1) In its current
/// state, it can be used to batch static calls to contracts that do not care
/// about who the sender is, (2) after extending it, to interact with trusted
/// contracts (see below for details). It implements a way of batching with value,
/// and requires none of the calls to revert.
/// @dev As mentioned above, this contract can be used to interact with trusted
/// contracts. Such interactions can leave this contract in a privileged
/// position (e.g., OevSearcherMulticall may be left with a non-zero balance of an
/// ERC20 token as a result of a transaction sent to it), which can be abused
/// by an attacker afterwards. In addition, attackers can frontrun interactions
/// to have the following interaction result in an unintended outcome. A
/// general solution to these attacks is overriding the externalMulticallWithValue function
/// behind an access control mechanism, such as an `onlyOwner` modifier.
/// Refer to MakerDAO's Multicall.sol for a similar implementation.
contract OevSearcherMulticall is IOevSearcherMulticall, Ownable {
    /// @notice Batches calls to external contracts with value and reverts as soon as one
    /// of the batched calls reverts
    /// @param targets Array of target addresses of batched calls
    /// @param data Array of calldata of batched calls
    /// @param values Array of values to send with each call
    /// @dev Can only be called by the contract owner
    /// @return returndata Array of returndata of batched calls
    function externalMulticallWithValue(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    )
        public
        payable
        virtual
        override
        onlyOwner
        returns (bytes[] memory returndata)
    {
        uint256 callCount = targets.length;
        require(
            callCount == data.length && callCount == values.length,
            "Parameter length mismatch"
        );
        uint256 accumulatedValue = 0;
        returndata = new bytes[](callCount);
        for (uint256 ind = 0; ind < callCount; ) {
            accumulatedValue += values[ind];
            require(msg.value >= accumulatedValue, "Insufficient value");
            require(
                targets[ind].code.length > 0,
                "Multicall target not contract"
            );
            bool success;
            // solhint-disable-next-line avoid-low-level-calls
            (success, returndata[ind]) = targets[ind].call{value: values[ind]}(
                data[ind]
            );
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
        require(msg.value == accumulatedValue, "Excess value");
    }

    /// @notice Withdraws the entire balance held by the contract to the owner
    /// @dev Can only be called by the contract owner
    function withdrawBalance() external onlyOwner {
        (bool sent, ) = payable(msg.sender).call{value: address(this).balance}(
            ""
        );
        require(sent, "Failed to send Ether");
    }
}
