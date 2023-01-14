// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IRequesterAuthorizer.sol";

/// @title Abstract contract that temporarily or indefinitely authorizes
/// requesters for Airnodes
/// @dev Airnodes can be configured to use multiple Authorizers, and one of
/// them returning `true` means the request should be responded to. The Airnode
/// operator is expected to communicate the required information to the users
/// through off-chain channels.
abstract contract RequesterAuthorizer is IRequesterAuthorizer {
    struct AuthorizationStatus {
        uint32 expirationTimestamp;
        uint224 indefiniteAuthorizationCount;
    }

    /// @notice Authorization expiration extender role description
    string
        public constant
        override AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION =
        "Authorization expiration extender";

    /// @notice Authorization expiration setter role description
    string
        public constant
        override AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION =
        "Authorization expiration setter";

    /// @notice Indefinite authorizer role description
    string public constant override INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION =
        "Indefinite authorizer";

    mapping(address => mapping(address => AuthorizationStatus))
        public
        override airnodeToRequesterToAuthorizationStatus;

    mapping(address => mapping(address => mapping(address => bool)))
        public
        override airnodeToRequesterToSetterToIndefiniteAuthorizationStatus;

    /// @notice Extends the expiration of the temporary authorization of
    /// the requester` for the Airnode
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function _extendAuthorizationExpiration(
        address airnode,
        address requester,
        uint32 expirationTimestamp
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        require(
            expirationTimestamp >
                airnodeToRequesterToAuthorizationStatus[airnode][requester]
                    .expirationTimestamp,
            "Does not extend expiration"
        );
        airnodeToRequesterToAuthorizationStatus[airnode][requester]
            .expirationTimestamp = expirationTimestamp;
        emit ExtendedAuthorizationExpiration(
            airnode,
            requester,
            expirationTimestamp,
            _msgSender()
        );
    }

    /// @notice Sets the expiration of the temporary authorization of
    /// the requester for  the Airnode
    /// @dev Unlike `_extendAuthorizerExpiration()`, this can hasten expiration
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function _setAuthorizationExpiration(
        address airnode,
        address requester,
        uint32 expirationTimestamp
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        airnodeToRequesterToAuthorizationStatus[airnode][requester]
            .expirationTimestamp = expirationTimestamp;
        emit SetAuthorizationExpiration(
            airnode,
            requester,
            expirationTimestamp,
            _msgSender()
        );
    }

    /// @notice Sets the indefinite authorization status of the requester for
    /// the Airnode
    /// @dev Emits the event even if it does not change the state
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param status Indefinite authorization status
    function _setIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        bool status
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        uint224 indefiniteAuthorizationCount = airnodeToRequesterToAuthorizationStatus[
                airnode
            ][requester].indefiniteAuthorizationCount;
        if (
            status &&
            !airnodeToRequesterToSetterToIndefiniteAuthorizationStatus[airnode][
                requester
            ][_msgSender()]
        ) {
            airnodeToRequesterToSetterToIndefiniteAuthorizationStatus[airnode][
                requester
            ][_msgSender()] = true;
            unchecked {
                indefiniteAuthorizationCount++;
            }
            airnodeToRequesterToAuthorizationStatus[airnode][requester]
                .indefiniteAuthorizationCount = indefiniteAuthorizationCount;
        } else if (
            !status &&
            airnodeToRequesterToSetterToIndefiniteAuthorizationStatus[airnode][
                requester
            ][_msgSender()]
        ) {
            airnodeToRequesterToSetterToIndefiniteAuthorizationStatus[airnode][
                requester
            ][_msgSender()] = false;
            unchecked {
                indefiniteAuthorizationCount--;
            }
            airnodeToRequesterToAuthorizationStatus[airnode][requester]
                .indefiniteAuthorizationCount = indefiniteAuthorizationCount;
        }
        emit SetIndefiniteAuthorizationStatus(
            airnode,
            requester,
            status,
            indefiniteAuthorizationCount,
            _msgSender()
        );
    }

    /// @notice Revokes the indefinite authorization status granted to the
    /// requester for the Airnode by a specific account
    /// @dev Only emits the event if it changes the state
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param setter Setter of the indefinite authorization status
    function _revokeIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        address setter
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        require(setter != address(0), "Setter address zero");
        uint224 indefiniteAuthorizationCount = airnodeToRequesterToAuthorizationStatus[
                airnode
            ][requester].indefiniteAuthorizationCount;
        if (
            airnodeToRequesterToSetterToIndefiniteAuthorizationStatus[airnode][
                requester
            ][setter]
        ) {
            airnodeToRequesterToSetterToIndefiniteAuthorizationStatus[airnode][
                requester
            ][setter] = false;
            unchecked {
                indefiniteAuthorizationCount--;
            }
            airnodeToRequesterToAuthorizationStatus[airnode][requester]
                .indefiniteAuthorizationCount = indefiniteAuthorizationCount;
            emit RevokedIndefiniteAuthorizationStatus(
                airnode,
                requester,
                setter,
                indefiniteAuthorizationCount,
                _msgSender()
            );
        }
    }

    /// @notice Verifies the authorization status of the requester for the
    /// Airnode
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @return Authorization status of the request
    function isAuthorized(
        address airnode,
        address requester
    ) public view override returns (bool) {
        AuthorizationStatus
            storage authorizationStatus = airnodeToRequesterToAuthorizationStatus[
                airnode
            ][requester];
        return
            authorizationStatus.indefiniteAuthorizationCount > 0 ||
            authorizationStatus.expirationTimestamp > block.timestamp;
    }

    /// @dev See Context.sol
    function _msgSender() internal view virtual returns (address sender);
}
