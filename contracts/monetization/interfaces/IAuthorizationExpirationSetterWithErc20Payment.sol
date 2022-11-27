// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IAuthorizerWithErc20.sol";

interface IAuthorizationExpirationSetterWithErc20Payment is
    IAuthorizerWithErc20
{
    event PaidTokens(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        uint64 authorizationExpirationExtension,
        address sender,
        uint64 newExpirationTimestamp
    );

    event ResetAuthorizationExpirationOfBlockedRequester(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        address sender
    );

    event SetMinimumAuthorizationExpirationExtension(
        uint64 minimumAuthorizationExpiraitonExtension,
        address sender
    );

    event SetMaximumAuthorizationExpiration(
        uint64 maximumAuthorizationExpiration,
        address sender
    );

    function payTokens(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        uint64 authorizationExpirationExtension
    ) external;

    function resetAuthorizationExpirationOfBlockedRequester(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester
    ) external;

    function setMinimumAuthorizationExpirationExtension(
        uint64 _minimumAuthorizationExpiraitonExtension
    ) external;

    function setMaximumAuthorizationExpiration(
        uint64 _maximumAuthorizationExpiration
    ) external;

    function getTokenPaymentAmount(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        uint64 authorizationExpirationExtension
    ) external view returns (uint256 tokenPaymentAmount);

    function minimumAuthorizationExpiraitonExtension()
        external
        view
        returns (uint64);

    function maximumAuthorizationExpiration() external view returns (uint64);
}
