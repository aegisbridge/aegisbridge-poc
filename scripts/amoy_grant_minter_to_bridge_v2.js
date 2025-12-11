// scripts/amoy_grant_minter_to_bridge_v2.js
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const rpcUrl = process.env.AMOY_RPC_URL;
  const priv = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  const wattAddr = process.env.WATT_AMOY;
  const bridgeAddr = process.env.TARGET_BRIDGE_AMOY;

  if (!rpcUrl) throw new Error("Missing AMOY_RPC_URL in .env");
  if (!priv) throw new Error("Missing PRIVATE_KEY/DEPLOYER_PRIVATE_KEY in .env");
  if (!wattAddr) throw new Error("Missing WATT_AMOY in .env");
  if (!bridgeAddr) throw new Error("Missing TARGET_BRIDGE_AMOY in .env");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(priv, provider);

  const erc20MinterAbi = [
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function grantRole(bytes32 role, address account) external",
  ];

  const watt = new ethers.Contract(wattAddr, erc20MinterAbi, signer);
  const MINTER_ROLE = ethers.id("MINTER_ROLE");

  console.log("=== Grant MINTER_ROLE wATT -> TargetBridge v2 ===");
  console.log("Network  : amoy");
  console.log("Deployer :", await signer.getAddress());
  console.log("wATT     :", wattAddr);
  console.log("Bridge   :", bridgeAddr);
  console.log("MINTER_ROLE hash:", MINTER_ROLE);

  const has = await watt.hasRole(MINTER_ROLE, bridgeAddr);
  console.log("Has MINTER_ROLE already?:", has);

  if (has) {
    console.log("✅ Bridge already has MINTER_ROLE, tidak perlu grant lagi.");
    return;
  }

  console.log("Granting MINTER_ROLE...");
  const tx = await watt.grantRole(MINTER_ROLE, bridgeAddr);
  console.log("Grant tx:", tx.hash);
  const rc = await tx.wait();
  console.log("✅ MINTER_ROLE granted in block", rc.blockNumber);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
