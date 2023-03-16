// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../../Api3ServerV1.sol";
import "../BeaconUpdatesWithRrp.sol";
import "../DataFeedUpdatesWithPsp.sol";

contract DataFeedServerFull is
    Api3ServerV1,
    BeaconUpdatesWithRrp,
    DataFeedUpdatesWithPsp
{
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _airnodeProtocol
    )
        Api3ServerV1(_accessControlRegistry, _adminRoleDescription, _manager)
        BeaconUpdatesWithRrp(_airnodeProtocol)
    {}
}
