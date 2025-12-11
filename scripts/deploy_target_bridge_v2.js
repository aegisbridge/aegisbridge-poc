// scripts/deploy_target_bridge_v2.js
const { ethers } = require("hardhat");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReceipt(txHash, timeoutMs = 5 * 60 * 1000, pollMs = 5000) {
  const provider = ethers.provider;
  const start = Date.now();

  console.log(`[Wait] Waiting for receipt for tx: ${txHash}`);

  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt && receipt.blockNumber) {
      console.log(
        `[Wait] ✅ Mined in block ${receipt.blockNumber}, status=${receipt.status}`
      );
      return receipt;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      `[Wait] Still pending after ~${elapsed}s... polling again in ${
        pollMs / 1000
      }s`
    );
    await sleep(pollMs);
  }

  console.log(
    `[Wait] Timeout after ~${Math.round(
      (Date.now() - start) / 1000
    )}s. Receipt still not found (pending / dropped).`
  );
  return null;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  // Ambil config dari .env
  const WATT =
    process.env.AMOY_WATT || process.env.WATT_AMOY || process.env.AMOY_WATT;
  const RELAYER =
    process.env.AMOY_RELAYER ||
    process.env.BRIDGE_RELAYER ||
    deployer.address;
  const SEPOLIA_SOURCE_BRIDGE = process.env.SEPOLIA_SOURCE_BRIDGE;

  if (!WATT || !SEPOLIA_SOURCE_BRIDGE) {
    throw new Error(
      "Missing WATT_AMOY/AMOY_WATT atau SEPOLIA_SOURCE_BRIDGE di .env"
    );
  }

  console.log("=== Deploy TargetBridge v2 (Amoy) ===");
  console.log(`Network  : ${net.name} (chainId=${net.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`wATT     : ${WATT}`);
  console.log(`Relayer  : ${RELAYER}`);
  console.log(`Remote SourceBridge (Sepolia) : ${SEPOLIA_SOURCE_BRIDGE}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(
    "Balance  :",
    ethers.formatUnits(balance, "ether"),
    "MATIC (native gas token)"
  );

  const TargetBridge = await ethers.getContractFactory("TargetBridge");

  // Build tx deploy
  const deployTxReq = await TargetBridge.getDeployTransaction(
    WATT,
    RELAYER,
    SEPOLIA_SOURCE_BRIDGE
  );

  // Estimasi gas + buffer
  let gasLimit = deployTxReq.gasLimit;
  if (!gasLimit) {
    const estimated = await ethers.provider.estimateGas(deployTxReq);
    gasLimit = (estimated * 120n) / 100n; // +20%
    deployTxReq.gasLimit = gasLimit;
  }

  // Gas price
  const feeData = await ethers.provider.getFeeData();
  const maxFeePerGas =
    feeData.maxFeePerGas ?? ethers.parseUnits("50", "gwei");
  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2", "gwei");

  deployTxReq.maxFeePerGas = maxFeePerGas;
  deployTxReq.maxPriorityFeePerGas = maxPriorityFeePerGas;

  console.log(
    "maxPriorityFee    :",
    ethers.formatUnits(maxPriorityFeePerGas, "gwei"),
    "gwei"
  );
  console.log(
    "maxFeePerGas      :",
    ethers.formatUnits(maxFeePerGas, "gwei"),
    "gwei"
  );
  console.log("gasLimit          :", gasLimit.toString());

  console.log("Deploying TargetBridge v2...");
  const txResponse = await deployer.sendTransaction(deployTxReq);
  console.log("Deploy tx hash:", txResponse.hash);

  const receipt = await waitForReceipt(txResponse.hash);

  if (!receipt) {
    console.log(`
⚠️  No receipt after waiting. The transaction may still be pending or has been dropped.
   → Cek tx hash ini di Amoy explorer: ${txResponse.hash}
   → Kalau tetap tidak muncul, coba jalankan lagi pakai --network amoy_backup
`);
    return;
  }

  // Normalize status (bisa number atau bigint)
  const status =
    typeof receipt.status === "bigint"
      ? receipt.status
      : BigInt(receipt.status ?? 0);

  if (status !== 1n) {
    console.log(
      "❌ Tx mined tapi status != 1 (gagal). Cek di explorer untuk detail."
    );
  } else {
    console.log("✅ Deploy sukses (status=1)");
  }

  if (receipt.contractAddress) {
    console.log("📦 Contract deployed at:", receipt.contractAddress);
    console.log(`
Set di .env:
TARGET_BRIDGE_AMOY="${receipt.contractAddress}"
`);
  } else {
    console.log(
      "ℹ️  Tidak ada contractAddress di receipt (mungkin ini bukan tx create?). Cek di explorer."
    );
  }
}

main().catch((err) => {
  console.error("❌ Error deploy_target_bridge_v2:", err);
  process.exit(1);
});
