// scripts/admin_unpause_target.js
//
// Unpause TargetBridge di Amoy (hanya owner).
require("dotenv").config();
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!AMOY_RPC_URL || !PRIVATE_KEY) {
  console.error("Missing AMOY_RPC_URL or PRIVATE_KEY");
  process.exit(1);
}

const deploymentsPath = path.join(
  __dirname,
  "..",
  "deployments",
  "testnet_sepolia_amoy.json"
);

if (!fs.existsSync(deploymentsPath)) {
  console.error("deployments/testnet_sepolia_amoy.json not found");
  process.exit(1);
}

const deployments = require(deploymentsPath);
if (!deployments.amoy || !deployments.amoy.TargetBridge) {
  console.error("No amoy.TargetBridge in deployments");
  process.exit(1);
}

const TARGET_BRIDGE = deployments.amoy.TargetBridge;
const artifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

async function main() {
  const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Admin address :", await wallet.getAddress());
  console.log("TargetBridge  :", TARGET_BRIDGE);

  const bridge = new ethers.Contract(TARGET_BRIDGE, artifact.abi, wallet);

  console.log("Calling unpause() on TargetBridge...");
  const tx = await bridge.unpause();
  console.log("tx hash:", tx.hash);
  const rc = await tx.wait();
  console.log("confirmed in block:", rc.blockNumber);
  console.log("Done. TargetBridge is now UNPAUSED.");
}

main().catch((err) => {
  console.error("admin_unpause_target error:", err);
  process.exit(1);
});
