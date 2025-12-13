/**
 * AegisBridge - Stateful Relayer (Sepolia -> Amoy) [NO FallbackProvider]
 *
 * Why this version:
 * - Avoids ethers FallbackProvider "network changed" issues by NOT mixing providers internally.
 * - Uses a simple "try primary, then backups" strategy per request.
 * - Providers are pinned to expected chainId (static network). If an endpoint returns the wrong
 *   chainId, it is skipped automatically.
 *
 * Run:
 *   node scripts/testnet_relayer_stateful_nofallback.js
 *
 * Env:
 *   SEPOLIA_RPC_URL/_1/_2/_3
 *   AMOY_RPC_URL/_1/_2/_3
 *   PRIVATE_KEY or DEPLOYER_PRIVATE_KEY
 *
 *   SourceBridge address:
 *     SEPOLIA_SOURCE_BRIDGE_ADDRESS or SEPOLIA_SOURCE_BRIDGE_V2 or SOURCE_BRIDGE_SEPOLIA ...
 *   TargetBridge address:
 *     AMOY_TARGET_BRIDGE_ADDRESS or AMOY_TARGET_BRIDGE_V2 or TARGET_BRIDGE_AMOY ...
 *
 * State:
 *   RELAYER_STATE_FILE=./data/relayer_state.json
 *   RELAYER_RESET_STATE=true
 *   RELAYER_FROM_BLOCK_SEPOLIA=...
 *
 * Scan:
 *   SEPOLIA_LOG_MAX_RANGE=10
 *   RELAYER_POLL_INTERVAL_MS=5000
 *   RELAYER_CONFIRMATIONS_SEPOLIA=2
 *
 * Mint:
 *   RELAYER_MINT_GAS_LIMIT=300000
 *   RELAYER_MINT_FUNCTION=mintFromSource   (optional)
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function nowIso() { return new Date().toISOString(); }

function env(name, def = "") {
  const v = process.env[name];
  return (v === undefined || v === null || String(v).trim() === "") ? def : String(v).trim();
}
function envInt(name, def) {
  const v = env(name, "");
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function envBool(name, def = false) {
  const v = env(name, "").toLowerCase();
  if (!v) return def;
  return ["1", "true", "yes", "y", "on"].includes(v);
}
function pickEnv(...names) {
  for (const n of names) {
    const v = env(n, "");
    if (v) return v;
  }
  return "";
}
function normalizePk(pk) {
  if (!pk) return "";
  const s = pk.trim();
  return s.startsWith("0x") ? s : "0x" + s;
}
function isPlaceholderUrl(u) {
  if (!u) return true;
  const s = u.toLowerCase();
  return s.includes("your_alchemy_key") || s.includes("your_") || s.endsWith("/v2/") || s.includes("example");
}
function collectRpc(prefix) {
  const keys = [`${prefix}_RPC_URL`, `${prefix}_RPC_URL_1`, `${prefix}_RPC_URL_2`, `${prefix}_RPC_URL_3`];
  const urls = [];
  for (const k of keys) {
    const u = env(k, "");
    if (u && !isPlaceholderUrl(u)) urls.push(u);
  }
  return [...new Set(urls)];
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function loadJson(p, fallback) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : fallback; }
  catch { return fallback; }
}
function saveJsonAtomic(p, data) {
  ensureDir(path.dirname(p));
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}
function loadAbi(artifactPath) {
  return require(artifactPath).abi;
}
function formatUnitsSafe(value, decimals = 18) {
  try { return ethers.formatUnits(value, decimals); } catch { return String(value); }
}

function makeProviders(urls, network) {
  // Pin static network to avoid auto-detect "network changed" surprises
  return urls.map((u) => new ethers.JsonRpcProvider(u, network));
}

async function tryProviders(providers, fn, label) {
  let lastErr = null;
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const res = await fn(p, i);
      return { ok: true, res, index: i };
    } catch (e) {
      const msg = e?.shortMessage || e?.message || String(e);
      lastErr = msg;

      // If wrong chainId (network changed), skip permanently by removing this provider
      if (String(msg).toLowerCase().includes("network changed")) {
        console.log(`[${nowIso()}] [rpc-skip][${label}] removing endpoint #${i} due to: ${msg}`);
        providers.splice(i, 1);
        i--;
        continue;
      }

      // Non-fatal: try next provider
      continue;
    }
  }
  return { ok: false, err: lastErr || "all providers failed" };
}

function pickMintFunction(targetIface, forcedName = "") {
  if (forcedName) {
    const frag = targetIface.fragments.find(f => f.type === "function" && f.name === forcedName);
    if (!frag) throw new Error(`RELAYER_MINT_FUNCTION="${forcedName}" not found in TargetBridge ABI`);
    return frag;
  }
  const candidates = targetIface.fragments
    .filter(f => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure")
    .filter(f => /mint|release|finalize|claim|bridge/i.test(f.name))
    .filter(f => f.inputs && f.inputs.length >= 3 && f.inputs.length <= 5);

  const score = (frag) => {
    const types = frag.inputs.map(i => i.type);
    const hasAddr = types.includes("address");
    const uints = types.filter(t => /^uint/.test(t)).length;
    let s = 0;
    if (hasAddr) s += 2;
    if (uints >= 2) s += 2;
    if (/mint/i.test(frag.name)) s += 2;
    if (types.join(",").includes("bytes")) s -= 1;
    return s;
  };

  candidates.sort((a,b) => score(b) - score(a));
  if (!candidates.length) throw new Error("Could not auto-detect mint function; set RELAYER_MINT_FUNCTION.");
  return candidates[0];
}

function buildArgsByHeuristic(frag, ctx) {
  const args = [];
  let usedAmount = false;
  let usedNonce = false;

  for (const inp of frag.inputs) {
    const t = inp.type;
    const n = (inp.name || "").toLowerCase();

    if (t === "address") { args.push(ctx.to); continue; }
    if (/^uint/.test(t)) {
      if (!usedAmount) { args.push(ctx.amount); usedAmount = true; continue; }
      if (!usedNonce) { args.push(ctx.nonce); usedNonce = true; continue; }

      if (n.includes("src") || n.includes("source") || n.includes("from")) args.push(ctx.sourceChainId);
      else if (n.includes("dst") || n.includes("target") || n.includes("to")) args.push(ctx.targetChainId);
      else if (n.includes("chain")) args.push(ctx.targetChainId);
      else args.push(0n);
      continue;
    }
    if (t === "bytes32") { args.push(ethers.ZeroHash); continue; }
    if (t === "bytes") { args.push("0x"); continue; }
    if (t === "bool") { args.push(true); continue; }
    throw new Error(`Unsupported mint param type: ${t}`);
  }
  return args;
}

async function main() {
  const ENV = env("NETWORK_ENV", "testnet");
  const DRY_RUN = envBool("RELAYER_DRY_RUN", false);

  const sepoliaUrls = collectRpc("SEPOLIA");
  const amoyUrls = collectRpc("AMOY");
  if (!sepoliaUrls.length) throw new Error("No Sepolia RPC URLs found. Set SEPOLIA_RPC_URL/_1/_2/_3.");
  if (!amoyUrls.length) throw new Error("No Amoy RPC URLs found. Set AMOY_RPC_URL/_1/_2/_3.");

  const pk = pickEnv("DEPLOYER_PRIVATE_KEY", "PRIVATE_KEY");
  if (!pk) throw new Error("Missing PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) in .env");

  const sourceBridgeAddress = pickEnv(
    "SEPOLIA_SOURCE_BRIDGE_ADDRESS",
    "SEPOLIA_SOURCE_BRIDGE_V2",
    "SEPOLIA_SOURCE_BRIDGE",
    "SOURCE_BRIDGE_SEPOLIA",
    "SEPOLIA_BRIDGE_ADDRESS"
  );
  const targetBridgeAddress = pickEnv(
    "AMOY_TARGET_BRIDGE_ADDRESS",
    "AMOY_TARGET_BRIDGE_V2",
    "TARGET_BRIDGE_AMOY",
    "AMOY_BRIDGE_ADDRESS"
  );
  if (!sourceBridgeAddress) throw new Error("Missing SourceBridge address env (SEPOLIA_SOURCE_BRIDGE_ADDRESS / ...)");
  if (!targetBridgeAddress) throw new Error("Missing TargetBridge address env (AMOY_TARGET_BRIDGE_ADDRESS / ...)");

  const sepoliaNetwork = { name: "sepolia", chainId: 11155111 };
  const amoyNetwork = { name: "amoy", chainId: 80002 };

  const sepoliaProviders = makeProviders(sepoliaUrls, sepoliaNetwork);
  const amoyProviders = makeProviders(amoyUrls, amoyNetwork);

  const sourceAbi = loadAbi("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
  const targetAbi = loadAbi("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

  console.log(`[dotenv] loaded at ${nowIso()}\n`);
  console.log("[RPC][sepolia] configured:");
  sepoliaUrls.forEach((u, i) => console.log(`  - (#${i}) ${u}`));
  console.log("\n[RPC][amoy] configured:");
  amoyUrls.forEach((u, i) => console.log(`  - (#${i}) ${u}`));

  console.log("==============================================");
  console.log("=== AegisBridge v2 Testnet Relayer (NoFB) ====");
  console.log("==============================================");
  console.log("Env            :", ENV);
  console.log("SourceBridge   :", sourceBridgeAddress);
  console.log("TargetBridge   :", targetBridgeAddress);
  console.log("Dry run        :", DRY_RUN);
  console.log("");

  // Persistent state
  const stateFile = env("RELAYER_STATE_FILE", path.join(".", "data", "relayer_state.json"));
  const resetState = envBool("RELAYER_RESET_STATE", false);
  const defaultState = {
    schema: 1,
    updatedAt: null,
    sepolia: {
      nextBlock: envInt("RELAYER_FROM_BLOCK_SEPOLIA", 0) || 0,
      lastSeenBlock: 0,
      lastProcessed: { nonce: null, blockNumber: null, srcTx: null, dstTx: null }
    }
  };
  const state = resetState ? defaultState : loadJson(stateFile, defaultState);

  if (!state.sepolia.nextBlock && envInt("RELAYER_FROM_BLOCK_SEPOLIA", 0)) {
    state.sepolia.nextBlock = envInt("RELAYER_FROM_BLOCK_SEPOLIA", 0);
  }

  console.log(`[state] file=${stateFile}`);
  console.log(`[state] sepolia.nextBlock=${state.sepolia.nextBlock || "(auto)"}\n`);

  const pollMs = envInt("RELAYER_POLL_INTERVAL_MS", 5000);
  const maxRangeSepolia = envInt("SEPOLIA_LOG_MAX_RANGE", 10);
  const confSepolia = envInt("RELAYER_CONFIRMATIONS_SEPOLIA", 2);

  const mintGasLimit = BigInt(env("RELAYER_MINT_GAS_LIMIT", "300000"));
  const forcedMintFn = env("RELAYER_MINT_FUNCTION", "");

  const lockedTopic = ethers.id("Locked(address,uint256,uint256)");

  // Build contract interfaces (no provider attached for parsing)
  const sourceIface = new ethers.Interface(sourceAbi);

  // Choose mint fn from ABI
  const targetIface = new ethers.Interface(targetAbi);
  const mintFrag = pickMintFunction(targetIface, forcedMintFn);
  console.log(`[mint] function selected: ${mintFrag.name}(${mintFrag.inputs.map(i=>i.type).join(",")})\n`);
  console.log(`[loop] poll=${pollMs}ms | sepoliaRangeMax=${maxRangeSepolia} | confirmations=${confSepolia}\n`);

  async function getLatestSafeBlock() {
    const r = await tryProviders(sepoliaProviders, async (p) => {
      const latest = await p.getBlockNumber();
      return Math.max(0, latest - confSepolia);
    }, "sepolia");
    if (!r.ok) throw new Error(`getBlockNumber failed: ${r.err}`);
    return r.res;
  }

  async function getLogs(fromBlock, toBlock) {
    const filter = { address: sourceBridgeAddress, fromBlock, toBlock, topics: [lockedTopic] };
    const r = await tryProviders(sepoliaProviders, async (p) => p.getLogs(filter), "sepolia");
    if (!r.ok) throw new Error(`getLogs failed: ${r.err}`);
    return r.res;
  }

  async function isProcessedOnTarget(nonce) {
    const r = await tryProviders(amoyProviders, async (p) => {
      const c = new ethers.Contract(targetBridgeAddress, targetAbi, p);
      return await c.processedNonces(nonce);
    }, "amoy");
    if (!r.ok) throw new Error(`processedNonces check failed: ${r.err}`);
    return r.res;
  }

  async function sendMint(ctx, args, srcTxHash) {
    if (DRY_RUN) return { dry: true };

    const r = await tryProviders(amoyProviders, async (p, idx) => {
      const w = new ethers.Wallet(normalizePk(pk), p);
      const c = new ethers.Contract(targetBridgeAddress, targetAbi, w);
      const fn = c.getFunction(mintFrag.name);

      // best-effort staticCall
      await fn.staticCall(...args);

      const tx = await fn(...args, { gasLimit: mintGasLimit });
      const rc = await tx.wait();
      return { txHash: tx.hash, blockNumber: rc.blockNumber, providerIndex: idx };
    }, "amoy");

    if (!r.ok) throw new Error(`mint failed: ${r.err}`);
    return r.res;
  }

  async function tick() {
    const safeLatest = await getLatestSafeBlock();

    if (!state.sepolia.nextBlock || state.sepolia.nextBlock <= 0) {
      state.sepolia.nextBlock = safeLatest;
    }

    const fromBlock = state.sepolia.nextBlock;
    if (fromBlock > safeLatest) return;

    const toBlock = Math.min(safeLatest, fromBlock + maxRangeSepolia - 1);

    let logs = [];
    try {
      logs = await getLogs(fromBlock, toBlock);
    } catch (e) {
      console.log(`[${nowIso()}] [warn] getLogs failed ${fromBlock}-${toBlock}: ${e?.message || e}`);
      return;
    }

    state.sepolia.lastSeenBlock = toBlock;

    if (logs.length) {
      console.log(`[${nowIso()}] [sepolia] Locked logs=${logs.length} range=${fromBlock}-${toBlock}`);
    }

    for (const log of logs) {
      let parsed;
      try { parsed = sourceIface.parseLog({ topics: log.topics, data: log.data }); }
      catch { continue; }

      const user = parsed.args[0];
      const amount = parsed.args[1];
      const nonce = parsed.args[2];

      let already = false;
      try { already = await isProcessedOnTarget(nonce); }
      catch (e) {
        console.log(`[${nowIso()}] [warn] processedNonces(${nonce}) check failed: ${e?.message || e}`);
        continue;
      }

      if (already) {
        console.log(`[${nowIso()}] [skip] nonce=${nonce.toString()} already processed (target)`);
        continue;
      }

      const ctx = {
        to: user,
        amount,
        nonce,
        sourceChainId: 11155111n,
        targetChainId: 80002n,
      };
      const args = buildArgsByHeuristic(mintFrag, ctx);

      console.log(`[${nowIso()}] [mint] nonce=${nonce.toString()} amount=${formatUnitsSafe(amount, 18)} to=${user}`);
      try {
        const out = await sendMint(ctx, args, log.transactionHash);
        if (!out.dry) {
          console.log(`  srcTx=${log.transactionHash}`);
          console.log(`  dstTx=${out.txHash}`);
          console.log(`  confirmed block=${out.blockNumber} (amoy provider #${out.providerIndex})`);
          state.sepolia.lastProcessed = {
            nonce: nonce.toString(),
            blockNumber: log.blockNumber,
            srcTx: log.transactionHash,
            dstTx: out.txHash
          };
        }
      } catch (e) {
        console.log(`[${nowIso()}] [fatal] mint failed nonce=${nonce.toString()}: ${e?.message || e}`);
      }
    }

    state.sepolia.nextBlock = toBlock + 1;
    state.updatedAt = nowIso();
    saveJsonAtomic(stateFile, state);
  }

  while (true) {
    try { await tick(); }
    catch (e) { console.log(`[${nowIso()}] [Fatal] ${e?.stack || e?.message || e}`); }
    await new Promise(r => setTimeout(r, pollMs));
  }
}

main().catch((e) => {
  console.error(`[${nowIso()}] [Fatal]`, e?.stack || e?.message || e);
  process.exitCode = 1;
});
