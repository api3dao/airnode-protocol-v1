// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./AuthorizerWithErc20.sol";
import "./interfaces/IAuthorizationExpirationSetterWithErc20Payment.sol";
import "../authorizers/interfaces/IRequesterAuthorizer.sol";

/// @title RequesterAuthorizer authorization expiration setter contract that
/// allows users to pay the respective token to be authorized
contract AuthorizationExpirationSetterWithErc20Payment is
    AuthorizerWithErc20,
    IAuthorizationExpirationSetterWithErc20Payment
{
    using SafeERC20 for IERC20;

    /// @notice Minimum authorization expiration extension
    uint64 public override minimumAuthorizationExpiraitonExtension = 1 days;

    /// @notice Maximum authorization duration
    uint64 public override maximumAuthorizationExpiration = 365 days;

    uint256 private constant PRICING_INTERVAL = 30 days;

    /// @param _accessControlRegistry AccessControlRegistry contract address
    /// @param _adminRoleDescription Admin role description
    /// @param _manager Manager address
    /// @param _airnodeEndpointPriceRegistry AirnodeEndpointPriceRegistry
    /// contract address
    /// @param _requesterAuthorizerRegistry RequesterAuthorizerRegistry
    /// contract address
    /// @param _token Token contract address
    /// @param _tokenPrice Token price in USD (times 10^18)
    /// @param _priceCoefficient Price coefficient (has the same number of
    /// decimals as the token)
    /// @param _proceedsDestination Destination of proceeds
    constructor(
        address _accessControlRegistry,
        string memory _adminRoleDescription,
        address _manager,
        address _airnodeEndpointPriceRegistry,
        address _requesterAuthorizerRegistry,
        address _token,
        uint256 _tokenPrice,
        uint256 _priceCoefficient,
        address _proceedsDestination
    )
        AuthorizerWithErc20(
            _accessControlRegistry,
            _adminRoleDescription,
            _manager,
            _airnodeEndpointPriceRegistry,
            _requesterAuthorizerRegistry,
            _token,
            _tokenPrice,
            _priceCoefficient,
            _proceedsDestination
        )
    {
        require(
            IAirnodeEndpointPriceRegistry(airnodeEndpointPriceRegistry)
                .PRICING_INTERVAL() == PRICING_INTERVAL,
            "Pricing interval mismatch"
        );
    }

    /// @notice Called by the maintainers or the manager to set the minimum
    /// authorization expiration extension
    /// @param _minimumAuthorizationExpiraitonExtension Minimum authorization
    /// expiration extension
    function setMinimumAuthorizationExpirationExtension(
        uint64 _minimumAuthorizationExpiraitonExtension
    ) external override onlyMaintainerOrManager {
        require(
            _minimumAuthorizationExpiraitonExtension <=
                maximumAuthorizationExpiration &&
                _minimumAuthorizationExpiraitonExtension != 0,
            "Invalid minimum duration"
        );
        minimumAuthorizationExpiraitonExtension = _minimumAuthorizationExpiraitonExtension;
        emit SetMinimumAuthorizationExpirationExtension(
            _minimumAuthorizationExpiraitonExtension,
            msg.sender
        );
    }

    /// @notice Called by the maintainers or the manager to set the maximum
    /// authorization expiration
    /// @param _maximumAuthorizationExpiration Maximum authorization expiration
    function setMaximumAuthorizationExpiration(
        uint64 _maximumAuthorizationExpiration
    ) external override onlyMaintainerOrManager {
        require(
            _maximumAuthorizationExpiration >=
                minimumAuthorizationExpiraitonExtension,
            "Invalid maximum duration"
        );
        maximumAuthorizationExpiration = _maximumAuthorizationExpiration;
        emit SetMaximumAuthorizationExpiration(
            _maximumAuthorizationExpiration,
            msg.sender
        );
    }

    /// @notice Pays tokens to set the authorization expiration of the
    /// requester for the Airnode–endpoint pair
    /// @param airnode Airnode address
    /// @param chainId Chain ID
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    /// @param authorizationExpirationExtension Authorization expiration
    /// extension
    function payTokens(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester,
        uint64 authorizationExpirationExtension
    )
        external
        override
        onlyActiveAirnode(airnode)
        onlyNonZeroChainId(chainId)
        onlyNonZeroRequester(requester)
        onlyNonBlockedRequester(airnode, requester)
    {
        require(
            authorizationExpirationExtension >=
                minimumAuthorizationExpiraitonExtension,
            "Extension below minimum"
        );
        uint256 tokenPaymentAmount = getTokenPaymentAmount(
            airnode,
            chainId,
            endpointId,
            authorizationExpirationExtension
        );
        IRequesterAuthorizer requesterAuthorizer = IRequesterAuthorizer(
            getRequesterAuthorizerAddress(chainId)
        );
        (uint64 currentExpirationTimestamp, ) = requesterAuthorizer
            .airnodeToEndpointIdToRequesterToAuthorizationStatus(
                airnode,
                endpointId,
                requester
            );
        uint64 newExpirationTimestamp = currentExpirationTimestamp >
            block.timestamp
            ? currentExpirationTimestamp + authorizationExpirationExtension
            : uint64(block.timestamp) + authorizationExpirationExtension;
        require(
            newExpirationTimestamp - block.timestamp <=
                maximumAuthorizationExpiration,
            "Exceeds maximum duration"
        );
        emit PaidTokens(
            airnode,
            chainId,
            endpointId,
            requester,
            authorizationExpirationExtension,
            msg.sender,
            newExpirationTimestamp
        );
        requesterAuthorizer.setAuthorizationExpiration(
            airnode,
            endpointId,
            requester,
            newExpirationTimestamp
        );
        IERC20(token).safeTransferFrom(
            msg.sender,
            proceedsDestination,
            tokenPaymentAmount
        );
    }

    /// @notice Resets the authorization expiration of the blocked requester
    /// for the Airnode–endpoint pair
    /// @param airnode Airnode address
    /// @param chainId Chain ID
    /// @param endpointId Endpoint ID
    /// @param requester Requester address
    function resetAuthorizationExpirationOfBlockedRequester(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        address requester
    ) external override {
        require(
            requesterIsBlocked(airnode, requester),
            "Requester not blocked"
        );
        emit ResetAuthorizationExpirationOfBlockedRequester(
            airnode,
            chainId,
            endpointId,
            requester,
            msg.sender
        );
        IRequesterAuthorizer(getRequesterAuthorizerAddress(chainId))
            .setAuthorizationExpiration(airnode, endpointId, requester, 0);
    }

    /// @notice Amount of tokens needed to be paid to extend the authorization
    /// expiration for the Airnode–endpoint pair
    /// @param airnode Airnode address
    /// @param chainId Chain ID
    /// @param endpointId Endpoint ID
    /// @param authorizationExpirationExtension Authorization expiration
    /// extension
    /// @return tokenPaymentAmount Token amount needed to be paid
    function getTokenPaymentAmount(
        address airnode,
        uint256 chainId,
        bytes32 endpointId,
        uint64 authorizationExpirationExtension
    ) public view override returns (uint256 tokenPaymentAmount) {
        tokenPaymentAmount =
            (getTokenAmount(airnode, chainId, endpointId) *
                authorizationExpirationExtension) /
            PRICING_INTERVAL;
    }
}
