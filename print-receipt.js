const zk = require('zksync-web3');

async function main() {
  const provider = new zk.Provider('https://mainnet.era.zksync.io');
  const receipt = await provider.getTransactionReceipt(
    '0xdeccdd936398aaadc650979b82a6a6e039ec62ee1108d7a28d9fcc68b8c82f9d'
  );
  console.log(JSON.stringify(receipt));
}

main();
