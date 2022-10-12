// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Multicall.sol";

/// @notice Contract that extends the functionality of Multicall to cover the
/// retrieval of some globally available variables
contract ExtendedMulticall is Multicall {
    /// @notice Returns the chain ID
    /// @return Chain ID
    function getChainId() external view returns (uint256) {
        return block.chainid;
    }

    /// @notice Returns the account balance
    /// @param account Account address
    /// @return Account balance
    function getBalance(address account) external view returns (uint256) {
        return account.balance;
    }

    /// @notice Returns the current block number
    /// @return Current block number
    function getBlockNumber() external view returns (uint256) {
        return block.number;
    }

    /// @notice Returns the current block timestamp
    /// @return Current block timestamp
    function getBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    /// @notice Returns the current block basefee
    /// @return Current block basefee
    function getBlockBasefee() external view returns (uint256) {
        return block.basefee;
    }

    /// @notice Receives and executes a batch of function calls on this contract
    /// @dev Unlike Openzeppelin.multicall(), this function does not revert when a call fails
    /// @param data Array with each function call data
    /// @return succeeded Array with each call success condition
    /// @return returnData Array with each call result
    function tryMulticall(bytes[] calldata data)
        external
        returns (bool[] memory succeeded, bytes[] memory returnData)
    {
        succeeded = new bool[](data.length);
        returnData = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(
                data[i]
            );
            succeeded[i] = success;
            returnData[i] = result;
        }
    }
}
