// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "./interfaces/IRegistryRolesWithManager.sol";

/// @title Contract to be inherited by registry contracts that will use generic
/// AccessControlRegistry roles
contract RegistryRolesWithManager is
    AccessControlRegistryAdminnedWithManager,
    IRegistryRolesWithManager
{
    /// @notice Registrar role description
    string public constant override REGISTRAR_ROLE_DESCRIPTION = "Registrar";

    /// @notice Registrar role
    bytes32 public immutable registrarRole;

    /// @dev Reverts if the sender is not the manager and does not have the
    /// registrar role
    modifier onlyRegistrarOrManager() {
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    registrarRole,
                    msg.sender
                ),
            "Sender cannot register"
        );
        _;
    }

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
    {
        registrarRole = _deriveRole(adminRole, REGISTRAR_ROLE_DESCRIPTION);
    }
}
