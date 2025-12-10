// scripts/amoy_request_return.js
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();

  const tokenAddress = process.env.WATT_AMOY;
  const bridgeAddress = process.env.TARGET_BRIDGE_AMOY;
  const rawAmount = process.env.AEGIS_RETURN_AMOUNT || "1000"; // dalam satuan token (bukan wei)

  if (!tokenAddress || !bridgeAddress) {
    console.error("❌ WATT_AMOY atau TARGET_BRIDGE_AMOY belum di-set di .env");
    process.exit(1);
  }

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];

  const token = await ethers.getContractAt(erc20Abi, tokenAddress);
  const decimals = await token.decimals();
  const symbol = await token.symbol();

  const parseUnits = ethers.parseUnits ?? ethers.utils.parseUnits;
  const formatUnits = ethers.formatUnits ?? ethers.utils.formatUnits;

  const amount = parseUnits(rawAmount, decimals);

  const userBefore = await token.balanceOf(signer.address);
  const bridgeBefore = await token.balanceOf(bridgeAddress);

  console.log("=== AegisBridge: Amoy -> Sepolia (requestReturnToSource) ===");
  console.log("Network      :", hre.network.name);
  console.log("User         :", signer.address);
  console.log("Token (wATT) :", tokenAddress);
  console.log("Bridge       :", bridgeAddress);
  console.log("Amount       :", rawAmount, symbol);
  console.log("User balance before   :", formatUnits(userBefore, decimals));
  console.log("Bridge balance before :", formatUnits(bridgeBefore, decimals));

  // 1) Approve
  const approveTx = await token.approve(bridgeAddress, amount);
  console.log("Approve tx :", approveTx.hash);
  await approveTx.wait();

  // 2) Panggil requestReturnToSource di TargetBridge
  const TargetBridge = await ethers.getContractFactory("TargetBridge");
  const bridge = TargetBridge.attach(bridgeAddress);

  const tx = await bridge.requestReturnToSource(amount);
  console.log("Return request tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Return request confirmed in block:", receipt.blockNumber);

  // 3) Baca nonce reverse terakhir
  const currentReturnNonce = await bridge.currentReturnNonce();

  const userAfter = await token.balanceOf(signer.address);
  const bridgeAfter = await token.balanceOf(bridgeAddress);

  console.log("");
  console.log("=== After requestReturnToSource ===");
  console.log("Current return nonce (Amoy -> Sepolia):", currentReturnNonce.toString());
  console.log("User balance after   :", formatUnits(userAfter, decimals));
  console.log("Bridge balance after :", formatUnits(bridgeAfter, decimals));

  console.log("");
  console.log("➡️  Gunakan return nonce ini di Sepolia untuk releaseFromTarget:", currentReturnNonce.toString());
}

main().catch((err) => {
  console.error("❌ Error amoy_request_return:", err);
  process.exitCode = 1;
});
