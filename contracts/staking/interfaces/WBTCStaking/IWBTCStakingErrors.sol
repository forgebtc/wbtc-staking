// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IWBTCStakingErrors {
    error StakingNotStartedErr();
    error StakingEndedErr();
    error StartTimestampInPastErr();
    error StartTimestampBiggerThanEndErr();
    error ZeroAddressErr();
    error ZeroAmountErr();
    error NothingToClaimErr();
    error NothingToWithdrawErr();
}