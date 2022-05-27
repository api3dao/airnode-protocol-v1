// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../DapiReader.sol";

contract MockDapiReader is DapiReader {
    constructor(address _dapiServer) DapiReader(_dapiServer) {}

    function exposedSetDapiServer(address _dapiServer) external {
        setDapiServer(_dapiServer);
    }

    function exposedReadWithDataFeedId(bytes32 dataFeedId)
        external
        view
        returns (int224 value, uint32 timestamp)
    {
        return IDapiServer(dapiServer).readDataFeedWithId(dataFeedId);
    }

    function exposedReadWithDapiName(bytes32 dapiName)
        external
        view
        returns (int224 value, uint32 timestamp)
    {
        return IDapiServer(dapiServer).readDataFeedWithDapiName(dapiName);
    }
}
