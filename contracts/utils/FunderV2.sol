// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./SelfMulticall.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./FunderDepositoryV2.sol";

contract FunderV2 is SelfMulticall {
    mapping(address => mapping(bytes32 => address payable))
        public ownerToRootToFunderDepositoryAddress;

    receive() external payable {}

    function deployFunderDepository(
        address owner,
        bytes32 root
    ) external returns (address payable funderDepository) {
        // Owner allowed to be zero
        require(root != bytes32(0), "Root zero");
        funderDepository = payable(
            new FunderDepositoryV2{salt: bytes32(0)}(owner, root)
        );
        ownerToRootToFunderDepositoryAddress[owner][root] = funderDepository;
        // Emit event
    }

    function withdraw(
        address owner,
        bytes32 root,
        address recipient,
        uint256 amount
    ) public {
        require(msg.sender == owner, "Sender not owner");
        require(recipient != address(0), "Recipient address zero");
        require(amount != 0, "Amount zero");
        address payable funderDepository = ownerToRootToFunderDepositoryAddress[
            owner
        ][root];
        require(funderDepository != address(0), "No such FunderDepository");
        require(funderDepository.balance >= amount, "Insufficient balance");
        // Emit event
        FunderDepositoryV2(funderDepository).withdraw(recipient, amount);
    }

    // fund() calls will keep withdrawing from FunderDepositoryV2 so it may be difficult to
    // withdraw the entire balance. I provided a convenience function for that.
    function withdrawAll(
        address owner,
        bytes32 root,
        address recipient
    ) external {
        withdraw(
            owner,
            root,
            recipient,
            ownerToRootToFunderDepositoryAddress[owner][root].balance
        );
    }

    // It's a bit heavy on the calldata but I don't see a way around it
    function fund(
        address owner,
        bytes32 root,
        bytes32[] calldata proof,
        address recipient,
        uint256 lowThreshold,
        uint256 highThreshold
    ) external {
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
        address payable funderDepository = ownerToRootToFunderDepositoryAddress[
            owner
        ][root];
        uint256 amountNeededToTopUp;
        unchecked {
            amountNeededToTopUp = highThreshold - recipientBalance;
        }
        uint256 balance = funderDepository.balance;
        uint256 amount = amountNeededToTopUp <= balance
            ? amountNeededToTopUp
            : balance;
        require(amount != 0, "Amount zero");
        // Emit event
        FunderDepositoryV2(funderDepository).withdraw(recipient, amount);
    }

    // This needs to be adapted for zksync, but at least we've done that before for ProxyFactory
    function computeFunderDepositoryAddress(
        address owner,
        bytes32 root
    ) external view returns (address funderDepository) {
        require(root != bytes32(0), "Root zero");
        funderDepository = Create2.computeAddress(
            bytes32(0),
            keccak256(
                abi.encodePacked(
                    type(FunderDepositoryV2).creationCode,
                    abi.encode(owner, root)
                )
            )
        );
    }
}
