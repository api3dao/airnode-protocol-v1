// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy2.sol";
import "./interfaces/IOevUpdater2.sol";

/// @title An immutable proxy contract that is used to read a specific data
/// feed (Beacon or Beacon set) of a specific DapiServer contract, execute OEV
/// updates and let the beneficiary withdraw the accumulated proceeds
/// @dev See DapiProxy.sol for comments about usage
contract DataFeedProxyWithOev2 is DataFeedProxy2, IOevUpdater2 {
    /// @notice OEV beneficiary address
    address public override oevBeneficiary;

    /// @param _dapiServer DapiServer address
    constructor(address _dapiServer) DataFeedProxy2(_dapiServer) {}

    function initializeOevBeneficiary(address _oevBeneficiary)
        external
        override
    {
        require(oevBeneficiary == address(0), "Already initialized");
        oevBeneficiary = _oevBeneficiary;
    }

    /// @notice Called by anyone to withdraw the OEV proceeds to the
    /// beneficiary account
    function withdraw() external {
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
    ) external payable {
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
    ) external payable {
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
        (value, timestamp) = IDapiServer(dapiServer)
            .readDataFeedWithIdAsOevProxy(dataFeedId);
        require(timestamp > 0, "Data feed not initialized");
    }
}
