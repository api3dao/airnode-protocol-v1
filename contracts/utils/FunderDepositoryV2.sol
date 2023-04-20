// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// This contract should always be deployed by calling deployFunderDepository() at FunderV2.
// Owner and root are immutable. If the owner wants to update the owner or the root, they can
// have a new FunderDepositoryV2 deployed and call withdrawAll() at FunderV2 to transfer the
// funds there
contract FunderDepositoryV2 {
    address public immutable funder;
    address public immutable owner;
    bytes32 public immutable root;

    constructor(address _owner, bytes32 _root) {
        funder = msg.sender;
        owner = _owner;
        root = _root;
    }

    receive() external payable {}

    // FunderV2 only uses this function to allow FunderDepositoryV2 owner to withdraw funds
    // or accounts specified by the root to be funded according to the thresholds
    function withdraw(address recipient, uint256 amount) external {
        require(msg.sender == funder, "Sender not Funder");
        // FunderV2 checks for balance so FunderDepositoryV2 does not need to
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer unsuccessful");
    }
}
