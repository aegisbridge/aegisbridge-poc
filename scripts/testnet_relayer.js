// scripts/testnet_relayer_v2.js
//
// AegisBridge v2 Testnet Relayer
// Forward:  Sepolia  SourceBridge.Locked          -> Amoy TargetBridge.mintFromSource
// Reverse:  Amoy     TargetBridge.ReturnRequested -> Sepolia SourceBridge.unlockFromTarget (atau lain, lihat catatan)
//
// Jalankan dengan:
//   node scripts/testnet_relayer_v2.js
//
// Pastikan .env berisi minimal:
//   SEPOLIA_RPC_URL, (optional SEPOLIA_RPC_URL_2, SEPOLIA_RPC_URL_3)
//   AMOY_RPC_URL,    (optional AMOY_RPC_URL_2, AMOY_RPC_URL_3)
//   PRIVATE_KEY / DEPLOYER_PRIVATE_KEY
//   SEPOLIA_SOURCE_BRIDGE / SOURCE_BRIDGE_SEPOLIA / BRIDGE_CONTRACT_SEPOLIA
//   TARGET_BRIDGE_AMOY / BRIDGE_CONTRACT_AMOY
//   ATT_SEPOLIA
//   WATT_AMOY
//   (opsional) RELAYER_* variabel lain
//

require("dotenv").config();
const { ethers } = require("ethers");

// ---------- Helper util ----------

function now() {
  return new Date().toISOString();
}

function log(prefix, msg, ...rest) {
  console.log(`[${now()}] [${prefix}] ${msg}`, ...rest);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ignore "filter not found" noise from some RPC providers
function logProviderError(label, err) {
  try {
    const rpcCode = err?.error?.code;
    const rpcMsg = err?.error?.message;

    if (rpcCode === -32000 && rpcMsg === "filter not found") {
      console.warn(
        `[${now()}] [${label}] RPC reset filter (filter not found). Ethers akan auto re-subscribe, aman diabaikan.`
      );
      return;
    }
  } catch (_) {
    // ignore
  }

  console.error(`[${now()}] [${label}] Provider error:`, err);
}

// Create JsonRpcProvider or FallbackProvider from multiple URLs
function makeFallbackProvider(label, chainId, urls, pollIntervalMs) {
  const cleanUrls = urls.filter((u) => !!u && u.trim() !== "");

  if (cleanUrls.length === 0) {
    throw new Error(`Tidak ada RPC URL untuk ${label} (cek .env)`);
  }

  console.log(`\n[RPC][${label}] dipakai:`);
  cleanUrls.forEach((url, i) => {
    const tag = i === 0 ? "primary" : `backup #${i}`;
    console.log(`  - (${tag}) ${url}`);
  });

  const providers = cleanUrls.map(
    (url) =>
      new ethers.JsonRpcProvider(url, {
        chainId,
        name: label,
      })
  );

  if (providers.length === 1) {
    providers[0].pollingInterval = pollIntervalMs;
    providers[0].on("error", (err) => logProviderError(label, err));
    return providers[0];
  }

  const fallback = new ethers.FallbackProvider(providers);
  fallback.pollingInterval = pollIntervalMs;
  fallback.on("error", (err) => logProviderError(label, err));
  return fallback;
}

// ---------- Env & config ----------

const NETWORK_ENV = process.env.NETWORK_ENV || "testnet";

const DRY_RUN =
  (process.env.RELAYER_DRY_RUN || "false").toString().toLowerCase() === "true";

const MAX_RETRIES = parseInt(process.env.RELAYER_MAX_RETRIES || "3", 10);
const RETRY_DELAY_MS = parseInt(process.env.RELAYER_RETRY_DELAY_MS || "10000", 10);
const POLL_INTERVAL_MS = parseInt(
  process.env.RELAYER_POLL_INTERVAL_MS || "5000",
  10
);

const FROM_BLOCK_SEPOLIA = process.env.RELAYER_FROM_BLOCK_SEPOLIA
  ? parseInt(process.env.RELAYER_FROM_BLOCK_SEPOLIA, 10)
  : null;
const FROM_BLOCK_AMOY = process.env.RELAYER_FROM_BLOCK_AMOY
  ? parseInt(process.env.RELAYER_FROM_BLOCK_AMOY, 10)
  : null;

const DISABLE_SYNC =
  (process.env.RELAYER_DISABLE_SYNC || "false").toString().toLowerCase() ===
  "true";

const MINT_GAS_LIMIT = BigInt(process.env.RELAYER_MINT_GAS_LIMIT || "300000");
const UNLOCK_GAS_LIMIT = BigInt(process.env.RELAYER_UNLOCK_GAS_LIMIT || "300000");

// RPC URLs (multi)
const sepoliaRpcUrls = [
  process.env.SEPOLIA_RPC_URL,
  process.env.SEPOLIA_RPC_URL_2,
  process.env.SEPOLIA_RPC_URL_3,
];

const amoyRpcUrls = [
  process.env.AMOY_RPC_URL,
  process.env.AMOY_RPC_URL_2,
  process.env.AMOY_RPC_URL_3,
];

// Contract addresses
const SOURCE_BRIDGE_ADDRESS =
  process.env.SOURCE_BRIDGE_SEPOLIA ||
  process.env.SEPOLIA_SOURCE_BRIDGE ||
  process.env.BRIDGE_CONTRACT_SEPOLIA;

const TARGET_BRIDGE_ADDRESS =
  process.env.TARGET_BRIDGE_AMOY ||
  process.env.BRIDGE_CONTRACT_AMOY ||
  process.env.AMOY_TARGET_BRIDGE;

const ATT_SEPOLIA_ADDRESS = process.env.ATT_SEPOLIA;
const WATT_AMOY_ADDRESS =
  process.env.WATT_AMOY || process.env.AMOY_WATT || process.env.AMOY_WATT_ADDRESS;

const RELAYER_PK = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!RELAYER_PK) {
  throw new Error("Missing DEPLOYER_PRIVATE_KEY / PRIVATE_KEY di .env");
}

if (!SOURCE_BRIDGE_ADDRESS || !TARGET_BRIDGE_ADDRESS) {
  throw new Error(
    "Missing SOURCE_BRIDGE_SEPOLIA / SEPOLIA_SOURCE_BRIDGE atau TARGET_BRIDGE_AMOY / BRIDGE_CONTRACT_AMOY di .env"
  );
}

if (!ATT_SEPOLIA_ADDRESS || !WATT_AMOY_ADDRESS) {
  throw new Error("Missing ATT_SEPOLIA atau WATT_AMOY di .env");
}

// ---------- ABIs ----------

const sourceBridgeArtifact = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
const targetBridgeArtifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

// Minimal ERC20 ABI (untuk ATT & wATT)
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// ---------- Main ----------

async function main() {
  // Providers + signers
  const sepoliaProvider = makeFallbackProvider(
    "sepolia",
    11155111,
    sepoliaRpcUrls,
    POLL_INTERVAL_MS
  );
  const amoyProvider = makeFallbackProvider(
    "amoy",
    80002,
    amoyRpcUrls,
    POLL_INTERVAL_MS
  );

  const sepoliaSigner = new ethers.Wallet(RELAYER_PK, sepoliaProvider);
  const amoySigner = new ethers.Wallet(RELAYER_PK, amoyProvider);

  const relayerAddress = await sepoliaSigner.getAddress();

  console.log("==============================================");
  console.log("=== AegisBridge v2 Testnet Relayer (Node) ====");
  console.log("==============================================");
  console.log("Env            :", NETWORK_ENV);
  console.log("Sepolia RPC    :", sepoliaRpcUrls.filter(Boolean)[0]);
  console.log("Amoy RPC       :", amoyRpcUrls.filter(Boolean)[0]);
  console.log("SourceBridge   :", SOURCE_BRIDGE_ADDRESS);
  console.log("TargetBridge   :", TARGET_BRIDGE_ADDRESS);
  console.log("ATT (Sepolia)  :", ATT_SEPOLIA_ADDRESS);
  console.log("wATT (Amoy)    :", WATT_AMOY_ADDRESS);
  console.log("Relayer wallet :", relayerAddress);
  console.log("Dry run        :", DRY_RUN);
  console.log("");

  // Contracts
  const sourceBridge = new ethers.Contract(
    SOURCE_BRIDGE_ADDRESS,
    sourceBridgeArtifact.abi,
    sepoliaProvider
  );

  const targetBridge = new ethers.Contract(
    TARGET_BRIDGE_ADDRESS,
    targetBridgeArtifact.abi,
    amoySigner // langsung dengan signer Amoy
  );

  const attSepolia = new ethers.Contract(
    ATT_SEPOLIA_ADDRESS,
    erc20Abi,
    sepoliaProvider
  );

  const wattAmoy = new ethers.Contract(WATT_AMOY_ADDRESS, erc20Abi, amoyProvider);

  // Token meta
  const [attSymbol, attDecimals, wattSymbol, wattDecimals] = await Promise.all([
    attSepolia.symbol(),
    attSepolia.decimals(),
    wattAmoy.symbol(),
    wattAmoy.decimals(),
  ]);

  log(
    "Meta",
    `ATT: symbol=${attSymbol}, decimals=${attDecimals} | wATT: symbol=${wattSymbol}, decimals=${wattDecimals}`
  );

  // ====== Sync (Catch Up) ======
  if (!DISABLE_SYNC) {
    await catchUpForwardLocked(
      sourceBridge,
      targetBridge,
      sepoliaProvider,
      attDecimals,
      "Forward"
    );
    await catchUpReverseReturnRequested(
      targetBridge,
      sourceBridge,
      amoyProvider,
      wattDecimals,
      "Reverse"
    );
  } else {
    log(
      "Meta",
      "RELAYER_DISABLE_SYNC=true → skip catch-up, langsung listen live events."
    );
  }

  // ====== Live listeners ======

  setupLiveForwardLocked(
    sourceBridge,
    targetBridge,
    attDecimals,
    "ForwardLive"
  );
  setupLiveReverseReturnRequested(
    targetBridge,
    sourceBridge,
    wattDecimals,
    "ReverseLive"
  );

  log(
    "Meta",
    "Relayer is now listening for bridge events on both networks... (Ctrl+C untuk stop)"
  );
}

// ---------- Forward: Locked (Sepolia) -> mintFromSource (Amoy) ----------

async function catchUpForwardLocked(
  sourceBridge,
  targetBridge,
  provider,
  attDecimals,
  prefix
) {
  const latest = await provider.getBlockNumber();

  // Default: lookback 2000 block kalau FROM_BLOCK_SEPOLIA tidak di-set
  const maxLookback = 2000;
  const startBlock = FROM_BLOCK_SEPOLIA || Math.max(0, latest - maxLookback);
  const endBlock = latest;
  const chunkSize = 10; // kecil, biar RPC nggak jebol

  log(
    "Forward",
    `Catching up Locked events on Sepolia from block ${startBlock} to ${endBlock} (chunkSize=${chunkSize})...`
  );

  let totalEvents = 0;

  for (let from = startBlock; from <= endBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, endBlock);
    log("Forward[CatchUp]", `queryFilter from block ${from} to ${to}`);

    const events = await sourceBridge.queryFilter("Locked", from, to);
    if (events.length > 0) {
      log("Forward[CatchUp]", `  -> got ${events.length} event(s)`);
    }

    for (const ev of events) {
      await handleLockedEvent(ev, sourceBridge, targetBridge, attDecimals, true);
      totalEvents += 1;
    }
  }

  log("Forward", `Total past Locked events found: ${totalEvents}`);
}

function setupLiveForwardLocked(
  sourceBridge,
  targetBridge,
  attDecimals,
  prefix
) {
  log("Forward", "Subscribing to Locked events on Sepolia (live)...");
  sourceBridge.on(
    "Locked",
    async (user, amount, nonce, event) => {
      try {
        const ev = event || { args: [user, amount, nonce] };
        await handleLockedEvent(ev, sourceBridge, targetBridge, attDecimals, false);
      } catch (err) {
        log(prefix, `Error in live Locked handler: ${err.message || err}`);
      }
    }
  );
}

async function isNonceProcessedOnTarget(targetBridge, nonce) {
  // Coba beberapa nama mapping yang umum
  try {
    if (typeof targetBridge.mintedNonces === "function") {
      return await targetBridge.mintedNonces(nonce);
    }
  } catch (_) {}

  try {
    if (typeof targetBridge.processedNonces === "function") {
      return await targetBridge.processedNonces(nonce);
    }
  } catch (_) {}

  // Kalau tidak ada, assume belum diproses; biar kontrak yang nge-revert kalau dobel
  return false;
}

async function handleLockedEvent(
  ev,
  sourceBridge,
  targetBridge,
  attDecimals,
  isPast
) {
  // ev.args: [user, amount, nonce]
  const user = ev.args[0];
  const amount = ev.args[1];
  const nonce = ev.args[2];

  const nonceNum = Number(nonce);
  const amountStr = ethers.formatUnits(amount, attDecimals);

  const kind = isPast ? "Forward[Past]" : "Forward[Live]";

  log(
    kind,
    `New Locked event: nonce=${nonceNum}, user=${user}, amount=${amountStr} ATT`
  );

  // Cek apakah nonce sudah pernah diproses di TargetBridge
  const processed = await isNonceProcessedOnTarget(targetBridge, nonce);
  if (processed) {
    log(kind, `Locked nonce=${nonceNum} already processed on TargetBridge, skipping`);
    return;
  }

  // Kirim mintFromSource ke TargetBridge (Amoy)
  log(
    kind,
    `Calling mintFromSource on Amoy: to=${user}, amount=${amountStr} ATT, nonce=${nonceNum}`
  );

  if (DRY_RUN) {
    log(kind, `DRY_RUN=true → tidak mengirim tx (simulasi saja).`);
    return;
  }

  const sendTx = async () => {
    return targetBridge.mintFromSource(user, amount, nonce, {
      gasLimit: MINT_GAS_LIMIT,
    });
  };

  await sendWithRetries(sendTx, kind, `mintFromSource(nonce=${nonceNum})`);
}

// ---------- Reverse: ReturnRequested (Amoy) -> unlock on Sepolia ----------

async function catchUpReverseReturnRequested(
  targetBridge,
  sourceBridge,
  provider,
  wattDecimals,
  prefix
) {
  const latest = await provider.getBlockNumber();

  const maxLookback = 2000;
  const startBlock = FROM_BLOCK_AMOY || Math.max(0, latest - maxLookback);
  const endBlock = latest;
  const chunkSize = 10;

  log(
    "Reverse",
    `Catching up ReturnRequested events on Amoy from block ${startBlock} to ${endBlock} (chunkSize=${chunkSize})...`
  );

  let totalEvents = 0;

  for (let from = startBlock; from <= endBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, endBlock);
    log("Reverse[CatchUp]", `queryFilter from block ${from} to ${to}`);

    const events = await targetBridge.queryFilter("ReturnRequested", from, to);
    if (events.length > 0) {
      log("Reverse[CatchUp]", `  -> got ${events.length} event(s)`);
    }

    for (const ev of events) {
      await handleReturnRequestedEvent(
        ev,
        targetBridge,
        sourceBridge,
        wattDecimals,
        true
      );
      totalEvents += 1;
    }
  }

  log("Reverse", `Total past ReturnRequested events found: ${totalEvents}`);
}

function setupLiveReverseReturnRequested(
  targetBridge,
  sourceBridge,
  wattDecimals,
  prefix
) {
  log("Reverse", "Subscribing to ReturnRequested events on Amoy (live)...");
  targetBridge.on(
    "ReturnRequested",
    async (user, amount, nonce, event) => {
      try {
        const ev = event || { args: [user, amount, nonce] };
        await handleReturnRequestedEvent(
          ev,
          targetBridge,
          sourceBridge,
          wattDecimals,
          false
        );
      } catch (err) {
        log(prefix, `Error in live ReturnRequested handler: ${err.message || err}`);
      }
    }
  );
}

async function handleReturnRequestedEvent(
  ev,
  targetBridge,
  sourceBridge,
  wattDecimals,
  isPast
) {
  const user = ev.args[0];
  const amount = ev.args[1];
  const nonce = ev.args[2];

  const nonceNum = Number(nonce);
  const amountStr = ethers.formatUnits(amount, wattDecimals);

  const kind = isPast ? "Reverse[Past]" : "Reverse[Live]";

  log(
    kind,
    `New ReturnRequested event: nonce=${nonceNum}, user=${user}, amount=${amountStr} wATT`
  );

  // Cari fungsi unlock yang tersedia di SourceBridge
  let unlockFnName = null;
  if (typeof sourceBridge.unlockFromTarget === "function") {
    unlockFnName = "unlockFromTarget";
  } else if (typeof sourceBridge.unlockToUser === "function") {
    unlockFnName = "unlockToUser";
  }

  if (!unlockFnName) {
    log(
      kind,
      "⚠️ SourceBridge tidak punya fungsi unlockFromTarget/unlockToUser di ABI. " +
        "Edit testnet_relayer_v2.js untuk memanggil fungsi unlock yang benar di SourceBridge."
    );
    return;
  }

  log(
    kind,
    `Calling ${unlockFnName} on Sepolia: to=${user}, amount=${amountStr} ATT, nonce=${nonceNum}`
  );

  if (DRY_RUN) {
    log(kind, `DRY_RUN=true → tidak mengirim tx (simulasi saja).`);
    return;
  }

  const sourceSigner = sourceBridge.runner; // provider atau signer?
  // Pastikan kita punya signer; kalau belum, kasih warning.
  if (!sourceSigner || !sourceSigner.provider) {
    log(
      kind,
      "⚠️ SourceBridge belum di-connect ke signer. " +
        "Jika perlu reverse bridge, update script untuk connect SourceBridge dengan signer Sepolia."
    );
    return;
  }

  const sendTx = async () => {
    // Panggil dinamis sesuai nama fungsi
    return sourceBridge[unlockFnName](user, amount, nonce, {
      gasLimit: UNLOCK_GAS_LIMIT,
    });
  };

  await sendWithRetries(sendTx, kind, `${unlockFnName}(nonce=${nonceNum})`);
}

// ---------- Tx helper with retries ----------

async function sendWithRetries(sendFn, prefix, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tx = await sendFn();
      log(prefix, `${label} tx sent: ${tx.hash} (attempt ${attempt})`);
      const receipt = await tx.wait();
      const status = receipt.status;

      if (status === 1n || status === 1) {
        log(prefix, `${label} tx confirmed in block ${receipt.blockNumber}, status=1`);
      } else {
        log(
          prefix,
          `⚠️ ${label} tx mined tapi status != 1 (status=${status}). Cek di explorer.`
        );
      }
      return;
    } catch (err) {
      const code = err?.code;
      const reason = err?.reason || err?.shortMessage || err?.message || String(err);

      // Khusus insufficient funds → jangan terus-terusan retry
      if (code === "INSUFFICIENT_FUNDS") {
        log(
          prefix,
          `${label} gagal (INSUFFICIENT_FUNDS): ${reason}. Tambah native gas (ETH/MATIC) dulu di wallet relayer.`
        );
        return;
      }

      log(
        prefix,
        `${label} attempt ${attempt} gagal: ${reason}`
      );

      if (attempt < MAX_RETRIES) {
        log(
          prefix,
          `Retry dalam ${RETRY_DELAY_MS} ms (attempt berikutnya: ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(RETRY_DELAY_MS);
      } else {
        log(prefix, `${label} gagal setelah ${MAX_RETRIES} percobaan.`);
      }
    }
  }
}

// ---------- Run ----------

main().catch((err) => {
  console.error(`[${now()}] [Fatal]`, err);
  process.exitCode = 1;
});
