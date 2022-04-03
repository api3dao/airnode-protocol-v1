// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IAirnodeEndpointPriceRegistry.sol";
import "./interfaces/IAirnodeEndpointPriceRegistryUser.sol";

/// @title Contract to be inherited by contracts that will interact with
/// AirnodeEndpointPriceRegistry
contract AirnodeEndpointPriceRegistryUser is IAirnodeEndpointPriceRegistryUser {
    /// @notice AirnodeEndpointPriceRegistry contract address
    address public immutable override airnodeEndpointPriceRegistry;

    /// @param _airnodeEndpointPriceRegistry AirnodeEndpointPriceRegistry
    /// contract address
    constructor(address _airnodeEndpointPriceRegistry) {
        require(
            _airnodeEndpointPriceRegistry != address(0),
            "Price registry address zero"
        );
        airnodeEndpointPriceRegistry = _airnodeEndpointPriceRegistry;
    }
}
