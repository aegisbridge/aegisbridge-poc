// scripts/amoy_send_test_tx.js
const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  const addr = await signer.getAddress();
  const balance = await ethers.provider.getBalance(addr);

  console.log("=== Test simple tx on Amoy ===");
  console.log("Network :", `${net.name} (chainId=${net.chainId})`);
  console.log("Sender  :", addr);
  console.log("Balance :", ethers.formatUnits(balance, "ether"), "MATIC");

  console.log("Sending simple 0-value tx to self...");
  const tx = await signer.sendTransaction({
    to: addr,
    value: 0n,
  });

  console.log("Test tx hash:", tx.hash);
  console.log("Cek hash ini di Amoy explorer.");
}

main().catch((err) => {
  console.error("❌ Error test tx:", err);
  process.exit(1);
});
