// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy.sol";
import "./DapiProxy.sol";
import "./DataFeedProxyWithOev.sol";
import "./DapiProxyWithOev.sol";

contract ProxyFactory {
    event DeployedDataFeedProxy(
        address indexed proxyAddress,
        bytes32 indexed dataFeedId,
        bytes metadata
    );

    event DeployedDapiProxy(
        address indexed proxyAddress,
        bytes32 indexed dapiName,
        bytes metadata
    );

    event DeployedDataFeedProxyWithOev(
        address indexed proxyAddress,
        bytes32 indexed dataFeedId,
        address indexed oevBeneficiary,
        bytes metadata
    );

    event DeployedDapiProxyWithOev(
        address indexed proxyAddress,
        bytes32 indexed dapiName,
        address indexed oevBeneficiary,
        bytes metadata
    );

    address public immutable dapiServer;

    constructor(address _dapiServer) {
        require(_dapiServer != address(0), "dAPI server zero");
        dapiServer = _dapiServer;
    }

    function deployDataFeedProxy(bytes32 dataFeedId, bytes calldata metadata)
        external
        returns (address proxyAddress)
    {
        proxyAddress = address(
            new DataFeedProxy{salt: keccak256(metadata)}(dapiServer, dataFeedId)
        );
        emit DeployedDataFeedProxy(proxyAddress, dataFeedId, metadata);
    }

    function deployDapiProxy(bytes32 dapiName, bytes calldata metadata)
        external
        returns (address proxyAddress)
    {
        proxyAddress = address(
            new DapiProxy{salt: keccak256(metadata)}(dapiServer, dapiName)
        );
        emit DeployedDapiProxy(proxyAddress, dapiName, metadata);
    }

    function deployDataFeedProxyWithOev(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress) {
        proxyAddress = address(
            new DataFeedProxyWithOev{salt: keccak256(metadata)}(
                dapiServer,
                dataFeedId,
                oevBeneficiary
            )
        );
        emit DeployedDataFeedProxyWithOev(
            proxyAddress,
            dataFeedId,
            oevBeneficiary,
            metadata
        );
    }

    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress) {
        proxyAddress = address(
            new DapiProxyWithOev{salt: keccak256(metadata)}(
                dapiServer,
                dapiName,
                oevBeneficiary
            )
        );
        emit DeployedDapiProxyWithOev(
            proxyAddress,
            dapiName,
            oevBeneficiary,
            metadata
        );
    }
}
