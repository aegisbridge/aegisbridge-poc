// scripts/approve_watt_for_bridge.js
require("dotenv").config();
const { ethers } = require("ethers");

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

async function main() {
  const RPC = process.env.AMOY_RPC_URL;
  const PK = process.env.TEST_SENDER_PRIVATE_KEY;
  const WATT = process.env.AMOY_WATT_TOKEN;
  const BRIDGE =
    process.env.AMOY_BRIDGE_ADDRESS ||
    process.env.AMOY_TARGET_BRIDGE ||
    process.env.TARGET_BRIDGE_ADDRESS;

  if (!RPC) throw new Error("AMOY_RPC_URL belum di .env");
  if (!PK) throw new Error("TEST_SENDER_PRIVATE_KEY belum di .env");
  if (!WATT) throw new Error("AMOY_WATT_TOKEN belum di .env");
  if (!BRIDGE)
    throw new Error("AMOY_BRIDGE_ADDRESS / AMOY_TARGET_BRIDGE belum di .env");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const token = new ethers.Contract(WATT, ERC20_ABI, wallet);

  const [symbol, decimals, rawBal, rawAllow] = await Promise.all([
    token.symbol(),
    token.decimals(),
    token.balanceOf(wallet.address),
    token.allowance(wallet.address, BRIDGE),
  ]);

  const bal = ethers.formatUnits(rawBal, decimals);
  const allow = ethers.formatUnits(rawAllow, decimals);

  console.log("Wallet        :", wallet.address);
  console.log("Token         :", symbol, `(${WATT})`);
  console.log("Balance       :", bal);
  console.log("Allowance now :", allow);

  // Amount dalam satuan token (bukan wei) – default 1000 kalau tidak ada argumen CLI
  const amountTokens = process.argv[2] || "1000";
  const amount = ethers.parseUnits(amountTokens, decimals);

  console.log(`Approving     : ${amountTokens} ${symbol} to bridge ${BRIDGE}`);

  const tx = await token.approve(BRIDGE, amount);
  console.log("Approve tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status        :", receipt.status);

  const newAllow = await token.allowance(wallet.address, BRIDGE);
  console.log("Allowance new :", ethers.formatUnits(newAllow, decimals));
}

main().catch((err) => {
  console.error("Error in approve_watt_for_bridge:", err);
  process.exit(1);
});
