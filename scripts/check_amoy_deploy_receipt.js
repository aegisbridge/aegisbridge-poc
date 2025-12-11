// scripts/check_amoy_deploy_receipt.js
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  // Ambil dari env: TX_HASH atau AMOY_DEPLOY_TX_HASH
  const txHash = process.env.TX_HASH || process.env.AMOY_DEPLOY_TX_HASH;

  if (!txHash) {
    console.log("❌ TX hash belum diset.");
    console.log(
      "   Set dulu env TX_HASH atau AMOY_DEPLOY_TX_HASH, contoh (PowerShell):"
    );
    console.log(
      '   $env:TX_HASH = "0x478004662016a12c85498bf9a0309ae6f0cb231982e1c432c5c2f0792f15bffd"'
    );
    return;
  }

  console.log(`Check receipt for tx: ${txHash}`);

  const provider = ethers.provider;
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    console.log("❌ Belum ada receipt (tx pending / belum dikenal node).");
    return;
  }

  console.log("✅ Receipt ditemukan!");
  console.log("  Block    :", receipt.blockNumber);
  console.log("  Status   :", receipt.status);
  console.log("  From     :", receipt.from);
  console.log("  To       :", receipt.to);
  console.log(
    "  Contract :",
    receipt.contractAddress || "(tidak ada contractAddress)"
  );
}

main().catch((err) => {
  console.error("Error check_amoy_deploy_receipt:", err);
  process.exit(1);
});
