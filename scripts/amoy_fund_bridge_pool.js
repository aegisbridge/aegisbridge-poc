// scripts/amoy_fund_bridge_pool.js
const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();

  const WATT_AMOY = process.env.WATT_AMOY;
  const TARGET_BRIDGE_AMOY = process.env.TARGET_BRIDGE_AMOY;
  const FUND_WATT_AMOUNT = process.env.FUND_WATT_AMOUNT || "1000"; // dalam satuan wATT (bukan wei)

  if (!WATT_AMOY || !TARGET_BRIDGE_AMOY) {
    throw new Error("Set WATT_AMOY dan TARGET_BRIDGE_AMOY di .env");
  }

  const erc20Abi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)"
  ];

  const token = new ethers.Contract(WATT_AMOY, erc20Abi, signer);

  const symbol = await token.symbol();
  const decimals = await token.decimals();

  const amount = ethers.parseUnits(FUND_WATT_AMOUNT, decimals);

  const userBalBefore = await token.balanceOf(signer.address);
  const bridgeBalBefore = await token.balanceOf(TARGET_BRIDGE_AMOY);

  console.log("=== Fund TargetBridge wATT pool ===");
  console.log("Token   :", symbol, "(", WATT_AMOY, ")");
  console.log("From    :", signer.address);
  console.log("Bridge  :", TARGET_BRIDGE_AMOY);
  console.log("Amount  :", FUND_WATT_AMOUNT, symbol);
  console.log("User bal before   :", ethers.formatUnits(userBalBefore, decimals));
  console.log("Bridge bal before :", ethers.formatUnits(bridgeBalBefore, decimals));

  const tx = await token.transfer(TARGET_BRIDGE_AMOY, amount);
  console.log("Transfer tx:", tx.hash);
  await tx.wait();

  const userBalAfter = await token.balanceOf(signer.address);
  const bridgeBalAfter = await token.balanceOf(TARGET_BRIDGE_AMOY);

  console.log("User bal after   :", ethers.formatUnits(userBalAfter, decimals));
  console.log("Bridge bal after :", ethers.formatUnits(bridgeBalAfter, decimals));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
