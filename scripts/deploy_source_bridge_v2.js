// scripts/deploy_source_bridge_v2.js
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  // ATT di Sepolia (canonical token)
  const att = process.env.ATT_SEPOLIA;
  // Relayer: default = deployer
  const relayer = process.env.BRIDGE_RELAYER || deployer.address;

  if (!att) {
    console.error("❌ ATT_SEPOLIA belum di-set di .env");
    process.exit(1);
  }

  console.log("=== Deploy SourceBridge v2 (Sepolia) ===");
  console.log("Network  :", hre.network.name);
  console.log("Deployer :", deployer.address);
  console.log("ATT      :", att);
  console.log("Relayer  :", relayer);

  const SourceBridge = await ethers.getContractFactory("SourceBridge");
  const bridge = await SourceBridge.deploy(att, relayer);

  if (bridge.waitForDeployment) {
    await bridge.waitForDeployment();
  } else if (bridge.deployed) {
    await bridge.deployed();
  }

  const address =
    bridge.getAddress ? await bridge.getAddress() : bridge.address;

  console.log("✅ SourceBridge v2 deployed at:", address);
}

main().catch((err) => {
  console.error("❌ Error deploy_source_bridge_v2:", err);
  process.exitCode = 1;
});
