// scripts/amoy_auto_refill_pool.js
// Auto refill pool wATT di TargetBridge v2 (Amoy) sampai mencapai target threshold.

require("dotenv").config();
const { ethers } = require("ethers");
const { getAmoyProvider } = require("./helpers/multiRpc");

// ENV penting
const AMOY_TARGET_BRIDGE_V2 = process.env.AMOY_TARGET_BRIDGE_V2;
const AMOY_WATT_TOKEN = process.env.AMOY_WATT_TOKEN;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// Target minimal pool dalam wATT
const TARGET_POOL_WATT = BigInt(
  process.env.AMOY_BRIDGE_TOPUP_MAX_WATT || "1500" // default target 1500 wATT
);

// Batas maksimum topup sekali jalan (supaya nggak all-in), dalam wATT
const MAX_TOPUP_WATT = BigInt(
  process.env.WATT_POOL_TOPUP || process.env.AMOY_BRIDGE_TOPUP_MAX_WATT || "500"
);

async function main() {
  console.log("=== Auto refill wATT pool di TargetBridge v2 (Amoy) ===");

  if (!AMOY_TARGET_BRIDGE_V2 || !AMOY_WATT_TOKEN || !DEPLOYER_PRIVATE_KEY) {
    throw new Error(
      "Pastikan AMOY_TARGET_BRIDGE_V2, AMOY_WATT_TOKEN, dan DEPLOYER_PRIVATE_KEY sudah di-set di .env"
    );
  }

  const provider = getAmoyProvider();
  const signer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

  console.log("Deployer :", signer.address);

  // Load ERC20 ABI
  const erc20Artifact = require("../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json");
  const erc20Abi = erc20Artifact.abi;

  const watt = new ethers.Contract(AMOY_WATT_TOKEN, erc20Abi, signer);

  const decimals = await watt.decimals();
  const unit = ethers.toBigInt(10) ** ethers.toBigInt(decimals);

  // Balances awal
  const bridgeBalanceRaw = await watt.balanceOf(AMOY_TARGET_BRIDGE_V2);
  const deployerBalanceRaw = await watt.balanceOf(signer.address);

  const bridgeBalanceWatt = ethers.formatUnits(bridgeBalanceRaw, decimals);
  const deployerBalanceWatt = ethers.formatUnits(deployerBalanceRaw, decimals);

  console.log("-------------------------------");
  console.log("Bridge address   :", AMOY_TARGET_BRIDGE_V2);
  console.log("wATT token       :", AMOY_WATT_TOKEN);
  console.log("Target pool min  :", TARGET_POOL_WATT.toString(), "wATT");
  console.log("Bridge pool now  :", bridgeBalanceWatt, "wATT");
  console.log("Deployer balance :", deployerBalanceWatt, "wATT");

  const targetPoolRaw = TARGET_POOL_WATT * unit;

  if (bridgeBalanceRaw >= targetPoolRaw) {
    console.log(
      "✅ Pool sudah >= target threshold, tidak perlu topup. (No action taken)"
    );
    return;
  }

  let missingRaw = targetPoolRaw - bridgeBalanceRaw;
  let maxTopupRaw = MAX_TOPUP_WATT * unit;

  // Batasan: jangan lebih dari MAX_TOPUP_WATT
  if (missingRaw > maxTopupRaw) {
    missingRaw = maxTopupRaw;
  }

  // Batasan: jangan lebih dari balance deployer
  if (missingRaw > deployerBalanceRaw) {
    missingRaw = deployerBalanceRaw;
  }

  if (missingRaw === 0n) {
    console.log(
      "⚠️  Tidak ada ruang untuk topup (balance deployer kurang atau pool sudah cukup dekat target)."
    );
    return;
  }

  const topupWattHuman = ethers.formatUnits(missingRaw, decimals);

  console.log("-------------------------------");
  console.log("Topup planned :", topupWattHuman, "wATT ke bridge.");
  console.log("Kirim transfer...");

  const tx = await watt.transfer(AMOY_TARGET_BRIDGE_V2, missingRaw);
  console.log("Topup tx     :", tx.hash);
  const receipt = await tx.wait();
  console.log("Mined in block:", receipt.blockNumber);

  // Cek ulang balance setelah topup
  const newBridgeBalanceRaw = await watt.balanceOf(AMOY_TARGET_BRIDGE_V2);
  const newDeployerBalanceRaw = await watt.balanceOf(signer.address);

  console.log("-------------------------------");
  console.log(
    "Bridge pool (after):",
    ethers.formatUnits(newBridgeBalanceRaw, decimals),
    "wATT"
  );
  console.log(
    "Deployer (after)   :",
    ethers.formatUnits(newDeployerBalanceRaw, decimals),
    "wATT"
  );
  console.log("✅ Pool wATT di TargetBridge v2 berhasil di-refill.");
}

main().catch((err) => {
  console.error("Error amoy_auto_refill_pool:", err);
  process.exit(1);
});
