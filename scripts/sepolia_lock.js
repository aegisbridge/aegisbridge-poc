// scripts/sepolia_lock.js

require("dotenv").config();
const hre = require("hardhat");
const { getSepoliaProvider } = require("./providers");

// Default 1000 ATT tiap lock (bisa diubah via .env)
const LOCK_AMOUNT_ATT = process.env.LOCK_AMOUNT_ATT || "1000";

async function main() {
  const { ethers } = hre;

  const pk = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY atau DEPLOYER_PRIVATE_KEY belum di-set di .env");

  const attAddress = process.env.ATT_SEPOLIA;
  const bridgeAddress = process.env.SEPOLIA_SOURCE_BRIDGE;

  if (!attAddress) throw new Error("ATT_SEPOLIA belum di-set di .env");
  if (!bridgeAddress) throw new Error("SEPOLIA_SOURCE_BRIDGE belum di-set di .env");

  const provider = getSepoliaProvider();
  const wallet = new ethers.Wallet(pk, provider);

  // Minimal ERC20 ABI
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
  ];

  // Load ABI SourceBridge dari artifacts
  const sourceBridgeJson = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
  const sourceBridgeAbi = sourceBridgeJson.abi;

  const att = new ethers.Contract(attAddress, erc20Abi, wallet);
  const sourceBridge = new ethers.Contract(bridgeAddress, sourceBridgeAbi, wallet);

  const [decimals, symbol] = await Promise.all([
    att.decimals(),
    att.symbol().catch(() => "ATT"),
  ]);

  const amount = ethers.parseUnits(LOCK_AMOUNT_ATT, decimals);

  const [userBeforeRaw, bridgeBeforeRaw] = await Promise.all([
    att.balanceOf(wallet.address),
    att.balanceOf(bridgeAddress),
  ]);

  const userBefore = ethers.formatUnits(userBeforeRaw, decimals);
  const bridgeBefore = ethers.formatUnits(bridgeBeforeRaw, decimals);

  console.log("Network : ", "sepolia");
  console.log("Deployer:", wallet.address);
  console.log(`${symbol} before:`, userBefore);
  console.log(`${symbol} bridge before:`, bridgeBefore);

  if (userBeforeRaw < amount) {
    throw new Error(
      `Saldo ${symbol} tidak cukup. Punya ${userBefore}, mau lock ${LOCK_AMOUNT_ATT} ${symbol}`
    );
  }

  // Cek allowance & approve kalau kurang
  const allowanceRaw = await att.allowance(wallet.address, bridgeAddress);
  if (allowanceRaw < amount) {
    console.log("Approve diperlukan...");
    const txApprove = await att.approve(bridgeAddress, amount);
    console.log("Approve tx:", txApprove.hash);
    const receiptApprove = await txApprove.wait();
    console.log("Approve mined in block:", receiptApprove.blockNumber);
  } else {
    console.log("Approve cukup, skip approve.");
  }

  // Panggil fungsi lock di SourceBridge (coba lock(), kalau gagal lockTokens())
  let txLock;
  try {
    if (typeof sourceBridge.lock === "function") {
      txLock = await sourceBridge.lock(amount);
    } else {
      throw new Error("lock() tidak ada, coba lockTokens()");
    }
  } catch (e1) {
    try {
      if (typeof sourceBridge.lockTokens === "function") {
        txLock = await sourceBridge.lockTokens(amount);
      } else {
        throw new Error("lockTokens() juga tidak ada di SourceBridge");
      }
    } catch (e2) {
      console.error("Gagal memanggil lock() maupun lockTokens() di SourceBridge");
      throw e2;
    }
  }

  console.log("Lock tx   :", txLock.hash);
  const receiptLock = await txLock.wait();
  console.log("Locked in block:", receiptLock.blockNumber);

  const [userAfterRaw, bridgeAfterRaw] = await Promise.all([
    att.balanceOf(wallet.address),
    att.balanceOf(bridgeAddress),
  ]);

  const userAfter = ethers.formatUnits(userAfterRaw, decimals);
  const bridgeAfter = ethers.formatUnits(bridgeAfterRaw, decimals);

  console.log(`${symbol} after (user)  :`, userAfter);
  console.log(`${symbol} after (bridge):`, bridgeAfter);

    // Decode event Locked kalau ada
  try {
    const logs = receiptLock.logs || [];
    let parsedLocked = null;

    for (const log of logs) {
      // Pastikan dari SourceBridge
      if (log.address.toLowerCase() !== bridgeAddress.toLowerCase()) continue;

      try {
        const parsed = sourceBridge.interface.parseLog({
          data: log.data,
          topics: log.topics,
        });

        if (parsed.name === "Locked") {
          parsedLocked = parsed;
          break;
        }
      } catch (e) {
        // Bukan event Locked, skip
      }
    }

    if (parsedLocked) {
      const { user, amount, nonce } = parsedLocked.args;
      console.log("\n➡️  Locked event decoded dari log:");
      console.log("    user  :", user);
      console.log("    amount:", ethers.formatUnits(amount, decimals));
      console.log("    nonce :", nonce.toString());
    } else {
      console.log(
        "⚠️  Lock tx sukses, tapi tidak berhasil decode nonce dari event Locked (cek di explorer kalau perlu)."
      );
    }
  } catch (err) {
    console.log(
      "⚠️  Lock tx sukses, tapi gagal decode event Locked (mungkin ABI/event name beda)."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error sepolia_lock:", err);
    process.exit(1);
  });
