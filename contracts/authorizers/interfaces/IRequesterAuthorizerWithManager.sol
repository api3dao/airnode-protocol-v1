// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access-control-registry/interfaces/IAccessControlRegistryAdminnedWithManager.sol";
import "./IRequesterAuthorizer.sol";

interface IRequesterAuthorizerWithManager is
    IAccessControlRegistryAdminnedWithManager,
    IRequesterAuthorizer
{
    function whitelistExpirationExtenderRole() external view returns (bytes32);

    function whitelistExpirationSetterRole() external view returns (bytes32);

    function indefiniteWhitelisterRole() external view returns (bytes32);
}
