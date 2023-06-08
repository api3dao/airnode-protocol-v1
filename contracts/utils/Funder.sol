// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./SelfMulticall.sol";
import "./interfaces/IFunder.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./FunderDepository.sol";

contract Funder is SelfMulticall, IFunder {
    mapping(address => mapping(bytes32 => address payable))
        public
        override ownerToRootToFunderDepositoryAddress;

    receive() external payable {}

    function deployFunderDepository(
        address owner,
        bytes32 root
    ) external override returns (address payable funderDepository) {
        // Owner allowed to be zero
        require(root != bytes32(0), "Root zero");
        funderDepository = payable(
            new FunderDepository{salt: bytes32(0)}(owner, root)
        );
        ownerToRootToFunderDepositoryAddress[owner][root] = funderDepository;
        // We could have not stored this and used computeFunderDepositoryAddress() on the
        // fly whenever we needed it, but doing so requires handling the FunderDepository
        // bytecode, which ends up being more expensive than reading a bytes32 from storage
        emit DeployedFunderDepository(funderDepository, owner, root);
    }

    // It's a bit heavy on the calldata but I don't see a way around it
    function fund(
        address owner,
        bytes32 root,
        bytes32[] calldata proof,
        address recipient,
        uint256 lowThreshold,
        uint256 highThreshold
    ) external override {
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
        uint256 amount = amountNeededToTopUp <= funderDepository.balance
            ? amountNeededToTopUp
            : funderDepository.balance;
        require(amount != 0, "Amount zero");
        FunderDepository(funderDepository).withdraw(recipient, amount);
        // Even though the call above is external, it is to a trusted contract so the
        // event can be emitted after it returns
        emit Funded(funderDepository, recipient, amount);
    }

    // Called by the owner
    function withdraw(
        bytes32 root,
        address recipient,
        uint256 amount
    ) public override {
        require(recipient != address(0), "Recipient address zero");
        require(amount != 0, "Amount zero");
        address payable funderDepository = ownerToRootToFunderDepositoryAddress[
            msg.sender
        ][root];
        require(funderDepository != address(0), "No such FunderDepository");
        require(funderDepository.balance >= amount, "Insufficient balance");
        FunderDepository(funderDepository).withdraw(recipient, amount);
        emit Withdrew(funderDepository, recipient, amount);
    }

    // fund() calls will keep withdrawing from FunderDepository so it may be difficult to
    // withdraw the entire balance. I provided a convenience function for that.
    function withdrawAll(bytes32 root, address recipient) external override {
        withdraw(
            root,
            recipient,
            ownerToRootToFunderDepositoryAddress[msg.sender][root].balance
        );
    }

    // This needs to be adapted for zksync but at least we've done that before for ProxyFactory
    function computeFunderDepositoryAddress(
        address owner,
        bytes32 root
    ) external view override returns (address funderDepository) {
        require(root != bytes32(0), "Root zero");
        funderDepository = Create2.computeAddress(
            bytes32(0),
            keccak256(
                abi.encodePacked(
                    type(FunderDepository).creationCode,
                    abi.encode(owner, root)
                )
            )
        );
    }
}
