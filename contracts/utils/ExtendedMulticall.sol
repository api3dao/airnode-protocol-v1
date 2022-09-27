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

    struct Result {
        bool success;
        bytes returnData;
    }

    event FailedDelegatedcall(
        bytes data,
        uint256 timestamp,
        string errorMessage,
        address indexed sender
    );

    function tryMulticall(bytes[] calldata data)
        external
        returns (Result[] memory results)
    {
        results = new Result[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(
                data[i]
            );
            if (!success) {
                // We do not bubble up the revert string from `callData`
                emit FailedDelegatedcall(
                    data[i],
                    block.timestamp,
                    "low-level delegate call failed",
                    msg.sender
                );
            }

            results[i] = Result(success, result);
        }
        return results;
    }
}
