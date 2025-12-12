require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) throw new Error("AMOY_RPC_URL belum di .env");

  // Alamat wATT di Amoy
  const wattAddress =
    process.env.WATT_AMOY_ADDRESS ||
    "0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4";

  // Alamat kontrak pool (default: TargetBridge)
  const poolAddress =
    process.env.TARGET_BRIDGE_AMOY ||
    "0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5";

  console.log("RPC Amoy   :", rpcUrl);
  console.log("wATT token :", wattAddress);
  console.log("Pool addr  :", poolAddress);

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const erc20Abi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
  ];

  const token = new ethers.Contract(wattAddress, erc20Abi, provider);

  const [symbol, decimals, bal] = await Promise.all([
    token.symbol(),
    token.decimals(),
    token.balanceOf(poolAddress),
  ]);

  console.log("Token   :", symbol, "(", wattAddress, ")");
  console.log(
    "Balance :",
    ethers.formatUnits(bal, decimals),
    symbol,
    "di",
    poolAddress
  );
}

main().catch((err) => {
  console.error("Error in check_watt_amoy:", err);
  process.exit(1);
});
