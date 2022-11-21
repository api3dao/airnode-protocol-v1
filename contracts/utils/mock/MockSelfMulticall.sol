// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../SelfMulticall.sol";
import "./MockMulticallTarget.sol";

contract MockSelfMulticall is SelfMulticall, MockMulticallTarget {}
