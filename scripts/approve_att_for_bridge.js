require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.TEST_SENDER_PRIVATE_KEY;
  const bridgeAddress = process.env.SEPOLIA_BRIDGE_ADDRESS;
  const attAddress =
    process.env.ATT_SEPOLIA_ADDRESS ||
    "0xDc925c125DC7b51946031761c1693eA6238Bf3fb"; // ATT di Sepolia (dari log relayer)

  if (!rpcUrl || !pk || !bridgeAddress) {
    throw new Error("SEPOLIA_RPC_URL / TEST_SENDER_PRIVATE_KEY / SEPOLIA_BRIDGE_ADDRESS belum lengkap di .env");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  const erc20Abi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];

  const token = new ethers.Contract(attAddress, erc20Abi, wallet);

  const [symbol, decimals, balanceBefore, allowanceBefore] = await Promise.all([
    token.symbol(),
    token.decimals(),
    token.balanceOf(wallet.address),
    token.allowance(wallet.address, bridgeAddress),
  ]);

  console.log("Wallet        :", wallet.address);
  console.log("Token         :", symbol, "(", attAddress, ")");
  console.log("Balance       :", ethers.formatUnits(balanceBefore, decimals));
  console.log("Allowance now :", ethers.formatUnits(allowanceBefore, decimals));

  // APPROVE AMOUNT — boleh besar sekalian
  const approveAmount = ethers.parseUnits("1000000", decimals);

  console.log("Approving     :", ethers.formatUnits(approveAmount, decimals), symbol, "to bridge", bridgeAddress);

  const tx = await token.approve(bridgeAddress, approveAmount);
  console.log("Approve tx hash:", tx.hash);
  console.log(">>> Tunggu beberapa detik sampai tx confirm, lalu jalankan lagi check_att_state.js untuk cek allowance.");
}

main().catch((err) => {
  console.error("Error in approve_att_for_bridge:", err);
  process.exit(1);
});
