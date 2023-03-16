// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../interfaces/IDataFeedServer.sol";

interface IBeaconSetUpdatesWithPsp is IDataFeedServer {
    function conditionPspBeaconSetUpdate(
        bytes32 subscriptionId,
        bytes calldata data,
        bytes calldata conditionParameters
    ) external view returns (bool);

    function fulfillPspBeaconSetUpdate(
        bytes32 subscriptionId,
        address airnode,
        address relayer,
        address sponsor,
        uint256 timestamp,
        bytes calldata data,
        bytes calldata signature
    ) external;

    // solhint-disable-next-line func-name-mixedcase
    function HUNDRED_PERCENT() external view returns (uint256);
}
