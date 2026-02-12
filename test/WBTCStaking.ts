import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ZeroAddress } from 'ethers';
import { Reverter } from './helpers/reverter';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { WBTCStaking, ERC20Mock, WBTCStaking__factory } from '../typechain-types';

async function timeTravel(timestamp: number) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await ethers.provider.send("evm_mine", []);
}

describe.only("WBTCStaking", () => {
    const reverter = new Reverter();

    const RATE = 10n ** 16n; // 1%

    let wbtc: ERC20Mock;
    let staking: WBTCStaking;

    let OWNER: HardhatEthersSigner;
    let SECOND: HardhatEthersSigner;
    let THIRD: HardhatEthersSigner;

    let startTimestamp: number;
    let endTimestamp: number;

    before(async () => {
        [OWNER, SECOND, THIRD] = await ethers.getSigners();
        
        let blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        startTimestamp = blockTimestamp + 5000;
        endTimestamp = startTimestamp + 60 * 60 * 24 * 365;

        const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
        const Staking = await ethers.getContractFactory("WBTCStaking");

        wbtc = await ERC20Mock.deploy("Wrapped BTC", "WBTC", 8);
        staking = await Staking.deploy(RATE, startTimestamp, endTimestamp, wbtc.target);

        await wbtc.mint(1000n * 10n ** 8n);
        await wbtc.approve(staking.target, 1000n * 10n ** 8n);
        await wbtc.connect(SECOND).mint(5000n * 10n ** 8n);
        await wbtc.connect(SECOND).approve(staking.target, 5000n * 10n ** 8n);

        await reverter.snapshot();
    });

    afterEach(reverter.revert);

    describe("#constructor", async () => {
        let StakingFactory: WBTCStaking__factory;

        beforeEach(async () => {
            StakingFactory = await ethers.getContractFactory("WBTCStaking");
        });

        it("should revert if startTimestamp in past", async () => {
            await expect(StakingFactory.deploy(RATE, 100, endTimestamp, wbtc.target)).to.be.revertedWithCustomError(staking, "StartTimestampInPastErr");
        });

        it("should revert if startTimestamp greater than endTimestamp", async () => {
            await expect(StakingFactory.deploy(RATE, startTimestamp, startTimestamp -1, wbtc.target)).to.be.revertedWithCustomError(staking, "StartTimestampBiggerThanEndErr");
        });
    });

    describe("#stake", () => {
        it("should correctly stake", async () => {
            const amount = 10n * 10n ** 8n; // 10 tokens
            const balanceBefore = await wbtc.balanceOf(OWNER.address);

            await timeTravel(startTimestamp);

            await staking.stake(amount);
            
            const balanceAfter = await wbtc.balanceOf(OWNER.address);
            const userStake = await staking.userStakes(OWNER.address);

            expect(await staking.totalStaked()).to.be.eq(amount);

            expect(userStake.staked).to.be.eq(amount);
            expect(userStake.rewardAmount).to.be.eq(0n);

            expect(balanceBefore - balanceAfter).to.be.eq(amount);
            expect(await wbtc.balanceOf(staking.target)).to.be.eq(amount);
        });

        it("should stake twise", async () => {
            const amount = 10n * 10n ** 8n; // 10 tokens
            const amount2 = 50n * 10n ** 8n;
            const balanceBefore = await wbtc.balanceOf(OWNER.address);

            await timeTravel(startTimestamp);

            await staking.stake(amount);

            await timeTravel(startTimestamp + 100);

            await staking.stake(amount2);
            
            const balanceAfter = await wbtc.balanceOf(OWNER.address);
            const userStake = await staking.userStakes(OWNER.address);

            expect(await staking.totalStaked()).to.be.eq(amount + amount2);

            expect(userStake.staked).to.be.eq(amount + amount2);
            expect(userStake.rewardAmount).not.eq(0n);
            expect(userStake.cusum).not.eq(0);

            expect(balanceBefore - balanceAfter).to.be.eq(amount + amount2);
            expect(await wbtc.balanceOf(staking.target)).to.be.eq(amount + amount2);
        });

        it("should revert if not started or already ended", async () => {
            const amount = 10n * 10n ** 8n; // 10 tokens

            await expect(staking.stake(amount)).to.be.revertedWithCustomError(staking, "StakingNotStartedErr");

            await timeTravel(endTimestamp + 1000);

            await expect(staking.stake(amount)).to.be.revertedWithCustomError(staking, "StakingEndedErr");
        });

        it("should revert if zero amount", async () => {
            await timeTravel(startTimestamp);
            await expect(staking.stake(0n)).to.be.revertedWithCustomError(staking, "ZeroAmountErr");
        });
    });

    describe("#claim", () => {
        const firstAmount = 5n * 10n ** 8n;
        const secondAmount = 9n * 10n ** 8n;

        beforeEach(async () => {
            await timeTravel(startTimestamp);
            await staking.stake(firstAmount);
            await staking.connect(SECOND).stake(secondAmount);

            await staking.addSupply(100n * 10n ** 8n);
        });

        it("should correctly claim", async () => {
            await timeTravel(startTimestamp + 500);

            let balanceBefore = await wbtc.balanceOf(OWNER.address);
            let reward = await staking.getAddedValue(OWNER.address);

            await staking.claim();
            
            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq(reward + balanceBefore);
        });

        it("should claim twise", async () => {
            await timeTravel(startTimestamp + 10000);

            let balanceBefore = await wbtc.balanceOf(OWNER.address);
            let reward = await staking.getAddedValue(OWNER.address);

            await staking.claim();
            
            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq(reward + balanceBefore);

            balanceBefore = await wbtc.balanceOf(SECOND.address);
            reward = await staking.getAddedValue(SECOND.address);

            await staking.connect(SECOND).claim();

            expect(await wbtc.balanceOf(SECOND.address)).to.be.eq(reward + balanceBefore);
        });

        it("should correctly calculate reward if staking ended", async () => {
            await timeTravel(endTimestamp + endTimestamp);

            let balanceBefore = await wbtc.balanceOf(OWNER.address);
           
            await staking.claim();            
           
            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq((firstAmount / 100n) + balanceBefore -1n); // -1n rounding
        })

        it("should correctly calculate if lastUpdate > endTimestamp", async () => {
            await timeTravel(endTimestamp + endTimestamp);
            
            let balanceBefore = await wbtc.balanceOf(OWNER.address);
            await staking.connect(SECOND).claim();            
            await staking.claim();

            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq((firstAmount / 100n) + balanceBefore -1n); // -1n rounding
        });

        it("should revert if not staked", async () => {
            await timeTravel(startTimestamp + 10000);
            await expect(staking.connect(THIRD).claim()).to.be.revertedWithCustomError(staking, "NothingToClaimErr");
        });
    });

    describe("#withdraw", () => {
        const firstAmount = 5n * 10n ** 8n;
        const secondAmount = 9n * 10n ** 8n;

        beforeEach(async () => {
            await timeTravel(startTimestamp);
            await staking.stake(firstAmount);
            await staking.connect(SECOND).stake(secondAmount);

            await staking.addSupply(100n * 10n ** 8n);
        });

        it("should correctly withdraw", async () => {
            await timeTravel(startTimestamp + 500);

            let balanceBefore = await wbtc.balanceOf(OWNER.address);
            let reward = await staking.getAddedValue(OWNER.address);

            await staking.withdraw();
            
            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq(reward + balanceBefore + firstAmount);
        });

        it("should withdraw for two users", async () => {
            await timeTravel(startTimestamp + 10000);

            let balanceBefore = await wbtc.balanceOf(OWNER.address);
            let reward = await staking.getAddedValue(OWNER.address);

            await staking.withdraw();
            
            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq(reward + balanceBefore + firstAmount);

            balanceBefore = await wbtc.balanceOf(SECOND.address);
            reward = await staking.getAddedValue(SECOND.address);

            await staking.connect(SECOND).withdraw();

            expect(await wbtc.balanceOf(SECOND.address)).to.be.eq(reward + balanceBefore + secondAmount);
        });

        it("should skip claiming if nothing to claim (without revert)", async () => {
            await timeTravel(endTimestamp + 1);

            let balanceBefore = await wbtc.balanceOf(OWNER.address);
            let reward = await staking.getAddedValue(OWNER.address);

            await staking.claim();

            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq(balanceBefore + reward);

            await staking.withdraw();

            expect(await wbtc.balanceOf(OWNER.address)).to.be.eq(balanceBefore + reward + firstAmount);
        });

        it("should revert if nothing to withdraw", async () => {
            await timeTravel(startTimestamp + 10000);

            await staking.withdraw();

            await expect(staking.withdraw()).to.be.revertedWithCustomError(staking, "NothingToWithdrawErr");
        });
    });

    describe("#proposeRate", () => {
        it("should propose rate", async () => {
            const newRate = 80n * 10n ** 16n;

            const time = (await ethers.provider.getBlock('latest')).timestamp;
            await staking.proposeRate(newRate);

            expect(await staking.proposalTime()).to.be.eq(time+1); // 1 sec for await tx
            expect(await staking.proposedRate()).to.be.eq(newRate);
        });

        it("should revert if current rate equals newRate", async () => {
            const rate = await staking.rate();

            await expect(staking.proposeRate(rate)).to.be.revertedWithCustomError(staking, "SameRatesErr");
        });

        it("should revert if out of rate bounds", async () => {
            await expect(staking.proposeRate(10n**14n)).to.be.revertedWithCustomError(staking, "LowerThanMinPercentageErr");
            await expect(staking.proposeRate(10n**27n)).to.be.revertedWithCustomError(staking, "GreaterThanMaxPercentageErr");
        });

        it("should revert if not owner", async () => {
            await expect(staking.connect(SECOND).proposeRate(10n**16n)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
        });
    });

    describe("#setRate", () => {
        const newRate = 80n * 10n ** 16n;

        beforeEach(async () => {
            await staking.proposeRate(newRate);
        });

        it("should set", async() => {
            let blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
            await timeTravel(blockTimestamp + 60*60*24);
            
            await staking.setRate();

            expect(await staking.rate()).to.be.eq(newRate);
        });

        it("should revert if not owner", async () => {
            await expect(staking.connect(SECOND).setRate()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
        });

        it("should revert if timelock not passed", async () => {
            await expect(staking.setRate()).to.be.revertedWithCustomError(staking, "TimelockNotPassedErr");
        });

        it("should revert if same rates", async () => {
            let blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
            await timeTravel(blockTimestamp + 60*60*24);

            await staking.setRate();
            await expect(staking.setRate()).to.be.revertedWithCustomError(staking, "SameRatesErr");
        });
    })

    describe("#getAddedValue", async () => {
        it("should test if total staked 0", async () => {
            let addedValue = await staking.getAddedValue(OWNER.address);
            expect(addedValue).to.be.eq(0n);
        })
    });

    describe("#recoverERC20", async () => {
        it("should correctly recover", async () => {
            await timeTravel(startTimestamp+1);
            await staking.connect(SECOND).stake(7n * 10n**8n);

            const amount = 50n * 10n**8n;
            await wbtc.transfer(staking.target, amount);

            const balanceBefore = await wbtc.balanceOf(OWNER.address);
            await staking.recoverERC20();
            const balanceAfter = await wbtc.balanceOf(OWNER.address);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it("should revert if not owner", async () => {
            await expect(staking.connect(SECOND).recoverERC20()).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
        });
    });

    describe("#addSupply", () => {
        it("should add supply", async () => {
            const balanceBefore = await wbtc.balanceOf(staking.target);
            const totalSupply = await staking.totalSupply();

            await staking.addSupply(10n ** 9n);

            expect(await staking.totalSupply()).to.be.eq(totalSupply + 10n ** 9n);
            expect(await wbtc.balanceOf(staking.target)).to.be.eq(balanceBefore + 10n ** 9n);
        });

        it("should revert if not owner", async () => {
            await expect(staking.connect(SECOND).addSupply(10n**9n)).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
        });
    });
});