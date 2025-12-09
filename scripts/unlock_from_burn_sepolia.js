// scripts/testnet_relayer.js
//
// Simple testnet relayer:
//  - Listens Locked on Sepolia  -> calls mintFromSource on Amoy
//  - Listens BurnToSource on Amoy -> calls unlockFromTarget on Sepolia

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const { ethers } = hre;

  // --- Load deployment info ---
  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    "testnet_sepolia_amoy.json"
  );

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      `deployments/testnet_sepolia_amoy.json not found at ${deploymentPath}`
    );
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const sepoliaInfo = deployments.sepolia;
  const amoyInfo = deployments.amoy;

  if (!sepoliaInfo || !amoyInfo) {
    throw new Error("Invalid testnet_sepolia_amoy.json format.");
  }

  const sourceBridgeAddress = sepoliaInfo.SourceBridge;
  const targetBridgeAddress = amoyInfo.TargetBridge;

  if (!sourceBridgeAddress || !targetBridgeAddress) {
    throw new Error(
      "SourceBridge / TargetBridge missing in testnet_sepolia_amoy.json"
    );
  }

  // --- RPC + wallet ---
  const sepoliaRpc = process.env.SEPOLIA_RPC_URL;
  const amoyRpc = process.env.AMOY_RPC_URL;
  const pk = process.env.PRIVATE_KEY;

  if (!sepoliaRpc || !amoyRpc || !pk) {
    throw new Error(
      "Make sure SEPOLIA_RPC_URL, AMOY_RPC_URL, and PRIVATE_KEY are set in .env"
    );
  }

  const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaRpc);
  const amoyProvider = new ethers.JsonRpcProvider(amoyRpc);

  const wallet = new ethers.Wallet(pk);
  const sepoliaSigner = wallet.connect(sepoliaProvider);
  const amoySigner = wallet.connect(amoyProvider);

  // --- Contracts ---
  const sourceBridgeArtifact = await hre.artifacts.readArtifact("SourceBridge");
  const targetBridgeArtifact = await hre.artifacts.readArtifact("TargetBridge");

  const sourceBridge = new ethers.Contract(
    sourceBridgeAddress,
    sourceBridgeArtifact.abi,
    sepoliaSigner
  );

  const targetBridge = new ethers.Contract(
    targetBridgeAddress,
    targetBridgeArtifact.abi,
    amoySigner
  );

  console.log("=== AegisBridge Testnet Relayer ===");
  console.log("Sepolia SourceBridge :", sourceBridgeAddress);
  console.log("Amoy TargetBridge    :", targetBridgeAddress);
  console.log("Relayer wallet       :", await sepoliaSigner.getAddress());
  console.log("===================================");

  const startBlockLocked = await sepoliaProvider.getBlockNumber();
  const startBlockBurn = await amoyProvider.getBlockNumber();

  console.log(
    `Listening Locked events on Sepolia starting from block ${startBlockLocked}...`
  );
  console.log(
    `Listening BurnToSource events on Amoy starting from block ${startBlockBurn}...\n`
  );
  console.log(
    "Tip: start this relayer first, then run sepolia_lock.js / amoy_burn_to_sepolia.js\n"
  );

  // ---------------------------------------------------------------------------
  // Direction 1: Sepolia (Locked) -> Amoy (mintFromSource)
  // ---------------------------------------------------------------------------
  sourceBridge.on(
    "Locked",
    async (sender, recipient, amount, nonce, event) => {
      try {
        console.log("--------------------------------------------------");
        console.log("[Locked event detected on Sepolia]");
        console.log(" from      :", sender);
        console.log(" recipient :", recipient);
        console.log(" amount    :", ethers.formatUnits(amount, 18));
        console.log(" nonce     :", nonce.toString());
        console.log(" txHash    :", event.transactionHash);

        const already = await targetBridge.processedNonces(nonce);
        if (already) {
          console.log(" -> Nonce already processed on TargetBridge. Skip mint.");
          return;
        }

        console.log(" -> Sending mintFromSource on Amoy...");
        const tx = await targetBridge.mintFromSource(recipient, amount, nonce);
        console.log(" -> Mint tx sent:", tx.hash);
        const receipt = await tx.wait();
        console.log(" -> Mint confirmed in block", receipt.blockNumber);
        console.log(
          " (Sepolia → Amoy bridge success for nonce",
          nonce.toString() + ")"
        );
      } catch (err) {
        console.error(" !! Error while handling Locked event:", err);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Direction 2: Amoy (BurnToSource) -> Sepolia (unlockFromTarget)
  // ---------------------------------------------------------------------------
  targetBridge.on(
    "BurnToSource",
    async (from, to, amount, burnNonce, event) => {
      try {
        console.log("--------------------------------------------------");
        console.log("[BurnToSource event detected on Amoy]");
        console.log(" from        :", from);
        console.log(" to (Sepolia):", to);
        console.log(" amount      :", ethers.formatUnits(amount, 18));
        console.log(" burnNonce   :", burnNonce.toString());
        console.log(" txHash      :", event.transactionHash);

        const already = await sourceBridge.processedBurnNonces(burnNonce);
        if (already) {
          console.log(
            " -> burnNonce already processed on SourceBridge. Skip unlock."
          );
          return;
        }

        console.log(" -> Sending unlockFromTarget on Sepolia...");
        const tx = await sourceBridge.unlockFromTarget(to, amount, burnNonce);
        console.log(" -> Unlock tx sent:", tx.hash);
        const receipt = await tx.wait();
        console.log(" -> Unlock confirmed in block", receipt.blockNumber);
        console.log(
          " (Amoy → Sepolia bridge success for burnNonce",
          burnNonce.toString() + ")"
        );
      } catch (err) {
        console.error(" !! Error while handling BurnToSource event:", err);
      }
    }
  );

  console.log("\nRelayer running. Press CTRL+C to stop.\n");
  process.stdin.resume();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
