// scripts/check_balances_testnet.js
//
// Cek saldo ATT (Sepolia) & wATT (Amoy) untuk:
// - EOA (PRIVATE_KEY)
// - SourceBridge / TargetBridge

require("dotenv").config();
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !AMOY_RPC_URL || !PRIVATE_KEY) {
  console.error(
    "[config] Missing SEPOLIA_RPC_URL / AMOY_RPC_URL / PRIVATE_KEY in .env"
  );
  process.exit(1);
}

// Load deployments
const deploymentsPath = path.join(
  __dirname,
  "..",
  "deployments",
  "testnet_sepolia_amoy.json"
);

if (!fs.existsSync(deploymentsPath)) {
  console.error(
    `[deployments] File not found: ${deploymentsPath}. Deploy v0.2 contracts first.`
  );
  process.exit(1);
}

const deployments = require(deploymentsPath);

if (!deployments.sepolia || !deployments.amoy) {
  console.error(
    "[deployments] Missing sepolia/amoy sections in testnet_sepolia_amoy.json"
  );
  process.exit(1);
}

const SEPOLIA_ATT = deployments.sepolia.ATT;
const SEPOLIA_SOURCE_BRIDGE = deployments.sepolia.SourceBridge;
const AMOY_WATT = deployments.amoy.wATT;
const AMOY_TARGET_BRIDGE = deployments.amoy.TargetBridge;

function short(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function main() {
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);

  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const userAddress = await wallet.getAddress();

  const erc20Abi = ["function balanceOf(address) view returns (uint256)"];

  const att = new ethers.Contract(SEPOLIA_ATT, erc20Abi, sepoliaProvider);
  const watt = new ethers.Contract(AMOY_WATT, erc20Abi, amoyProvider);

  const [attUser, attBridge] = await Promise.all([
    att.balanceOf(userAddress),
    att.balanceOf(SEPOLIA_SOURCE_BRIDGE),
  ]);

  const [wattUser, wattBridge] = await Promise.all([
    watt.balanceOf(userAddress),
    watt.balanceOf(AMOY_TARGET_BRIDGE),
  ]);

  console.log("=== AegisBridge v0.2 Testnet Balances ===");
  console.log();
  console.log("User / Relayer EOA :", userAddress);
  console.log();
  console.log("Sepolia (ATT)");
  console.log("  Token       :", SEPOLIA_ATT);
  console.log("  SourceBridge:", SEPOLIA_SOURCE_BRIDGE);
  console.log(
    "  ATT user    :",
    ethers.formatUnits(attUser, 18),
    "(ATT)"
  );
  console.log(
    "  ATT bridge  :",
    ethers.formatUnits(attBridge, 18),
    "(ATT)"
  );
  console.log();
  console.log("Amoy (wATT)");
  console.log("  Token       :", AMOY_WATT);
  console.log("  TargetBridge:", AMOY_TARGET_BRIDGE);
  console.log(
    "  wATT user   :",
    ethers.formatUnits(wattUser, 18),
    "(wATT)"
  );
  console.log(
    "  wATT bridge :",
    ethers.formatUnits(wattBridge, 18),
    "(wATT)"
  );
  console.log("========================================");
}

main().catch((err) => {
  console.error("check_balances_testnet error:", err);
  process.exit(1);
});
