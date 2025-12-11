// scripts/testnet_relayer_v2.js
// AegisBridge v2 two-way relayer: Sepolia <-> Polygon Amoy
// Run with: `node scripts/testnet_relayer_v2.js`

require("dotenv").config();
const { ethers } = require("ethers");

// --- Load compiled ABIs -----------------------------------------------------

const sourceBridgeArtifact = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
const targetBridgeArtifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

// --- Environment ------------------------------------------------------------

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const AMOY_RPC_URL = process.env.AMOY_RPC_URL;

const SOURCE_BRIDGE_SEPOLIA = process.env.SOURCE_BRIDGE_SEPOLIA;
const TARGET_BRIDGE_AMOY = process.env.TARGET_BRIDGE_AMOY;

const RELAYER_PRIVATE_KEY =
  process.env.RELAYER_PRIVATE_KEY ||
  process.env.DEPLOYER_PRIVATE_KEY ||
  process.env.PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !AMOY_RPC_URL) {
  throw new Error("Missing SEPOLIA_RPC_URL or AMOY_RPC_URL in .env");
}
if (!SOURCE_BRIDGE_SEPOLIA || !TARGET_BRIDGE_AMOY) {
  throw new Error("Missing SOURCE_BRIDGE_SEPOLIA or TARGET_BRIDGE_AMOY in .env");
}
if (!RELAYER_PRIVATE_KEY) {
  throw new Error(
    "Missing relayer private key. Set RELAYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY or PRIVATE_KEY in .env"
  );
}

// Optional token metadata (used only for nicer logs)
const ATT_SEPOLIA = process.env.ATT_SEPOLIA;
const WATT_AMOY = process.env.WATT_AMOY;

// Lookback window for catch-up (in blocks)
const SEPOLIA_LOOKBACK_BLOCKS = Number(process.env.RELAYER_SEPOLIA_LOOKBACK || "2000");
const AMOY_LOOKBACK_BLOCKS = Number(process.env.RELAYER_AMOY_LOOKBACK || "2000");

// Max block span per eth_getLogs (Alchemy free tier requires <= 10)
const MAX_LOG_RANGE = Number(process.env.RELAYER_MAX_LOG_RANGE || "10");

// --- Providers & Signers ----------------------------------------------------

const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);

const baseWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY);
const sepoliaSigner = baseWallet.connect(sepoliaProvider);
const amoySigner = baseWallet.connect(amoyProvider);

// --- Contracts --------------------------------------------------------------

const sourceBridge = new ethers.Contract(
  SOURCE_BRIDGE_SEPOLIA,
  sourceBridgeArtifact.abi,
  sepoliaSigner
);

const targetBridge = new ethers.Contract(
  TARGET_BRIDGE_AMOY,
  targetBridgeArtifact.abi,
  amoySigner
);

const erc20Abi = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

let attSymbol = "ATT";
let attDecimals = 18;
let wattSymbol = "wATT";
let wattDecimals = 18;

// --- Logging helper ---------------------------------------------------------

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// --- Token metadata (for pretty logs) ---------------------------------------

async function initTokenMetadata() {
  try {
    if (ATT_SEPOLIA) {
      const att = new ethers.Contract(ATT_SEPOLIA, erc20Abi, sepoliaProvider);
      attDecimals = await att.decimals();
      attSymbol = await att.symbol();
    }
  } catch (e) {
    log("[Meta] Failed to load ATT metadata, using defaults:", e.reason || e.message || e);
  }

  try {
    if (WATT_AMOY) {
      const watt = new ethers.Contract(WATT_AMOY, erc20Abi, amoyProvider);
      wattDecimals = await watt.decimals();
      wattSymbol = await watt.symbol();
    }
  } catch (e) {
    log("[Meta] Failed to load wATT metadata, using defaults:", e.reason || e.message || e);
  }

  log(
    `[Meta] ATT: symbol=${attSymbol}, decimals=${attDecimals} | wATT: symbol=${wattSymbol}, decimals=${wattDecimals}`
  );
}

// --- Forward handler: Locked (Sepolia) -> mintFromSource (Amoy) -------------

async function handleLocked(user, amount, nonce, event, fromCatchUp = false) {
  const nonceStr = nonce.toString();
  const amountFormatted = ethers.formatUnits(amount, attDecimals);
  const prefix = fromCatchUp ? "[Forward][Past]" : "[Forward][Live]";

  try {
    const alreadyProcessed = await targetBridge.processedNonces(nonce);
    if (alreadyProcessed) {
      log(`${prefix} Locked nonce=${nonceStr} already processed on TargetBridge, skipping`);
      return;
    }

    log(
      `${prefix} New Locked event: nonce=${nonceStr}, user=${user}, amount=${amountFormatted} ${attSymbol}`
    );
    log(
      `${prefix} Calling mintFromSource on Amoy: to=${user}, amount=${amountFormatted} ${attSymbol}, nonce=${nonceStr}`
    );

    const tx = await targetBridge.mintFromSource(user, amount, nonce);
    log(`${prefix} mintFromSource tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    log(`${prefix} mintFromSource confirmed in block ${receipt.blockNumber}`);
  } catch (err) {
    log(
      `${prefix} Error processing Locked nonce=${nonceStr}:`,
      err.reason || err.message || err
    );
  }
}

// --- Reverse handler: ReturnRequested (Amoy) -> releaseFromTarget (Sepolia) --

async function handleReturnRequested(user, amount, nonce, event, fromCatchUp = false) {
  const nonceStr = nonce.toString();
  const amountFormatted = ethers.formatUnits(amount, wattDecimals);
  const prefix = fromCatchUp ? "[Reverse][Past]" : "[Reverse][Live]";

  try {
    const alreadyProcessed = await sourceBridge.processedReturnNonces(nonce);
    if (alreadyProcessed) {
      log(
        `${prefix} ReturnRequested nonce=${nonceStr} already processed on SourceBridge, skipping`
      );
      return;
    }

    log(
      `${prefix} New ReturnRequested event: nonce=${nonceStr}, user=${user}, amount=${amountFormatted} ${wattSymbol}`
    );
    log(
      `${prefix} Calling releaseFromTarget on Sepolia: to=${user}, amount=${amountFormatted} ${attSymbol}, nonce=${nonceStr}`
    );

    const tx = await sourceBridge.releaseFromTarget(user, amount, nonce);
    log(`${prefix} releaseFromTarget tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    log(`${prefix} releaseFromTarget confirmed in block ${receipt.blockNumber}`);
  } catch (err) {
    log(
      `${prefix} Error processing ReturnRequested nonce=${nonceStr}:`,
      err.reason || err.message || err
    );
  }
}

// --- Helper: query events in small chunks (Alchemy free tier safe) ----------

async function queryEventsChunked(contract, filter, fromBlock, toBlock, maxRange, label) {
  let allEvents = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const end = Math.min(start + maxRange - 1, toBlock);
    log(`${label} queryFilter from block ${start} to ${end}`);
    try {
      const chunk = await contract.queryFilter(filter, start, end);
      if (chunk.length > 0) {
        log(`${label}   -> got ${chunk.length} event(s)`);
      }
      allEvents = allEvents.concat(chunk);
    } catch (err) {
      log(
        `${label} error while querying blocks ${start}-${end}:`,
        err.reason || err.message || err
      );
    }
    start = end + 1;
  }

  return allEvents;
}

// --- Catch-up: process recent past events -----------------------------------

async function catchUpForward() {
  const currentBlock = await sepoliaProvider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - SEPOLIA_LOOKBACK_BLOCKS);

  log(
    `[Forward] Catching up Locked events on Sepolia from block ${fromBlock} to ${currentBlock} (maxRange=${MAX_LOG_RANGE})...`
  );

  const filter = sourceBridge.filters.Locked();
  const events = await queryEventsChunked(
    sourceBridge,
    filter,
    fromBlock,
    currentBlock,
    MAX_LOG_RANGE,
    "[Forward][CatchUp]"
  );

  if (events.length === 0) {
    log("[Forward] No past Locked events in lookback window");
    return;
  }

  log(`[Forward] Total past Locked events found: ${events.length}`);
  for (const ev of events) {
    const [user, amount, nonce] = ev.args;
    await handleLocked(user, amount, nonce, ev, true);
  }
}

async function catchUpReverse() {
  const currentBlock = await amoyProvider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - AMOY_LOOKBACK_BLOCKS);

  log(
    `[Reverse] Catching up ReturnRequested events on Amoy from block ${fromBlock} to ${currentBlock} (maxRange=${MAX_LOG_RANGE})...`
  );

  const filter = targetBridge.filters.ReturnRequested();
  const events = await queryEventsChunked(
    targetBridge,
    filter,
    fromBlock,
    currentBlock,
    MAX_LOG_RANGE,
    "[Reverse][CatchUp]"
  );

  if (events.length === 0) {
    log("[Reverse] No past ReturnRequested events in lookback window");
    return;
  }

  log(`[Reverse] Total past ReturnRequested events found: ${events.length}`);
  for (const ev of events) {
    const [user, amount, nonce] = ev.args;
    await handleReturnRequested(user, amount, nonce, ev, true);
  }
}

// --- Main -------------------------------------------------------------------

async function main() {
  log("=== AegisBridge v2 Testnet Relayer ===");
  log("Env            :", process.env.AEGIS_ENV || "testnet");
  log("Sepolia RPC    :", SEPOLIA_RPC_URL);
  log("Amoy RPC       :", AMOY_RPC_URL);
  log("SourceBridge   :", SOURCE_BRIDGE_SEPOLIA);
  log("TargetBridge   :", TARGET_BRIDGE_AMOY);

  const relayerAddr = await sepoliaSigner.getAddress();
  log("Relayer wallet :", relayerAddr);

  await initTokenMetadata();

  // Catch up on recent events before subscribing
  await catchUpForward();
  await catchUpReverse();

  // Subscribe to live events
  log("[Forward] Subscribing to Locked events on Sepolia...");
  sourceBridge.on("Locked", (user, amount, nonce, event) => {
    handleLocked(user, amount, nonce, event, false);
  });

  log("[Reverse] Subscribing to ReturnRequested events on Amoy...");
  targetBridge.on("ReturnRequested", (user, amount, nonce, event) => {
    handleReturnRequested(user, amount, nonce, event, false);
  });

  log("Relayer is now listening for bridge events on both networks...");
  log("Press Ctrl+C to exit.");
}

main().catch((err) => {
  log("Relayer fatal error:", err.reason || err.message || err);
  process.exit(1);
});
