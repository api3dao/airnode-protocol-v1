// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "./interfaces/IRequesterAuthorizer.sol";

/// @title Abstract contract to be inherited by Authorizer contracts that
/// temporarily or permanently whitelist requesters for Airnode–endpoint pairs
/// or Airnodes
/// @dev An authorization for an Airnode with endpoint ID `bytes32(0)`
/// represents a blanket authorization across all endpoints of the Airnode
abstract contract RequesterAuthorizer is ERC2771Context, IRequesterAuthorizer {
    struct WhitelistStatus {
        uint64 expirationTimestamp;
        uint192 indefiniteWhitelistCount;
    }

    // There are four roles implemented in this contract:
    // Root
    // └── (1) Admin (can grant and revoke the roles below)
    //     ├── (2) Whitelist expiration extender
    //     ├── (3) Whitelist expiration setter
    //     └── (4) Indefinite whitelister
    // Their IDs are derived from the descriptions below. Refer to
    // AccessControlRegistry for more information.
    // To clarify, the root role of the manager is the admin of (1), while (1)
    // is the admin of (2), (3) and (4). So (1) is more of a "contract admin",
    // while the `adminRole` used in AccessControl and AccessControlRegistry
    // refers to a more general adminship relationship between roles.

    /// @notice Whitelist expiration extender role description
    string
        public constant
        override WHITELIST_EXPIRATION_EXTENDER_ROLE_DESCRIPTION =
        "Whitelist expiration extender";

    /// @notice Whitelist expiration setter role description
    string
        public constant
        override WHITELIST_EXPIRATION_SETTER_ROLE_DESCRIPTION =
        "Whitelist expiration setter";

    /// @notice Indefinite whitelister role description

    string public constant override INDEFINITE_WHITELISTER_ROLE_DESCRIPTION =
        "Indefinite whitelister";

    bytes32
        internal constant WHITELIST_EXPIRATION_EXTENDER_ROLE_DESCRIPTION_HASH =
        keccak256(
            abi.encodePacked(WHITELIST_EXPIRATION_EXTENDER_ROLE_DESCRIPTION)
        );

    bytes32
        internal constant WHITELIST_EXPIRATION_SETTER_ROLE_DESCRIPTION_HASH =
        keccak256(
            abi.encodePacked(WHITELIST_EXPIRATION_SETTER_ROLE_DESCRIPTION)
        );

    bytes32 internal constant INDEFINITE_WHITELISTER_ROLE_DESCRIPTION_HASH =
        keccak256(abi.encodePacked(INDEFINITE_WHITELISTER_ROLE_DESCRIPTION));

    mapping(bytes32 => mapping(address => WhitelistStatus))
        private serviceIdToUserToWhitelistStatus;

    mapping(bytes32 => mapping(address => mapping(address => bool)))
        private serviceIdToUserToSetterToIndefiniteWhitelistStatus;

    /// @param _trustedForwarder Trusted forwarder that verifies and executes
    /// signed meta-calls
    constructor(address _trustedForwarder) ERC2771Context(_trustedForwarder) {}

    /// @notice Extends the expiration of the temporary whitelist of
    /// `requester` for the `airnode`–`endpointId` pair and emits an event
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary whitelist
    /// will expire
    function _extendWhitelistExpirationAndEmit(
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
                serviceIdToUserToWhitelistStatus[serviceId][requester]
                    .expirationTimestamp,
            "Does not extend expiration"
        );
        serviceIdToUserToWhitelistStatus[serviceId][requester]
            .expirationTimestamp = expirationTimestamp;
        emit ExtendedWhitelistExpiration(
            airnode,
            endpointId,
            requester,
            _msgSender(),
            expirationTimestamp
        );
    }

    /// @notice Sets the expiration of the temporary whitelist of `requester`
    /// for the `airnode`–`endpointId` pair and emits an event
    /// @dev Unlike `_extendWhitelistExpiration()`, this can hasten expiration
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary whitelist
    /// will expire
    function _setWhitelistExpirationAndEmit(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        bytes32 serviceId = deriveServiceId(airnode, endpointId);
        serviceIdToUserToWhitelistStatus[serviceId][requester]
            .expirationTimestamp = expirationTimestamp;
        emit SetWhitelistExpiration(
            airnode,
            endpointId,
            requester,
            _msgSender(),
            expirationTimestamp
        );
    }

    /// @notice Sets the indefinite whitelist status of `requester` for the
    /// `airnode`–`endpointId` pair and emits an event
    /// @dev Emits the event even if it does not change the state.
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param status Indefinite whitelist status
    function _setIndefiniteWhitelistStatusAndEmit(
        address airnode,
        bytes32 endpointId,
        address requester,
        bool status
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        bytes32 serviceId = deriveServiceId(airnode, endpointId);
        uint192 indefiniteWhitelistCount = serviceIdToUserToWhitelistStatus[
            serviceId
        ][requester].indefiniteWhitelistCount;
        if (
            status &&
            !serviceIdToUserToSetterToIndefiniteWhitelistStatus[serviceId][
                requester
            ][_msgSender()]
        ) {
            serviceIdToUserToSetterToIndefiniteWhitelistStatus[serviceId][
                requester
            ][_msgSender()] = true;
            indefiniteWhitelistCount++;
            serviceIdToUserToWhitelistStatus[serviceId][requester]
                .indefiniteWhitelistCount = indefiniteWhitelistCount;
        } else if (
            !status &&
            serviceIdToUserToSetterToIndefiniteWhitelistStatus[serviceId][
                requester
            ][_msgSender()]
        ) {
            serviceIdToUserToSetterToIndefiniteWhitelistStatus[serviceId][
                requester
            ][_msgSender()] = false;
            indefiniteWhitelistCount--;
            serviceIdToUserToWhitelistStatus[serviceId][requester]
                .indefiniteWhitelistCount = indefiniteWhitelistCount;
        }
        emit SetIndefiniteWhitelistStatus(
            airnode,
            endpointId,
            requester,
            _msgSender(),
            status,
            indefiniteWhitelistCount
        );
    }

    /// @notice Revokes the indefinite whitelist status granted to `requester`
    /// for the `airnode`–`endpointId` pair by a specific account and emits an
    /// event
    /// @dev Only emits the event if it changes the state
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param requester Requester address
    /// @param setter Setter of the indefinite whitelist status
    function _revokeIndefiniteWhitelistStatusAndEmit(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) internal {
        require(airnode != address(0), "Airnode address zero");
        require(requester != address(0), "Requester address zero");
        require(setter != address(0), "Setter address zero");
        bytes32 serviceId = deriveServiceId(airnode, endpointId);
        uint192 indefiniteWhitelistCount = serviceIdToUserToWhitelistStatus[
            serviceId
        ][requester].indefiniteWhitelistCount;
        if (
            serviceIdToUserToSetterToIndefiniteWhitelistStatus[serviceId][
                requester
            ][setter]
        ) {
            serviceIdToUserToSetterToIndefiniteWhitelistStatus[serviceId][
                requester
            ][setter] = false;
            indefiniteWhitelistCount--;
            serviceIdToUserToWhitelistStatus[serviceId][requester]
                .indefiniteWhitelistCount = indefiniteWhitelistCount;
            emit RevokedIndefiniteWhitelistStatus(
                airnode,
                endpointId,
                requester,
                setter,
                _msgSender(),
                indefiniteWhitelistCount
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
            userIsWhitelisted(
                deriveServiceId(airnode, bytes32(0)),
                requester
            ) ||
            userIsWhitelisted(deriveServiceId(airnode, endpointId), requester);
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

    /// @notice Returns the whitelist status of `requester` for the
    /// `airnode`–`endpointId` pair
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @return expirationTimestamp Timestamp at which the temporary whitelist
    /// will expire
    /// @return indefiniteWhitelistCount Number of times `requester` was
    /// whitelisted indefinitely for the `airnode`–`endpointId` pair
    function airnodeToEndpointIdToRequesterToWhitelistStatus(
        address airnode,
        bytes32 endpointId,
        address requester
    )
        external
        view
        override
        returns (uint64 expirationTimestamp, uint192 indefiniteWhitelistCount)
    {
        WhitelistStatus
            storage whitelistStatus = serviceIdToUserToWhitelistStatus[
                deriveServiceId(airnode, endpointId)
            ][requester];
        expirationTimestamp = whitelistStatus.expirationTimestamp;
        indefiniteWhitelistCount = whitelistStatus.indefiniteWhitelistCount;
    }

    /// @notice Returns if an account has indefinitely whitelisted `requester`
    /// for the `airnode`–`endpointId` pair
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param setter Address of the account that has potentially whitelisted
    /// `requester` for the `airnode`–`endpointId` pair indefinitely
    /// @return indefiniteWhitelistStatus If `setter` has indefinitely
    /// whitelisted `requester` for the `airnode`–`endpointId` pair
    function airnodeToEndpointIdToRequesterToSetterToIndefiniteWhitelistStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) external view override returns (bool indefiniteWhitelistStatus) {
        indefiniteWhitelistStatus = serviceIdToUserToSetterToIndefiniteWhitelistStatus[
            deriveServiceId(airnode, endpointId)
        ][requester][setter];
    }

    /// @notice Called privately to derive a service ID out of the Airnode
    /// address and the endpoint ID
    /// @dev This is done to re-use the more general Whitelist contract for
    /// the specific case of Airnode–endpoint pairs
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @return serviceId Service ID
    function deriveServiceId(address airnode, bytes32 endpointId)
        private
        pure
        returns (bytes32 serviceId)
    {
        serviceId = keccak256(abi.encodePacked(airnode, endpointId));
    }

    /// @notice Returns if the user is whitelised to use the service
    /// @param serviceId Service ID
    /// @param user User address
    /// @return isWhitelisted If the user is whitelisted
    function userIsWhitelisted(bytes32 serviceId, address user)
        private
        view
        returns (bool isWhitelisted)
    {
        WhitelistStatus
            storage whitelistStatus = serviceIdToUserToWhitelistStatus[
                serviceId
            ][user];
        return
            whitelistStatus.indefiniteWhitelistCount > 0 ||
            whitelistStatus.expirationTimestamp > block.timestamp;
    }
}
