// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../OevDapiServer.sol";
import "../BeaconUpdatesWithRrp.sol";
import "../DataFeedUpdatesWithPsp.sol";
import "../BeaconUpdatesWithSignedData.sol";

contract DataFeedServerFull is
    OevDapiServer,
    BeaconUpdatesWithRrp,
    DataFeedUpdatesWithPsp,
    BeaconUpdatesWithSignedData
{
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _airnodeProtocol
    )
        OevDapiServer(_accessControlRegistry, _adminRoleDescription, _manager)
        BeaconUpdatesWithRrp(_airnodeProtocol)
    {}
}
