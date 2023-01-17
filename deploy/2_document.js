const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

module.exports = async () => {
  const networks = fs
    .readdirSync('deployments', { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);
  const contractNames = ['AccessControlRegistry', 'AirnodeProtocol', 'DapiServer', 'ProxyFactory'];

  const references = {
    chainNames: networks.reduce((acc, network) => {
      return { ...acc, [hre.config.networks[network].chainId]: network };
    }, {}),
    contracts: {
      ...contractNames.reduce((acc, contractName) => {
        return {
          ...acc,
          [contractName]: networks.reduce((acc, network) => {
            const deployment = JSON.parse(
              fs.readFileSync(path.join('deployments', network, `${contractName}.json`), 'utf8')
            );
            return { ...acc, [hre.config.networks[network].chainId]: deployment.address };
          }, {}),
        };
      }, {}),
    },
  };
  fs.writeFileSync(path.join('deployments', 'references.json'), JSON.stringify(references, null, 2));
};
