// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IOrderPayable {
    event PaidForOrder(
        bytes32 indexed orderId,
        uint256 expirationTimestamp,
        address orderSigner,
        uint256 amount,
        address sender
    );

    event Withdrew(address recipient, uint256 amount);

    function payForOrder(bytes calldata encodedData) external payable;

    function withdraw(address recipient) external returns (uint256 amount);

    // solhint-disable-next-line func-name-mixedcase
    function ORDER_SIGNER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    // solhint-disable-next-line func-name-mixedcase
    function WITHDRAWER_ROLE_DESCRIPTION()
        external
        view
        returns (string memory);

    function orderSignerRole() external view returns (bytes32);

    function withdrawerRole() external view returns (bytes32);

    function orderIdToPaymentStatus(
        bytes32 orderId
    ) external view returns (bool paymentStatus);
}
