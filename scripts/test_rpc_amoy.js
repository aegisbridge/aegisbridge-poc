// scripts/test_rpc_amoy.js
require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const mode = process.argv[2] || "main";

  const url =
    mode === "backup"
      ? process.env.AMOY_RPC_URL_BACKUP
      : process.env.AMOY_RPC_URL;

  if (!url) {
    console.error("❌ RPC URL untuk mode", mode, "tidak ada di .env");
    process.exit(1);
  }

  console.log(`Testing Amoy RPC (${mode}): ${url}`);
  const provider = new ethers.JsonRpcProvider(url);

  const net = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();

  console.log("ChainId :", net.chainId.toString());
  console.log("Block   :", blockNumber.toString());
}

main().catch((err) => {
  console.error("❌ Error test_rpc_amoy:", err);
  process.exit(1);
});
