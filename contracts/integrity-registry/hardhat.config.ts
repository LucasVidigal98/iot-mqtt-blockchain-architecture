import { config as loadEnv } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

loadEnv();

const privateKey = process.env.GANACHE_PRIVATE_KEY?.trim();
const localhostUrl = process.env.GANACHE_RPC_URL ?? "http://localhost:8545";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: {},
    localhost: {
      url: localhostUrl,
      ...(privateKey ? { accounts: [privateKey] } : {})
    }
  }
};

export default config;
