// scripts/amoy_burn_to_sepolia.js
//
// Burn wATT on Polygon Amoy, emit BurnToSource,
// lalu (di step berikutnya) relayer / script di Sepolia akan memanggil unlockFromTarget.

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const { ethers, network } = hre;

  console.log("=== Amoy burn → Sepolia unlock demo ===");
  console.log("Network :", network.name);

  const [signer] = await ethers.getSigners();
  const deployer = await signer.getAddress();
  console.log("Deployer / holder wATT :", deployer);

  // ---------------------------------------------------------------------------
  // Load deployment addresses
  // ---------------------------------------------------------------------------
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

  const amoyInfo = deployments.amoy;
  if (!amoyInfo) {
    console.error("Full deployments JSON:", deployments);
    throw new Error('Missing "amoy" section in testnet_sepolia_amoy.json');
  }

  const wATTAddress = amoyInfo.wATT || amoyInfo.WrappedTestToken;
  const targetBridgeAddress =
    amoyInfo.TargetBridge || amoyInfo.targetBridge || amoyInfo.bridge;

  if (!wATTAddress || !targetBridgeAddress) {
    console.error("amoyInfo:", amoyInfo);
    throw new Error(
      "WrappedTestToken / TargetBridge missing in testnet_sepolia_amoy.json"
    );
  }

  console.log("wATT         :", wATTAddress);
  console.log("TargetBridge :", targetBridgeAddress);

  const wATT = await ethers.getContractAt("WrappedTestToken", wATTAddress, signer);
  const targetBridge = await ethers.getContractAt(
    "TargetBridge",
    targetBridgeAddress,
    signer
  );

  // ---------------------------------------------------------------------------
  // Sanity check: wATT.bridge harus = TargetBridge
  // ---------------------------------------------------------------------------
  const bridgeOnToken = await wATT.bridge();
  console.log("wATT.bridge()           :", bridgeOnToken);
  console.log("TargetBridge (expected) :", targetBridgeAddress);

  if (bridgeOnToken.toLowerCase() !== targetBridgeAddress.toLowerCase()) {
    console.log(
      "\n⚠️ WARNING: wATT.bridge != TargetBridge address.\n" +
        "   WrappedTestToken.onlyBridge akan revert dengan pesan 'Only bridge'.\n" +
        "   Kalau ini terjadi di testnet, solusi paling bersih: redeploy amoy target.\n"
    );
  }

  // ---------------------------------------------------------------------------
  // CONFIG – amount yang mau dibakar + recipient di Sepolia
  // ---------------------------------------------------------------------------
  const BURN_AMOUNT = process.env.BURN_AMOUNT || "400"; // wATT
  const TARGET_ON_SEPOLIA =
    process.env.TARGET_ON_SEPOLIA || deployer; // alamat penerima ATT di Sepolia

  const amount = ethers.parseUnits(BURN_AMOUNT, 18);

  // ---------------------------------------------------------------------------
  // Cek balance sebelum burn
  // ---------------------------------------------------------------------------
  const balBefore = await wATT.balanceOf(deployer);
  console.log("wATT balance before:", ethers.formatUnits(balBefore, 18));

  if (balBefore < amount) {
    console.error(
      `Not enough wATT to burn. Have ${ethers.formatUnits(
        balBefore,
        18
      )}, need ${BURN_AMOUNT}`
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // Simulate dulu dengan staticCall supaya kelihatan reason kalau revert
  // ---------------------------------------------------------------------------
  console.log(
    `\nSimulating burnToSource(${BURN_AMOUNT} wATT → ${TARGET_ON_SEPOLIA}) via staticCall...`
  );

  try {
    // ethers v6 style: method.staticCall(...)
    await targetBridge.burnToSource.staticCall(amount, TARGET_ON_SEPOLIA);
    console.log("✅ staticCall burnToSource() SUCCESS (no revert).");
  } catch (err) {
    console.error("❌ staticCall burnToSource() REVERTED.");
    console.error("shortMessage:", err.shortMessage || err.message);
    if (err.data) {
      console.error("data       :", err.data);
    }
    if (err.reason) {
      console.error("reason     :", err.reason);
    }
    console.error(
      "\nKemungkinan besar reason-nya 'Only bridge' atau 'ERC20: burn amount exceeds balance'."
    );
    return; // jangan kirim tx beneran kalau simulasi sudah revert
  }

  // ---------------------------------------------------------------------------
  // Execute real burn (kalau simulasi sukses)
  // ---------------------------------------------------------------------------
  console.log(
    `\nBurning ${BURN_AMOUNT} wATT on Amoy → unlock ATT to ${TARGET_ON_SEPOLIA} on Sepolia...`
  );

  const tx = await targetBridge.burnToSource(amount, TARGET_ON_SEPOLIA);
  console.log("Burn tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Burn confirmed in block:", receipt.blockNumber);

  const balAfter = await wATT.balanceOf(deployer);
  console.log("wATT balance after :", ethers.formatUnits(balAfter, 18));

  console.log(
    "\nDone. Relayer / script di Sepolia sekarang bisa baca BurnToSource dan memanggil unlockFromTarget()."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
