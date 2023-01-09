const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('../test-utils');

describe('SponsorshipUtils', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      sponsor: accounts[1],
      randomPerson: accounts[9],
    };

    const airnodeProtocolFactory = await ethers.getContractFactory('AirnodeProtocol', roles.deployer);
    const airnodeProtocol = await airnodeProtocolFactory.deploy();
    const airnodeRequesterFactory = await ethers.getContractFactory('MockAirnodeRequester', roles.deployer);
    const airnodeRequester = await airnodeRequesterFactory.deploy(airnodeProtocol.address);

    const subscriptionId = testUtils.generateRandomBytes32();

    return {
      roles,
      airnodeProtocol,
      airnodeRequester,
      subscriptionId,
    };
  }

  describe('setRrpSponsorshipStatus', function () {
    context('Requester address not zero', function () {
      it('sets RRP sponsorship status', async function () {
        const { roles, airnodeProtocol, airnodeRequester } = await helpers.loadFixture(deploy);
        expect(
          await airnodeProtocol.sponsorToRequesterToRrpSponsorshipStatus(
            roles.sponsor.address,
            airnodeRequester.address
          )
        ).to.equal(false);
        await expect(airnodeProtocol.connect(roles.sponsor).setRrpSponsorshipStatus(airnodeRequester.address, true))
          .to.emit(airnodeProtocol, 'SetRrpSponsorshipStatus')
          .withArgs(roles.sponsor.address, airnodeRequester.address, true);
        expect(
          await airnodeProtocol.sponsorToRequesterToRrpSponsorshipStatus(
            roles.sponsor.address,
            airnodeRequester.address
          )
        ).to.equal(true);
        await expect(airnodeProtocol.connect(roles.sponsor).setRrpSponsorshipStatus(airnodeRequester.address, false))
          .to.emit(airnodeProtocol, 'SetRrpSponsorshipStatus')
          .withArgs(roles.sponsor.address, airnodeRequester.address, false);
        expect(
          await airnodeProtocol.sponsorToRequesterToRrpSponsorshipStatus(
            roles.sponsor.address,
            airnodeRequester.address
          )
        ).to.equal(false);
      });
    });
    context('Requester address zero', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol.connect(roles.sponsor).setRrpSponsorshipStatus(ethers.constants.AddressZero, true)
        ).to.be.revertedWith('Requester address zero');
      });
    });
  });

  describe('setPspSponsorshipStatus', function () {
    context('Subscription ID is not zero', function () {
      it('sets PSP sponsorship status', async function () {
        const { roles, airnodeProtocol, subscriptionId } = await helpers.loadFixture(deploy);
        expect(
          await airnodeProtocol.sponsorToSubscriptionIdToPspSponsorshipStatus(roles.sponsor.address, subscriptionId)
        ).to.equal(false);
        await expect(airnodeProtocol.connect(roles.sponsor).setPspSponsorshipStatus(subscriptionId, true))
          .to.emit(airnodeProtocol, 'SetPspSponsorshipStatus')
          .withArgs(roles.sponsor.address, subscriptionId, true);
        expect(
          await airnodeProtocol.sponsorToSubscriptionIdToPspSponsorshipStatus(roles.sponsor.address, subscriptionId)
        ).to.equal(true);
        await expect(airnodeProtocol.connect(roles.sponsor).setPspSponsorshipStatus(subscriptionId, false))
          .to.emit(airnodeProtocol, 'SetPspSponsorshipStatus')
          .withArgs(roles.sponsor.address, subscriptionId, false);
        expect(
          await airnodeProtocol.sponsorToSubscriptionIdToPspSponsorshipStatus(roles.sponsor.address, subscriptionId)
        ).to.equal(false);
      });
    });
    context('Subscription ID is zero', function () {
      it('reverts', async function () {
        const { roles, airnodeProtocol } = await helpers.loadFixture(deploy);
        await expect(
          airnodeProtocol.connect(roles.sponsor).setPspSponsorshipStatus(ethers.constants.HashZero, true)
        ).to.be.revertedWith('Subscription ID zero');
      });
    });
  });
});
