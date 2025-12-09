const hre = require("hardhat");
const cfg = require("../deployments/testnet_sepolia_amoy.json");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  if (network.name !== "amoy") {
    throw new Error("Run this with --network amoy");
  }

  // ====== SETTING MANUAL DI SINI ======
  const AMOUNT = "1000"; // harus sama dengan yang di-lock di Sepolia
  const NONCE  = 1;      // pakai nonce dari sepolia_lock.js (sekarang: 6)
  // ====================================

  const wAtt = await ethers.getContractAt("WrappedTestToken", cfg.amoy.wATT);
  const dstBridge = await ethers.getContractAt(
    "TargetBridge",
    cfg.amoy.TargetBridge
  );

  const amount = ethers.parseUnits(AMOUNT, 18);

  console.log("Network : amoy");
  console.log("Deployer:", deployer.address);
  console.log(
    "wATT before:",
    await ethers.formatUnits(await wAtt.balanceOf(deployer.address), 18)
  );

  const already = await dstBridge.processedNonces(NONCE);
  if (already) {
    console.log("Nonce", NONCE, "already processed on target. Skip mint.");
    return;
  }

  const txMint = await dstBridge.mintFromSource(
    deployer.address,
    amount,
    NONCE
  );
  await txMint.wait();
  console.log("Mint tx:", txMint.hash);

  console.log(
    "wATT after:",
    await ethers.formatUnits(await wAtt.balanceOf(deployer.address), 18)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
