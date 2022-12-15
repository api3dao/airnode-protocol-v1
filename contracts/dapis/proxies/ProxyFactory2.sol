// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy2.sol";
import "./DapiProxy2.sol";
import "./DataFeedProxyWithOev2.sol";
import "./DapiProxyWithOev2.sol";
import "./interfaces/IProxyFactory.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/// @title Contract factory that deterministically deploys proxies that read
/// data feeds (Beacons or Beacon sets) or dAPIs, along with optional OEV
/// support
/// @dev The proxies are deployed normally and not cloned to minimize the gas
/// cost overhead while using them to read data feed values.
contract ProxyFactory2 is IProxyFactory {
    /// @notice DapiServer address
    address public immutable override dapiServer;

    address public immutable dataFeedProxyImplementation;
    address public immutable dapiProxyImplementation;
    address public immutable dataFeedProxyWithOevImplementation;
    address public immutable dapiProxyWithOevImplementation;

    /// @param _dapiServer DapiServer address
    constructor(address _dapiServer) {
        require(_dapiServer != address(0), "DapiServer address zero");
        dapiServer = _dapiServer; // Not used
        dataFeedProxyImplementation = address(new DataFeedProxy2(_dapiServer));
        IDataFeedProxy2(dataFeedProxyImplementation).initialize(
            bytes32(type(uint256).max)
        );
        dapiProxyImplementation = address(new DapiProxy2(_dapiServer));
        IDapiProxy2(dapiProxyImplementation).initialize(
            bytes32(type(uint256).max)
        );
        dataFeedProxyWithOevImplementation = address(
            new DataFeedProxyWithOev2(_dapiServer)
        );
        IDataFeedProxy2(dataFeedProxyWithOevImplementation).initialize(
            bytes32(type(uint256).max)
        );
        IOevUpdater2(dataFeedProxyWithOevImplementation)
            .initializeOevBeneficiary(
                0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF
            );
        dapiProxyWithOevImplementation = address(
            new DapiProxyWithOev2(_dapiServer)
        );
        IDapiProxy2(dapiProxyWithOevImplementation).initialize(
            bytes32(type(uint256).max)
        );
        IOevUpdater2(dapiProxyWithOevImplementation).initializeOevBeneficiary(
            0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF
        );
    }

    /// @notice Deterministically deploys a data feed proxy
    /// @param dataFeedId Data feed ID
    /// @param metadata Metadata associated with the proxy
    function deployDataFeedProxy(bytes32 dataFeedId, bytes calldata metadata)
        external
        override
        returns (address proxyAddress)
    {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        proxyAddress = Clones.cloneDeterministic(
            dataFeedProxyImplementation,
            keccak256(metadata)
        );
        IDataFeedProxy2(proxyAddress).initialize(dataFeedId);
        emit DeployedDataFeedProxy(proxyAddress, dataFeedId, metadata);
    }

    /// @notice Deterministically deploys a dAPI proxy
    /// @param dapiName dAPI name
    /// @param metadata Metadata associated with the proxy
    function deployDapiProxy(bytes32 dapiName, bytes calldata metadata)
        external
        override
        returns (address proxyAddress)
    {
        require(dapiName != bytes32(0), "dAPI name zero");
        proxyAddress = Clones.cloneDeterministic(
            dapiProxyImplementation,
            keccak256(metadata)
        );
        IDapiProxy2(proxyAddress).initialize(dapiName);
        emit DeployedDapiProxy(proxyAddress, dapiName, metadata);
    }

    /// @notice Deterministically deploys a data feed proxy with OEV support
    /// @param dataFeedId Data feed ID
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    function deployDataFeedProxyWithOev(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = Clones.cloneDeterministic(
            dataFeedProxyWithOevImplementation,
            keccak256(metadata)
        );
        IDataFeedProxy2(proxyAddress).initialize(dataFeedId);
        IOevUpdater2(proxyAddress).initializeOevBeneficiary(oevBeneficiary);
        emit DeployedDataFeedProxyWithOev(
            proxyAddress,
            dataFeedId,
            oevBeneficiary,
            metadata
        );
    }

    /// @notice Deterministically deploys a dAPI proxy with OEV support
    /// @param dapiName dAPI name
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = Clones.cloneDeterministic(
            dapiProxyWithOevImplementation,
            keccak256(metadata)
        );
        IDapiProxy2(proxyAddress).initialize(dapiName);
        IOevUpdater2(proxyAddress).initializeOevBeneficiary(oevBeneficiary);
        emit DeployedDapiProxyWithOev(
            proxyAddress,
            dapiName,
            oevBeneficiary,
            metadata
        );
    }
}
