// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IProxyFactory {
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

    function deployDataFeedProxy(bytes32 dataFeedId, bytes calldata metadata)
        external
        returns (address proxyAddress);

    function deployDapiProxy(bytes32 dapiName, bytes calldata metadata)
        external
        returns (address proxyAddress);

    function deployDataFeedProxyWithOev(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress);

    function dapiServer() external view returns (address);
}