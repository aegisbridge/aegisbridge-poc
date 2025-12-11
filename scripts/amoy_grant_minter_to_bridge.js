// scripts/amoy_grant_minter_to_bridge.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Network  :", (await ethers.provider.getNetwork()).name);
  console.log("Deployer :", deployer.address);

  const WATT_ADDR = process.env.WATT_AMOY;
  const BRIDGE_ADDR = process.env.TARGET_BRIDGE_AMOY;

  if (!WATT_ADDR || !BRIDGE_ADDR) {
    throw new Error("WATT_AMOY atau TARGET_BRIDGE_AMOY belum di-set di .env");
  }

  // ABI minimal untuk ERC20PresetMinterPauser
  const MINTER_ROLE =
    "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4c0c1a1e4f5f7f3f5d"; // keccak256("MINTER_ROLE")

  const watt = await ethers.getContractAt(
    [
      "function grantRole(bytes32 role, address account) external",
      "function hasRole(bytes32 role, address account) external view returns (bool)",
    ],
    WATT_ADDR
  );

  console.log("Grant MINTER_ROLE to bridge:", BRIDGE_ADDR);

  const has = await watt.hasRole(MINTER_ROLE, BRIDGE_ADDR);
  if (has) {
    console.log("Bridge already has MINTER_ROLE, no action.");
    return;
  }

  const tx = await watt.grantRole(MINTER_ROLE, BRIDGE_ADDR);
  console.log("Tx grantRole sent:", tx.hash);
  await tx.wait();
  console.log("✅ MINTER_ROLE granted to bridge.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
