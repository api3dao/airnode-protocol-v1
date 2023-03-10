// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "./RequesterAuthorizer.sol";
import "./interfaces/IRequesterAuthorizerWithManager.sol";

/// @title Authorizer contract that the manager can use to temporarily or
/// indefinitely authorize requesters for Airnodes
contract RequesterAuthorizerWithManager is
    ERC2771Context,
    AccessControlRegistryAdminnedWithManager,
    RequesterAuthorizer,
    IRequesterAuthorizerWithManager
{
    /// @notice Authorization expiration extender role
    bytes32 public immutable override authorizationExpirationExtenderRole;

    /// @notice Authorization expiration setter role
    bytes32 public immutable override authorizationExpirationSetterRole;

    /// @notice Indefinite authorizer role
    bytes32 public immutable override indefiniteAuthorizerRole;

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager
    )
        ERC2771Context(_accessControlRegistry)
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
    {
        authorizationExpirationExtenderRole = _deriveRole(
            adminRole,
            keccak256(
                abi.encodePacked(
                    AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION
                )
            )
        );
        authorizationExpirationSetterRole = _deriveRole(
            adminRole,
            keccak256(
                abi.encodePacked(
                    AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION
                )
            )
        );
        indefiniteAuthorizerRole = _deriveRole(
            adminRole,
            keccak256(abi.encodePacked(INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION))
        );
    }

    /// @notice Extends the expiration of the temporary authoriztion of the
    /// requester for  the Airnode if the sender is allowed to extend
    /// authorization expiration
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function extendAuthorizerExpiration(
        address airnode,
        address requester,
        uint32 expirationTimestamp
    ) external override {
        require(
            hasAuthorizationExpirationExtenderRoleOrIsManager(_msgSender()),
            "Cannot extend expiration"
        );
        _extendAuthorizationExpiration(airnode, requester, expirationTimestamp);
    }

    /// @notice Sets the expiration of the temporary authorization of the
    /// requester for the Airnode if the sender is allowed to set expiration
    /// @dev Unlike `extendAuthorizerExpiration()`, this can hasten expiration
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param expirationTimestamp Timestamp at which the temporary
    /// authorization will expire
    function setAuthorizationExpiration(
        address airnode,
        address requester,
        uint32 expirationTimestamp
    ) external override {
        require(
            hasAuthorizationExpirationSetterRoleOrIsManager(_msgSender()),
            "Cannot set expiration"
        );
        _setAuthorizationExpiration(airnode, requester, expirationTimestamp);
    }

    /// @notice Sets the indefinite authorizer status of the requester for the
    /// Airnode if the sender is allowed to authorize indefinitely
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param status Indefinite authorizer status
    function setIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        bool status
    ) external override {
        require(
            hasIndefiniteAuthorizerRoleOrIsManager(_msgSender()),
            "Cannot set indefinite status"
        );
        _setIndefiniteAuthorizationStatus(airnode, requester, status);
    }

    /// @notice Revokes the indefinite authorization status granted by a
    /// specific account that no longer has the indefinite authorizer role
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param setter Setter of the indefinite authorization status
    function revokeIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        address setter
    ) external override {
        require(
            !hasIndefiniteAuthorizerRoleOrIsManager(setter),
            "setter can set indefinite status"
        );
        _revokeIndefiniteAuthorizationStatus(airnode, requester, setter);
    }

    /// @dev Returns if the account has the authorization expiration extender
    /// role or is the manager
    /// @param account Account address
    /// @return If the account has the authorization extender role or is the
    /// manager
    function hasAuthorizationExpirationExtenderRoleOrIsManager(
        address account
    ) private view returns (bool) {
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
    function hasAuthorizationExpirationSetterRoleOrIsManager(
        address account
    ) private view returns (bool) {
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
    function hasIndefiniteAuthorizerRoleOrIsManager(
        address account
    ) private view returns (bool) {
        return
            manager == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                indefiniteAuthorizerRole,
                account
            );
    }

    /// @dev See Context.sol
    function _msgSender()
        internal
        view
        virtual
        override(RequesterAuthorizer, ERC2771Context)
        returns (address)
    {
        return ERC2771Context._msgSender();
    }
}
