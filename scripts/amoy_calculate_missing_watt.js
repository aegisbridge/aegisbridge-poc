// scripts/amoy_calculate_missing_watt.js
// Hitung defisit pool wATT di Amoy dibanding target threshold sederhana (tanpa baca event Sepolia)

require("dotenv").config();
const { ethers } = require("ethers");

// Kita cuma perlu Amoy RPC di script ini
const { getAmoyProvider } = require("./helpers/multiRpc");

// Ambil alamat dari .env
const AMOY_TARGET_BRIDGE_V2 = process.env.AMOY_TARGET_BRIDGE_V2;
const AMOY_WATT_TOKEN = process.env.AMOY_WATT_TOKEN;

// Target pool minimal (dalam unit wATT, bukan wei)
const TARGET_POOL_WATT = BigInt(
  process.env.AMOY_BRIDGE_TOPUP_MAX_WATT || "1500" // default 1500 wATT
);

async function main() {
  console.log("=== Hitung defisit wATT pool (Amoy) vs target threshold ===");

  if (!AMOY_TARGET_BRIDGE_V2 || !AMOY_WATT_TOKEN) {
    throw new Error(
      "Pastikan AMOY_TARGET_BRIDGE_V2 dan AMOY_WATT_TOKEN sudah di-set di .env"
    );
  }

  const amoyProvider = getAmoyProvider();

  // Load ABI ERC20 standar dari artifacts
  const erc20Artifact = require("../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json");
  const erc20Abi = erc20Artifact.abi;

  const watt = new ethers.Contract(AMOY_WATT_TOKEN, erc20Abi, amoyProvider);

  // Baca decimals
  const decimals = await watt.decimals();
  const unit = ethers.toBigInt(10) ** ethers.toBigInt(decimals);

  // Balance wATT di bridge
  const bridgeBalanceRaw = await watt.balanceOf(AMOY_TARGET_BRIDGE_V2);

  const bridgeBalanceWatt = ethers.formatUnits(bridgeBalanceRaw, decimals);
  const targetPoolRaw = TARGET_POOL_WATT * unit;

  const missingRaw =
    bridgeBalanceRaw >= targetPoolRaw ? 0n : targetPoolRaw - bridgeBalanceRaw;

  console.log("-------------------------------");
  console.log("Bridge address :", AMOY_TARGET_BRIDGE_V2);
  console.log("wATT token     :", AMOY_WATT_TOKEN);
  console.log(
    "Target pool    :",
    TARGET_POOL_WATT.toString(),
    "wATT (threshold sederhana)"
  );
  console.log("Bridge pool    :", bridgeBalanceWatt, "wATT");

  if (missingRaw === 0n) {
    console.log("Defisit        : 0 (pool sudah >= target).");
  } else {
    console.log(
      "Defisit        :",
      ethers.formatUnits(missingRaw, decimals),
      "wATT (perkiraan minimal supaya pool >= target)"
    );
  }

  console.log("-------------------------------");
  console.log(
    "Catatan: Script ini pakai pendekatan sederhana (threshold pool), " +
      "tanpa scan Locked events di Sepolia supaya tidak kena limit eth_getLogs plan gratis."
  );
}

main().catch((err) => {
  console.error("Error amoy_calculate_missing_watt:", err);
  process.exit(1);
});
