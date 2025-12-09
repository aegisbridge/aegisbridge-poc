// scripts/testnet_relayer.js
// AegisBridge v0.3.1 Testnet Relayer
//
// - Listens to:
//   - Locked(user, recipient, amount, nonce) on SourceBridge (Sepolia)
//   - BurnToSource(from, to, amount, burnNonce) on TargetBridge (Amoy)
// - Calls:
//   - mintFromSource(recipient, amount, nonce) on TargetBridge
//   - unlockFromTarget(recipient, amount, burnNonce) on SourceBridge
//
// v0.3.1 features:
//   - DRY_RUN mode (no tx sent, just log what *would* happen)
//   - Retry logic for tx sending
//   - Chunked catch-up (eth_getLogs max 10-block window for Alchemy free tier)
//   - Optional disable sync via RELAYER_DISABLE_SYNC
//   - Persistent state in relayer_state.json (processed nonces)
//   - More robust reading of deployment JSON (ATT / wATT keys)

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// ------------------------
// Config
// ------------------------

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !AMOY_RPC_URL || !PRIVATE_KEY) {
  console.error(
    "[FATAL] Missing SEPOLIA_RPC_URL / AMOY_RPC_URL / PRIVATE_KEY in .env"
  );
  process.exit(1);
}

// Relayer behavior config
const DRY_RUN =
  (process.env.RELAYER_DRY_RUN || "false").toLowerCase() === "true";
const MAX_RETRIES = Number(process.env.RELAYER_MAX_RETRIES || "3");
const RETRY_DELAY_MS = Number(process.env.RELAYER_RETRY_DELAY_MS || "10000");
const DISABLE_SYNC =
  (process.env.RELAYER_DISABLE_SYNC || "false").toLowerCase() === "true";

const FROM_BLOCK_SEPOLIA = process.env.RELAYER_FROM_BLOCK_SEPOLIA
  ? Number(process.env.RELAYER_FROM_BLOCK_SEPOLIA)
  : null;
const FROM_BLOCK_AMOY = process.env.RELAYER_FROM_BLOCK_AMOY
  ? Number(process.env.RELAYER_FROM_BLOCK_AMOY)
  : null;

// eth_getLogs window limit (Alchemy free tier: max 10 blocks)
const LOG_CHUNK_SIZE = 10;

// Files
const ROOT_DIR = path.join(__dirname, "..");
const DEPLOYMENTS_FILE = path.join(
  ROOT_DIR,
  "deployments",
  "testnet_sepolia_amoy.json"
);
const STATE_FILE = path.join(ROOT_DIR, "relayer_state.json");
const LOG_FILE = path.join(ROOT_DIR, "relayer.log");

// ------------------------
// Utils: logging & state
// ------------------------

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n", { encoding: "utf8" });
  } catch (e) {
    // Do not crash on log file error
  }
}

function loadJsonSafe(file, defaultValue) {
  try {
    if (!fs.existsSync(file)) return defaultValue;
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    log(`[WARN] Failed to read/parse ${file}: ${e.message}`);
    return defaultValue;
  }
}

function saveJsonSafe(file, value) {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
  } catch (e) {
    log(`[WARN] Failed to write ${file}: ${e.message}`);
  }
}

// Load deployments
const deployments = loadJsonSafe(DEPLOYMENTS_FILE, {});
if (!deployments.sepolia || !deployments.amoy) {
  console.error(
    `[FATAL] Missing sepolia/amoy sections in ${DEPLOYMENTS_FILE}. Deploy v0.2, then try again.`
  );
  process.exit(1);
}

const sepoliaSection = deployments.sepolia;
const amoySection = deployments.amoy;

// Try multiple key names for ATT & wATT (robust to small JSON changes)
const attAddress =
  sepoliaSection.ATT ||
  sepoliaSection.TestToken ||
  sepoliaSection.token ||
  sepoliaSection.Token;

const wattAddress =
  amoySection.WrappedTestToken ||
  amoySection.wATT ||
  amoySection.Token ||
  amoySection.token;

if (!attAddress) {
  console.error(
    "[FATAL] Could not find ATT address in deployments.sepolia (tried ATT / TestToken / token / Token)"
  );
  process.exit(1);
}
if (!wattAddress) {
  console.error(
    "[WARN] Could not find WrappedTestToken address in deployments.amoy (tried WrappedTestToken / wATT / Token / token). Logging will show undefined, but relayer can still work using TargetBridge only."
  );
}

// Load relayer state (processed nonces)
let relayerState = loadJsonSafe(STATE_FILE, {
  processedLockNonces: {}, // lock nonce on source (for mintFromSource)
  processedBurnNonces: {}, // burn nonce on target (for unlockFromTarget)
});

// Persist state helpers
function markLockNonceProcessed(nonce) {
  relayerState.processedLockNonces[nonce.toString()] = true;
  saveJsonSafe(STATE_FILE, relayerState);
}

function markBurnNonceProcessed(burnNonce) {
  relayerState.processedBurnNonces[burnNonce.toString()] = true;
  saveJsonSafe(STATE_FILE, relayerState);
}

// ------------------------
// Providers & Contracts
// ------------------------

const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);

const sepoliaWallet = new ethers.Wallet(PRIVATE_KEY, sepoliaProvider);
const amoyWallet = new ethers.Wallet(PRIVATE_KEY, amoyProvider);

// Load ABIs from Hardhat artifacts
const sourceBridgeAbi = require(path.join(
  ROOT_DIR,
  "artifacts",
  "contracts",
  "SourceBridge.sol",
  "SourceBridge.json"
)).abi;
const targetBridgeAbi = require(path.join(
  ROOT_DIR,
  "artifacts",
  "contracts",
  "TargetBridge.sol",
  "TargetBridge.json"
)).abi;

const sourceBridgeAddress = sepoliaSection.SourceBridge;
const targetBridgeAddress = amoySection.TargetBridge;

if (!sourceBridgeAddress || !targetBridgeAddress) {
  console.error(
    "[FATAL] Missing SourceBridge / TargetBridge addresses in deployments JSON"
  );
  process.exit(1);
}

const sourceBridge = new ethers.Contract(
  sourceBridgeAddress,
  sourceBridgeAbi,
  sepoliaWallet
);
const targetBridge = new ethers.Contract(
  targetBridgeAddress,
  targetBridgeAbi,
  amoyWallet
);

// ------------------------
// Helpers
// ------------------------

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry sending tx
async function sendWithRetry(fn, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (DRY_RUN) {
        log(`[DRY_RUN] Would send tx: ${label}`);
        return null;
      }
      log(`[TX] ${label} — attempt ${attempt}/${MAX_RETRIES}`);
      const tx = await fn();
      log(`[TX] ${label} sent: ${tx.hash}`);
      const receipt = await tx.wait();
      log(
        `[TX] ${label} confirmed in block ${receipt.blockNumber} (status=${receipt.status})`
      );
      return receipt;
    } catch (err) {
      lastError = err;
      const short = err.shortMessage || err.message || String(err);

      // Non-retryable errors
      if (
        short.includes("already processed") ||
        short.includes("nonce already processed") ||
        short.includes("paused") ||
        short.includes("Pausable: paused")
      ) {
        log(
          `[TX-ERROR] ${label} non-retryable error: ${short} — not retrying.`
        );
        break;
      }

      log(
        `[TX-ERROR] ${label} failed on attempt ${attempt}/${MAX_RETRIES}: ${short}`
      );
      if (attempt < MAX_RETRIES) {
        log(
          `[TX] Waiting ${RETRY_DELAY_MS} ms before retry (label=${label})...`
        );
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  log(`[TX-ERROR] ${label} giving up after ${MAX_RETRIES} attempts.`);
  if (lastError) {
    log(`[TX-ERROR-DETAIL]`, lastError);
  }
  return null;
}

// Chunked queryFilter to respect Alchemy free tier 10-block limit
async function queryEventsChunked(contract, filter, fromBlock, toBlock, label) {
  const events = [];
  const chunkSize = LOG_CHUNK_SIZE;

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    log(
      `[SYNC] [${label}] Querying events from block ${start} to ${end} (chunkSize=${chunkSize})...`
    );
    try {
      const chunk = await contract.queryFilter(filter, start, end);
      log(
        `[SYNC] [${label}] Got ${chunk.length} event(s) in chunk ${start}-${end}.`
      );
      events.push(...chunk);
    } catch (e) {
      const short = e.shortMessage || e.message || String(e);
      log(
        `[SYNC-ERROR] [${label}] Failed to query logs ${start}-${end}: ${short}`
      );
      // Jika provider limit terlalu ketat, kita lanjut saja — event masih bisa ditangkap live subscription.
    }
    // kecilkan speed agar tidak spam RPC
    await sleep(300);
  }

  return events;
}

// ------------------------
// Handlers
// ------------------------

async function handleLockedEvent(sender, recipient, amount, nonce, event) {
  const nonceStr = nonce.toString();
  const a = ethers.formatUnits(amount, 18);

  log(
    `\n[LOCK EVENT] Sepolia Locked → nonce=${nonceStr}, amount=${a}, sender=${sender}, recipient=${recipient}, tx=${event.log.transactionHash}`
  );

  // Check local state
  if (relayerState.processedLockNonces[nonceStr]) {
    log(
      `[LOCK] nonce=${nonceStr} already marked as processed in relayer_state.json, skipping mint.`
    );
    return;
  }

  // On-chain check: processedNonces on TargetBridge (if exposed)
  let alreadyProcessed = false;
  try {
    if (typeof targetBridge.processedNonces === "function") {
      alreadyProcessed = await targetBridge.processedNonces(nonce);
    }
  } catch (e) {
    log(
      `[WARN] Failed to read processedNonces(${nonceStr}) on TargetBridge: ${e.message}`
    );
  }

  if (alreadyProcessed) {
    log(
      `[LOCK] nonce=${nonceStr} already processed on TargetBridge (on-chain), marking as processed locally and skipping.`
    );
    markLockNonceProcessed(nonce);
    return;
  }

  // Call mintFromSource on Amoy
  log(
    `[MINT] Preparing mintFromSource on Amoy: user=${recipient}, amount=${a}, nonce=${nonceStr}`
  );

  const receipt = await sendWithRetry(
    () => targetBridge.mintFromSource(recipient, amount, nonce),
    `mintFromSource(nonce=${nonceStr})`
  );

  if (receipt && receipt.status === 1) {
    log(
      `[MINT] mintFromSource successful for nonce=${nonceStr}, tx=${receipt.transactionHash}`
    );
    markLockNonceProcessed(nonce);
  } else if (DRY_RUN) {
    log(
      `[MINT][DRY_RUN] Skipped sending tx, but mintFromSource would have been called for nonce=${nonceStr}.`
    );
  }
}

async function handleBurnToSourceEvent(from, to, amount, burnNonce, event) {
  const nonceStr = burnNonce.toString();
  const a = ethers.formatUnits(amount, 18);

  log(
    `\n[BURN EVENT] Amoy BurnToSource → burnNonce=${nonceStr}, amount=${a}, from=${from}, to=${to}, tx=${event.log.transactionHash}`
  );

  // Check local state
  if (relayerState.processedBurnNonces[nonceStr]) {
    log(
      `[BURN] burnNonce=${nonceStr} already marked as processed in relayer_state.json, skipping unlock.`
    );
    return;
  }

  // On-chain check: processedBurnNonces on SourceBridge
  let alreadyProcessed = false;
  try {
    if (typeof sourceBridge.processedBurnNonces === "function") {
      alreadyProcessed = await sourceBridge.processedBurnNonces(burnNonce);
    }
  } catch (e) {
    log(
      `[WARN] Failed to read processedBurnNonces(${nonceStr}) on SourceBridge: ${e.message}`
    );
  }

  if (alreadyProcessed) {
    log(
      `[BURN] burnNonce=${nonceStr} already processed on SourceBridge (on-chain), marking as processed locally and skipping.`
    );
    markBurnNonceProcessed(burnNonce);
    return;
  }

  // Call unlockFromTarget on Sepolia
  log(
    `[UNLOCK] Preparing unlockFromTarget on Sepolia: recipient=${to}, amount=${a}, burnNonce=${nonceStr}`
  );

  const receipt = await sendWithRetry(
    () => sourceBridge.unlockFromTarget(to, amount, burnNonce),
    `unlockFromTarget(burnNonce=${nonceStr})`
  );

  if (receipt && receipt.status === 1) {
    log(
      `[UNLOCK] unlockFromTarget successful for burnNonce=${nonceStr}, tx=${receipt.transactionHash}`
    );
    markBurnNonceProcessed(burnNonce);
  } else if (DRY_RUN) {
    log(
      `[UNLOCK][DRY_RUN] Skipped sending tx, but unlockFromTarget would have been called for burnNonce=${nonceStr}.`
    );
  }
}

// ------------------------
// Catch-up past events
// ------------------------

async function syncPastLockedEvents() {
  const latest = await sepoliaProvider.getBlockNumber();
  const from =
    FROM_BLOCK_SEPOLIA && FROM_BLOCK_SEPOLIA > 0
      ? FROM_BLOCK_SEPOLIA
      : Math.max(0, latest - 2000); // last ~2000 blocks by default

  log(
    `[SYNC] Fetching past Locked events on Sepolia from block ${from} to ${latest} (chunked by ${LOG_CHUNK_SIZE})...`
  );
  const filter = sourceBridge.filters.Locked();
  const events = await queryEventsChunked(
    sourceBridge,
    filter,
    from,
    latest,
    "Locked/Sepolia"
  );
  log(`[SYNC] Total Locked events found across all chunks: ${events.length}`);
  for (const ev of events) {
    const { sender, recipient, amount, nonce } = ev.args;
    await handleLockedEvent(sender, recipient, amount, nonce, ev);
  }
}

async function syncPastBurnEvents() {
  const latest = await amoyProvider.getBlockNumber();
  const from =
    FROM_BLOCK_AMOY && FROM_BLOCK_AMOY > 0
      ? FROM_BLOCK_AMOY
      : Math.max(0, latest - 2000);

  log(
    `[SYNC] Fetching past BurnToSource events on Amoy from block ${from} to ${latest} (chunked by ${LOG_CHUNK_SIZE})...`
  );
  const filter = targetBridge.filters.BurnToSource();
  const events = await queryEventsChunked(
    targetBridge,
    filter,
    from,
    latest,
    "BurnToSource/Amoy"
  );
  log(
    `[SYNC] Total BurnToSource events found across all chunks: ${events.length}`
  );
  for (const ev of events) {
    const { from: src, to, amount, burnNonce } = ev.args;
    await handleBurnToSourceEvent(src, to, amount, burnNonce, ev);
  }
}

// ------------------------
// Main
// ------------------------

async function main() {
  const [sepoliaNetwork, amoyNetwork] = await Promise.all([
    sepoliaProvider.getNetwork(),
    amoyProvider.getNetwork(),
  ]);

  const sepoliaChainId = sepoliaNetwork.chainId;
  const amoyChainId = amoyNetwork.chainId;

  log("=== AegisBridge v0.3.1 Testnet Relayer ===");
  log(`Sepolia RPC : ${SEPOLIA_RPC_URL}`);
  log(`Amoy RPC    : ${AMOY_RPC_URL}`);
  log(`Deployer/Relayer address: ${sepoliaWallet.address}`);
  log("");
  log(`Sepolia chainId : ${sepoliaChainId}`);
  log(`Amoy    chainId : ${amoyChainId}`);
  log("");
  log(`SourceBridge (Sepolia): ${sourceBridgeAddress}`);
  log(`ATT (Sepolia)        : ${attAddress}`);
  log(`TargetBridge (Amoy)  : ${targetBridgeAddress}`);
  log(`wATT (Amoy)          : ${wattAddress}`);
  log("========================================");
  log(
    `[CONFIG] DRY_RUN=${DRY_RUN}, MAX_RETRIES=${MAX_RETRIES}, RETRY_DELAY_MS=${RETRY_DELAY_MS}`
  );
  log(
    `[CONFIG] DISABLE_SYNC=${DISABLE_SYNC}, FROM_BLOCK_SEPOLIA=${FROM_BLOCK_SEPOLIA}, FROM_BLOCK_AMOY=${FROM_BLOCK_AMOY}`
  );
  log(
    `[STATE] Loaded relayer_state.json with ${Object.keys(
      relayerState.processedLockNonces || {}
    ).length} lock nonces and ${Object.keys(
      relayerState.processedBurnNonces || {}
    ).length} burn nonces.`
  );
  log("");

  // Catch-up (optional)
  if (!DISABLE_SYNC) {
    await syncPastLockedEvents();
    await syncPastBurnEvents();
  } else {
    log("[SYNC] Initial sync is DISABLED by RELAYER_DISABLE_SYNC=true.");
  }

  // Live subscriptions
  log("Subscribing to live events...");
  log(
    "- Locked(user, recipient, amount, nonce) on SourceBridge (Sepolia) → mintFromSource on Amoy"
  );
  log(
    "- BurnToSource(from, to, amount, burnNonce) on TargetBridge (Amoy) → unlockFromTarget on Sepolia"
  );
  log("");
  log("Press Ctrl+C to exit.\n");

  sourceBridge.on(
    "Locked",
    async (sender, recipient, amount, nonce, event) => {
      try {
        await handleLockedEvent(sender, recipient, amount, nonce, event);
      } catch (e) {
        log(`[ERROR] handleLockedEvent failed: ${e.message || e}`);
      }
    }
  );

  targetBridge.on(
    "BurnToSource",
    async (from, to, amount, burnNonce, event) => {
      try {
        await handleBurnToSourceEvent(from, to, amount, burnNonce, event);
      } catch (e) {
        log(`[ERROR] handleBurnToSourceEvent failed: ${e.message || e}`);
      }
    }
  );
}

main().catch((err) => {
  console.error("[FATAL] Relayer crashed:", err);
  process.exit(1);
});
