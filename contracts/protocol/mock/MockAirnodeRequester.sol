// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../AirnodeRequester.sol";

contract MockAirnodeRequester is AirnodeRequester {
    mapping(bytes32 => bytes) public requestIdToData;

    constructor(address _airnodeProtocol) AirnodeRequester(_airnodeProtocol) {}

    function makeRequest(
        address airnode,
        bytes32 endpointOrTemplateId,
        bytes calldata parameters,
        address sponsor,
        bytes4 fulfillFunctionId
    ) external returns (bytes32 requestId) {
        requestId = IAirnodeProtocol(airnodeProtocol).makeRequest(
            airnode,
            endpointOrTemplateId,
            parameters,
            sponsor,
            fulfillFunctionId
        );
    }

    function makeRequestRelayed(
        address airnode,
        bytes32 endpointOrTemplateId,
        bytes calldata parameters,
        address relayer,
        address sponsor,
        bytes4 fulfillFunctionId
    ) external returns (bytes32 requestId) {
        requestId = IAirnodeProtocol(airnodeProtocol).makeRequestRelayed(
            airnode,
            endpointOrTemplateId,
            parameters,
            relayer,
            sponsor,
            fulfillFunctionId
        );
    }

    function fulfillRequest(
        bytes32 requestId,
        uint256 timestamp,
        bytes calldata data
    ) external onlyAirnodeProtocol onlyValidTimestamp(timestamp) {
        requestIdToData[requestId] = data;
    }

    /// @notice A method to be called back by the respective method at
    /// AirnodeRrp.sol for testing fulfillment failure
    /// @param // requestId Request ID
    /// @param timestamp Timestamp used in the signature
    /// @param // data Data returned by the Airnode
    function fulfillRequestAlwaysReverts(
        bytes32 /* requestId */,
        uint256 timestamp,
        bytes calldata /* data */
    ) external view onlyAirnodeProtocol onlyValidTimestamp(timestamp) {
        revert("Always reverts");
    }

    /// @notice A method to be called back by the respective method at
    /// AirnodeRrp.sol for testing fulfillment failure
    /// @param // requestId Request ID
    /// @param timestamp Timestamp used in the signature
    /// @param // data Data returned by the Airnode
    function fulfillRequestAlwaysRevertsWithNoString(
        bytes32 /* requestId */,
        uint256 timestamp,
        bytes calldata /* data */
    ) external view onlyAirnodeProtocol onlyValidTimestamp(timestamp) {
        revert(); // solhint-disable-line reason-string
    }

    /// @notice A method to be called back by the respective method at
    /// AirnodeRrp.sol for testing fulfillment running out of gas
    /// @param // requestId Request ID
    /// @param timestamp Timestamp used in the signature
    /// @param // data Data returned by the Airnode
    function fulfillRequestAlwaysRunsOutOfGas(
        bytes32 /* requestId */,
        uint256 timestamp,
        bytes calldata /* data */
    ) external view onlyAirnodeProtocol onlyValidTimestamp(timestamp) {
        while (true) {}
    }

    /// @notice Overriden to reject signatures that have been signed 1 hour
    /// before or after `block.timestamp`
    /// @dev The validation scheme implemented here is an arbitrary example. Do
    /// not treat it as a recommendation. Refer to AirnodeRequester for more
    /// information.
    /// @param timestamp Timestamp used in the signature
    function timestampIsValid(
        uint256 timestamp
    ) internal view virtual override returns (bool) {
        return
            timestamp + 1 hours > block.timestamp &&
            timestamp < block.timestamp + 1 hours;
    }
}
