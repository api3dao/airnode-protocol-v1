// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRequesterAuthorizer {
    event ExtendedAuthorizationExpiration(
        address indexed airnode,
        address indexed requester,
        uint32 expirationTimestamp,
        address sender
    );

    event SetAuthorizationExpiration(
        address indexed airnode,
        address indexed requester,
        uint32 expirationTimestamp,
        address sender
    );

    event SetIndefiniteAuthorizationStatus(
        address indexed airnode,
        address indexed requester,
        bool status,
        uint224 indefiniteAuthorizationCount,
        address sender
    );

    event RevokedIndefiniteAuthorizationStatus(
        address indexed airnode,
        address indexed requester,
        address setter,
        uint224 indefiniteAuthorizationCount,
        address sender
    );

    function extendAuthorizerExpiration(
        address airnode,
        address requester,
        uint32 expirationTimestamp
    ) external;

    function setAuthorizationExpiration(
        address airnode,
        address requester,
        uint32 expirationTimestamp
    ) external;

    function setIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        bool status
    ) external;

    function revokeIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        address setter
    ) external;

    function isAuthorized(
        address airnode,
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

    function airnodeToRequesterToAuthorizationStatus(
        address airnode,
        address requester
    )
        external
        view
        returns (
            uint32 expirationTimestamp,
            uint224 indefiniteAuthorizationCount
        );

    function airnodeToRequesterToSetterToIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        address setter
    ) external view returns (bool indefiniteAuthorizationStatus);
}
