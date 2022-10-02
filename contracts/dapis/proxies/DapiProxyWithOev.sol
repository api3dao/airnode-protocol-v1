// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DapiProxy.sol";

contract DapiProxyWithOev is DapiProxy {
    constructor(
        address _dapiServer,
        address _reader,
        bytes32 _dapiNameHash,
        bytes32 _policyHash,
        address _referral
    ) DapiProxy(_dapiServer, _reader, _dapiNameHash, _policyHash, _referral) {}

    // TODO: Implement withdraw()

    function oevBeaconUpdate(
        address airnode,
        bytes32 templateId,
        uint256 timestamp,
        bytes memory data,
        uint256 expireTimestamp,
        uint256 bidAmount,
        bytes memory signature
    ) external payable {
        require(block.timestamp < expireTimestamp, "Signature has expired");
        require(msg.value >= bidAmount, "Insufficient bid amount");
        IDapiServer(dapiServer).updateOwnBeaconWithSignedData(
            airnode,
            templateId,
            timestamp,
            data,
            abi.encodePacked(
                block.chainid,
                msg.sender,
                address(this),
                expireTimestamp,
                bidAmount
            ),
            signature
        );
    }

    function oevBeaconSetUpdate(
        address[] memory airnodes,
        bytes32[] memory templateIds,
        uint256[] memory timestamps,
        bytes[] memory data,
        uint256 expireTimestamp,
        uint256 bidAmount,
        bytes[] memory signatures
    ) external payable {
        require(block.timestamp < expireTimestamp, "Signature has expired");
        require(msg.value >= bidAmount, "Insufficient bid amount");
        IDapiServer(dapiServer).updateOwnBeaconSetWithSignedData(
            airnodes,
            templateIds,
            timestamps,
            data,
            abi.encodePacked(
                block.chainid,
                msg.sender,
                address(this),
                expireTimestamp,
                bidAmount
            ),
            signatures
        );
    }

    function read()
        external
        view
        override
        returns (int224 value, uint32 timestamp)
    {
        require(
            reader == address(0) || msg.sender == reader,
            "Sender cannot read"
        );
        (
            int224 ownDataFeedValue,
            uint32 ownDataFeedTimestamp,
            int224 baseDataFeedValue,
            uint32 baseDataFeedTimestamp
        ) = IDapiServer(dapiServer).readOwnDataFeedWithDapiNameHash(
                dapiNameHash
            );
        if (ownDataFeedTimestamp > baseDataFeedTimestamp) {
            return (ownDataFeedValue, ownDataFeedTimestamp);
        } else {
            return (baseDataFeedValue, baseDataFeedTimestamp);
        }
    }
}
