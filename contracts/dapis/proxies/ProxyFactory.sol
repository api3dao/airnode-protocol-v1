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
        bytes memory initcode = abi.encodePacked(
            type(DataFeedProxy).creationCode,
            abi.encode(dapiServer, dataFeedId)
        );
        bytes32 metadataHash = keccak256(metadata);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            proxyAddress := create2(
                0,
                add(initcode, 0x20),
                mload(initcode),
                metadataHash
            )
        }
        require(proxyAddress != address(0), "Proxy already deployed");
        emit DeployedDataFeedProxy(proxyAddress, dataFeedId, metadata);
    }

    function deployDapiProxy(bytes32 dapiName, bytes calldata metadata)
        external
        returns (address proxyAddress)
    {
        bytes memory initcode = abi.encodePacked(
            type(DapiProxy).creationCode,
            abi.encode(dapiServer, dapiName)
        );
        bytes32 metadataHash = keccak256(metadata);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            proxyAddress := create2(
                0,
                add(initcode, 0x20),
                mload(initcode),
                metadataHash
            )
        }
        require(proxyAddress != address(0), "Proxy already deployed");
        emit DeployedDapiProxy(proxyAddress, dapiName, metadata);
    }

    function deployDataFeedProxyWithOev(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external returns (address proxyAddress) {
        bytes memory initcode = abi.encodePacked(
            type(DataFeedProxyWithOev).creationCode,
            abi.encode(dapiServer, dataFeedId, oevBeneficiary)
        );
        bytes32 metadataHash = keccak256(metadata);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            proxyAddress := create2(
                0,
                add(initcode, 0x20),
                mload(initcode),
                metadataHash
            )
        }
        require(proxyAddress != address(0), "Proxy already deployed");
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
        bytes memory initcode = abi.encodePacked(
            type(DapiProxyWithOev).creationCode,
            abi.encode(dapiServer, dapiName, oevBeneficiary)
        );
        bytes32 metadataHash = keccak256(metadata);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            proxyAddress := create2(
                0,
                add(initcode, 0x20),
                mload(initcode),
                metadataHash
            )
        }
        require(proxyAddress != address(0), "Proxy already deployed");
        emit DeployedDapiProxyWithOev(
            proxyAddress,
            dapiName,
            oevBeneficiary,
            metadata
        );
    }
}
