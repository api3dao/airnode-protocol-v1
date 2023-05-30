// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFunderDepository {
    function funder() external view returns (address);

    function owner() external view returns (address);

    function root() external view returns (bytes32);
}
