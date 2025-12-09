// scripts/admin_pause_source.js
//
// Pause SourceBridge di Sepolia (hanya owner).
require("dotenv").config();
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !PRIVATE_KEY) {
  console.error("Missing SEPOLIA_RPC_URL or PRIVATE_KEY");
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
if (!deployments.sepolia || !deployments.sepolia.SourceBridge) {
  console.error("No sepolia.SourceBridge in deployments");
  process.exit(1);
}

const SOURCE_BRIDGE = deployments.sepolia.SourceBridge;
const artifact = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Admin address :", await wallet.getAddress());
  console.log("SourceBridge  :", SOURCE_BRIDGE);

  const bridge = new ethers.Contract(SOURCE_BRIDGE, artifact.abi, wallet);

  console.log("Calling pause() on SourceBridge...");
  const tx = await bridge.pause();
  console.log("tx hash:", tx.hash);
  const rc = await tx.wait();
  console.log("confirmed in block:", rc.blockNumber);
  console.log("Done. SourceBridge is now PAUSED.");
}

main().catch((err) => {
  console.error("admin_pause_source error:", err);
  process.exit(1);
});
