// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISelfMulticall {
    function selfMulticall(bytes[] calldata data)
        external
        returns (bytes[] memory returndata);

    function trySelfMulticall(bytes[] calldata data)
        external
        returns (bool[] memory successes, bytes[] memory returndata);
}
