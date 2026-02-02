// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IWBTCStakingEvents {
    event Staked(uint256 amount, address user);
    event Erc20Recovered(uint256 amount, address token);
    event Claimed(uint256 amount, address user);
    event RewardRateUpdated(uint256 newRate);
}