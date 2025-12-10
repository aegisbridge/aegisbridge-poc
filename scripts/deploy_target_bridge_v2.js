// scripts/deploy_target_bridge_v2.js
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  const watt = process.env.WATT_AMOY;
  const relayer = process.env.BRIDGE_RELAYER || deployer.address;

  if (!watt) {
    console.error("❌ WATT_AMOY belum di-set di .env");
    process.exit(1);
  }

  console.log("=== Deploy TargetBridge v2 (Amoy) ===");
  console.log("Deployer :", deployer.address);
  console.log("wATT     :", watt);
  console.log("Relayer  :", relayer);

  const TargetBridge = await ethers.getContractFactory("TargetBridge");
  const bridge = await TargetBridge.deploy(watt, relayer);

  if (bridge.waitForDeployment) {
    await bridge.waitForDeployment();
  } else if (bridge.deployed) {
    await bridge.deployed();
  }

  const address =
    bridge.getAddress ? await bridge.getAddress() : bridge.address;

  console.log("✅ TargetBridge v2 deployed at:", address);
}

main().catch((err) => {
  console.error("❌ Error deploy_target_bridge_v2:", err);
  process.exitCode = 1;
});
