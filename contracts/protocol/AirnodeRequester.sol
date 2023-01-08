// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IAirnodeProtocol.sol";
import "./interfaces/IAirnodeRequester.sol";

/// @title Contract to be inherited by contracts that will make Airnode
/// requests and receive fulfillments
contract AirnodeRequester is IAirnodeRequester {
    /// @notice AirnodeProtocol contract address
    address public immutable override airnodeProtocol;

    /// @dev Reverts if the sender is not the AirnodeProtocol contract. Use
    /// this modifier with methods that are meant to receive RRP fulfillments.
    modifier onlyAirnodeProtocol() {
        require(
            msg.sender == address(airnodeProtocol),
            "Sender not Airnode protocol"
        );
        _;
    }

    /// @dev Reverts if the timestamp is not valid. Use this modifier with
    /// methods that are meant to receive RRP and PSP fulfillments.
    /// @param timestamp Timestamp used in the signature
    modifier onlyValidTimestamp(uint256 timestamp) {
        require(timestampIsValid(timestamp), "Timestamp not valid");
        _;
    }

    /// @param _airnodeProtocol AirnodeProtocol contract address
    constructor(address _airnodeProtocol) {
        require(_airnodeProtocol != address(0), "AirnodeProtocol address zero");
        airnodeProtocol = _airnodeProtocol;
    }

    /// @notice Returns if the timestamp used in the signature is valid
    /// @dev If and how the timestamp should be validated depends on the nature
    /// of the request. If the request is "return me the price of this asset at
    /// this specific time in history", it can be assumed that the response
    /// will not go out of date. If the request is "return me the price of this
    /// asset now", the requester would rather not consider a response that is
    /// not immediate. Since users commonly make the latter type of requests,
    /// we provide an example timestamp validation function. Feel free to use a
    /// different condition or even omit it if you are aware of the
    /// implications.
    /// @param timestamp Timestamp used in the signature
    function timestampIsValid(uint256 timestamp) internal view returns (bool) {
        unchecked {
            return
                timestamp + 1 hours > block.timestamp &&
                timestamp < block.timestamp + 15 minutes;
        }
    }
}
