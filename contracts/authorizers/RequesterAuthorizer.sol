// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "./interfaces/IRequesterAuthorizer.sol";

/// @title Abstract contract to be inherited by Authorizer contracts that
/// temporarily or permanently authorizes requesters for Airnodes
abstract contract RequesterAuthorizer is ERC2771Context, IRequesterAuthorizer {
    struct AuthorizationStatus {
        uint32 expirationTimestamp;
        uint224 indefiniteAuthorizationCount;
    }

    // There are four roles implemented in this contract:
    // Root
    // └── (1) Admin (can grant and revoke the roles below)
    //     ├── (2) Authorization expiration extender
    //     ├── (3) Authorization expiration setter
    //     └── (4) Indefinite authorizer
    // Their IDs are derived from the descriptions below. Refer to
    // AccessControlRegistry for more information.
    // To clarify, the root role of the manager is the admin of (1), while (1)
    // is the admin of (2), (3) and (4). So (1) is more of a "contract admin",
    // while the `adminRole` used in AccessControl and AccessControlRegistry
    // refers to a more general adminship relationship between roles.

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

    bytes32
        internal constant AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION_HASH =
        keccak256(
            abi.encodePacked(AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION)
        );

    bytes32
        internal constant AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION_HASH =
        keccak256(
            abi.encodePacked(AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION)
        );

    bytes32 internal constant INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION_HASH =
        keccak256(abi.encodePacked(INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION));

    mapping(address => mapping(address => AuthorizationStatus))
        public
        override airnodeToRequesterToAuthorizationStatus;

    mapping(address => mapping(address => mapping(address => bool)))
        public
        override airnodeToRequesterToSetterToIndefiniteAuthorizationStatus;

    /// @param _trustedForwarder Trusted forwarder that verifies and executes
    /// signed meta-txes
    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    /// @notice Extends the expiration of the temporary authorization of
    /// `requester` for `airnode`
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
            _msgSender(),
            expirationTimestamp
        );
    }

    /// @notice Sets the expiration of the temporary authorization of
    /// `requester` for `airnode`
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
            _msgSender(),
            expirationTimestamp
        );
    }

    /// @notice Sets the indefinite authorization status of `requester` for
    /// `airnode`
    /// @dev Emits the event even if it does not change the state.
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
            _msgSender(),
            status,
            indefiniteAuthorizationCount
        );
    }

    /// @notice Revokes the indefinite authorization status granted to
    /// `requester` for `airnode` by a specific account
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
                _msgSender(),
                indefiniteAuthorizationCount
            );
        }
    }

    /// @notice Verifies the authorization status of a request
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
}
