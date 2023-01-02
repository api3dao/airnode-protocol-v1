const hre = require('hardhat');
const { expect } = require('chai');

describe('RequesterAuthorizerRegistryReader', function () {
  let roles;
  let accessControlRegistry, requesterAuthorizerRegistry;
  let requesterAuthorizerRegistryAdminRoleDescription = 'RequesterAuthorizerRegistry admin';

  beforeEach(async () => {
    const accounts = await hre.ethers.getSigners();
    roles = {
      deployer: accounts[0],
      manager: accounts[1],
    };
    const expiringMetaCallForwarderFactory = await hre.ethers.getContractFactory(
      'ExpiringMetaCallForwarder',
      roles.deployer
    );
    const expiringMetaCallForwarder = await expiringMetaCallForwarderFactory.deploy();
    const accessControlRegistryFactory = await hre.ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    accessControlRegistry = await accessControlRegistryFactory.deploy(expiringMetaCallForwarder.address);
    const requesterAuthorizerRegistryFactory = await hre.ethers.getContractFactory(
      'RequesterAuthorizerRegistry',
      roles.deployer
    );
    requesterAuthorizerRegistry = await requesterAuthorizerRegistryFactory.deploy(
      accessControlRegistry.address,
      requesterAuthorizerRegistryAdminRoleDescription,
      roles.manager.address
    );
  });

  describe('constructor', function () {
    context('RequesterAuthorizerRegistry address is not zero', function () {
      it('constructs', async function () {
        const requesterAuthorizerRegistryUserFactory = await hre.ethers.getContractFactory(
          'RequesterAuthorizerRegistryUser',
          roles.deployer
        );
        const requesterAuthorizerRegistryUser = await requesterAuthorizerRegistryUserFactory.deploy(
          requesterAuthorizerRegistry.address
        );
        expect(await requesterAuthorizerRegistryUser.requesterAuthorizerRegistry()).to.equal(
          requesterAuthorizerRegistry.address
        );
      });
    });
    context('RequesterAuthorizerRegistry address is zero', function () {
      it('reverts', async function () {
        const requesterAuthorizerRegistryUserFactory = await hre.ethers.getContractFactory(
          'RequesterAuthorizerRegistryUser',
          roles.deployer
        );
        await expect(
          requesterAuthorizerRegistryUserFactory.deploy(hre.ethers.constants.AddressZero)
        ).to.be.revertedWith('Authorizer registry address zero');
      });
    });
  });
});
