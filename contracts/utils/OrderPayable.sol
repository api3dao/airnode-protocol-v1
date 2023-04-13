// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../access-control-registry/AccessControlRegistryAdminnedWithManager.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract OrderPayable is AccessControlRegistryAdminnedWithManager {
    using ECDSA for bytes32;
    using Address for address;

    event PaidForOrder(
        bytes32 indexed orderId,
        uint256 expirationTimestamp,
        address orderSigner,
        uint256 amount
    );

    event PaidInvoice(
        bytes32 indexed orderId,
        uint256 expirationTimestamp,
        address orderSigner,
        address invoicePayer,
        uint256 amount
    );

    event Withdrew(address recipient, uint256 amount);

    string public constant ORDER_SIGNER_ROLE_DESCRIPTION = "Order signer";
    string public constant WITHDRAWER_ROLE_DESCRIPTION = "Withdrawer";
    bytes32 public immutable orderSignerRole;
    bytes32 public immutable withdrawerRole;

    mapping(bytes32 => bool) public orderIdToPaymentStatus;

    modifier onlyValidOrderParameters(
        bytes32 orderId,
        uint256 expirationTimestamp,
        address orderSigner,
        uint256 paymentAmount
    ) {
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
        require(paymentAmount > 0, "Payment amount zero");
        require(!orderIdToPaymentStatus[orderId], "Order already paid for");
        _;
    }

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

    function payForOrder(
        bytes32 orderId,
        uint256 expirationTimestamp,
        address orderSigner,
        bytes calldata signature
    )
        external
        payable
        onlyValidOrderParameters(
            orderId,
            expirationTimestamp,
            orderSigner,
            msg.value
        )
    {
        require(
            (
                keccak256(
                    abi.encodePacked(orderId, expirationTimestamp, msg.value)
                ).toEthSignedMessageHash()
            ).recover(signature) == orderSigner,
            "Signature mismatch"
        );
        orderIdToPaymentStatus[orderId] = true;
        emit PaidForOrder(orderId, expirationTimestamp, orderSigner, msg.value);
    }

    function payInvoice(
        bytes32 orderId,
        uint256 expirationTimestamp,
        address orderSigner,
        bytes calldata signature
    )
        external
        payable
        onlyValidOrderParameters(
            orderId,
            expirationTimestamp,
            orderSigner,
            msg.value
        )
    {
        require(
            (
                keccak256(
                    abi.encodePacked(
                        orderId,
                        expirationTimestamp,
                        msg.sender,
                        msg.value
                    )
                ).toEthSignedMessageHash()
            ).recover(signature) == orderSigner,
            "Signature mismatch"
        );
        orderIdToPaymentStatus[orderId] = true;
        emit PaidInvoice(
            orderId,
            expirationTimestamp,
            orderSigner,
            msg.sender,
            msg.value
        );
    }

    // We need the recipient to be specified because if OwnableCallForwarder
    // is the manager and it calls this function to withdraw to itself, the
    // funds will get stuck because OwnableCallForwarder doesn't have a sweep
    // function
    function withdraw(address recipient) external {
        require(
            msg.sender == manager ||
                IAccessControlRegistry(accessControlRegistry).hasRole(
                    withdrawerRole,
                    msg.sender
                ),
            "Sender cannot withdraw"
        );
        uint256 balance = address(this).balance;
        emit Withdrew(recipient, balance);
        (bool success, ) = recipient.call{value: balance}("");
        require(success, "Transfer unsuccessful");
    }
}
