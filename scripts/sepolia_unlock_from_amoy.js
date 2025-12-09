// scripts/sepolia_unlock_from_amoy.js
//
// Manual unlock ATT di Sepolia setelah BurnToSource di Amoy.
// Versi ini TIDAK lagi memanggil processedBurnNonces() supaya tidak revert
// kalau kontrak di Sepolia masih versi lama. Kita langsung staticCall unlockFromTarget()
// untuk cek apakah fungsi itu memang ada dan akan sukses.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const { ethers, network } = hre;

  console.log("=== Sepolia unlockFromTarget demo ===");
  console.log("Network :", network.name);

  const [signer] = await ethers.getSigners();
  const deployer = await signer.getAddress();
  console.log("Deployer (receiver ATT) :", deployer);

  // ---------------------------------------------------------
  // Load deployment info
  // ---------------------------------------------------------
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
  if (!sepoliaInfo) {
    console.error("Full deployments JSON:", deployments);
    throw new Error('Missing "sepolia" section in testnet_sepolia_amoy.json');
  }

  const sourceBridgeAddress =
    sepoliaInfo.SourceBridge || sepoliaInfo.sourceBridge || sepoliaInfo.Bridge;
  const attAddress = sepoliaInfo.ATT || sepoliaInfo.TestToken;

  if (!sourceBridgeAddress) {
    console.error("sepoliaInfo:", sepoliaInfo);
    throw new Error("SourceBridge address missing in testnet_sepolia_amoy.json");
  }

  console.log("SourceBridge :", sourceBridgeAddress);
  console.log("ATT (TestToken):", attAddress || "(not set in JSON)");

  const sourceBridge = await ethers.getContractAt(
    "SourceBridge",
    sourceBridgeAddress,
    signer
  );

  let att;
  if (attAddress) {
    att = await ethers.getContractAt("TestToken", attAddress, signer);
  }

  // ---------------------------------------------------------
  // CONFIG – sesuaikan dengan burn di Amoy
  // ---------------------------------------------------------
  // Burn pertama di TargetBridge baru hampir pasti burnNonce = 1
  const BURN_NONCE = Number(process.env.BURN_NONCE || 1);
  const UNLOCK_AMOUNT = process.env.UNLOCK_AMOUNT || "400";

  const amount = ethers.parseUnits(UNLOCK_AMOUNT, 18);

  console.log("\nConfig:");
  console.log("  BURN_NONCE    :", BURN_NONCE);
  console.log("  UNLOCK_AMOUNT :", UNLOCK_AMOUNT);

  // ---------------------------------------------------------
  // Cek balance sebelum unlock (kalau ATT address diketahui)
  // ---------------------------------------------------------
  if (att) {
    const balUserBefore = await att.balanceOf(deployer);
    const balBridgeBefore = await att.balanceOf(sourceBridgeAddress);
    console.log(
      "ATT user   (before):",
      ethers.formatUnits(balUserBefore, 18)
    );
    console.log(
      "ATT bridge (before):",
      ethers.formatUnits(balBridgeBefore, 18)
    );
  } else {
    console.log("ATT address not set, skip balance logs.");
  }

  // ---------------------------------------------------------
  // Simulate unlockFromTarget via staticCall
  // ---------------------------------------------------------
  console.log(
    `\nSimulating unlockFromTarget(${deployer}, ${UNLOCK_AMOUNT}, burnNonce=${BURN_NONCE}) via staticCall...`
  );

  try {
    await sourceBridge.unlockFromTarget.staticCall(
      deployer,
      amount,
      BURN_NONCE
    );
    console.log("✅ staticCall unlockFromTarget() SUCCESS (no revert).");
  } catch (err) {
    console.error("❌ staticCall unlockFromTarget() REVERTED.");
    console.error("shortMessage:", err.shortMessage || err.message);
    if (err.data) {
      console.error("data       :", err.data);
    }
    if (err.reason) {
      console.error("reason     :", err.reason);
    }
    console.error(
      "\nArtinya kontrak SourceBridge di Sepolia belum support unlockFromTarget untuk kombinasi ini,\n" +
        "kemungkinan besar masih versi v0.1 (satu arah). Untuk full roundtrip di testnet,\n" +
        "kita perlu redeploy SourceBridge v0.2 di Sepolia."
    );
    return;
  }

  // ---------------------------------------------------------
  // Kirim tx beneran unlockFromTarget
  // ---------------------------------------------------------
  console.log(
    `\nCalling unlockFromTarget(${deployer}, ${UNLOCK_AMOUNT}, burnNonce=${BURN_NONCE}) on Sepolia...`
  );

  const tx = await sourceBridge.unlockFromTarget(
    deployer,
    amount,
    BURN_NONCE
  );
  console.log("Unlock tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Unlock confirmed in block:", receipt.blockNumber);

  if (att) {
    const balUserAfter = await att.balanceOf(deployer);
    const balBridgeAfter = await att.balanceOf(sourceBridgeAddress);
    console.log(
      "ATT user   (after):",
      ethers.formatUnits(balUserAfter, 18)
    );
    console.log(
      "ATT bridge (after):",
      ethers.formatUnits(balBridgeAfter, 18)
    );
  }

  console.log("\n=== DONE Sepolia unlockFromTarget ===");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
