require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const {
  SEPOLIA_RPC_URL,
  AMOY_RPC_URL,
  AMOY_RPC_URL_BACKUP,
  PRIVATE_KEY,
} = process.env;

function getAccounts() {
  return PRIVATE_KEY ? [PRIVATE_KEY] : [];
}

module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: getAccounts(),
      chainId: 11155111,
    },
    amoy: {
      // RPC utama
      url: AMOY_RPC_URL || "",
      accounts: getAccounts(),
      chainId: 80002,
    },
    amoy_backup: {
      // RPC backup (Alchemy), kalau yang utama rewel
      url: AMOY_RPC_URL_BACKUP || AMOY_RPC_URL || "",
      accounts: getAccounts(),
      chainId: 80002,
    },
  },
};
