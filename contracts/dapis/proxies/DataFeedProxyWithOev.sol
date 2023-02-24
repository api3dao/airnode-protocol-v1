// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy.sol";
import "../interfaces/IOevDataFeedServer.sol";
import "./interfaces/IOevProxy.sol";

/// @title An immutable proxy contract that is used to read a specific data
/// feed (Beacon or Beacon set) of a specific DapiServer contract and inform
/// DapiServer about the beneficiary of the respective OEV proceeds
/// @notice In an effort to reduce the bytecode of this contract, its
/// constructor arguments are validated by ProxyFactory, rather than
/// internally. If you intend to deploy this contract without using
/// ProxyFactory, you are recommended to implement an equivalent validation.
/// @dev See DapiProxy.sol for comments about usage
contract DataFeedProxyWithOev is DataFeedProxy, IOevProxy {
    /// @notice OEV beneficiary address
    address public immutable override oevBeneficiary;

    /// @param _dapiServer DapiServer address
    /// @param _dataFeedId Data feed (Beacon or Beacon set) ID
    /// @param _oevBeneficiary OEV beneficiary
    constructor(
        address _dapiServer,
        bytes32 _dataFeedId,
        address _oevBeneficiary
    ) DataFeedProxy(_dapiServer, _dataFeedId) {
        oevBeneficiary = _oevBeneficiary;
    }

    /// @notice Reads the data feed that this proxy maps to
    /// @return value Data feed value
    /// @return timestamp Data feed timestamp
    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IOevDataFeedServer(dapiServer)
            .readDataFeedWithIdAsOevProxy(dataFeedId);
    }
}
