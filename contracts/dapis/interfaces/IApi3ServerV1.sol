// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IOevDapiServer.sol";
import "./IBeaconUpdatesWithSignedData.sol";
import "./IBeaconSetUpdatesWithPsp.sol";

interface IApi3ServerV1 is
    IOevDapiServer,
    IBeaconUpdatesWithSignedData,
    IBeaconSetUpdatesWithPsp
{}
