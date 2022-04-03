// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IRequesterAuthorizerWhitelisterWithToken.sol";

interface IRequesterAuthorizerWhitelisterWithTokenDeposit is
    IRequesterAuthorizerWhitelisterWithToken
{
    event SetWithdrawalLeadTime(uint256 withdrawalLeadTime, address sender);

    event DepositedTokens(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address sender,
        uint256 tokenDepositsCount,
        uint256 tokenDepositAmount
    );

    event SignaledWithdrawalIntent(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address sender,
        uint256 tokenDepositsCount
    );

    event WithdrewTokens(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address sender,
        uint256 tokenDepositsCount,
        uint256 tokenWithdrawAmount
    );

    event WithdrewTokensDepositedForBlockedRequester(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address depositor,
        uint256 tokenDepositsCount,
        uint256 tokenWithdrawAmount
    );

    function setWithdrawalLeadTime(uint256 _withdrawalLeadTime) external;

    function depositTokens(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester
    ) external;

    function signalWithdrawalIntent(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester
    ) external;

    function withdrawTokens(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester
    ) external;

    function withdrawFundsDepositedForBlockedRequester(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address depositor
    ) external;

    function airnodeToChainIdToEndpointIdToRequesterToTokenDepositsCount(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester
    ) external view returns (uint256);

    function airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToAmount(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address depositor
    ) external view returns (uint256);

    function airnodeToChainIdToEndpointIdToRequesterToTokenDepositorToEarliestWithdrawalTime(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address depositor
    ) external view returns (uint256);

    function withdrawalLeadTime() external view returns (uint256);
}
