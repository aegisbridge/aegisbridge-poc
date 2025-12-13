// hardhat.config.js (recommended network config snippet)
require("dotenv").config();

const PK =
  process.env.DEPLOYER_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  "";

function with0x(k) {
  if (!k) return "";
  return k.startsWith("0x") ? k : "0x" + k;
}

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: PK ? [with0x(PK)] : [],
      chainId: 11155111,
    },
    amoy: {
      url: process.env.AMOY_RPC_URL,
      accounts: PK ? [with0x(PK)] : [],
      chainId: 80002,
    },
  },
};
