// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access-control-registry/interfaces/IAccessControlRegistryAdminned.sol";
import "./IRequesterAuthorizer.sol";

interface IRequesterAuthorizerWithAirnode is
    IAccessControlRegistryAdminned,
    IRequesterAuthorizer
{
    function deriveAdminRole(
        address airnode
    ) external view returns (bytes32 role);

    function deriveAuthorizationExpirationExtenderRole(
        address airnode
    ) external view returns (bytes32 role);

    function deriveAuthorizationExpirationSetterRole(
        address airnode
    ) external view returns (bytes32 role);

    function deriveIndefiniteAuthorizerRole(
        address airnode
    ) external view returns (bytes32 role);
}
