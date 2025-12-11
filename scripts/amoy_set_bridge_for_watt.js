// scripts/amoy_set_bridge_for_watt.js
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const rpcUrl = process.env.AMOY_RPC_URL;
  const priv = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  const wattAddr = process.env.WATT_AMOY;
  const newBridge = process.env.TARGET_BRIDGE_AMOY;

  if (!rpcUrl) throw new Error("Missing AMOY_RPC_URL in .env");
  if (!priv) throw new Error("Missing PRIVATE_KEY/DEPLOYER_PRIVATE_KEY in .env");
  if (!wattAddr) throw new Error("Missing WATT_AMOY in .env");
  if (!newBridge) throw new Error("Missing TARGET_BRIDGE_AMOY in .env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(priv, provider);

  const wattAbi = [
    "function bridge() view returns (address)",
    "function setBridge(address _bridge) external",
  ];

  const watt = new ethers.Contract(wattAddr, wattAbi, signer);

  const deployer = await signer.getAddress();
  console.log("=== Set bridge() wATT -> TargetBridge v2 ===");
  console.log("Network  : amoy");
  console.log("Deployer :", deployer);
  console.log("wATT     :", wattAddr);
  console.log("New bridge:", newBridge);

  // Cek bridge lama
  let currentBridge;
  try {
    currentBridge = await watt.bridge();
    console.log("Current bridge():", currentBridge);
  } catch (e) {
    console.error("❌ Gagal call bridge(). Mungkin wATT tidak punya fungsi bridge().");
    console.error("Detail:", e);
    process.exit(1);
  }

  if (currentBridge.toLowerCase() === newBridge.toLowerCase()) {
    console.log("✅ bridge() sudah diset ke TargetBridge v2. Tidak perlu update.");
    return;
  }

  console.log("🔄 Mengubah bridge() ke TargetBridge v2...");
  const tx = await watt.setBridge(newBridge);
  console.log("SetBridge tx:", tx.hash);
  const rc = await tx.wait();
  console.log("✅ bridge() di-update di block", rc.blockNumber);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
