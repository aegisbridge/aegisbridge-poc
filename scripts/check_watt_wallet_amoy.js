// scripts/check_watt_wallet_amoy.js
require("dotenv").config();
const { ethers } = require("ethers");

// Minimal ERC-20 ABI (cukup untuk symbol, decimals, balanceOf)
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)"
];

async function main() {
  const RPC = process.env.AMOY_RPC_URL;
  const WATT = process.env.AMOY_WATT_TOKEN;       // 0x9A06...
  const WALLET = process.env.TEST_SENDER_ADDRESS; // 0x36b9...

  if (!RPC) throw new Error("AMOY_RPC_URL belum di .env");
  if (!WATT) throw new Error("AMOY_WATT_TOKEN belum di .env");
  if (!WALLET) throw new Error("TEST_SENDER_ADDRESS belum di .env");

  const provider = new ethers.JsonRpcProvider(RPC);
  const token = new ethers.Contract(WATT, ERC20_ABI, provider);

  const [symbol, decimals, rawBalance] = await Promise.all([
    token.symbol(),
    token.decimals(),
    token.balanceOf(WALLET),
  ]);

  const balance = Number(ethers.formatUnits(rawBalance, decimals));

  console.log("RPC Amoy   :", RPC);
  console.log("wATT token :", WATT);
  console.log("Wallet     :", WALLET);
  console.log(`Balance    : ${balance} ${symbol} di ${WALLET}`);
}

main().catch((err) => {
  console.error("Error check_watt_wallet_amoy:", err);
  process.exit(1);
});
