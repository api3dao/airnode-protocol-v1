// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "./RequesterAuthorizer.sol";
import "./interfaces/IRequesterAuthorizerWithManager.sol";

/// @title Authorizer contract that a manager can use to temporarily or
/// indefinitely whitelist requesters for Airnode–endpoint pairs or Airnodes
contract RequesterAuthorizerWithManager is
    AccessControlRegistryAdminnedWithManager,
    RequesterAuthorizer,
    IRequesterAuthorizerWithManager
{
    // Since there will be a single manager, we can derive the roles beforehand

    /// @notice Whitelist expiration extender role
    bytes32 public immutable override whitelistExpirationExtenderRole;

    /// @notice Whitelist expiration setter role
    bytes32 public immutable override whitelistExpirationSetterRole;

    /// @notice Indefinite whitelister role
    bytes32 public immutable override indefiniteWhitelisterRole;

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
        whitelistExpirationExtenderRole = _deriveRole(
            adminRole,
            WHITELIST_EXPIRATION_EXTENDER_ROLE_DESCRIPTION_HASH
        );
        whitelistExpirationSetterRole = _deriveRole(
            adminRole,
            WHITELIST_EXPIRATION_SETTER_ROLE_DESCRIPTION_HASH
        );
        indefiniteWhitelisterRole = _deriveRole(
            adminRole,
            INDEFINITE_WHITELISTER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @notice Extends the expiration of the temporary whitelist of
    /// `requester` for the `airnode`–`endpointId` pair if the sender is
    /// allowed to extend whitelist expiration
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary whitelist
    /// will expire
    function extendWhitelistExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) external override {
        require(
            hasWhitelistExpirationExtenderRoleOrIsManager(_msgSender()),
            "Cannot extend expiration"
        );
        _extendWhitelistExpirationAndEmit(
            airnode,
            endpointId,
            requester,
            expirationTimestamp
        );
    }

    /// @notice Sets the expiration of the temporary whitelist of `requester`
    /// for the `airnode`–`endpointId` pair if the sender is allowed to set
    /// expiration
    /// @dev Unlike `extendWhitelistExpiration()`, this can hasten expiration
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary whitelist
    /// will expire
    function setWhitelistExpiration(
        address airnode,
        bytes32 endpointId,
        address requester,
        uint64 expirationTimestamp
    ) external override {
        require(
            hasWhitelistExpirationSetterRoleOrIsManager(_msgSender()),
            "Cannot set expiration"
        );
        _setWhitelistExpirationAndEmit(
            airnode,
            endpointId,
            requester,
            expirationTimestamp
        );
    }

    /// @notice Sets the indefinite whitelist status of `requester` for the
    /// `airnode`–`endpointId` pair if the sender is allowed to whitelist
    /// indefinitely
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param status Indefinite whitelist status
    function setIndefiniteWhitelistStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        bool status
    ) external override {
        require(
            hasIndefiniteWhitelisterRoleOrIsManager(_msgSender()),
            "Cannot set indefinite status"
        );
        _setIndefiniteWhitelistStatusAndEmit(
            airnode,
            endpointId,
            requester,
            status
        );
    }

    /// @notice Revokes the indefinite whitelist status granted by a specific
    /// account that no longer has the indefinite whitelister role
    /// @param airnode Airnode address
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param setter Setter of the indefinite whitelist status
    function revokeIndefiniteWhitelistStatus(
        address airnode,
        bytes32 endpointId,
        address requester,
        address setter
    ) external override {
        require(
            !hasIndefiniteWhitelisterRoleOrIsManager(setter),
            "setter can set indefinite status"
        );
        _revokeIndefiniteWhitelistStatusAndEmit(
            airnode,
            endpointId,
            requester,
            setter
        );
    }

    /// @dev Returns if the account has the whitelist expiration extender role
    /// or is the manager
    /// @param account Account address
    /// @return If the account has the whitelist extender role or is the
    /// manager
    function hasWhitelistExpirationExtenderRoleOrIsManager(address account)
        private
        view
        returns (bool)
    {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                whitelistExpirationExtenderRole,
                account
            );
    }

    /// @dev Returns if the account has the whitelist expriation setter role or
    /// is the manager
    /// @param account Account address
    /// @return If the account has the whitelist setter role or is the
    /// manager
    function hasWhitelistExpirationSetterRoleOrIsManager(address account)
        private
        view
        returns (bool)
    {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                whitelistExpirationSetterRole,
                account
            );
    }

    /// @dev Returns if the account has the indefinite whitelister role or is the
    /// manager
    /// @param account Account address
    /// @return If the account has the indefinite whitelister role or is the
    /// manager
    function hasIndefiniteWhitelisterRoleOrIsManager(address account)
        private
        view
        returns (bool)
    {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                indefiniteWhitelisterRole,
                account
            );
    }
}
