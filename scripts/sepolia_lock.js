const hre = require("hardhat");
const cfg = require("../deployments/testnet_sepolia_amoy.json");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  if (network.name !== "sepolia") {
    throw new Error("Run this with --network sepolia");
  }

  // UBAH ANGKA INI SESUAI KEBUTUHAN
  const AMOUNT_TO_LOCK = "1000";

  const att = await ethers.getContractAt("TestToken", cfg.sepolia.ATT);
  const srcBridge = await ethers.getContractAt(
    "SourceBridge",
    cfg.sepolia.SourceBridge
  );

  const amount = ethers.parseUnits(AMOUNT_TO_LOCK, 18);

  console.log("Network : ", network.name);
  console.log("Deployer:", deployer.address);
  console.log(
    "ATT before:",
    await ethers.formatUnits(await att.balanceOf(deployer.address), 18)
  );

  const txApprove = await att.approve(cfg.sepolia.SourceBridge, amount);
  await txApprove.wait();
  console.log("Approve tx:", txApprove.hash);

  const txLock = await srcBridge.lock(amount, deployer.address);
  const receipt = await txLock.wait();
  console.log("Lock tx   :", txLock.hash);
  console.log("Locked in block:", receipt.blockNumber);

  const nonce = await srcBridge.nonce();
  console.log("Current nonce on SourceBridge:", nonce.toString());

  console.log(
    "ATT after (user):",
    await ethers.formatUnits(await att.balanceOf(deployer.address), 18)
  );
  console.log(
    "ATT after (bridge):",
    await ethers.formatUnits(
      await att.balanceOf(cfg.sepolia.SourceBridge),
      18
    )
  );

  console.log(
    `\n➡️  Gunakan nonce ini di sisi Amoy untuk mintFromSource: ${nonce.toString()}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
