// scripts/testnet_relayer.js
//
// Simple testnet relayer for AegisBridge v0.2:
// - Listens to Locked events on Sepolia → calls mintFromSource on Amoy
// - Listens to BurnToSource events on Amoy → calls unlockFromTarget on Sepolia
//
// Run with:
//   node scripts/testnet_relayer.js
//
// Requires:
//   - .env with SEPOLIA_RPC_URL, AMOY_RPC_URL, PRIVATE_KEY
//   - deployments/testnet_sepolia_amoy.json filled by deploy scripts
//   - Hardhat already compiled (artifacts exist)

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// --- ENV ---
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !AMOY_RPC_URL || !PRIVATE_KEY) {
  console.error(
    "[ERROR] Missing SEPOLIA_RPC_URL / AMOY_RPC_URL / PRIVATE_KEY in .env"
  );
  process.exit(1);
}

// --- LOAD DEPLOYMENTS JSON ---
const deploymentsPath = path.join(
  __dirname,
  "..",
  "deployments",
  "testnet_sepolia_amoy.json"
);

if (!fs.existsSync(deploymentsPath)) {
  console.error(
    "[ERROR] deployments/testnet_sepolia_amoy.json not found at:",
    deploymentsPath
  );
  process.exit(1);
}

const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

const sepoliaInfo = deployments.sepolia;
const amoyInfo = deployments.amoy;

if (!sepoliaInfo || !amoyInfo) {
  console.error("[ERROR] Missing sepolia/amoy sections in deployments JSON:");
  console.error(JSON.stringify(deployments, null, 2));
  process.exit(1);
}

const SOURCE_BRIDGE_ADDRESS =
  sepoliaInfo.SourceBridge || sepoliaInfo.sourceBridge;
const ATT_ADDRESS = sepoliaInfo.ATT || sepoliaInfo.TestToken;

const TARGET_BRIDGE_ADDRESS =
  amoyInfo.TargetBridge || amoyInfo.targetBridge || amoyInfo.Bridge;
const WATT_ADDRESS = amoyInfo.wATT || amoyInfo.WrappedTestToken;

if (!SOURCE_BRIDGE_ADDRESS || !TARGET_BRIDGE_ADDRESS) {
  console.error("[ERROR] Missing SourceBridge or TargetBridge address");
  console.error("sepoliaInfo:", sepoliaInfo);
  console.error("amoyInfo   :", amoyInfo);
  process.exit(1);
}

// --- LOAD ABIs FROM HARDHAT ARTIFACTS ---
const sourceBridgeArtifact = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
const targetBridgeArtifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

const sourceBridgeAbi = sourceBridgeArtifact.abi;
const targetBridgeAbi = targetBridgeArtifact.abi;

// --- PROVIDERS & WALLETS ---
const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);

const walletSepolia = new ethers.Wallet(PRIVATE_KEY, sepoliaProvider);
const walletAmoy = new ethers.Wallet(PRIVATE_KEY, amoyProvider);

// --- CONTRACT INSTANCES ---
const sourceBridge = new ethers.Contract(
  SOURCE_BRIDGE_ADDRESS,
  sourceBridgeAbi,
  walletSepolia
);
const targetBridge = new ethers.Contract(
  TARGET_BRIDGE_ADDRESS,
  targetBridgeAbi,
  walletAmoy
);

// --- LOG BASIC INFO ---
async function printInfo() {
  const [sepoliaNet, amoyNet] = await Promise.all([
    sepoliaProvider.getNetwork(),
    amoyProvider.getNetwork(),
  ]);

  console.log("=== AegisBridge v0.2 Testnet Relayer ===");
  console.log("Sepolia RPC :", SEPOLIA_RPC_URL);
  console.log("Amoy RPC    :", AMOY_RPC_URL);
  console.log("Deployer/Relayer address:", walletSepolia.address);
  console.log("");
  console.log("Sepolia chainId :", sepoliaNet.chainId.toString());
  console.log("Amoy    chainId :", amoyNet.chainId.toString());
  console.log("");
  console.log("SourceBridge (Sepolia):", SOURCE_BRIDGE_ADDRESS);
  console.log("ATT (Sepolia)        :", ATT_ADDRESS || "(not set)");
  console.log("TargetBridge (Amoy)  :", TARGET_BRIDGE_ADDRESS);
  console.log("wATT (Amoy)          :", WATT_ADDRESS || "(not set)");
  console.log("========================================\n");
}

// --- HELPERS ---
function fmtAmount(amount) {
  try {
    return ethers.formatUnits(amount, 18);
  } catch {
    return amount.toString();
  }
}

// --- HANDLERS ---
// 1) Locked on Sepolia -> mintFromSource on Amoy
async function handleLocked(user, amount, nonce, event) {
  try {
    console.log("\n[EVENT] Locked on Sepolia");
    console.log("  tx       :", event.transactionHash);
    console.log("  user     :", user);
    console.log("  amount   :", fmtAmount(amount));
    console.log("  nonce    :", nonce.toString());

    // Check on Amoy whether this nonce is already processed
    let alreadyProcessed = false;
    if (typeof targetBridge.processedNonces === "function") {
      alreadyProcessed = await targetBridge.processedNonces(nonce);
      console.log("  processedNonces[nonce] on Amoy:", alreadyProcessed);
    }

    if (alreadyProcessed) {
      console.log("  → Nonce already processed on Amoy, skipping mintFromSource.");
      return;
    }

    console.log("  → Calling mintFromSource(user, amount, nonce) on Amoy...");

    // Optional: simulate first
    try {
      await targetBridge.mintFromSource.staticCall(user, amount, nonce);
      console.log("    staticCall mintFromSource SUCCESS (no revert).");
    } catch (err) {
      console.error("    staticCall mintFromSource REVERTED.");
      console.error("    message:", err.shortMessage || err.message);
      if (err.data) console.error("    data   :", err.data);
      return;
    }

    const tx = await targetBridge.mintFromSource(user, amount, nonce);
    console.log("    tx sent      :", tx.hash);
    const receipt = await tx.wait();
    console.log("    tx confirmed :", receipt.blockNumber);
  } catch (err) {
    console.error("[ERROR] handleLocked:", err);
  }
}

// 2) BurnToSource on Amoy -> unlockFromTarget on Sepolia
async function handleBurnToSource(user, targetUser, amount, burnNonce, event) {
  try {
    console.log("\n[EVENT] BurnToSource on Amoy");
    console.log("  tx         :", event.transactionHash);
    console.log("  burner     :", user);
    console.log("  targetUser :", targetUser);
    console.log("  amount     :", fmtAmount(amount));
    console.log("  burnNonce  :", burnNonce.toString());

    // Check on Sepolia if this burnNonce already processed
    let alreadyProcessed = false;
    if (typeof sourceBridge.processedBurnNonces === "function") {
      alreadyProcessed = await sourceBridge.processedBurnNonces(burnNonce);
      console.log(
        "  processedBurnNonces[burnNonce] on Sepolia:",
        alreadyProcessed
      );
    }

    if (alreadyProcessed) {
      console.log(
        "  → burnNonce already processed on Sepolia, skipping unlockFromTarget."
      );
      return;
    }

    console.log(
      "  → Calling unlockFromTarget(targetUser, amount, burnNonce) on Sepolia..."
    );

    // Optional: simulate first
    try {
      await sourceBridge.unlockFromTarget.staticCall(
        targetUser,
        amount,
        burnNonce
      );
      console.log("    staticCall unlockFromTarget SUCCESS (no revert).");
    } catch (err) {
      console.error("    staticCall unlockFromTarget REVERTED.");
      console.error("    message:", err.shortMessage || err.message);
      if (err.data) console.error("    data   :", err.data);
      return;
    }

    const tx = await sourceBridge.unlockFromTarget(
      targetUser,
      amount,
      burnNonce
    );
    console.log("    tx sent      :", tx.hash);
    const receipt = await tx.wait();
    console.log("    tx confirmed :", receipt.blockNumber);
  } catch (err) {
    console.error("[ERROR] handleBurnToSource:", err);
  }
}

// --- MAIN ---
async function main() {
  await printInfo();

  console.log("Subscribing to events...");
  console.log(
    "- Locked(user, amount, nonce) on SourceBridge (Sepolia) → mintFromSource on Amoy"
  );
  console.log(
    "- BurnToSource(user, targetUser, amount, burnNonce) on TargetBridge (Amoy) → unlockFromTarget on Sepolia"
  );
  console.log("Press Ctrl+C to exit.\n");

  // Event names must match the contract ABI
  sourceBridge.on("Locked", handleLocked);

  // For BurnToSource we rely on the ABI param order:
  // event BurnToSource(address indexed user, address indexed targetUser, uint256 amount, uint256 burnNonce);
  targetBridge.on("BurnToSource", handleBurnToSource);

  // Keep the process alive
  process.on("SIGINT", () => {
    console.log("\nShutting down relayer (SIGINT)...");
    sourceBridge.removeAllListeners();
    targetBridge.removeAllListeners();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
