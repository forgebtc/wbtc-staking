require('dotenv').config();

import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ledger';
import { HardhatUserConfig } from 'hardhat/config';

const isDev = process.env.ENVIRONMENT === 'dev'; 
const accountConfig = isDev ? [process.env.PRIVATE_KEY || ''] : [process.env.LEDGER_ACCOUNT || ''];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    }
  },
  mocha: {
    timeout: 86400000,
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || '',
      accounts: accountConfig,
    }, 
    bsc: {
      url: process.env.BSC_RPC_URL || '',
      accounts: accountConfig,
    },
    eth: {
      url: process.env.ETH_RPC_URL || '',
      accounts: accountConfig,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};

export default config;
