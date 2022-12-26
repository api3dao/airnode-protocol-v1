// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "./interfaces/IRequesterAuthorizer.sol";

/// @title Abstract contract to be inherited by Authorizer contracts that
/// temporarily or permanently authorizes requesters for Airnode–endpoint pairs
/// or Airnodes
/// @dev An authorization for an Airnode with endpoint ID `bytes32(0)`
/// represents a blanket authorization across all endpoints of the Airnode
abstract contract RequesterAuthorizer is ERC2771Context, IRequesterAuthorizer {
    struct AuthorizationStatus {
        uint64 expirationTimestamp;
        uint192 indefiniteAuthorizationCount;
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

    mapping(bytes32 => mapping(address => AuthorizationStatus))
        private serviceIdToUserToAuthorizationStatus;

    mapping(bytes32 => mapping(address => mapping(address => bool)))
        private serviceIdToUserToSetterToIndefiniteAuthorizationStatus;

    /// @param _trustedForwarder Trusted forwarder that verifies and executes
    /// signed meta-calls
    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    /// @notice Extends the expiration of the temporary authorization of
    /// `requester` for `airnode`–`endpointId` pair
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function _extendAuthorizationExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        bytes32 serviceId = deriveServiceId(airnode, endpointId);
        require(
            expirationTimestamp >
                serviceIdToUserToAuthorizationStatus[serviceId][requester]
                    .expirationTimestamp,
            "Does not extend expiration"
        );
        serviceIdToUserToAuthorizationStatus[serviceId][requester]
            .expirationTimestamp = expirationTimestamp;
        emit ExtendedAuthorizationExpiration(
            airnode,
            endpointId,
            requester,
            _msgSender(),
            expirationTimestamp
        );
    }

    /// @notice Sets the expiration of the temporary authorization of
    /// `requester` for `airnode`–`endpointId` pair
    /// @dev Unlike `_extendAuthorizerExpiration()`, this can hasten expiration
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function _setAuthorizationExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        bytes32 serviceId = deriveServiceId(airnode, endpointId);
        serviceIdToUserToAuthorizationStatus[serviceId][requester]
            .expirationTimestamp = expirationTimestamp;
        emit SetAuthorizationExpiration(
            airnode,
            endpointId,
            requester,
            _msgSender(),
            expirationTimestamp
        );
    }

    /// @notice Sets the indefinite authorization status of `requester` for
    /// `airnode`–`endpointId` pair
    /// @dev Emits the event even if it does not change the state.
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param status Indefinite authorization status
    function _setIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        bool status
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        bytes32 serviceId = deriveServiceId(airnode, endpointId);
        uint192 indefiniteAuthorizationCount = serviceIdToUserToAuthorizationStatus[
                serviceId
            ][requester].indefiniteAuthorizationCount;
        if (
            status &&
            !serviceIdToUserToSetterToIndefiniteAuthorizationStatus[serviceId][
                requester
            ][_msgSender()]
        ) {
            serviceIdToUserToSetterToIndefiniteAuthorizationStatus[serviceId][
                requester
            ][_msgSender()] = true;
            unchecked {
                indefiniteAuthorizationCount++;
            }
            serviceIdToUserToAuthorizationStatus[serviceId][requester]
                .indefiniteAuthorizationCount = indefiniteAuthorizationCount;
        } else if (
            !status &&
            serviceIdToUserToSetterToIndefiniteAuthorizationStatus[serviceId][
                requester
            ][_msgSender()]
        ) {
            serviceIdToUserToSetterToIndefiniteAuthorizationStatus[serviceId][
                requester
            ][_msgSender()] = false;
            unchecked {
                indefiniteAuthorizationCount--;
            }
            serviceIdToUserToAuthorizationStatus[serviceId][requester]
                .indefiniteAuthorizationCount = indefiniteAuthorizationCount;
        }
        emit SetIndefiniteAuthorizationStatus(
            airnode,
            endpointId,
            requester,
            _msgSender(),
            status,
            indefiniteAuthorizationCount
        );
    }

    /// @notice Revokes the indefinite authorization status granted to
    /// `requester` for `airnode`–`endpointId` pair by a specific account
    /// @dev Only emits the event if it changes the state
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param setter Setter of the indefinite authorization status
    function _revokeIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        require(setter != address(0), "Setter address zero");
        bytes32 serviceId = deriveServiceId(airnode, endpointId);
        uint192 indefiniteAuthorizationCount = serviceIdToUserToAuthorizationStatus[
                serviceId
            ][requester].indefiniteAuthorizationCount;
        if (
            serviceIdToUserToSetterToIndefiniteAuthorizationStatus[serviceId][
                requester
            ][setter]
        ) {
            serviceIdToUserToSetterToIndefiniteAuthorizationStatus[serviceId][
                requester
            ][setter] = false;
            unchecked {
                indefiniteAuthorizationCount--;
            }
            serviceIdToUserToAuthorizationStatus[serviceId][requester]
                .indefiniteAuthorizationCount = indefiniteAuthorizationCount;
            emit RevokedIndefiniteAuthorizationStatus(
                airnode,
                endpointId,
                requester,
                setter,
                _msgSender(),
                indefiniteAuthorizationCount
            );
        }
    }

    /// @notice Verifies the authorization status of a request
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @return Authorization status of the request
    function isAuthorized(
        address airnode,
        bytes32 endpointId,
        address requester
    ) public view override returns (bool) {
        return
            userIsAuthorized(deriveServiceId(airnode, bytes32(0)), requester) ||
            userIsAuthorized(deriveServiceId(airnode, endpointId), requester);
    }

    /// @notice Verifies the authorization status of a request
    /// @dev This method has redundant arguments because V0 authorizer
    /// contracts have to have the same interface and potential authorizer
    /// contracts may require to access the arguments that are redundant here
    /// @param requestId Request ID
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param sponsor Sponsor address
    /// @param requester Requester address
    /// @return Authorization status of the request
    function isAuthorizedV0(
        bytes32 requestId, // solhint-disable-line no-unused-vars
        address airnode,
        bytes32 endpointId,
        address sponsor, // solhint-disable-line no-unused-vars
        address requester
    ) external view override returns (bool) {
        return isAuthorized(airnode, endpointId, requester);
    }

    /// @notice Returns the authorization status of `requester` for
    /// `airnode`–`endpointId` pair
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @return expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    /// @return indefiniteAuthorizationCount Number of times `requester` was
    /// authorized indefinitely for `airnode`–`endpointId` pair
    function airnodeToEndpointIdToRequesterToAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester
    )
        external
        view
        override
        returns (
            uint64 expirationTimestamp,
            uint192 indefiniteAuthorizationCount
        )
    {
        AuthorizationStatus
            storage authorizationStatus = serviceIdToUserToAuthorizationStatus[
                deriveServiceId(airnode, endpointId)
            ][requester];
        expirationTimestamp = authorizationStatus.expirationTimestamp;
        indefiniteAuthorizationCount = authorizationStatus
            .indefiniteAuthorizationCount;
    }

    /// @notice Returns if an account has indefinitely authorized `requester`
    /// for `airnode`–`endpointId` pair
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param setter Address of the account that has potentially authorized
    /// `requester` for `airnode`–`endpointId` pair indefinitely
    /// @return indefiniteAuthorizationStatus If `setter` has indefinitely
    /// authorized `requester` for `airnode`–`endpointId` pair
    function airnodeToEndpointIdToRequesterToSetterToIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) external view override returns (bool indefiniteAuthorizationStatus) {
        indefiniteAuthorizationStatus = serviceIdToUserToSetterToIndefiniteAuthorizationStatus[
            deriveServiceId(airnode, endpointId)
        ][requester][setter];
    }

    /// @notice Called privately to derive a service ID out of the Airnode
    /// address and the endpoint ID
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @return serviceId Service ID
    function deriveServiceId(
        address airnode,
        bytes32 endpointId
    ) private pure returns (bytes32 serviceId) {
        serviceId = keccak256(abi.encodePacked(airnode, endpointId));
    }

    /// @notice Returns if the user is authorized to use the service
    /// @param serviceId Service ID
    /// @param user User address
    /// @return isAuthorized If the user is authorized
    function userIsAuthorized(
        bytes32 serviceId,
        address user
    ) private view returns (bool) {
        AuthorizationStatus
            storage authorizationStatus = serviceIdToUserToAuthorizationStatus[
                serviceId
            ][user];
        return
            authorizationStatus.indefiniteAuthorizationCount > 0 ||
            authorizationStatus.expirationTimestamp > block.timestamp;
    }
}
