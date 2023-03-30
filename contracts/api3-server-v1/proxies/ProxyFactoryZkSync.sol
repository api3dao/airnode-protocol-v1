// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy.sol";
import "./DapiProxy.sol";
import "./DataFeedProxyWithOev.sol";
import "./DapiProxyWithOev.sol";
import "./interfaces/IProxyFactory.sol";

/// @title Contract factory that deterministically deploys proxies that read
/// data feeds (Beacons or Beacon sets) or dAPIs, along with optional OEV
/// support
/// @notice This ProxyFactory implementation replaces the OpenZeppelin CREATE2
/// address computation to match zkSync's. Accordingly, only use this contract
/// on the zkSync chains that use the ContractDeployer contract to deploy
/// contracts. For more information, see the link below
/// https://github.com/matter-labs/era-system-contracts/blob/857da713d9756ec13f071916848e283e74579817/contracts/ContractDeployer.sol
/// @dev The proxies are deployed normally and not cloned to minimize the gas
/// cost overhead while using them to read data feed values
contract ProxyFactoryZkSync is IProxyFactory {
    // https://github.com/matter-labs/era-system-contracts/blob/857da713d9756ec13f071916848e283e74579817/contracts/Constants.sol#L74
    bytes32 private constant CREATE2_PREFIX =
        0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494;
    // According to the zkSync docs, bytecode is hashed using sha256, and then the first two bytes are
    // replaced with the length of the bytecode in 32-byte words.
    // To verify the hashes below
    // - Build https://github.com/api3dao/airnode-protocol-v1/tree/deploy-zksync-reference
    // - Get the bytecode from the artifacts
    // - Use `utils.hashBytecode()` from the `zksync-web3` package
    bytes32 private constant DAPI_PROXY_BYTECODE_HASH =
        0x010000718e160c49f26d36ffd29dbe562fcc1ae0c45e3add4ae314721c4cfd50;
    bytes32 private constant DATA_FEED_PROXY_BYTECODE_HASH =
        0x01000071aa077a2b3722b686ce72da1b80c036fe00b90b1b0666cf7472ed7181;
    bytes32 private constant DAPI_PROXY_WITH_OEV_BYTECODE_HASH =
        0x010000833ea8eec6c5a363e8de8e0a9fcd770e93f86d9ec426c1f7886822cb4d;
    bytes32 private constant DATA_FEED_PROXY_WITH_OEV_BYTECODE_HASH =
        0x010000832145787c75d77acc93c6b6e61af2909128377978cb54e6f31e139cc0;

    /// @notice Api3ServerV1 address
    address public immutable override api3ServerV1;

    /// @param _api3ServerV1 Api3ServerV1 address
    constructor(address _api3ServerV1) {
        require(_api3ServerV1 != address(0), "Api3ServerV1 address zero");
        api3ServerV1 = _api3ServerV1;
    }

    /// @notice Deterministically deploys a data feed proxy
    /// @param dataFeedId Data feed ID
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDataFeedProxy(
        bytes32 dataFeedId,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        proxyAddress = address(
            new DataFeedProxy{salt: keccak256(metadata)}(
                api3ServerV1,
                dataFeedId
            )
        );
        emit DeployedDataFeedProxy(proxyAddress, dataFeedId, metadata);
    }

    /// @notice Deterministically deploys a dAPI proxy
    /// @param dapiName dAPI name
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDapiProxy(
        bytes32 dapiName,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        proxyAddress = address(
            new DapiProxy{salt: keccak256(metadata)}(
                api3ServerV1,
                keccak256(abi.encodePacked(dapiName))
            )
        );
        emit DeployedDapiProxy(proxyAddress, dapiName, metadata);
    }

    /// @notice Deterministically deploys a data feed proxy with OEV support
    /// @param dataFeedId Data feed ID
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDataFeedProxyWithOev(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = address(
            new DataFeedProxyWithOev{salt: keccak256(metadata)}(
                api3ServerV1,
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

    /// @notice Deterministically deploys a dAPI proxy with OEV support
    /// @param dapiName dAPI name
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function deployDapiProxyWithOev(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = address(
            new DapiProxyWithOev{salt: keccak256(metadata)}(
                api3ServerV1,
                keccak256(abi.encodePacked(dapiName)),
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

    /// @notice Computes the address of the data feed proxy
    /// @param dataFeedId Data feed ID
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDataFeedProxyAddress(
        bytes32 dataFeedId,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        proxyAddress = computeCreate2Address(
            address(this),
            DATA_FEED_PROXY_BYTECODE_HASH,
            keccak256(metadata),
            abi.encode(api3ServerV1, dataFeedId)
        );
    }

    /// @notice Computes the address of the dAPI proxy
    /// @param dapiName dAPI name
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDapiProxyAddress(
        bytes32 dapiName,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        proxyAddress = computeCreate2Address(
            address(this),
            DAPI_PROXY_BYTECODE_HASH,
            keccak256(metadata),
            abi.encode(api3ServerV1, keccak256(abi.encodePacked(dapiName)))
        );
    }

    /// @notice Computes the address of the data feed proxy with OEV support
    /// @param dataFeedId Data feed ID
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDataFeedProxyWithOevAddress(
        bytes32 dataFeedId,
        address oevBeneficiary,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dataFeedId != bytes32(0), "Data feed ID zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = computeCreate2Address(
            address(this),
            DATA_FEED_PROXY_WITH_OEV_BYTECODE_HASH,
            keccak256(metadata),
            abi.encode(api3ServerV1, dataFeedId, oevBeneficiary)
        );
    }

    /// @notice Computes the address of the dAPI proxy with OEV support
    /// @param dapiName dAPI name
    /// @param oevBeneficiary OEV beneficiary
    /// @param metadata Metadata associated with the proxy
    /// @return proxyAddress Proxy address
    function computeDapiProxyWithOevAddress(
        bytes32 dapiName,
        address oevBeneficiary,
        bytes calldata metadata
    ) external view override returns (address proxyAddress) {
        require(dapiName != bytes32(0), "dAPI name zero");
        require(oevBeneficiary != address(0), "OEV beneficiary zero");
        proxyAddress = computeCreate2Address(
            address(this),
            DAPI_PROXY_WITH_OEV_BYTECODE_HASH,
            keccak256(metadata),
            abi.encode(
                api3ServerV1,
                keccak256(abi.encodePacked(dapiName)),
                oevBeneficiary
            )
        );
    }

    /// @notice Computes the address where the contract will be deployed as a
    /// result of a CREATE2 operation on zkSync
    /// @dev This is an exact copy of `getNewAddressCreate2()` implementation
    /// from the ContractDeployer, which is a zkSync system contract
    /// @param sender Address of the account that sends the CREATE2
    /// @param customBytecodeHash Bytecode of the contract being deployed
    /// hashed in a customized way defined by zkSync
    /// @param salt CREATE2 salt
    /// @param constructorInput Constructor input arguments
    function computeCreate2Address(
        address sender,
        bytes32 customBytecodeHash,
        bytes32 salt,
        bytes memory constructorInput
    ) private pure returns (address) {
        bytes32 constructorInputHash = keccak256(constructorInput);
        bytes32 hash = keccak256(
            bytes.concat(
                CREATE2_PREFIX,
                bytes32(uint256(uint160(sender))),
                salt,
                customBytecodeHash,
                constructorInputHash
            )
        );
        return address(uint160(uint256(hash)));
    }
}
