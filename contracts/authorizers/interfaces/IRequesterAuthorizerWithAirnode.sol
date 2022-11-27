// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access-control-registry/interfaces/IAccessControlRegistryAdminned.sol";
import "./IRequesterAuthorizer.sol";

interface IRequesterAuthorizerWithAirnode is
    IAccessControlRegistryAdminned,
    IRequesterAuthorizer
{
    function deriveAdminRole(address airnode)
        external
        view
        returns (bytes32 role);

    function deriveWhitelistExpirationExtenderRole(address airnode)
        external
        view
        returns (bytes32 role);

    function deriveWhitelistExpirationSetterRole(address airnode)
        external
        view
        returns (bytes32 role);

    function deriveIndefiniteWhitelisterRole(address airnode)
        external
        view
        returns (bytes32 role);
}
