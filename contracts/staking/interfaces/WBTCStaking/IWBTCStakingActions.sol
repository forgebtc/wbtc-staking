// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IWBTCStakingActions {
    /**
     * @return Amount of staking rewards at current block.timestamp.
     * @param user_ address of user.
     */
    function getAddedValue(address user_) external view returns (uint256);
    
    /**
     * @dev Method allows to stake wbtc token.
     * @param amount_ amount of wbtc token to stake.
     */
    function stake(uint256 amount_) external;

    /**
     * @dev Method allows to claim staking rewards.
     * @notice Amout of tokens equals to `getAddedValue` result.
     */
    function claim() external;

    /**
     * @dev Method allows to withdraw staked tokens.
     * @notice Method also claims unclaimed rewards.
     */
    function withdraw() external;

    /**
     * @dev Allows to propose changing reward rate (100% = 10**18).
     * @param newRate_ uint256 rate.
     */
    function proposeRate(uint256 newRate_) external;


    /**
     * @dev Allow to apply proposed rate
     */
    function setRate() external;
}