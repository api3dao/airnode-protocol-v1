// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IDapiProxy.sol";
import "./interfaces/IProxyWithOev.sol";

contract DapiProxyWithOev is IDapiProxy, IProxyWithOev {
    address public immutable dapiServer;
    bytes32 public immutable dapiNameHash;
    address public immutable oevBeneficiary;

    constructor(
        address _dapiServer,
        bytes32 _dapiName,
        address _oevBeneficiary
    ) {
        dapiServer = _dapiServer;
        dapiNameHash = keccak256(abi.encodePacked(_dapiName));
        oevBeneficiary = _oevBeneficiary;
    }

    function withdraw() external override {
        uint256 balance = address(this).balance;
        require(balance > 0, "Zero balance");
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = oevBeneficiary.call{value: balance}("");
        require(success, "Beneficiary reverted withdrawal");
    }

    function updateOevProxyBeaconWithSignedData(
        address airnode,
        bytes32 templateId,
        uint256 timestamp,
        bytes memory data,
        uint256 expireTimestamp,
        uint256 bidAmount,
        bytes memory signature
    ) external payable override {
        require(block.timestamp < expireTimestamp, "Expired signature");
        require(msg.value == bidAmount, "Invalid bid amount");
        IDapiServer(dapiServer).updateOevProxyBeaconWithSignedData(
            airnode,
            templateId,
            timestamp,
            data,
            abi.encodePacked(
                block.chainid,
                address(this),
                msg.sender,
                expireTimestamp,
                bidAmount
            ),
            signature
        );
    }

    function updateOevProxyBeaconSetWithSignedData(
        address[] memory airnodes,
        bytes32[] memory templateIds,
        uint256[] memory timestamps,
        bytes[] memory data,
        uint256 expireTimestamp,
        uint256 bidAmount,
        bytes[] memory signatures
    ) external payable override {
        require(block.timestamp < expireTimestamp, "Expired signature");
        require(msg.value == bidAmount, "Invalid bid amount");
        IDapiServer(dapiServer).updateOevProxyBeaconSetWithSignedData(
            airnodes,
            templateIds,
            timestamps,
            data,
            abi.encodePacked(
                block.chainid,
                address(this),
                msg.sender,
                expireTimestamp,
                bidAmount
            ),
            signatures
        );
    }

    function read()
        external
        view
        virtual
        override
        returns (uint224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer)
            .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
        require(timestamp > 0, "dAPI not initialized");
    }
}
