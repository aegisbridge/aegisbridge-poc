require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Ambil variabel dari file .env (nanti kita isi belakangan)
const { SEPOLIA_RPC_URL, AMOY_RPC_URL, PRIVATE_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    // Network Ethereum Sepolia
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // Network Polygon Amoy
    amoy: {
      url: AMOY_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
