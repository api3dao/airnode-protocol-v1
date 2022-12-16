// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./DataFeedProxy.sol";
import "./interfaces/IOevUpdater.sol";

/// @title An immutable proxy contract that is used to read a specific data
/// feed (Beacon or Beacon set) of a specific DapiServer contract, execute OEV
/// updates and let the beneficiary withdraw the accumulated proceeds
/// @dev See DapiProxy.sol for comments about usage
contract DataFeedProxyWithOev is DataFeedProxy, IOevUpdater {
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
    function updateOevProxyDataFeedWithSignedData(
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
        IDapiServer(dapiServer).updateOevProxyDataFeedWithSignedData(
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
    }
}
