// scripts/check_target_nonce.js
const hre = require("hardhat");

async function main() {
  // nonce yang mau dicek (bisa diganti lewat env biar fleksibel)
  const nonceToCheck = process.env.CHECK_NONCE || "11";

  const targetBridgeAddress = process.env.TARGET_BRIDGE_AMOY;
  if (!targetBridgeAddress) {
    console.error("❌ TARGET_BRIDGE_AMOY belum di-set di .env");
    process.exit(1);
  }

  const [signer] = await hre.ethers.getSigners();

  console.log("=== Cek nonce di TargetBridge (Amoy) ===");
  console.log("Network :", hre.network.name);
  console.log("Signer  :", signer.address);
  console.log("Bridge  :", targetBridgeAddress);
  console.log("Nonce   :", nonceToCheck);

  const TargetBridge = await hre.ethers.getContractFactory("TargetBridge");
  const bridge = TargetBridge.attach(targetBridgeAddress);

  // asumsi kontrak punya mapping: mapping(uint256 => bool) public processedNonces;
  const processed = await bridge.processedNonces(nonceToCheck);
  console.log(`processedNonces(${nonceToCheck}) =`, processed);
}

main().catch((err) => {
  console.error("❌ Error check_target_nonce:", err);
  process.exitCode = 1;
});
