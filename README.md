# Airnode protocol v1

This package temporarily houses the Airnode v1 protocol contracts. With the Airnode v1 release, these contracts will be
migrated into the [Airnode monorepo](https://github.com/api3dao/airnode).

If you are looking for the contracts that Airnode v0 uses, see
[@api3/airnode-protocol](https://github.com/api3dao/airnode/tree/master/packages/airnode-protocol). If you are looking
for how to operate an Airnode, see the [docs](https://docs.api3.org/airnode).

## Instructions

Install the dependencies and build

```sh
yarn
yarn build
```

Test the contracts, get test coverage and gas reports

```sh
yarn test
# Runs exhaustive tests for Sort.sol
yarn test:extended
# Outputs to `./coverage`
yarn test:coverage
# Outputs to `.gas_report`
yarn test:gas
```

## Important note about zkSync

The ProxyFactory deployed on the zkSync networks is a modified version ([ProxyFactoryZkSync](https://github.com/api3dao/airnode-protocol-v1/blob/deploy-zksync-reference/contracts/api3-server-v1/proxies/ProxyFactoryZkSync.sol)) that handles the difference in CREATE2 address computation.
This package exports the address of these deployments under the name ProxyFactory to keep the interface uniform.
The proxy address computation methods of `@api3/contracts` also handle the difference, so if you use `@api3/contracts` and the ProxyFactory contract's proxy address computation methods, you can treat zkSync as any other network.
However, if you have your own proxy address derivation implementation, be aware that you will need to make an exception for zkSync.

## Solidity versions

The current form of the repo is tested with Solidity version `0.8.17`. The complete contracts to be deployed are locked
at this version, and the rest (interfaces, stub contracts, mock contracts) specify version `^0.8.0` to not limit their
users. Some mock contracts use custom errors, which is why they specify version `^0.8.4`.

## Overview

- `access-control-registry/`: Contracts typically implement standalone access control schemes, ranging from inheriting
  `Ownable` to customized complex models. This makes it difficult to track the privileges that an account has granted,
  which has negative usability and security implications. This issue is more relevant in a decentralized governance
  context, e.g., a DAO would need to delegate privileges to less decentralized agents, audit their performance, and
  revoke privileges in case they are abused. For such an approach to work, the granted privileges need to be easily
  discoverable. `AccessControlRegistry` is a shared registry that accounts can create tree-shaped role structures, which
  other contracts can refer to.

- `protocol/`: "The Airnode protocol" refers to two protocols: request-response protocol (RRP) and publish–subscribe
  protocol (PSP). RRP is the pull version ("What is the price of Bitcoin?") and PSP is the pull version ("Call me back
  when the price of Bitcoin is $50,000.") An Airnode detects RRP requests by listening to events from `AirnodeProtocol`,
  and PSP subscriptions by querying the respective `Allocator`s. There are also relayed versions of RRP and PSP, where
  the requester specifies a relayer to deliver the response signed by an Airnode.

- `allocators/`: An Airnode that supports PSP needs to detect potential subscriptions to serve. To avoid having to
  manually configure the Airnode to update the subscriptions, the node operator can configure it to refer to specific
  `Allocator` contracts. These contracts implement custom rules regarding how the subscriptions can be updated, which
  likely involve monetization.

- `authorizers/`: An Airnode that detects RRP requests or PSP subscriptions needs to know which of these should be
  served. To avoid having to manually configure the Airnode to maintain a whitelist, the node operator can configure it
  to refer to specific `Authorizer` contracts. These contracts implement custom rules regarding which requests and
  subscriptions should be served, which likely involve monetization.

- `dapis/`: The `DataFeedServer` contract implements _Beacons_, which are single-Airnode data feeds. Beacons can be
  combined to create _Beacon sets_, which are asynchronously aggregated Beacons (we refer to both Beacons and Beacon
  sets as "data feeds"). _dAPIs_, implemented by `DapiServer`, are names that are attached to Beacons or Beacon sets,
  which can be seen as managed data feeds. `BeaconUpdatesWithRrp` and `DataFeedUpdatesWithPsp` uses RRP and PSP to
  update data feeds respectively, which makes them a very good example of how the Airnode protocol can be used. In
  addition, `BeaconUpdatesWithSignedData` allows data signed by the respective Airnodes to update Beacons, which can be
  delivered outside of the protocol. Finally, a special version of these signed data updates are used to capture
  [oracle extractable value (OEV)](https://medium.com/api3/oracle-extractable-value-oev-13c1b6d53c5b) in
  `OevDataFeedServer`.

- `utils/`: As the name suggests, utility contracts that the other contracts may require. Multicall contracts are aimed
  to minimize Airnode RPC calls and improve UX for non-protocol contracts. `OwnableCallForwarder` enables the role trees
  in `AccessControlRegistry` to be transferrable. `ExpiringMetaTxForwarder` allows Airnode operators or acounts
  authorized by them to issue signatures to have users self-whitelist.

## Design pillars

**Protocolization:** API3 aims to build oracle services that are powered entirely by first-party oracles, i.e., oracles
operated by API providers. This means we cannot offload our problems to node operators, both the node and its protocol
needs to be _set-and-forget_. This is best reflected in PSP, which allows one to set up data feeds (and many other kinds
of oracle services) remotely, without requiring any effort from the node operator.

It should be noted that we also consider the oracle business model to be an extension of the protocol, and also aim for
a set-and-forget business model. `Allocator`s and `Authorizer`s are the stubs that we build into the data protocol for
monetization to also be protocolized, and we will release contracts that fully flesh this out in the future.

**Specificity:** A common pitfall in protocol design is over-generalization in an attempt to cover all potential
use-cases. This creates a lot of abstraction that the user now needs to learn, while not providing any structure that
the user can work off of. In contrast, we went with an opinionated approach by providing scaffolds into the direction we
think the user should build towards.

**Immutability:** API3 aims to build trust-miminized oracles services, which means one should only have to trust the
data sources (which is unavoidable) and no one else. Governance, even by a DAO, contaminates this trust-minimization. To
avoid this, we do two things: (1) Our contracts are not upgradeable, as this unavoidably requires some kind of
governance. (2) Endpoints defined in [OIS](https://docs.api3.org/ois) (oracle integration specifications) are identified
by [endpoint ID](https://docs.api3.org/airnode/latest/concepts/endpoint.html#endpointid)s, endpoint IDs and
[Airnode ABI-encoded parameters](https://docs.api3.org/airnode/latest/reference/specifications/airnode-abi-specifications.html)
constitute
[template ID](https://docs.api3.org/airnode/latest/reference/specifications/airnode-abi-specifications.html)s,
[Airnode addresses](https://docs.api3.org/airnode/latest/reference/specifications/airnode-abi-specifications.html) and
template IDs constitute Beacon IDs, and Beacon IDs constitute Beacon set IDs. Therefore, it is possible to track the
entire data supply chain starting from the API all the way to the aggregated data feed easily and in a trust-minimized
way.

**Optimistic scaling:** Our solutions are generally built optimistically, with one tamper-proof and highly efficient
solution, and one trust-minimized and less efficient solution. The first solution is tamper-proof because it depends on
signatures from the first-party Airnode, yet its delivery is centralized for performance. The only risk with this
solution is for it to become unavailable, in which case the trust-minimized solution should be seamlessly fallen back
to. For an oracle service to be trust-minimized, it must interact with the chain directly. Depending on a third-party
relay, or requiring to interact with other oracle nodes through a blockchain or a state channel is considered
unacceptable for the trust-minimized solution, as this introduces additional points of failure.

An example of this can be seen in `DapiServer`, where Beacon sets are updated by collecting signed data from Airnodes
and calling `updateBeaconWithSignedData()` and `updateBeaconSetWithBeacons()` by a centralized agent. In the event that
this service stops, Airnodes can update their respective Beacons by calling `fulfillPspBeaconUpdate()` if they have PSP
subscriptions, or they can use `updateDataFeedWithSignedData()` only with their own signed data to update their
respective Beacon (as [byog](https://byog.io/) does), after which the Beacon set can be updated by anyone by calling
`updateBeaconSetWithBeacons()` or through a PSP subscription that will call `fulfillPspBeaconSetUpdate()` based on
deviation conditions. The latter method of doing things is not expected to be used, yet it existing as a failsafe makes
the former method acceptable.

## Implementation details

### `AccessControlRegistry` and role trees

The contracts that use `AccessControlRegistry` in this repo (i.e., the `AccessControlRegistryAdminned` contracts) use
the following convention to create role trees per contract.

```
Root
  └─── Admin (can grant and revoke the roles below)
        ├── Contract specific role #1
        ├── Contract specific role #2
        └── Contract specific role #3
```

Here, the root role is immutably tied to an account. The contract admin role is derived from the root role and the
contract admin role description. This implies that contracts that have the same contract admin role description will
share role trees.

### `...WithManager` vs `...WithAirnode`

There are two types of `AccessControlRegistryAdminned` contracts in this repo, ones that end with `...WithManager` and
ones that end with `...WithAirnode`. This essentially refers to if the root role belongs to a manager account (e.g., the
API3 DAO), or if this is a shared account where each Airnode manages their own role tree and associated privileges. Note
that when applicable the root role is tied to the manager account immutably, which means if you want the managership to
be transferrable, you should designate `OwnableCallForwarder` (which is an `Ownable` contract whose ownership can be
transferred) to be the manager and make your calls through that.

### Relayed RRP and PSP

RRP and PSP have relayed versions where the requester specifies a relayer to deliver data signed by the respective
Airnode. Note that our aim here was to replicate the entire RRP and PSP functionality in relayed form, rather than to
design a relay-based oracle protocol. Since relaying for RRP and PSP requires the relayer to be trusted—not for not
tampering with data, but for not denying service and in the PSP case not delivering fulfillments even when the
conditions are not satisfied—it is more suitable for a trusted relayer to be specified.

### Sponsor and sponsor wallets

We have determined the gas cost of oracle services to be a very significant friction point for business models. Although
relaying signed data is a nicer alternative here, as discussed above, we find this far from being trust-minimized by
itself. As a solution, we built a scheme into the protocol that allows the users to cover the gas costs caused by their
usage. You can refer to the v0 docs for this, as the concept has not changed since then:
https://docs.api3.org/airnode/latest/concepts/sponsor.html

Sponsorship is done on a per-requester basis for RRP, and on a per-subscription basis for PSP. Relaying services suffer
from the same gas cost issues as oracle services, and since the requester knows the relayer beforehand and trusts them
to the degree that they get the relay service from them, we expect the same sponsorship scheme to be applicable. Sponsor
wallets for protocols and their relayed versions are kept separately, while the sponsorship statuses are unified. In
other words, when a sponsor sponsors a requester for RRP, they also sponsor them for relayed RRP. However, two separate
sponsor wallets will be kept for the requester, one for RRP and one for relayed RRP.

### Not requiring Airnode operator transactions

In a first-part oracle setting, requiring the Airnode operators to make any transactions is a significant friction
point. This is why the Airnode operator does not need to deploy a contract of their own (they use the shared
`AirnodeProtocol` contract) or make a transaction to announce anything. To opt in or out of a monetization scheme, they
simply need to update their configuration file to add or remove `Allocator`s and `Authorizer`s and redeploy, and
communicate that they have done so through off-chain channels.

### Data feed monetization

In addition to
[service coverage](https://github.com/api3dao/api3-whitepaper/blob/3f4a2e3a19b45bd1a6c26f7b6ab21861fc0373ef/api3-whitepaper.tex#L727),
we expect the main data feed monetization model to be based on OEV (see Figure 1 in the
[litepaper](https://raw.githubusercontent.com/api3dao/oev-litepaper/main/oev-litepaper.pdf)). To implement this in the
most optimized way, we built it into `Api3ServerV1`, yet data feed users can opt out of it if they wish to.

### Data feed proxies

Data feeds are popular oracle services mostly because they are simple and highly standardized. Even so, it is a
challenge to have the user correctly execute integrations, and providing technical support is not a scalable solution.
We aim our user onboarding process to be entirely automated, and we have many variants of the same data feeds (does the
user want to read the dAPI, the Beacon set that the dAPI points to, OEV enabled or disabled, with or without security
coverage, etc.) To solve both of these problems at once, we decided to enable users to use the
[API3 Market](https://market.api3.org/dapis) to deploy proxies that implement the integration they need
programmatically. As a result, whatever API3 data feed a user uses, all they need to will be to call the `read()`
function of a contract.

To minimize the overhead of using proxies, we preferred having them deployed normally (instead of being cloned). To
reduce the deployment cost of these proxies, we pushed as much of the implementation into DapiServer.

### Expiring meta-transactions

`AccessControlRegistry`, `Allocator`s and `Authorizer`s support meta-transactions. This is mostly considering the fact
that the users will want Airnode operators to make transactions, and the Airnode operators will not want to pay for the
gas cost of these transactions. Considering our requirements and expected usage scenarios, we ended up with a customized
meta-transaction implementation that we fully accept to not be suitable for general purpose usage. The main points here
are that we did not use a nonce because we do not want meta-transactions to block each other, and we have an expiration
timestamp to avoid dangling liabilities. As a further precaution, we allowed the signer to cancel meta-transactions
(that are not executed yet) with a transaction of their own.
