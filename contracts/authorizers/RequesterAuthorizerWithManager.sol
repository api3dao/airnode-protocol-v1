// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "./RequesterAuthorizer.sol";
import "./interfaces/IRequesterAuthorizerWithManager.sol";

/// @title Authorizer contract that a manager can use to temporarily or
/// indefinitely authorize requesters for Airnode–endpoint pairs or Airnodes
contract RequesterAuthorizerWithManager is
    AccessControlRegistryAdminnedWithManager,
    RequesterAuthorizer,
    IRequesterAuthorizerWithManager
{
    // Since there will be a single manager, we can derive the roles beforehand

    /// @notice Authorization expiration extender role
    bytes32 public immutable override authorizationExpirationExtenderRole;

    /// @notice Authorization expiration setter role
    bytes32 public immutable override authorizationExpirationSetterRole;

    /// @notice Indefinite authorizer role
    bytes32 public immutable override indefiniteAuthorizerRole;

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    /// @param _trustedForwarder Trusted forwarder that verifies and executes
    /// signed meta-calls
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _trustedForwarder
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
        RequesterAuthorizer(_trustedForwarder)
    {
        authorizationExpirationExtenderRole = _deriveRole(
            adminRole,
            AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION_HASH
        );
        authorizationExpirationSetterRole = _deriveRole(
            adminRole,
            AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION_HASH
        );
        indefiniteAuthorizerRole = _deriveRole(
            adminRole,
            INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @notice Extends the expiration of the temporary authoriztion of
    /// `requester` for `airnode`–`endpointId` pair if the sender is allowed
    /// to extend authorization expiration
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function extendAuthorizerExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) external override {
        require(
            hasAuthorizationExpirationExtenderRoleOrIsManager(_msgSender()),
            "Cannot extend expiration"
        );
        _extendAuthorizationExpirationAndEmit(
            airnode,
            endpointId,
            requester,
            expirationTimestamp
        );
    }

    /// @notice Sets the expiration of the temporary authorization of
    /// `requester` for `airnode`–`endpointId` pair if the sender is allowed to
    /// set expiration
    /// @dev Unlike `extendAuthorizerExpiration()`, this can hasten expiration
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function setAuthorizationExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) external override {
        require(
            hasAuthorizationExpirationSetterRoleOrIsManager(_msgSender()),
            "Cannot set expiration"
        );
        _setAuthorizationExpirationAndEmit(
            airnode,
            endpointId,
            requester,
            expirationTimestamp
        );
    }

    /// @notice Sets the indefinite authorizer status of `requester` for
    /// `airnode`–`endpointId` pair if the sender is allowed to authorize
    /// indefinitely
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param status Indefinite authorizer status
    function setIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        bool status
    ) external override {
        require(
            hasIndefiniteAuthorizerRoleOrIsManager(_msgSender()),
            "Cannot set indefinite status"
        );
        _setIndefiniteAuthorizationStatusAndEmit(
            airnode,
            endpointId,
            requester,
            status
        );
    }

    /// @notice Revokes the indefinite authorization status granted by a
    /// specific account that no longer has the indefinite authorizer role
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param setter Setter of the indefinite authorization status
    function revokeIndefiniteAuthorizationStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) external override {
        require(
            !hasIndefiniteAuthorizerRoleOrIsManager(setter),
            "setter can set indefinite status"
        );
        _revokeIndefiniteAuthorizationStatusAndEmit(
            airnode,
            endpointId,
            requester,
            setter
        );
    }

    /// @dev Returns if the account has the authorization expiration extender
    /// role or is the manager
    /// @param account Account address
    /// @return If the account has the authorization extender role or is the
    /// manager
    function hasAuthorizationExpirationExtenderRoleOrIsManager(address account)
        private
        view
        returns (bool)
    {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                authorizationExpirationExtenderRole,
                account
            );
    }

    /// @dev Returns if the account has the authorization expiration setter
    /// role or is the manager
    /// @param account Account address
    /// @return If the account has the authorization expiration setter role or
    /// is the manager
    function hasAuthorizationExpirationSetterRoleOrIsManager(address account)
        private
        view
        returns (bool)
    {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                authorizationExpirationSetterRole,
                account
            );
    }

    /// @dev Returns if the account has the indefinite authorizer role or is
    /// the manager
    /// @param account Account address
    /// @return If the account has the indefinite authorizer role or is the
    /// manager
    function hasIndefiniteAuthorizerRoleOrIsManager(address account)
        private
        view
        returns (bool)
    {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                indefiniteAuthorizerRole,
                account
            );
    }
}
