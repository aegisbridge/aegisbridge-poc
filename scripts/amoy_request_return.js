// scripts/amoy_request_return.js
// Request return wATT -> ATT (Amoy -> Sepolia)
// Jalankan dengan:
//   npx hardhat run scripts/amoy_request_return.js --network amoy
// atau kirim jumlah custom (dalam SATUAN TOKEN, bukan wei), contoh:
//   npx hardhat run scripts/amoy_request_return.js --network amoy -- 500

const { ethers } = require("hardhat");
require("dotenv").config();

const DECIMALS = 18;

function parseAmountArg() {
  // arg setelah "--" (opsional)
  const raw = process.argv[2];
  if (!raw) {
    // default 1000 wATT
    return 1000n;
  }
  try {
    return BigInt(raw);
  } catch (e) {
    throw new Error(`Argumen amount tidak valid: "${raw}". Gunakan angka bulat, contoh: 500`);
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  const user = await signer.getAddress();
  const net = await signer.provider.getNetwork();

  const WATT_AMOY = process.env.WATT_AMOY;
  const TARGET_BRIDGE_AMOY = process.env.TARGET_BRIDGE_AMOY;

  if (!WATT_AMOY || !TARGET_BRIDGE_AMOY) {
    throw new Error(
      "Missing WATT_AMOY atau TARGET_BRIDGE_AMOY di .env (pastikan pakai alamat wATT & TargetBridge v2 yang terbaru)"
    );
  }

  const humanAmount = parseAmountArg();          // contoh: 1000
  const amount = humanAmount * 10n ** 18n;       // ke wei (18 desimal)

  console.log("=== Request Return wATT -> ATT (Amoy → Sepolia) ===");
  console.log(`Network : ${net.chainId} (amoy)`);
  console.log(`User    : ${user}`);
  console.log(`wATT    : ${WATT_AMOY}`);
  console.log(`Bridge  : ${TARGET_BRIDGE_AMOY}`);
  console.log(`Amount  : ${humanAmount.toString()} wATT\n`);

  // NOTE: wATT pakai ABI yang sama dengan ATT (ERC20)
  const watt = await ethers.getContractAt("ATT", WATT_AMOY, signer);
  const bridge = await ethers.getContractAt("TargetBridge", TARGET_BRIDGE_AMOY, signer);

  const symbol = await watt.symbol();
  const balBefore = await watt.balanceOf(user);

  console.log(`Saldo ${symbol} sebelum (user): ${ethers.formatUnits(balBefore, DECIMALS)}`);

  if (balBefore < amount) {
    console.log(
      `❌ Saldo ${symbol} tidak cukup untuk requestReturn ${humanAmount.toString()} ${symbol}`
    );
    return;
  }

  // 1) Cek allowance ke bridge
  const allowance = await watt.allowance(user, TARGET_BRIDGE_AMOY);
  if (allowance < amount) {
    console.log(
      `Approve ${humanAmount.toString()} ${symbol} ke TargetBridge (butuh allowance baru)...`
    );
    const approveTx = await watt.approve(TARGET_BRIDGE_AMOY, amount);
    console.log(`Approve tx hash : ${approveTx.hash}`);
    const approveReceipt = await approveTx.wait();
    console.log(`Approve mined in block: ${approveReceipt.blockNumber}\n`);
  } else {
    console.log("Allowance sudah cukup → skip approve\n");
  }

  // 2) Panggil fungsi requestReturn di TargetBridge v2
  const fnName = process.env.TARGET_REQUEST_RETURN_FN || "requestReturn";
  console.log(
    `Call ${fnName}(${humanAmount.toString()} ${symbol}) pada TargetBridge v2 untuk minta return ke Sepolia...`
  );

  if (typeof bridge[fnName] !== "function") {
    throw new Error(
      `Fungsi "${fnName}" tidak ditemukan di TargetBridge. ` +
        `Set env TARGET_REQUEST_RETURN_FN ke nama fungsi yang benar kalau di Solidity namanya berbeda.`
    );
  }

  const returnTx = await bridge[fnName](amount);
  console.log(`Return tx hash : ${returnTx.hash}`);
  const receipt = await returnTx.wait();
  console.log(`Return tx mined in block: ${receipt.blockNumber}`);

  const balAfter = await watt.balanceOf(user);
  console.log(`\nSaldo ${symbol} sesudah (user): ${ethers.formatUnits(balAfter, DECIMALS)}`);

  console.log(
    "\n➡️  Jika `testnet_relayer_v2.js` lagi running, relayer akan nangkep event `ReturnRequested` ini di Amoy " +
      "dan otomatis call unlock di SourceBridge (Sepolia) supaya ATT kamu balik."
  );
}

main().catch((err) => {
  console.error("Error amoy_request_return:", err);
  process.exit(1);
});
