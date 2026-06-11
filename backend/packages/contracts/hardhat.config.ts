import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SENTINEL_PRIVATE_KEY =
  process.env.SENTINEL_PRIVATE_KEY ??
  "0x0000000000000000000000000000000000000000000000000000000000000001";

const MANTLE_SEPOLIA_RPC_URL =
  process.env.MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";

const MANTLE_MAINNET_RPC_URL =
  process.env.MANTLE_MAINNET_RPC_URL ?? "https://rpc.mantle.xyz";

const ETHEREUM_SEPOLIA_RPC_URL =
  process.env.ETHEREUM_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const MANTLESCAN_API_KEY = process.env.MANTLESCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    mantleSepolia: {
      url: MANTLE_SEPOLIA_RPC_URL,
      chainId: 5003,
      accounts: [SENTINEL_PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto",
    },
    mantleMainnet: {
      url: MANTLE_MAINNET_RPC_URL,
      chainId: 5000,
      accounts: [SENTINEL_PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto",
    },
    ethSepolia: {
      url: ETHEREUM_SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: [SENTINEL_PRIVATE_KEY],
      gasPrice: "auto",
      gas: "auto",
    },
  },

  etherscan: {
    apiKey: {
      mantleSepolia: MANTLESCAN_API_KEY,
      mantleMainnet: MANTLESCAN_API_KEY,
    },
    customChains: [
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL: "https://api-sepolia.mantlescan.xyz/api",
          browserURL: "https://sepolia.mantlescan.xyz",
        },
      },
      {
        network: "mantleMainnet",
        chainId: 5000,
        urls: {
          apiURL: "https://api.mantlescan.xyz/api",
          browserURL: "https://mantlescan.xyz",
        },
      },
    ],
  },

  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },

  mocha: {
    timeout: 120_000,
  },
};

export default config;
