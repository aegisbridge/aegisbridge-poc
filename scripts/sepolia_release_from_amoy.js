// scripts/sepolia_release_from_amoy.js
// Skrip untuk rilis ATT di Sepolia berdasarkan return request dari Amoy
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();

  const bridgeAddress = process.env.SOURCE_BRIDGE_SEPOLIA;
  const attAddress = process.env.ATT_SEPOLIA;

  const returnUser = process.env.RETURN_USER;       // user di Amoy (tapi kita rilis ke address yang sama di Sepolia)
  const rawAmount = process.env.RETURN_AMOUNT;      // amount token (dalam satuan ATT, bukan wei)
  const rawNonce  = process.env.RETURN_NONCE;       // nonce reverse dari Amoy (currentReturnNonce)

  if (!bridgeAddress || !attAddress || !returnUser || !rawAmount || !rawNonce) {
    console.error("❌ ENV belum lengkap. Butuh:");
    console.error("   SOURCE_BRIDGE_SEPOLIA, ATT_SEPOLIA, RETURN_USER, RETURN_AMOUNT, RETURN_NONCE");
    process.exit(1);
  }

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  const token = await ethers.getContractAt(erc20Abi, attAddress);
  const decimals = await token.decimals();
  const symbol = await token.symbol();

  const parseUnits = ethers.parseUnits ?? ethers.utils.parseUnits;
  const formatUnits = ethers.formatUnits ?? ethers.utils.formatUnits;

  const amount = parseUnits(rawAmount, decimals);
  const nonce = BigInt(rawNonce);

  const userBefore = await token.balanceOf(returnUser);
  const bridgeBefore = await token.balanceOf(bridgeAddress);

  console.log("=== AegisBridge: Release from Amoy -> Sepolia ===");
  console.log("Network         :", hre.network.name);
  console.log("Relayer signer  :", signer.address);
  console.log("Bridge (Source) :", bridgeAddress);
  console.log("Token (ATT)     :", attAddress);
  console.log("Recipient       :", returnUser);
  console.log("Amount          :", rawAmount, symbol);
  console.log("Return nonce    :", rawNonce);
  console.log("User balance before   :", formatUnits(userBefore, decimals));
  console.log("Bridge balance before :", formatUnits(bridgeBefore, decimals));

  const SourceBridge = await ethers.getContractFactory("SourceBridge");
  const bridge = SourceBridge.attach(bridgeAddress);

  const tx = await bridge.releaseFromTarget(returnUser, amount, nonce);
  console.log("Release tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Release confirmed in block:", receipt.blockNumber);

  const userAfter = await token.balanceOf(returnUser);
  const bridgeAfter = await token.balanceOf(bridgeAddress);

  console.log("");
  console.log("=== After releaseFromTarget ===");
  console.log("User balance after   :", formatUnits(userAfter, decimals));
  console.log("Bridge balance after :", formatUnits(bridgeAfter, decimals));

  console.log("");
  console.log("✅ Release selesai untuk nonce:", rawNonce);
}

main().catch((err) => {
  console.error("❌ Error sepolia_release_from_amoy:", err);
  process.exitCode = 1;
});
