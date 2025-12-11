// scripts/amoy_check_watt_pool.js

require("dotenv").config();
const hre = require("hardhat");
const { getAmoyProvider } = require("./providers");

async function main() {
  const { ethers } = hre;

  const pk = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY atau DEPLOYER_PRIVATE_KEY belum di-set di .env");

  const wAttAddress = process.env.WATT_AMOY;
  const bridgeAddress = process.env.TARGET_BRIDGE_AMOY;

  if (!wAttAddress) throw new Error("WATT_AMOY belum di-set di .env");
  if (!bridgeAddress) throw new Error("TARGET_BRIDGE_AMOY belum di-set di .env");

  const provider = getAmoyProvider();
  const wallet = new ethers.Wallet(pk, provider);

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ];

  const token = new ethers.Contract(wAttAddress, erc20Abi, provider);

  const [decimals, symbol, userBalRaw, bridgeBalRaw] = await Promise.all([
    token.decimals(),
    token.symbol().catch(() => "wATT"),
    token.balanceOf(wallet.address),
    token.balanceOf(bridgeAddress),
  ]);

  const userBal = ethers.formatUnits(userBalRaw, decimals);
  const bridgeBal = ethers.formatUnits(bridgeBalRaw, decimals);

  console.log("=== Cek pool wATT di Amoy ===");
  console.log("Network   :", "amoy");
  console.log("Deployer  :", wallet.address);
  console.log("Token     :", `${wAttAddress} (${symbol})`);
  console.log("Bridge    :", bridgeAddress);
  console.log("-------------------------------");
  console.log(`User ${symbol}   :`, userBal);
  console.log(`Bridge ${symbol} :`, bridgeBal);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error amoy_check_watt_pool:", err);
    process.exit(1);
  });
