const ethers = require('ethers');

// I didn't want to pollute the @api3/contracts interface for these tests so I copy pasted the below from
// https://github.com/api3dao/contracts/blob/02bacb58809715914f841dd0464b5a93126665f7/src/zksync.js

const CREATE2_PREFIX = '0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494';

const bytecodeHashes = {
  DapiProxy: '0x010000718e160c49f26d36ffd29dbe562fcc1ae0c45e3add4ae314721c4cfd50',
  DataFeedProxy: '0x01000071aa077a2b3722b686ce72da1b80c036fe00b90b1b0666cf7472ed7181',
  DapiProxyWithOev: '0x010000833ea8eec6c5a363e8de8e0a9fcd770e93f86d9ec426c1f7886822cb4d',
  DataFeedProxyWithOev: '0x010000832145787c75d77acc93c6b6e61af2909128377978cb54e6f31e139cc0',
};

function computeCreate2Address(senderAddress, salt, bytecodeHash, constructorInput) {
  return ethers.utils.getAddress(
    ethers.utils.hexDataSlice(
      ethers.utils.keccak256(
        ethers.utils.hexConcat([
          CREATE2_PREFIX,
          ethers.utils.hexZeroPad(senderAddress, 32),
          salt,
          bytecodeHash,
          ethers.utils.keccak256(constructorInput),
        ])
      ),
      12
    )
  );
}

module.exports = { bytecodeHashes, computeCreate2Address };
