// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "../access-control-registry/AccessControlRegistryAdminned.sol";
import "./RequesterAuthorizer.sol";
import "./interfaces/IRequesterAuthorizerWithAirnode.sol";

/// @title Authorizer contract that Airnode operators can use to temporarily or
/// indefinitely authorize requesters for the respective Airnodes
contract RequesterAuthorizerWithAirnode is
    ERC2771Context,
    AccessControlRegistryAdminned,
    RequesterAuthorizer,
    IRequesterAuthorizerWithAirnode
{
    bytes32
        private constant AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION_HASH =
        keccak256(
            abi.encodePacked(AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION)
        );

    bytes32
        private constant AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION_HASH =
        keccak256(
            abi.encodePacked(AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION)
        );

    bytes32 private constant INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION_HASH =
        keccak256(abi.encodePacked(INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION));

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription
    )
        ERC2771Context(_accessControlRegistry)
        AccessControlRegistryAdminned(
            _accessControlRegistry,
            _adminRoleDescription
        )
    {}

    /// @notice Extends the expiration of the temporary authorization of
    /// `requester` for `airnode` if the sender is allowed to extend
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
            hasAuthorizationExpirationExtenderRoleOrIsAirnode(
                airnode,
                _msgSender()
            ),
            "Cannot extend expiration"
        );
        _extendAuthorizationExpiration(airnode, requester, expirationTimestamp);
    }

    /// @notice Sets the expiration of the temporary authorization of
    /// `requester` for `airnode` if the sender is allowed to set expiration
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
            hasAuthorizationExpirationSetterRoleOrIsAirnode(
                airnode,
                _msgSender()
            ),
            "Cannot set expiration"
        );
        _setAuthorizationExpiration(airnode, requester, expirationTimestamp);
    }

    /// @notice Sets the indefinite authorization status of `requester` for
    /// `airnode` if the sender is allowed to authorize indefinitely
    /// @param airnode Airnode address
    /// @param requester Requester address
    /// @param status Indefinite authorization status
    function setIndefiniteAuthorizationStatus(
        address airnode,
        address requester,
        bool status
    ) external override {
        require(
            hasIndefiniteAuthorizerRoleOrIsAirnode(airnode, _msgSender()),
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
            !hasIndefiniteAuthorizerRoleOrIsAirnode(airnode, setter),
            "setter can set indefinite status"
        );
        _revokeIndefiniteAuthorizationStatus(airnode, requester, setter);
    }

    /// @notice Derives the admin role for the Airnode
    /// @param airnode Airnode address
    /// @return adminRole Admin role
    function deriveAdminRole(
        address airnode
    ) external view override returns (bytes32 adminRole) {
        adminRole = _deriveAdminRole(airnode);
    }

    /// @notice Derives the authorization expiration extender role for the
    /// Airnode
    /// @param airnode Airnode address
    /// @return authorizationExpirationExtenderRole Authorization expiration
    /// extender role
    function deriveAuthorizationExpirationExtenderRole(
        address airnode
    )
        public
        view
        override
        returns (bytes32 authorizationExpirationExtenderRole)
    {
        authorizationExpirationExtenderRole = _deriveRole(
            _deriveAdminRole(airnode),
            AUTHORIZATION_EXPIRATION_EXTENDER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @notice Derives the authorization expiration setter role for the
    /// Airnode
    /// @param airnode Airnode address
    /// @return authorizationExpirationSetterRole Authorization expiration
    /// setter role
    function deriveAuthorizationExpirationSetterRole(
        address airnode
    ) public view override returns (bytes32 authorizationExpirationSetterRole) {
        authorizationExpirationSetterRole = _deriveRole(
            _deriveAdminRole(airnode),
            AUTHORIZATION_EXPIRATION_SETTER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @notice Derives the indefinite authorizer role for the Airnode
    /// @param airnode Airnode address
    /// @return indefiniteAuthorizerRole Indefinite authorizer role
    function deriveIndefiniteAuthorizerRole(
        address airnode
    ) public view override returns (bytes32 indefiniteAuthorizerRole) {
        indefiniteAuthorizerRole = _deriveRole(
            _deriveAdminRole(airnode),
            INDEFINITE_AUTHORIZER_ROLE_DESCRIPTION_HASH
        );
    }

    /// @dev Returns if the account has the authorization expiration extender
    /// role or is the Airnode address
    /// @param airnode Airnode address
    /// @param account Account address
    /// @return If the account has the authorization extender role or is the
    /// Airnode address
    function hasAuthorizationExpirationExtenderRoleOrIsAirnode(
        address airnode,
        address account
    ) private view returns (bool) {
        return
            airnode == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                deriveAuthorizationExpirationExtenderRole(airnode),
                account
            );
    }

    /// @dev Returns if the account has the authorization expriation setter
    /// role or is the Airnode address
    /// @param airnode Airnode address
    /// @param account Account address
    /// @return If the account has the authorization expiration setter role or
    /// is the Airnode address
    function hasAuthorizationExpirationSetterRoleOrIsAirnode(
        address airnode,
        address account
    ) private view returns (bool) {
        return
            airnode == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                deriveAuthorizationExpirationSetterRole(airnode),
                account
            );
    }

    /// @dev Returns if the account has the indefinite authorizer role or is
    /// the Airnode address
    /// @param airnode Airnode address
    /// @param account Account address
    /// @return If the account has the indefinite authorizer role or is the
    /// Airnode addrss
    function hasIndefiniteAuthorizerRoleOrIsAirnode(
        address airnode,
        address account
    ) private view returns (bool) {
        return
            airnode == account ||
            IAccessControlRegistry(accessControlRegistry).hasRole(
                deriveIndefiniteAuthorizerRole(airnode),
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
