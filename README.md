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
