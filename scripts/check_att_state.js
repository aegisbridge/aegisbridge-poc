require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.TEST_SENDER_PRIVATE_KEY;
  const bridgeAddress = process.env.SEPOLIA_BRIDGE_ADDRESS;
  const attAddress =
    process.env.ATT_SEPOLIA_ADDRESS ||
    "0xDc925c125DC7b51946031761c1693eA6238Bf3fb"; // dari log relayer

  if (!rpcUrl || !pk || !bridgeAddress) {
    throw new Error("SEPOLIA_RPC_URL / TEST_SENDER_PRIVATE_KEY / SEPOLIA_BRIDGE_ADDRESS belum lengkap di .env");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  const erc20Abi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)"
  ];

  const token = new ethers.Contract(attAddress, erc20Abi, provider);

  const [symbol, decimals, balance, allowance] = await Promise.all([
    token.symbol(),
    token.decimals(),
    token.balanceOf(wallet.address),
    token.allowance(wallet.address, bridgeAddress),
  ]);

  console.log("Wallet        :", wallet.address);
  console.log("ATT address   :", attAddress);
  console.log("Symbol/dec    :", symbol, "/", decimals);
  console.log("Balance       :", ethers.formatUnits(balance, decimals));
  console.log("Allowance --> Bridge:", ethers.formatUnits(allowance, decimals));
}

main().catch((err) => {
  console.error("Error in check_att_state:", err);
  process.exit(1);
});
