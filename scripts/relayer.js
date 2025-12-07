const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [relayer] = await ethers.getSigners();

  // 🔧 GANTI INI dengan alamat-hasil deploy_bridges_v2.js
  const SRC_BRIDGE_ADDRESS = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"; // SourceBridge
  const DST_BRIDGE_ADDRESS = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"; // TargetBridge

  const srcBridge = await ethers.getContractAt("SourceBridge", SRC_BRIDGE_ADDRESS);
  const dstBridge = await ethers.getContractAt("TargetBridge", DST_BRIDGE_ADDRESS);

  console.log("Relayer running as:", relayer.address);
  console.log("SourceBridge:", SRC_BRIDGE_ADDRESS);
  console.log("TargetBridge:", DST_BRIDGE_ADDRESS);

  // Listener untuk event Locked di SourceBridge
  srcBridge.on("Locked", async (sender, recipient, amount, nonce, event) => {
    console.log("\n=== Locked event detected ===");
    console.log(" sender   :", sender);
    console.log(" recipient:", recipient);
    console.log(" amount   :", ethers.formatUnits(amount, 18));
    console.log(" nonce    :", Number(nonce));

    try {
      // Cek apakah nonce sudah pernah diproses di TargetBridge
      const alreadyProcessed = await dstBridge.processedNonces(nonce);
      if (alreadyProcessed) {
        console.log("⚠️  Nonce already processed, skipping.");
        return;
      }

      console.log("➡️  Sending mintFromSource tx...");
      const tx = await dstBridge.mintFromSource(recipient, amount, nonce);
      console.log("  tx hash:", tx.hash);

      const receipt = await tx.wait();
      console.log("✅ mintFromSource confirmed in block", receipt.blockNumber);
    } catch (err) {
      console.error("❌ Error while processing Locked event:", err.message || err);
    }
  });

  console.log("\n⏳ Relayer listening for Locked events on SourceBridge...");
  console.log("Lock some tokens via SourceBridge.lock(...) to see it in action.\n");

  // Biar script nggak langsung selesai
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
