// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// I wanted to build this in a way that you can also use it to fund 100 sponsor
// wallets that each power a single self-funded Beacon.
// Use FunderFactory to deploy.
contract Funder is Ownable {
    // Making this immutable would be nice. However, I foresee that we will
    // want to update this and having to transfer funds to do so will be very
    // annoying/error-prone.
    bytes32 public root;

    // This contract is intended to be cloned so the constructor makes the
    // implementation unusable
    constructor() {
        _transferOwnership(address(0));
        root = bytes32(uint256(1));
    }

    // Anyone can send ETH to this contract, it can only be used in funding or
    // withdrawn by the owner
    receive() external payable {
        // Maybe emit an event? If the user is withdrawing from an exchange for
        // example and the exchange hardcodes the gas limit as 21,000, the
        // event will have that transaction revert. That being said, maybe even
        // the `receive()` itself causes enough overhead to have this use-case
        // fail. I will experiment on this.
    }

    // `initialOwner` can be `address(0)` to make the root immutable and not
    // allow funds to be withdrawn
    function initialize(address initialOwner, bytes32 initialRoot) external {
        require(root == bytes32(0), "Cannot initialize");
        _transferOwnership(initialOwner);
        root = initialRoot;
        // Emit event
    }

    function setRoot(bytes32 _root) external onlyOwner {
        require(_root != bytes32(0), "Root zero");
        root = _root;
        // Emit event
    }

    // I figure we may want to skim without disturbing its operation so I added
    // `amount`
    function withdraw(address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Recipient address zero");
        require(amount != 0, "Amount zero");
        require(address(this).balance >= amount, "Insufficient balance");
        // Emit event
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer unsuccessful");
    }

    // One can build a layer on top of this to reward accounts that call this.
    // An even cooler thing to do would be to set `root` so that this function
    // also funds the reward contract.
    function fund(
        bytes32[] calldata proof,
        address recipient,
        uint256 lowThreshold,
        uint256 highThreshold
    ) external {
        // Still checking these in case the tree was populated with invalid
        // values
        require(recipient != address(0), "Recipient address zero");
        require(
            lowThreshold <= highThreshold,
            "Low threshold higher than high"
        );
        require(highThreshold != 0, "High threshold zero");
        // https://github.com/OpenZeppelin/merkle-tree#validating-a-proof-in-solidity
        bytes32 leaf = keccak256(
            bytes.concat(
                keccak256(abi.encode(recipient, lowThreshold, highThreshold))
            )
        );
        require(MerkleProof.verify(proof, root, leaf), "Invalid proof");
        // https://en.wikipedia.org/wiki/Hysteresis#In_engineering
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
