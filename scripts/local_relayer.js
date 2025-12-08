const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const { ethers, network } = hre;
  const [relayer] = await ethers.getSigners();

  console.log("=== LOCAL RELAYER START ===");
  console.log("Network:", network.name);
  console.log("Relayer:", relayer.address);

  const configPath = path.join(__dirname, "..", "deployments", "local_relayer.json");
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const sourceBridge = await ethers.getContractAt("SourceBridge", cfg.SourceBridge);
  const targetBridge = await ethers.getContractAt("TargetBridge", cfg.TargetBridge);
  const att          = await ethers.getContractAt("TestToken", cfg.ATT);
  const wAtt         = await ethers.getContractAt("WrappedTestToken", cfg.wATT);

  console.log("SourceBridge:", cfg.SourceBridge);
  console.log("TargetBridge:", cfg.TargetBridge);
  console.log("ATT         :", cfg.ATT);
  console.log("wATT        :", cfg.wATT);
  console.log("=================================\n");

  sourceBridge.on("Locked", async (from, to, amount, nonce, event) => {
    try {
      console.log("[EVENT Locked]");
      console.log(" from   :", from);
      console.log(" to     :", to);
      console.log(" amount :", ethers.formatUnits(amount, 18));
      console.log(" nonce  :", nonce.toString());
      console.log(" txHash :", event.log.transactionHash);

      const already = await targetBridge.processedNonces(nonce);
      if (already) {
        console.log(" -> Nonce already processed on target. Skip mint.\n");
        return;
      }

      const tx = await targetBridge.mintFromSource(to, amount, nonce);
      console.log(" -> Mint tx sent:", tx.hash);
      const receipt = await tx.wait();
      console.log(" -> Mint tx mined in block:", receipt.blockNumber);

      const bal = await wAtt.balanceOf(to);
      console.log(" -> wATT balance of", to, ":", ethers.formatUnits(bal, 18), "\n");
    } catch (err) {
      console.error("Error handling Locked event:", err.message || err);
    }
  });

  targetBridge.on("BurnToSource", async (from, to, amount, burnNonce, event) => {
    try {
      console.log("[EVENT BurnToSource]");
      console.log(" from      :", from);
      console.log(" to        :", to);
      console.log(" amount    :", ethers.formatUnits(amount, 18));
      console.log(" burnNonce :", burnNonce.toString());
      console.log(" txHash    :", event.log.transactionHash);

      const already = await sourceBridge.processedBurnNonces(burnNonce);
      if (already) {
        console.log(" -> Burn nonce already processed on source. Skip unlock.\n");
        return;
      }

      const tx = await sourceBridge.unlockFromTarget(to, amount, burnNonce);
      console.log(" -> Unlock tx sent:", tx.hash);
      const receipt = await tx.wait();
      console.log(" -> Unlock tx mined in block:", receipt.blockNumber);

      const balUser   = await att.balanceOf(to);
      const balBridge = await att.balanceOf(cfg.SourceBridge);
      console.log(" -> ATT user   :", ethers.formatUnits(balUser, 18));
      console.log(" -> ATT bridge :", ethers.formatUnits(balBridge, 18), "\n");
    } catch (err) {
      console.error("Error handling BurnToSource event:", err.message || err);
    }
  });

  console.log("Relayer is listening for events...\n");
  await new Promise(() => {});
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
