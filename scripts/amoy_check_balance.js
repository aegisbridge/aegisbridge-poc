// scripts/amoy_check_balance.js
const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();

  const tokenAddress = process.env.WATT_AMOY || process.env.BRIDGE_TOKEN_AMOY;
  if (!tokenAddress) {
    console.error("❌ WATT_AMOY / BRIDGE_TOKEN_AMOY belum di-set di .env");
    process.exit(1);
  }

  console.log("=== Cek wATT di Amoy ===");
  console.log("Network :", hre.network.name);
  console.log("Owner   :", signer.address);
  console.log("Token   :", tokenAddress);

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  const token = await hre.ethers.getContractAt(erc20Abi, tokenAddress);

  const [rawBal, decimals, symbol] = await Promise.all([
    token.balanceOf(signer.address),
    token.decimals(),
    token.symbol(),
  ]);

  const formatted =
    hre.ethers.formatUnits
      ? hre.ethers.formatUnits(rawBal, decimals)
      : hre.ethers.utils.formatUnits(rawBal, decimals);

  console.log(`Balance ${symbol} di Amoy: ${formatted}`);
}

main().catch((err) => {
  console.error("❌ Error amoy_check_balance:", err);
  process.exitCode = 1;
});
