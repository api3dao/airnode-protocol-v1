// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./interfaces/IOevSearcherMulticall.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Contract that enables an OEV searcher to make batched calls to
/// external, trusted accounts to facilitate value extraction
/// @notice Any of the batched calls failing will result in the transaction to
/// be reverted. Batched calls are allowed to send values. The contract is
/// allowed to receive funds in case this is required during value extraction.
/// @dev OEV searchers that will be targeting the same contracts repeatedly are
/// recommended to develop and use a more optimized version of this contract
contract OevSearcherMulticall is IOevSearcherMulticall, Ownable {
    receive() external payable {}

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
    ) public payable virtual onlyOwner returns (bytes[] memory returndata) {
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
    function withdrawBalance() public virtual onlyOwner {
        uint256 contractBalance = address(this).balance;
        require(contractBalance > 0, "No funds to withdraw");
        (bool sent, ) = payable(msg.sender).call{value: contractBalance}("");
        require(sent, "Withdraw failed");
    }
}
