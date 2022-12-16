// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DapiProxy.sol";
import "./interfaces/IOevUpdater.sol";

/// @title An immutable proxy contract that is used to read a specific dAPI of
/// a specific DapiServer contract, execute OEV updates and let the beneficiary
/// withdraw the accumulated proceeds
/// @dev See DapiProxy.sol for comments about usage
contract DapiProxyWithOev is DapiProxy, IOevUpdater {
    /// @notice OEV beneficiary address
    address public immutable override oevBeneficiary;

    /// @param _dapiServer DapiServer address
    /// @param _dapiNameHash Hash of the dAPI name
    /// @param _oevBeneficiary OEV beneficiary
    constructor(
        address _dapiServer,
        bytes32 _dapiNameHash,
        address _oevBeneficiary
    ) DapiProxy(_dapiServer, _dapiNameHash) {
        oevBeneficiary = _oevBeneficiary;
    }

    /// @notice Called by anyone to withdraw the OEV proceeds to the
    /// beneficiary account
    function withdraw() external override {
        uint256 balance = address(this).balance;
        require(balance > 0, "Zero balance");
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = oevBeneficiary.call{value: balance}("");
        require(success, "Beneficiary reverted withdrawal");
    }

    /// @notice Called by the OEV auction winner along with the bid payment to
    /// update the OEV proxy Beacon
    /// @dev The winner of the auction calls this in a `multicall()` and
    /// extracts the OEV in subsequent calls of the same transaction
    /// @param airnode Airnode address
    /// @param templateId Template ID
    /// @param timestamp Timestamp used in the signature
    /// @param data Response data (an `int256` encoded in contract ABI)
    /// @param expirationTimestamp Expiration timestamp of the signature
    /// @param bidAmount Amount of the bid that won the OEV auction
    /// @param signature Template ID, a timestamp and the response data signed
    /// for the specific bid by the Airnode address
    function updateOevProxyBeaconWithSignedData(
        address airnode,
        bytes32 templateId,
        uint256 timestamp,
        bytes memory data,
        uint256 expirationTimestamp,
        uint256 bidAmount,
        bytes memory signature
    ) external payable override {
        require(block.timestamp < expirationTimestamp, "Expired signature");
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
                expirationTimestamp,
                bidAmount
            ),
            signature
        );
    }

    /// @notice Called by the OEV auction winner along with the bid payment to
    /// update the OEV proxy Beacon set
    /// @dev The winner of the auction calls this in a `multicall()` and
    /// extracts the OEV in subsequent calls of the same transaction
    /// @param airnodes Airnode addresses
    /// @param templateIds Template IDs
    /// @param timestamps Timestamps used in the signatures
    /// @param data Response data (an `int256` encoded in contract ABI per
    /// Beacon)
    /// @param expirationTimestamp Expiration timestamp of the signatures
    /// @param bidAmount Amount of the bid that won the OEV auction
    /// @param signatures Template ID, a timestamp and the response data signed
    /// for the specific bid by the respective Airnode address per Beacon
    function updateOevProxyBeaconSetWithSignedData(
        address[] memory airnodes,
        bytes32[] memory templateIds,
        uint256[] memory timestamps,
        bytes[] memory data,
        uint256 expirationTimestamp,
        uint256 bidAmount,
        bytes[] memory signatures
    ) external payable override {
        require(block.timestamp < expirationTimestamp, "Expired signature");
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
                expirationTimestamp,
                bidAmount
            ),
            signatures
        );
    }

    /// @notice Reads the dAPI that this proxy maps to
    /// @return value dAPI value
    /// @return timestamp dAPI timestamp
    function read()
        external
        view
        virtual
        override
        returns (int224 value, uint32 timestamp)
    {
        (value, timestamp) = IDapiServer(dapiServer)
            .readDataFeedWithDapiNameHashAsOevProxy(dapiNameHash);
        require(timestamp > 0, "dAPI not initialized");
    }
}
