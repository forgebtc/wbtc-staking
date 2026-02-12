// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./interfaces/IWBTCStaking.sol";

contract WBTCStaking is Ownable, ReentrancyGuard, IWBTCStaking {
    using SafeERC20 for IERC20;

    uint256 public constant PRECISION = 10 ** 18; // 100%
    uint256 public constant MIN_PRECENTAGE = PRECISION / 1000;

    uint256 public totalStaked;
    uint256 public totalSupply;
    uint256 public cusum;
    uint256 public lastUpdate;

    uint256 public rate;
    uint256 public proposedRate;
    uint256 public proposalTime;

    uint256 public startTimestamp;
    uint256 public endTimestamp;

    IERC20 public immutable wbtc;

    mapping(address => UserStake) public userStakes;

    modifier onlyWhenActive() {
        require(block.timestamp >= startTimestamp, StakingNotStartedErr());
        require(block.timestamp <= endTimestamp, StakingEndedErr());
        _;
    }

    constructor(
        uint256 rate_,
        uint256 startTimestamp_,
        uint256 endTimestamp_,
        IERC20 wbtc_
    ) Ownable(_msgSender()) {
        require(block.timestamp <= startTimestamp_, StartTimestampInPastErr());
        require(startTimestamp_ <= endTimestamp_, StartTimestampBiggerThanEndErr());
        
        startTimestamp = startTimestamp_;
        endTimestamp = endTimestamp_;
        wbtc = wbtc_;

        _setRate(rate_);
    }


    function getAddedValue(address user_) public view returns (uint256) {
        UserStake storage userStake = userStakes[user_];
        uint256 cusum_ = cusum;
        
        if (totalStaked != 0) {
           cusum_ += (_getAddedValue(block.timestamp, lastUpdate) * PRECISION) / 10**18;
        }

        return
            (userStake.staked * (cusum_ - userStake.cusum)) /
            PRECISION +
            userStake.rewardAmount;
    }

    function stake(uint256 amount_) external onlyWhenActive nonReentrant {
        _stake(_msgSender(), amount_);
    }

    function claim() external nonReentrant {
        uint256 addedValue = getAddedValue(_msgSender());
        require(addedValue > 0, NothingToClaimErr());
        _claim(_msgSender(), addedValue);
    }

    function withdraw() external nonReentrant {
        uint256 addedValue = getAddedValue(_msgSender());
        if (addedValue > 0) {
            _claim(_msgSender(), addedValue);
        }
        
        uint256 userBalance = userStakes[_msgSender()].staked;
        require(userBalance > 0, NothingToWithdrawErr());

        delete userStakes[_msgSender()];
        totalStaked -= userBalance;

        wbtc.safeTransfer(_msgSender(), userBalance);
    }

    function proposeRate(uint256 newRate_) external onlyOwner {
        require(newRate_ <= PRECISION, GreaterThanMaxPercentageErr());
        require(newRate_ >= MIN_PRECENTAGE, LowerThanMinPercentageErr());
        require(newRate_ != rate, SameRatesErr());

        proposedRate = newRate_;
        proposalTime = block.timestamp;

        emit RewardRateProposed(newRate_);
    }

    function setRate() external onlyOwner {
        require(proposalTime + 1 days < block.timestamp, TimelockNotPassedErr());
        require(proposedRate != rate, SameRatesErr());
        _setRate(proposedRate);
    }

    function recoverERC20() external onlyOwner {
        wbtc.safeTransfer(_msgSender(), wbtc.balanceOf(address(this)) - (totalSupply + totalStaked));
    }

    function addSupply(uint256 amount_) external onlyOwner {
        totalSupply += amount_;
        wbtc.safeTransferFrom(_msgSender(), address(this), amount_);
    }

    function _updateCusum(address user_) private {
        uint256 cusum_ = cusum;

        if (totalStaked != 0) {
            cusum_ += _getAddedValue(block.timestamp, lastUpdate);
            cusum = cusum_;
        }

        if (user_ != address(0)) {
            UserStake storage userStake = userStakes[user_];

            userStake.rewardAmount +=
                (userStake.staked * (cusum_ - userStake.cusum)) /
                PRECISION;
            userStake.cusum = cusum_;
        }

        lastUpdate = block.timestamp;
    }


    function _stake(address user_, uint256 amount_) private {
        require(user_ != address(0), ZeroAddressErr());
        require(amount_ > 0, ZeroAmountErr());

        _updateCusum(user_);

        uint256 oldBalance = wbtc.balanceOf(address(this));
        wbtc.safeTransferFrom(user_, address(this), amount_);

        uint256 balanceAmount = wbtc.balanceOf(address(this)) - oldBalance;
        totalStaked += balanceAmount;
        userStakes[user_].staked += balanceAmount;

        emit Staked(balanceAmount, user_);
    }


    function _claim(address user_, uint256 amount_  ) private {
        _updateCusum(user_);

        uint256 toClaim = Math.min(totalSupply, amount_);

        userStakes[user_].rewardAmount -= toClaim;
        totalSupply -= toClaim;
        wbtc.safeTransfer(user_, toClaim);

        emit Claimed(toClaim, user_);
    }

    function _getAddedValue(
        uint256 futureTime_,
        uint256 lastUpdate_
    ) private view returns (uint256) {
        if (endTimestamp < lastUpdate_) {
            return 0;
        }

        return rate * (Math.min(futureTime_, endTimestamp) - lastUpdate_) / 365 days ;
    }

    function _setRate(uint256 rate_) internal {
        _updateCusum(address(0));
        rate = rate_;
        emit RewardRateUpdated(rate_);
    }
}