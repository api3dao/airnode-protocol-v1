// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IAuthorizerV0.sol";

interface IRequesterAuthorizer is IAuthorizerV0 {
    event ExtendedAuthorizationExpiration(
        address indexed airnode,
        bytes32 endpointId,
        address indexed requester,
        address indexed sender,
        uint256 expiration
    );

    event SetAuthorizationExpiration(
        address indexed airnode,
        bytes32 endpointId,
        address indexed requester,
        address indexed sender,
        uint256 expiration
    );

    event SetIndefiniteAuthorizationStatus(
        address indexed airnode,
        bytes32 endpointId,
        address indexed requester,
        address indexed sender,
        bool status,
        uint192 indefiniteAuthorizationCount
    );

    event RevokedIndefiniteAuthorizationStatus(
        address indexed airnode,
        bytes32 endpointId,
        address indexed requester,
        address indexed setter,
        address sender,
        uint192 indefiniteAuthorizationCount
    );

    function extendAuthorizerExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) external;

    function setAuthorizationExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) external;

    function setIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        bool status
    ) external;

    function revokeIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) external;

    function airnodeToEndpointIdToRequesterToAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester
    )
        external
        view
        returns (
            uint64 expirationTimestamp,
            uint192 indefiniteAuthorizationCount
        );

    function airnodeToEndpointIdToRequesterToSetterToIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) external view returns (bool indefiniteAuthorizationStatus);

    function isAuthorized(
        address airnode,
        bytes32 endpointId,
        address requester
    ) external view returns (bool);

    // solhint-disable-next-line func-name-mixedcase
    function AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    // solhint-disable-next-line func-name-mixedcase
    function AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    // solhint-disable-next-line func-name-mixedcase
    function INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);
}
