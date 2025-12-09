#!/usr/bin/env node
"use strict";

/**
 * AegisBridge – Testnet Relayer v0.4.2
 *
 * - Listens:
 *   - Locked(user, recipient, amount, nonce) on SourceBridge (Sepolia)
 *   - BurnToSource(from, to, amount, burnNonce) on TargetBridge (Amoy)
 * - Calls:
 *   - mintFromSource(recipient, amount, nonce) on TargetBridge (Amoy)
 *   - unlockFromTarget(recipient, amount, burnNonce) on SourceBridge (Sepolia)
 *
 * Features:
 * - Reads config from `.env` + deployments/testnet_sepolia_amoy.json
 * - DRY_RUN mode
 * - Retry tx dengan backoff
 * - Catch-up events (chunk 10 blok) untuk eth_getLogs limit
 * - Simpan processed nonces ke relayer_state.json (idempotent)
 * - RELAYER_DISABLE_SYNC untuk matikan initial sync
 * - HTTP /health endpoint
 * - FIX: paksa gasLimit wajar (default 300k) untuk menghindari
 *   "INTERNAL_ERROR: gas limit is too high" di Polygon Amoy
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");

// ------------------------
// Config dari .env
// ------------------------

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";

if (!SEPOLIA_RPC_URL || !AMOY_RPC_URL || !PRIVATE_KEY) {
  console.error(
    "[FATAL] Missing SEPOLIA_RPC_URL / AMOY_RPC_URL / DEPLOYER_PRIVATE_KEY (or PRIVATE_KEY) in .env"
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

// Gas limit override (biar nggak over-estimate)
const MINT_GAS_LIMIT = Number(
  process.env.RELAYER_MINT_GAS_LIMIT || "300000"
);
const UNLOCK_GAS_LIMIT = Number(
  process.env.RELAYER_UNLOCK_GAS_LIMIT || "300000"
);

// eth_getLogs window limit (Alchemy free tier: max ~10 blocks)
const LOG_CHUNK_SIZE = 10;

// Health / observability config
const NETWORK_ENV = process.env.NETWORK_ENV || "testnet";
const HEALTH_PORT = Number(process.env.HEALTH_PORT || "8081");
const HEALTH_INTERVAL_MS = Number(
  process.env.RELAYER_HEALTH_INTERVAL_MS ||
    process.env.RELAYER_POLL_INTERVAL_MS ||
    "5000"
);

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
    // jangan crash cuma gara-gara gagal nulis log
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

// ------------------------
// Load deployments (addresses & deployer)
// ------------------------

const deployments = loadJsonSafe(DEPLOYMENTS_FILE, {});
if (!deployments.sepolia || !deployments.amoy) {
  console.error(
    `[FATAL] Missing sepolia/amoy sections in ${DEPLOYMENTS_FILE}.
Deploy v0.2, then try again.`
  );
  process.exit(1);
}

const sepoliaSection = deployments.sepolia;
const amoySection = deployments.amoy;

// Try multiple keys for ATT & wATT (robust to JSON changes)
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
    "[WARN] Could not find WrappedTestToken address in deployments.amoy (tried WrappedTestToken / wATT / Token / token).\nLogging will show undefined, but relayer can still work using TargetBridge only."
  );
}

// Load relayer state (processed nonces, dsb).
let relayerState = loadJsonSafe(STATE_FILE, {
  processedLockNonces: {},
  processedBurnNonces: {},
});

// Pastikan key utama selalu ada
if (
  !relayerState.processedLockNonces ||
  typeof relayerState.processedLockNonces !== "object"
) {
  relayerState.processedLockNonces = {};
}
if (
  !relayerState.processedBurnNonces ||
  typeof relayerState.processedBurnNonces !== "object"
) {
  relayerState.processedBurnNonces = {};
}

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
// Providers, wallets
// ------------------------

const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);

const sepoliaWallet = new ethers.Wallet(PRIVATE_KEY, sepoliaProvider);
const amoyWallet = new ethers.Wallet(PRIVATE_KEY, amoyProvider);

// ------------------------
// Load ABIs from Hardhat artifacts (with fallback path)
// ------------------------

function loadAbiWithFallback(contractName, fileCandidates) {
  for (const candidate of fileCandidates) {
    const full = path.join(ROOT_DIR, "artifacts", "contracts", ...candidate);
    try {
      if (fs.existsSync(full)) {
        const json = require(full);
        log(
          `[ABI] Loaded ABI for ${contractName} from artifacts/contracts/${candidate.join(
            "/"
          )}`
        );
        return json.abi;
      }
    } catch (e) {
      // continue to next candidate
    }
  }

  console.error(
    `[FATAL] Could not find ABI for ${contractName}. Tried:\n` +
      fileCandidates
        .map((c) => `  - artifacts/contracts/${c.join("/")}`)
        .join("\n")
  );
  process.exit(1);
}

// Candidates:
// - AegisBridge.sol/SourceBridge.json
// - SourceBridge.sol/SourceBridge.json
const sourceBridgeAbi = loadAbiWithFallback("SourceBridge", [
  ["AegisBridge.sol", "SourceBridge.json"],
  ["SourceBridge.sol", "SourceBridge.json"],
]);

// Candidates:
// - AegisBridge.sol/TargetBridge.json
// - TargetBridge.sol/TargetBridge.json
const targetBridgeAbi = loadAbiWithFallback("TargetBridge", [
  ["AegisBridge.sol", "TargetBridge.json"],
  ["TargetBridge.sol", "TargetBridge.json"],
]);

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
// Health state & HTTP server
// ------------------------

const healthState = {
  env: NETWORK_ENV,
  startedAt: new Date().toISOString(),
  lastTickAt: null,
  lastError: null,
  sepolia: {
    ok: false,
    lastBlock: null,
    lastError: null,
    bridge: sourceBridgeAddress,
  },
  amoy: {
    ok: false,
    lastBlock: null,
    lastError: null,
    bridge: targetBridgeAddress,
  },
  lastLockNonce: null,
  lastBurnNonce: null,
};

async function healthTick() {
  const now = new Date().toISOString();
  healthState.lastTickAt = now;
  let globalError = null;

  // Ping Sepolia
  try {
    const block = await sepoliaProvider.getBlockNumber();
    healthState.sepolia.ok = true;
    healthState.sepolia.lastBlock = block;
    healthState.sepolia.lastError = null;
  } catch (err) {
    const msg = String(err.shortMessage || err.message || err);
    healthState.sepolia.ok = false;
    healthState.sepolia.lastError = msg;
    globalError = globalError || err;
    log("[HEALTH] Sepolia ping failed:", msg);
  }

  // Ping Amoy
  try {
    const block = await amoyProvider.getBlockNumber();
    healthState.amoy.ok = true;
    healthState.amoy.lastBlock = block;
    healthState.amoy.lastError = null;
  } catch (err) {
    const msg = String(err.shortMessage || err.message || err);
    healthState.amoy.ok = false;
    healthState.amoy.lastError = msg;
    globalError = globalError || err;
    log("[HEALTH] Amoy ping failed:", msg);
  }

  if (globalError) {
    healthState.lastError = String(
      globalError.shortMessage || globalError.message || globalError
    );
  } else {
    healthState.lastError = null;
  }
}

function startHealthLoop() {
  // initial tick
  healthTick().catch((err) =>
    log("[HEALTH] Initial healthTick error:", err.message || err)
  );

  setInterval(() => {
    healthTick().catch((err) =>
      log("[HEALTH] healthTick error:", err.message || err)
    );
  }, HEALTH_INTERVAL_MS);
}

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url && req.url.startsWith("/health")) {
      const allOk = healthState.sepolia.ok && healthState.amoy.ok;
      const payload = {
        ok: allOk,
        env: healthState.env,
        startedAt: healthState.startedAt,
        lastTickAt: healthState.lastTickAt,
        sepolia: healthState.sepolia,
        amoy: healthState.amoy,
        lastLockNonce: healthState.lastLockNonce,
        lastBurnNonce: healthState.lastBurnNonce,
        lastError: healthState.lastError,
      };

      const body = JSON.stringify(payload);
      res.writeHead(allOk ? 200 : 500, {
        "Content-Type": "application/json",
      });
      return res.end(body);
    }

    // 404 fallback
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(HEALTH_PORT, () => {
    log("[HEALTH] HTTP health endpoint listening on port", HEALTH_PORT);
  });

  server.on("error", (err) => {
    log("[HEALTH] Server error:", err.message || err);
  });
}

// ------------------------
// Helpers
// ------------------------

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry sending tx dengan backoff & DRY_RUN
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

      // Non-retryable error hints
      if (
        short.includes("already processed") ||
        short.includes("nonce already processed") ||
        short.includes("paused") ||
        short.includes("Pausable: paused") ||
        short.includes("gas limit is too high")
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
    log("[TX-ERROR-DETAIL]", lastError);
  }
  return null;
}

// Chunked queryFilter untuk respect limit
async function queryEventsChunked(
  contract,
  filter,
  fromBlock,
  toBlock,
  label
) {
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
      // lanjut saja, live subscription masih bisa nangkap event berikutnya
    }

    // kecilkan speed agar tidak spam RPC
    await sleep(300);
  }

  return events;
}

// ------------------------
// Event Handlers
// ------------------------

async function handleLockedEvent(sender, recipient, amount, nonce, event) {
  const nonceStr = nonce.toString();
  const a = ethers.formatUnits(amount, 18);
  log(
    `\n[LOCK EVENT] Sepolia Locked → nonce=${nonceStr}, amount=${a}, sender=${sender}, recipient=${recipient}, tx=${event.log.transactionHash}`
  );

  // Update health lastLockNonce (event terlihat)
  healthState.lastLockNonce = nonceStr;

  // Check local state
  if (relayerState.processedLockNonces[nonceStr]) {
    log(
      `[LOCK] nonce=${nonceStr} already marked as processed in relayer_state.json, skipping mint.`
    );
    return;
  }

  // On-chain check: processedNonces on TargetBridge (kalau ada)
  let alreadyProcessed = false;
  try {
    if (typeof targetBridge.processedNonces === "function") {
      alreadyProcessed = await targetBridge.processedNonces(nonce);
    }
  } catch (e) {
    log(
      `[WARN] Failed to read processedNonces(${nonceStr}) on TargetBridge: ${
        e.message || e
      }`
    );
  }

  if (alreadyProcessed) {
    log(
      `[LOCK] nonce=${nonceStr} already processed on TargetBridge (on-chain), marking as processed locally and skipping.`
    );
    markLockNonceProcessed(nonce);
    return;
  }

  // Call mintFromSource on Amoy with explicit gasLimit
  log(
    `[MINT] Preparing mintFromSource on Amoy: user=${recipient}, amount=${a}, nonce=${nonceStr}, gasLimit=${MINT_GAS_LIMIT}`
  );

  const receipt = await sendWithRetry(
    () =>
      targetBridge.mintFromSource(recipient, amount, nonce, {
        gasLimit: MINT_GAS_LIMIT,
      }),
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

  // Update health lastBurnNonce
  healthState.lastBurnNonce = nonceStr;

  // Check local state
  if (relayerState.processedBurnNonces[nonceStr]) {
    log(
      `[BURN] burnNonce=${nonceStr} already marked as processed in relayer_state.json, skipping unlock.`
    );
    return;
  }

  // On-chain check: processedBurnNonces on SourceBridge (kalau ada)
  let alreadyProcessed = false;
  try {
    if (typeof sourceBridge.processedBurnNonces === "function") {
      alreadyProcessed = await sourceBridge.processedBurnNonces(burnNonce);
    }
  } catch (e) {
    log(
      `[WARN] Failed to read processedBurnNonces(${nonceStr}) on SourceBridge: ${
        e.message || e
      }`
    );
  }

  if (alreadyProcessed) {
    log(
      `[BURN] burnNonce=${nonceStr} already processed on SourceBridge (on-chain), marking as processed locally and skipping.`
    );
    markBurnNonceProcessed(burnNonce);
    return;
  }

  // Call unlockFromTarget on Sepolia with explicit gasLimit
  log(
    `[UNLOCK] Preparing unlockFromTarget on Sepolia: recipient=${to}, amount=${a}, burnNonce=${nonceStr}, gasLimit=${UNLOCK_GAS_LIMIT}`
  );

  const receipt = await sendWithRetry(
    () =>
      sourceBridge.unlockFromTarget(to, amount, burnNonce, {
        gasLimit: UNLOCK_GAS_LIMIT,
      }),
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
      : Math.max(0, latest - 2000); // default: last ~2000 blocks

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

  log("=== AegisBridge v0.4.2 Testnet Relayer ===");
  log(`Env           : ${NETWORK_ENV}`);
  log(`Sepolia RPC   : ${SEPOLIA_RPC_URL}`);
  log(`Amoy RPC      : ${AMOY_RPC_URL}`);
  log(`Relayer addr  : ${sepoliaWallet.address}`);
  log("");
  log(`Sepolia chainId : ${sepoliaChainId}`);
  log(`Amoy chainId    : ${amoyChainId}`);
  log("");
  log(`SourceBridge (Sepolia): ${sourceBridgeAddress}`);
  log(`ATT (Sepolia)          : ${attAddress}`);
  log(`TargetBridge (Amoy)    : ${targetBridgeAddress}`);
  log(`wATT (Amoy)            : ${wattAddress}`);
  log("========================================");
  log(
    `[CONFIG] DRY_RUN=${DRY_RUN}, MAX_RETRIES=${MAX_RETRIES}, RETRY_DELAY_MS=${RETRY_DELAY_MS}`
  );
  log(
    `[CONFIG] DISABLE_SYNC=${DISABLE_SYNC}, FROM_BLOCK_SEPOLIA=${FROM_BLOCK_SEPOLIA}, FROM_BLOCK_AMOY=${FROM_BLOCK_AMOY}`
  );
  log(
    `[CONFIG] MINT_GAS_LIMIT=${MINT_GAS_LIMIT}, UNLOCK_GAS_LIMIT=${UNLOCK_GAS_LIMIT}`
  );
  log(
    `[STATE] Loaded relayer_state.json with ${
      Object.keys(relayerState.processedLockNonces || {}).length
    } lock nonces and ${
      Object.keys(relayerState.processedBurnNonces || {}).length
    } burn nonces.`
  );
  log(
    `[HEALTH] HTTP port=${HEALTH_PORT}, interval=${HEALTH_INTERVAL_MS} ms\n`
  );

  // Initial catch-up (kalau tidak di-disable)
  if (!DISABLE_SYNC) {
    await syncPastLockedEvents();
    await syncPastBurnEvents();
  } else {
    log("[SYNC] Initial sync is DISABLED by RELAYER_DISABLE_SYNC=true.");
  }

  // Start health loop + HTTP server
  startHealthLoop();
  startHealthServer();

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
        log(
          `[ERROR] handleLockedEvent failed: ${e.message || e.toString()}`
        );
      }
    }
  );

  targetBridge.on(
    "BurnToSource",
    async (from, to, amount, burnNonce, event) => {
      try {
        await handleBurnToSourceEvent(from, to, amount, burnNonce, event);
      } catch (e) {
        log(
          `[ERROR] handleBurnToSourceEvent failed: ${
            e.message || e.toString()
          }`
        );
      }
    }
  );
}

// Global error handlers
process.on("unhandledRejection", (reason) => {
  log("[UNHANDLED_REJECTION]", String(reason));
});

process.on("uncaughtException", (err) => {
  log("[UNCAUGHT_EXCEPTION]", err.message || err.toString());
});

// Run
main().catch((err) => {
  console.error("[FATAL] Relayer crashed:", err);
  process.exit(1);
});
