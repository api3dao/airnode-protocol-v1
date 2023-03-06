// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./interfaces/IStorageUtils.sol";

/// @title Contract that stores template and subscription details on chain
/// @notice The Airnode protocol does not depend on the template or
/// subscription details being stored on-chain. Airnode can be informed about
/// these in other ways, e.g., the details are hardcoded in the Airnode
/// configuration file.
contract StorageUtils is IStorageUtils {
    struct Template {
        bytes32 endpointId;
        bytes parameters;
    }

    struct Subscription {
        uint256 chainId;
        address airnode;
        bytes32 endpointOrTemplateId;
        bytes parameters;
        bytes conditions;
        address relayer;
        address sponsor;
        address requester;
        bytes4 fulfillFunctionId;
    }

    /// @notice Maximum parameter length for byte strings that Airnodes will
    /// need to read from storage or logs
    /// @dev A very generous limit is applied, under the assumption that
    /// anything larger than this is a grief attempt. If the user needs to use
    /// longer parameters, they will need to use off-chain channels to pass
    /// the respective template/subscription details to the Airnode operator
    /// for them to be specified in the configuration file.
    uint256 public constant override MAXIMUM_PARAMETER_LENGTH = 4096;

    /// @notice Template details with the ID
    mapping(bytes32 => Template) public override templates;

    /// @notice Subscription details with the ID
    mapping(bytes32 => Subscription) public override subscriptions;

    /// @notice Stores template details
    /// @dev Templates fully or partially define requests. By referencing a
    /// template, requesters can omit specifying the "boilerplate" sections of
    /// requests.
    /// In a subscription context, a zero endpoint ID means the Airnode does
    /// not need to use one of its endpoints, and can move directly on to
    /// fulfillment. This is particularly useful for defining traditional
    /// keeper jobs that do not require off-chain data.
    /// @param endpointId Endpoint ID (allowed to be `bytes32(0)`)
    /// @param parameters Template parameters, encoded in Airnode ABI
    /// @return templateId Template ID
    function storeTemplate(
        bytes32 endpointId,
        bytes calldata parameters
    ) external override returns (bytes32 templateId) {
        require(
            parameters.length <= MAXIMUM_PARAMETER_LENGTH,
            "Parameters too long"
        );
        templateId = keccak256(abi.encodePacked(endpointId, parameters));
        templates[templateId] = Template({
            endpointId: endpointId,
            parameters: parameters
        });
        emit StoredTemplate(templateId, endpointId, parameters);
    }

    /// @notice Stores subscription details
    /// @dev `airnode` should make the query specified by `templateId` and
    /// `parameters`. If the returned data satisfies `conditions`, it should
    /// call `requester`'s `fulfillFunctionId` on `chainId` with the returned
    /// data, using the wallet dedicated to `sponsor`.
    /// If `relayer` is not `airnode`, the relayer is responsible with checking
    /// `condition` and using the wallet dedicated to `sponsor` to deliver the
    /// data.
    /// In most cases, `conditions` will specify a static call to a function on
    /// `chainId` with the data. The extent of its flexibility depends on the
    /// node implementation and is outside the scope of the on-chain protocol.
    /// Similarly, `conditions` can specify with what frequency it should be
    /// verified, and the details of this is outside the scope.
    /// `templateId` being zero is similar to the endpoint ID being zero for
    /// templates, means the endpoint query can be skipped. In this case,
    /// `parameters` will be treated as the data that is returned by the
    /// endpoint while verifying `conditions`.
    /// @param chainId Chain ID
    /// @param airnode Airnode address
    /// @param endpointOrTemplateId Endpoint or template ID (allowed to be
    /// `bytes32(0)`)
    /// @param parameters Parameters provided by the subscription in addition
    /// to the parameters in the template (if applicable), encoded in Airnode
    /// ABI
    /// @param conditions Conditions under which the subscription is requested
    /// to be fulfilled, encoded in Airnode ABI
    /// @param relayer Relayer address
    /// @param sponsor Sponsor address
    /// @param requester Requester address
    /// @param fulfillFunctionId Selector of the function to be called for
    /// fulfillment
    /// @return subscriptionId Subscription ID
    function storeSubscription(
        uint256 chainId,
        address airnode,
        bytes32 endpointOrTemplateId,
        bytes calldata parameters,
        bytes calldata conditions,
        address relayer,
        address sponsor,
        address requester,
        bytes4 fulfillFunctionId
    ) external override returns (bytes32 subscriptionId) {
        require(chainId != 0, "Chain ID zero");
        require(airnode != address(0), "Airnode address zero");
        require(
            parameters.length <= MAXIMUM_PARAMETER_LENGTH,
            "Parameters too long"
        );
        require(
            conditions.length <= MAXIMUM_PARAMETER_LENGTH,
            "Conditions too long"
        );
        require(relayer != address(0), "Relayer address zero");
        require(sponsor != address(0), "Sponsor address zero");
        require(requester != address(0), "Requester address zero");
        require(fulfillFunctionId != bytes4(0), "Fulfill function ID zero");
        subscriptionId = keccak256(
            abi.encode(
                chainId,
                airnode,
                endpointOrTemplateId,
                parameters,
                conditions,
                relayer,
                sponsor,
                requester,
                fulfillFunctionId
            )
        );
        subscriptions[subscriptionId] = Subscription({
            chainId: chainId,
            airnode: airnode,
            endpointOrTemplateId: endpointOrTemplateId,
            parameters: parameters,
            conditions: conditions,
            relayer: relayer,
            sponsor: sponsor,
            requester: requester,
            fulfillFunctionId: fulfillFunctionId
        });
        emit StoredSubscription(
            subscriptionId,
            chainId,
            airnode,
            endpointOrTemplateId,
            parameters,
            conditions,
            relayer,
            sponsor,
            requester,
            fulfillFunctionId
        );
    }
}
