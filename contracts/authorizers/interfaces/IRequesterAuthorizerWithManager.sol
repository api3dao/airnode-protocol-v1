// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../access-control-registry/interfaces/IAccessControlRegistryAdminnedWithManager.sol";
import "./IRequesterAuthorizer.sol";

interface IRequesterAuthorizerWithManager is
    IAccessControlRegistryAdminnedWithManager,
    IRequesterAuthorizer
{
    function authorizationExpirationExtenderRole()
        external
        view
        returns (bytes32);

    function authorizationExpirationSetterRole()
        external
        view
        returns (bytes32);

    function indefiniteAuthorizerRole() external view returns (bytes32);
}
