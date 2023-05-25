// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "./interfaces/IOrderPayable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Contract used to pay for orders denoted in the native currency
/// @notice OrderPayable is managed by an account that designates order signers
/// and withdrawers. Only orders for which a signature is issued for by an
/// order signer can be paid for. Order signers have to be EOAs to be able to
/// issue ERC191 signatures. The manager is responsible with reverting unwanted
/// signatures (for example, if a compromised order signer issues an
/// underpriced order and the order is paid for, the manager should revoke the
/// role, refund the payment and consider the order void).
/// Withdrawers can be EOAs or contracts. For example, one can implement a
/// withdrawer contract that withdraws funds automatically to a Funder
/// contract.
contract OrderPayable is
    AccessControlRegistryAdminnedWithManager,
    IOrderPayable
{
    using ECDSA for bytes32;

    /// @notice Order signer role description
    string public constant override ORDER_SIGNER_ROLE_DESCRIPTION =
        "Order signer";

    /// @notice Withdrawer role description
    string public constant override WITHDRAWER_ROLE_DESCRIPTION = "Withdrawer";

    /// @notice Order signer role
    bytes32 public immutable override orderSignerRole;

    /// @notice Withdrawer role
    bytes32 public immutable override withdrawerRole;

    /// @notice Returns if the order with ID is paid for
    mapping(bytes32 => bool) public override orderIdToPaymentStatus;

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager
    )
        AccessControlRegistryAdminnedWithManager(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager
        )
    {
        orderSignerRole = _deriveRole(
            _deriveAdminRole(manager),
            ORDER_SIGNER_ROLE_DESCRIPTION
        );
        withdrawerRole = _deriveRole(
            _deriveAdminRole(manager),
            WITHDRAWER_ROLE_DESCRIPTION
        );
    }

    /// @notice Called with value to pay for an order
    /// @dev The sender must set `msg.value` to cover the exact amount
    /// specified by the order.
    /// Input arguments are provided in encoded form to improve the UX for
    /// using ABI-based, automatically generated contract GUIs such as ones
    /// from Safe and Etherscan. Given that OrderPayable is verified, the user
    /// is only required to provide the OrderPayable address, select
    /// `payForOrder()`, copy-paste `encodedData` (instead of 4 separate
    /// fields) and enter `msg.value`.
    /// @param encodedData The order ID, expiration timestamp, order signer
    /// address and signature in ABI-encoded form
    function payForOrder(bytes calldata encodedData) external payable override {
        // Do not care if `encodedData` has trailing data
        (
            bytes32 orderId,
            uint256 expirationTimestamp,
            address orderSigner,
            bytes memory signature
        ) = abi.decode(encodedData, (bytes32, uint256, address, bytes));
        // We do not allow invalid orders even if they are signed by an
        // authorized order signer
        require(orderId != bytes32(0), "Order ID zero");
        require(expirationTimestamp > block.timestamp, "Order expired");
        require(
            orderSigner == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    orderSignerRole,
                    orderSigner
                ),
            "Invalid order signer"
        );
        require(msg.value > 0, "Payment amount zero");
        require(!orderIdToPaymentStatus[orderId], "Order already paid for");
        require(
            (
                keccak256(
                    abi.encodePacked(
                        block.chainid,
                        address(this),
                        orderId,
                        expirationTimestamp,
                        msg.value
                    )
                ).toEthSignedMessageHash()
            ).recover(signature) == orderSigner,
            "Signature mismatch"
        );
        orderIdToPaymentStatus[orderId] = true;
        emit PaidForOrder(
            orderId,
            expirationTimestamp,
            orderSigner,
            msg.value,
            msg.sender
        );
    }

    /// @notice Called by a withdrawer to withdraw the entire balance of
    /// OrderPayable to `recipient`
    /// @param recipient Recipient address
    /// @return amount Withdrawal amount
    function withdraw(
        address recipient
    ) external override returns (uint256 amount) {
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    withdrawerRole,
                    msg.sender
                ),
            "Sender cannot withdraw"
        );
        amount = address(this).balance;
        emit Withdrew(recipient, amount);
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer unsuccessful");
    }
}
