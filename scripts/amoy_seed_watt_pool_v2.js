// scripts/amoy_seed_watt_pool_v2.js
require("dotenv").config();
const { ethers } = require("hardhat");

function fmt(amount, decimals) {
  // amount: bigint
  return Number(ethers.formatUnits(amount, decimals)).toFixed(1);
}

async function main() {
  console.log("=== Top up wATT pool di TargetBridge v2 (Amoy) ===");

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  // --- Ambil alamat token & bridge dari .env (fallback ke hardcoded kalau perlu) ---
  const tokenAddress =
    process.env.AMOY_WATT_ADDRESS ||
    process.env.AMOY_WATT ||
    "0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4";

  const bridgeAddress =
    process.env.AMOY_TARGET_BRIDGE_V2 ||
    process.env.AMOY_TARGET_BRIDGE ||
    "0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5";

  // --- Max topup per run (dalam satuan wATT, bukan wei) ---
  // Bisa di-set di .env: AMOY_BRIDGE_TOPUP_MAX_WATT, default 500
  const maxTopupHumanStr = process.env.AMOY_BRIDGE_TOPUP_MAX_WATT || "500";
  let maxTopupHuman;

  try {
    maxTopupHuman = BigInt(maxTopupHumanStr);
  } catch (e) {
    throw new Error(
      `AMOY_BRIDGE_TOPUP_MAX_WATT invalid: "${maxTopupHumanStr}", harus integer (tanpa desimal).`
    );
  }

  console.log("Deployer :", deployerAddr);
  console.log("Token    :", tokenAddress, "(wATT)");
  console.log("Bridge   :", bridgeAddress);
  console.log("Target topup (max) :", maxTopupHuman.toString(), "wATT");
  console.log("-------------------------------");

  // --- Minimal ABI untuk ERC20: balanceOf, transfer, decimals ---
  const abi = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "function decimals() view returns (uint8)",
  ];

  const watt = new ethers.Contract(tokenAddress, abi, deployer);

  const decimals = await watt.decimals();
  const factor = 10n ** BigInt(decimals);

  const userBal = await watt.balanceOf(deployerAddr);
  const bridgeBal = await watt.balanceOf(bridgeAddress);

  console.log("Deployer wATT before:", fmt(userBal, decimals));
  console.log("Bridge   wATT before:", fmt(bridgeBal, decimals));

  // === Hitung jumlah topup ===
  const maxTopupRaw = maxTopupHuman * factor;

  // Simple aja: kirim min(maxTopupRaw, saldo user)
  let topupRaw = maxTopupRaw;
  if (topupRaw > userBal) {
    topupRaw = userBal;
  }

  if (topupRaw === 0n) {
    console.log("Tidak ada wATT yang cukup di wallet untuk topup. Batal.");
    return;
  }

  const topupHuman = fmt(topupRaw, decimals);
  console.log(`⏩ Transfer ${topupHuman} wATT ke bridge...`);

  try {
    const tx = await watt.transfer(bridgeAddress, topupRaw);
    console.log("Transfer tx:", tx.hash);

    const receipt = await tx.wait();
    console.log("  Mined in block:", receipt.blockNumber);
  } catch (err) {
    // Khusus error "replacement transaction underpriced"
    if (
      err.code === "REPLACEMENT_UNDERPRICED" ||
      (typeof err.shortMessage === "string" &&
        err.shortMessage.toLowerCase().includes("replacement fee too low"))
    ) {
      console.error(
        "Error amoy_seed_watt_pool_v2: replacement fee too low / underpriced.\n" +
          "➡ Biasanya karena masih ada tx sebelumnya dengan nonce sama yang belum mined.\n" +
          "   - Tunggu beberapa detik sampai tx lama masuk blok, lalu jalankan script lagi, atau\n" +
          "   - Kalau mau lebih advance: set gas lebih tinggi (maxFeePerGas / maxPriorityFeePerGas) untuk force replace."
      );
      return;
    }

    console.error("Error amoy_seed_watt_pool_v2:", err);
    throw err;
  }

  const userBalAfter = await watt.balanceOf(deployerAddr);
  const bridgeBalAfter = await watt.balanceOf(bridgeAddress);

  console.log("-------------------------------");
  console.log("Deployer wATT after :", fmt(userBalAfter, decimals));
  console.log("Bridge   wATT after :", fmt(bridgeBalAfter, decimals));
  console.log("✅ Pool wATT di TargetBridge v2 sudah ditambah.");
}

main().catch((err) => {
  // Biar prefix error konsisten
  if (!String(err.message || "").includes("amoy_seed_watt_pool_v2")) {
    console.error("Error amoy_seed_watt_pool_v2:", err);
  }
  process.exitCode = 1;
});
