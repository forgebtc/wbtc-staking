// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IWBTCStakingState {
    struct UserStake {
        uint256 staked;
        uint256 cusum;
        uint256 rewardAmount;
    }
}