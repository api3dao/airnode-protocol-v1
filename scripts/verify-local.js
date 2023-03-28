// Even though hardhat-etherscan claims to also verify the deployment locally,
// it doesn't expose that as a command. As a result, you can't verify deployments
// on chains at which there is no supported block explorer. This is an alternative
// that fetches the deployed bytecode from a chain and compares that with the output
// of the local compilation.

const path = require('path');
const fs = require('fs');
const { assert } = require('console');
const { go } = require('@api3/promise-utils');
const hre = require('hardhat');

const contractNames = ['AccessControlRegistry', 'OwnableCallForwarder', 'Api3ServerV1', 'ProxyFactory'];

const verifyDeployedBytecode = (deployedBytecode, generatedBytecode, contractName, networkName) => {
  if (deployedBytecode === generatedBytecode) {
    return true;
  }
  // The compiler appends by default the IPFS hash of the metadata file to the end of the bytecode (the last 53 bytes/106 char)
  // for reference: https://docs.soliditylang.org/en/v0.8.17/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode
  else if (deployedBytecode.slice(0, -106) === generatedBytecode.slice(0, -106)) {
    console.log(`⚠️ ${contractName} metadata is different from onchain value on ${networkName}!`);
    return true;
  } else {
    return false;
  }
};

async function main() {
  let networkNames = fs
    .readdirSync(path.join('deployments'), { withFileTypes: true })
    .filter((item) => {
      return item.isDirectory() && !['zksync-goerli-testnet', 'zksync'].includes(item.name);
    })
    .map((item) => item.name);

  // If the network is supported, only verify the network passed as the argument
  // otherwise, verify all supported networks
  if (networkNames.includes(hre.network.name)) {
    networkNames = [hre.network.name];
  } else if (hre.network.name !== 'hardhat') {
    throw new Error(`❗ ${hre.network.name} is not a supported network!`);
  }

  const deployments = {};

  const verificationPromises = await Promise.all(
    networkNames.flatMap((network) => {
      deployments[network] = fs
        .readdirSync(path.join('deployments', network), { withFileTypes: true })
        .filter((item) => item.isFile() && item.name.endsWith('.json'))
        .reduce(
          (acc, item) => ({
            ...acc,
            [item.name.slice(0, -5)]: JSON.parse(fs.readFileSync(path.join('deployments', network, item.name), 'utf8')),
          }),
          {}
        );

      return contractNames.map(async (contractName) => {
        const deployment = deployments[network][contractName];
        const artifact = await hre.deployments.getArtifact(contractName);
        const constructor = artifact.abi.find((method) => method.type === 'constructor');
        let generatedBytecode = artifact.bytecode;
        if (constructor) {
          // If a constructor is defined, encode and add the constructor arguments to the contract bytecode
          const constructorArgumentTypes = constructor.inputs.map((input) => input.type);
          const encodedConstructorArguments = hre.ethers.utils.defaultAbiCoder.encode(
            constructorArgumentTypes,
            deployment.args
          );
          generatedBytecode = hre.ethers.utils.solidityPack(
            ['bytes', 'bytes'],
            [artifact.bytecode, encodedConstructorArguments]
          );
        }

        const provider = new hre.ethers.providers.JsonRpcProvider(hre.config.networks[network].url);
        const goFetchCreationTx = await go(() => provider.getTransaction(deployment.transactionHash), {
          retries: 10,
          attemptTimeoutMs: 5000,
          totalTimeoutMs: 50000,
          delay: {
            type: 'random',
            minDelayMs: 2000,
            maxDelayMs: 5000,
          },
        });
        if (!goFetchCreationTx.success || !goFetchCreationTx.data) {
          return {
            success: false,
            data: `❗ Could not fetch creation tx for ${contractName} on ${network}!`,
          };
        }
        const creationTx = goFetchCreationTx.data;
        const creationData = creationTx.data;

        if (creationTx.creates) {
          // creationTx.creates is defined if the deployment is undeterministic
          // Verify that the creation tx hash belongs to the address
          assert(creationTx.creates === deployment.address);
          if (!verifyDeployedBytecode(creationData, generatedBytecode, contractName, network))
            return {
              success: false,
              data: `❗ ${contractName} undeterministic deployment on ${network} DOES NOT match the local build!`,
            };

          return {
            success: true,
            data: `✅  ${contractName} undeterministic deployment on ${network} matches the local build!`,
          };
        } else {
          const salt = hre.ethers.constants.HashZero;
          const deterministicDeploymentAddress = hre.ethers.utils.getCreate2Address(
            '0x4e59b44847b379578588920ca78fbf26c0b4956c', // default create2 factory address in hardhat
            salt,
            hre.ethers.utils.keccak256(generatedBytecode)
          );
          generatedBytecode = hre.ethers.utils.hexConcat([salt, generatedBytecode]);
          if (!verifyDeployedBytecode(creationData, generatedBytecode, contractName, network))
            return {
              success: false,
              data: `❗ ${contractName} deterministic deployment on ${network} DOES NOT match the local build!`,
            };

          if (creationData === generatedBytecode) assert(deterministicDeploymentAddress === deployment.address);
          return {
            success: true,
            data: `✅  ${contractName} deterministic deployment on ${network} matches the local build!`,
          };
        }
      });
    })
  );

  verificationPromises.forEach((verificationPromise) => console.log(verificationPromise.data));

  if (verificationPromises.some((verificationPromise) => !verificationPromise.success)) {
    throw new Error('❗ Some deployments do not match the local build!');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
