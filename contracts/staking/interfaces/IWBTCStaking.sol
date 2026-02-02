// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./WBTCStaking/IWBTCStakingActions.sol";
import "./WBTCStaking/IWBTCStakingErrors.sol";
import "./WBTCStaking/IWBTCStakingEvents.sol";
import "./WBTCStaking/IWBTCStakingState.sol";

interface IWBTCStaking is IWBTCStakingActions, IWBTCStakingErrors, IWBTCStakingEvents, IWBTCStakingState {}