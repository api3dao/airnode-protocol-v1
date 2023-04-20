// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Funder is nice but it may be a bit overkill for funding only two wallets
contract FunderLite {
    // Reading these three immutable values is cheaper than reading `root` from
    // storage
    address public immutable recipient;
    uint256 public immutable lowThreshold;
    uint256 public immutable highThreshold;

    // Deployed normally (is not cloned) to reduce gas cost of funding calls
    constructor(
        address _recipient,
        uint256 _lowThreshold,
        uint256 _highThreshold
    ) {
        require(_recipient != address(0)); // solhint-disable-line reason-string
        require(_lowThreshold <= _highThreshold); // solhint-disable-line reason-string
        require(_highThreshold != 0); // solhint-disable-line reason-string
        recipient = _recipient;
        lowThreshold = _lowThreshold;
        highThreshold = _highThreshold;
    }

    // Anyone can send ETH to this contract, omitted withdrawal implementation
    // to reduce bytecode
    receive() external payable {}

    // No Merkle proofs. Still allows reward mechanism to be built on top.
    function fund() external {
        uint256 recipientBalance = recipient.balance;
        require(recipientBalance <= lowThreshold, "Balance not low enough");
        uint256 topUpAmount = highThreshold - recipientBalance <
            address(this).balance
            ? highThreshold - recipientBalance
            : address(this).balance;
        require(topUpAmount != 0, "Top up amount zero");
        // Emit event
        (bool success, ) = recipient.call{value: topUpAmount}("");
        require(success, "Transfer unsuccessful");
    }
}
