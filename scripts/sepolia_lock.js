// scripts/sepolia_lock.js
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();

  const tokenAddress = process.env.ATT_SEPOLIA;
  const bridgeAddress = process.env.SOURCE_BRIDGE_SEPOLIA;
  const rawAmount = process.env.AEGIS_LOCK_AMOUNT || "1000"; // 1000 ATT default

  if (!tokenAddress || !bridgeAddress) {
    console.error("❌ ATT_SEPOLIA atau SOURCE_BRIDGE_SEPOLIA belum di-set di .env");
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

  console.log("Network : ", hre.network.name);
  console.log("Deployer:", signer.address);
  console.log(`${symbol} before:`, formatUnits(userBefore, decimals));
  console.log(`${symbol} bridge before:`, formatUnits(bridgeBefore, decimals));

  // 1) Approve ATT ke SourceBridge v2
  const approveTx = await token.approve(bridgeAddress, amount);
  console.log("Approve tx:", approveTx.hash);
  await approveTx.wait();

  // 2) Panggil lock(amount) di SourceBridge v2 (SATU ARGUMEN)
  const SourceBridge = await ethers.getContractFactory("SourceBridge");
  const bridge = SourceBridge.attach(bridgeAddress);

  const lockTx = await bridge.lock(amount);
  console.log("Lock tx   :", lockTx.hash);
  const receipt = await lockTx.wait();
  console.log("Locked in block:", receipt.blockNumber);

  const currentNonce = await bridge.currentNonce();

  const userAfter = await token.balanceOf(signer.address);
  const bridgeAfter = await token.balanceOf(bridgeAddress);

  console.log(`${symbol} after (user)  :`, formatUnits(userAfter, decimals));
  console.log(`${symbol} after (bridge):`, formatUnits(bridgeAfter, decimals));
  console.log("");
  console.log("➡️  Current nonce on SourceBridge v2:", currentNonce.toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
