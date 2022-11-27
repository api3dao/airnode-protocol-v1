// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../access-control-registry/AccessControlRegistryAdminned.sol";
import "./RequesterAuthorizer.sol";
import "./interfaces/IRequesterAuthorizerWithAirnode.sol";

/// @title Authorizer contract that Airnode operators can use to temporarily or
/// indefinitely whitelist requesters for Airnode–endpoint pairs or Airnodes
contract RequesterAuthorizerWithAirnode is
    AccessControlRegistryAdminned,
    RequesterAuthorizer,
    IRequesterAuthorizerWithAirnode
{
    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _trustedForwarder Trusted forwarder that verifies and executes
    /// signed meta-calls
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _trustedForwarder
    )
        AccessControlRegistryAdminned(
            _accessControlRegistry,
            _adminRoleDescription
        )
        RequesterAuthorizer(_trustedForwarder)
    {}

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
            hasWhitelistExpirationExtenderRoleOrIsAirnode(
                airnode,
                _msgSender()
            ),
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
            hasWhitelistExpirationSetterRoleOrIsAirnode(airnode, _msgSender()),
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
            hasIndefiniteWhitelisterRoleOrIsAirnode(airnode, _msgSender()),
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
            !hasIndefiniteWhitelisterRoleOrIsAirnode(airnode, setter),
            "setter can set indefinite status"
        );
        _revokeIndefiniteWhitelistStatusAndEmit(
            airnode,
            endpointId,
            requester,
            setter
        );
    }

    /// @notice Derives the admin role for the Airnode
    /// @param airnode Airnode address
    /// @return adminRole Admin role
    function deriveAdminRole(address airnode)
        external
        view
        override
        returns (bytes32 adminRole)
    {
        adminRole = _deriveAdminRole(airnode);
    }

    /// @notice Derives the whitelist expiration extender role for the Airnode
    /// @param airnode Airnode address
    /// @return whitelistExpirationExtenderRole Whitelist expiration extender
    /// role
    function deriveWhitelistExpirationExtenderRole(address airnode)
        public
        view
        override
        returns (bytes32 whitelistExpirationExtenderRole)
    {
        whitelistExpirationExtenderRole = _deriveRole(
            _deriveAdminRole(airnode),
            WHITELIST_EXPIRATION_EXTENDER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @notice Derives the whitelist expiration setter role for the Airnode
    /// @param airnode Airnode address
    /// @return whitelistExpirationSetterRole Whitelist expiration setter role
    function deriveWhitelistExpirationSetterRole(address airnode)
        public
        view
        override
        returns (bytes32 whitelistExpirationSetterRole)
    {
        whitelistExpirationSetterRole = _deriveRole(
            _deriveAdminRole(airnode),
            WHITELIST_EXPIRATION_SETTER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @notice Derives the indefinite whitelister role for the Airnode
    /// @param airnode Airnode address
    /// @return indefiniteWhitelisterRole Indefinite whitelister role
    function deriveIndefiniteWhitelisterRole(address airnode)
        public
        view
        override
        returns (bytes32 indefiniteWhitelisterRole)
    {
        indefiniteWhitelisterRole = _deriveRole(
            _deriveAdminRole(airnode),
            INDEFINITE_WHITELISTER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @dev Returns if the account has the whitelist expiration extender role
    /// or is the Airnode address
    /// @param airnode Airnode address
    /// @param account Account address
    /// @return If the account has the whitelist extender role or is the
    /// Airnode address
    function hasWhitelistExpirationExtenderRoleOrIsAirnode(
        address airnode,
        address account
    ) private view returns (bool) {
        return
            airnode == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                deriveWhitelistExpirationExtenderRole(airnode),
                account
            );
    }

    /// @dev Returns if the account has the whitelist expriation setter role or
    /// is the Airnode address
    /// @param airnode Airnode address
    /// @param account Account address
    /// @return If the account has the whitelist setter role or is the Airnode
    /// address
    function hasWhitelistExpirationSetterRoleOrIsAirnode(
        address airnode,
        address account
    ) private view returns (bool) {
        return
            airnode == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                deriveWhitelistExpirationSetterRole(airnode),
                account
            );
    }

    /// @dev Returns if the account has the indefinite whitelister role or is the
    /// Airnode address
    /// @param airnode Airnode address
    /// @param account Account address
    /// @return If the account has the indefinite whitelister role or is the
    /// Airnode addrss
    function hasIndefiniteWhitelisterRoleOrIsAirnode(
        address airnode,
        address account
    ) private view returns (bool) {
        return
            airnode == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                deriveIndefiniteWhitelisterRole(airnode),
                account
            );
    }
}
