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

Test the contracts, get test coverage and gas report

```sh
yarn test
yarn test:extended
# Outputs to `./coverage`
yarn test:coverage
# Outputs to `.gas_report`
yarn test:gas
```

# Temporary

    // There are four roles implemented in this contract:
    // Root
    // └── (1) Admin (can grant and revoke the roles below)
    //     ├── (2) Authorization expiration extender
    //     ├── (3) Authorization expiration setter
    //     └── (4) Indefinite authorizer
    // Their IDs are derived from the descriptions below. Refer to
    // AccessControlRegistry for more information.
    // To clarify, the root role of the manager is the admin of (1), while (1)
    // is the admin of (2), (3) and (4). So (1) is more of a "contract admin",
    // while the `adminRole` used in AccessControl and AccessControlRegistry
    // refers to a more general adminship relationship between roles.

    /// @notice Airnode operators need to opt in to using each Allocator by
    /// configuring their Airnode to do so


    /// In all contracts, we use the "set" verb to refer to setting a value
    /// without considering its previous value, and emitting an event whether
    /// a state change has occurred or not.

    TODO: Move the protocol descriptions from the contracts to the README
