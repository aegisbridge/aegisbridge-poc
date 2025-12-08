const hre = require("hardhat");
const cfg = require("../deployments/testnet_sepolia_amoy.json");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  if (network.name !== "sepolia") {
    throw new Error("Run this with --network sepolia");
  }

  const att = await ethers.getContractAt("TestToken", cfg.sepolia.ATT);
  const sourceBridge = await ethers.getContractAt(
    "SourceBridge",
    cfg.sepolia.SourceBridge
  );

  const amount = ethers.parseUnits("600", 18);

  // GANTI ini sesuai burnNonce dari output amoy_burn_600.js
  const BURN_NONCE = 1;

  console.log("Network :", network.name);
  console.log("Deployer:", deployer.address);
  console.log(
    "ATT before (user)  :",
    await ethers.formatUnits(await att.balanceOf(deployer.address), 18)
  );
  console.log(
    "ATT before (bridge):",
    await ethers.formatUnits(
      await att.balanceOf(cfg.sepolia.SourceBridge),
      18
    )
  );

  let alreadyProcessed = false;
  try {
    alreadyProcessed = await sourceBridge.processedBurnNonces(BURN_NONCE);
    console.log(
      "processedBurnNonces[",
      BURN_NONCE,
      "] before:",
      alreadyProcessed
    );
  } catch (e) {
    console.log("processedBurnNonces view not available, skip check.");
  }

  if (alreadyProcessed) {
    console.log("Burn nonce", BURN_NONCE, "already processed. Skip unlock.");
    return;
  }

  const txUnlock = await sourceBridge.unlockFromTarget(
    deployer.address,
    amount,
    BURN_NONCE
  );
  const receipt = await txUnlock.wait();
  console.log("Unlock tx      :", txUnlock.hash);
  console.log("Unlocked in block:", receipt.blockNumber);

  console.log(
    "ATT after (user)  :",
    await ethers.formatUnits(await att.balanceOf(deployer.address), 18)
  );
  console.log(
    "ATT after (bridge):",
    await ethers.formatUnits(
      await att.balanceOf(cfg.sepolia.SourceBridge),
      18
    )
  );

  try {
    const processedAfter = await sourceBridge.processedBurnNonces(BURN_NONCE);
    console.log(
      "processedBurnNonces[",
      BURN_NONCE,
      "] after:",
      processedAfter
    );
  } catch (e) {
    // kalau function nggak ada di versi testnet, ignore
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
