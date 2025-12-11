// scripts/amoy_check_balance.js

require("dotenv").config();
const hre = require("hardhat");
const { getAmoyProvider } = require("./providers");

async function main() {
  const { ethers } = hre;

  const pk = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    throw new Error("PRIVATE_KEY atau DEPLOYER_PRIVATE_KEY belum di-set di .env");
  }

  const wAttAddress = process.env.WATT_AMOY;
  if (!wAttAddress) {
    throw new Error("WATT_AMOY belum di-set di .env (alamat wATT di Amoy).");
  }

  const provider = getAmoyProvider();
  const wallet = new ethers.Wallet(pk, provider);

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ];

  const token = new ethers.Contract(wAttAddress, erc20Abi, provider);

  const [balRaw, decimals, symbol] = await Promise.all([
    token.balanceOf(wallet.address),
    token.decimals(),
    token.symbol().catch(() => "wATT"),
  ]);

  const bal = ethers.formatUnits(balRaw, decimals);

  console.log("=== Cek wATT di Amoy ===");
  console.log("Network :", "amoy");
  console.log("Owner   :", wallet.address);
  console.log("Token   :", wAttAddress);
  console.log(`Balance ${symbol} di Amoy:`, bal);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error amoy_check_balance:", err);
    process.exit(1);
  });
