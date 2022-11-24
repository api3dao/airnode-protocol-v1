// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../utils/interfaces/ISelfMulticall.sol";
import "./IAccessControlRegistryUser.sol";

interface IAccessControlRegistryAdminned is
    ISelfMulticall,
    IAccessControlRegistryUser
{
    function adminRoleDescription() external view returns (string memory);
}
