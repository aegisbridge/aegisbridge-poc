/**
 * AegisBridge - Stateful Testnet Relayer (Sepolia <-> Amoy) [Robust RPC]
 *
 * Fixes vs previous version:
 * - Probes each RPC URL to detect chainId and FILTERS out mismatched networks before building FallbackProvider.
 * - Does NOT force a static network on JsonRpcProvider (prevents "network changed: 1 => 11155111").
 *
 * Run:
 *   node scripts/testnet_relayer_stateful.js
 *
 * State:
 *   RELAYER_STATE_FILE=./data/relayer_state.json
 *   RELAYER_RESET_STATE=true
 *
 * Scanning:
 *   RELAYER_FROM_BLOCK_SEPOLIA=...
 *   SEPOLIA_LOG_MAX_RANGE=10
 *   RELAYER_POLL_INTERVAL_MS=5000
 *   RELAYER_CONFIRMATIONS_SEPOLIA=2
 *
 * Mint:
 *   RELAYER_MINT_GAS_LIMIT=300000
 *   RELAYER_MINT_FUNCTION=... (optional)
 *
 * RPC:
 *   SEPOLIA_RPC_URL/_1/_2/_3
 *   AMOY_RPC_URL/_1/_2/_3
 *   RPC_QUORUM_SEPOLIA=1
 *   RPC_QUORUM_AMOY=1
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
  // artifactPath is relative to this script file in scripts/
  return require(artifactPath).abi;
}

function formatUnitsSafe(value, decimals = 18) {
  try { return ethers.formatUnits(value, decimals); } catch { return String(value); }
}

async function probeAndFilterUrls(urls, label) {
  // Detect chainId for each URL, keep only those matching the first successful chainId.
  let expected = null;
  const good = [];
  const bad = [];
  for (const u of urls) {
    try {
      const p = new ethers.JsonRpcProvider(u);
      const n = await p.getNetwork();
      const cid = BigInt(n.chainId);
      if (expected === null) expected = cid;

      if (cid === expected) {
        good.push({ url: u, chainId: cid });
      } else {
        bad.push({ url: u, chainId: cid, reason: `mismatch (expected ${expected})` });
      }
    } catch (e) {
      bad.push({ url: u, chainId: null, reason: e?.shortMessage || e?.message || String(e) });
    }
  }

  if (!good.length) {
    const lines = bad.map(x => `- ${x.url} (${x.reason})`).join("\n");
    throw new Error(`[${label}] No working RPC endpoints.\n${lines}`);
  }

  return { chainId: expected, good, bad };
}

function buildFallbackProvider(goodUrls, quorum, label) {
  const configs = goodUrls.map((item, idx) => {
    const provider = new ethers.JsonRpcProvider(item.url);
    return { provider, priority: idx + 1, weight: 1, stallTimeout: 2000 };
  });
  return new ethers.FallbackProvider(configs, quorum);
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

  // Probe and filter endpoints by detected chainId (prevents network mismatch crash)
  console.log(`[dotenv] loaded at ${nowIso()}\n`);

  const probSep = await probeAndFilterUrls(sepoliaUrls, "sepolia");
  const probAmoy = await probeAndFilterUrls(amoyUrls, "amoy");

  const quorumSep = envInt("RPC_QUORUM_SEPOLIA", 1);
  const quorumAmoy = envInt("RPC_QUORUM_AMOY", 1);

  const sepoliaProvider = buildFallbackProvider(probSep.good, quorumSep, "sepolia");
  const amoyProvider = buildFallbackProvider(probAmoy.good, quorumAmoy, "amoy");

  const walletSepolia = new ethers.Wallet(normalizePk(pk), sepoliaProvider);
  const walletAmoy = new ethers.Wallet(normalizePk(pk), amoyProvider);

  const sourceAbi = loadAbi("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
  const targetAbi = loadAbi("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

  const sourceBridge = new ethers.Contract(sourceBridgeAddress, sourceAbi, walletSepolia);
  const targetBridge = new ethers.Contract(targetBridgeAddress, targetAbi, walletAmoy);

  console.log("[RPC][sepolia] used:");
  probSep.good.forEach((x, i) => console.log(`  - (${i === 0 ? "primary" : "backup #" + i}) ${x.url} (chainId ${x.chainId})`));
  if (probSep.bad.length) {
    console.log("[RPC][sepolia] skipped:");
    probSep.bad.forEach(x => console.log(`  - ${x.url} (${x.reason})`));
  }

  console.log("\n[RPC][amoy] used:");
  probAmoy.good.forEach((x, i) => console.log(`  - (${i === 0 ? "primary" : "backup #" + i}) ${x.url} (chainId ${x.chainId})`));
  if (probAmoy.bad.length) {
    console.log("[RPC][amoy] skipped:");
    probAmoy.bad.forEach(x => console.log(`  - ${x.url} (${x.reason})`));
  }

  console.log("==============================================");
  console.log("=== AegisBridge v2 Testnet Relayer (State) ===");
  console.log("==============================================");
  console.log("Env            :", ENV);
  console.log("Sepolia chainId:", probSep.chainId.toString());
  console.log("Amoy chainId   :", probAmoy.chainId.toString());
  console.log("SourceBridge   :", sourceBridgeAddress);
  console.log("TargetBridge   :", targetBridgeAddress);
  console.log("Relayer wallet :", await walletSepolia.getAddress());
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

  // Config
  const pollMs = envInt("RELAYER_POLL_INTERVAL_MS", 5000);
  const maxRangeSepolia = envInt("SEPOLIA_LOG_MAX_RANGE", 10);
  const confSepolia = envInt("RELAYER_CONFIRMATIONS_SEPOLIA", 2);

  const mintGasLimit = BigInt(env("RELAYER_MINT_GAS_LIMIT", "300000"));
  const forcedMintFn = env("RELAYER_MINT_FUNCTION", "");

  // Event topic
  const lockedTopic = ethers.id("Locked(address,uint256,uint256)");

  const mintFrag = pickMintFunction(targetBridge.interface, forcedMintFn);
  console.log(`[mint] function selected: ${mintFrag.name}(${mintFrag.inputs.map(i=>i.type).join(",")})\n`);
  console.log(`[loop] poll=${pollMs}ms | sepoliaRangeMax=${maxRangeSepolia} | confirmations=${confSepolia}\n`);

  async function getLatestSafeBlock(provider, confirmations) {
    const latest = await provider.getBlockNumber();
    return Math.max(0, latest - confirmations);
  }

  async function scanAndProcessSepolia() {
    const safeLatest = await getLatestSafeBlock(sepoliaProvider, confSepolia);

    if (!state.sepolia.nextBlock || state.sepolia.nextBlock <= 0) {
      state.sepolia.nextBlock = safeLatest;
    }

    let fromBlock = state.sepolia.nextBlock;
    if (fromBlock > safeLatest) return false;

    const toBlock = Math.min(safeLatest, fromBlock + maxRangeSepolia - 1);

    const filter = { address: sourceBridgeAddress, fromBlock, toBlock, topics: [lockedTopic] };

    let logs = [];
    try { logs = await sepoliaProvider.getLogs(filter); }
    catch (e) {
      console.log(`[${nowIso()}] [warn] getLogs failed ${fromBlock}-${toBlock}: ${e?.shortMessage || e?.message || e}`);
      return false;
    }

    state.sepolia.lastSeenBlock = toBlock;

    if (logs.length) {
      console.log(`[${nowIso()}] [sepolia] Locked logs=${logs.length} range=${fromBlock}-${toBlock}`);
    }

    for (const log of logs) {
      let parsed;
      try { parsed = sourceBridge.interface.parseLog({ topics: log.topics, data: log.data }); }
      catch { continue; }

      const user = parsed.args[0];
      const amount = parsed.args[1];
      const nonce = parsed.args[2];

      let already = false;
      try { already = await targetBridge.processedNonces(nonce); }
      catch (e) {
        console.log(`[${nowIso()}] [warn] processedNonces(${nonce}) check failed: ${e?.shortMessage || e?.message || e}`);
      }
      if (already) {
        console.log(`[${nowIso()}] [skip] nonce=${nonce.toString()} already processed (target)`);
        continue;
      }

      const ctx = {
        to: user,
        amount,
        nonce,
        sourceChainId: BigInt(probSep.chainId),
        targetChainId: BigInt(probAmoy.chainId),
      };
      const args = buildArgsByHeuristic(mintFrag, ctx);

      if (DRY_RUN) {
        console.log(`[${nowIso()}] [dry] would mint nonce=${nonce.toString()} amount=${formatUnitsSafe(amount, 18)} to=${user}`);
        continue;
      }

      try {
        const fn = targetBridge.getFunction(mintFrag.name);
        await fn.staticCall(...args);
      } catch (e) {
        console.log(`[${nowIso()}] [fail] staticCall mint nonce=${nonce.toString()} => ${e?.shortMessage || e?.message || e}`);
        continue;
      }

      console.log(`[${nowIso()}] [mint] nonce=${nonce.toString()} amount=${formatUnitsSafe(amount, 18)} to=${user}`);
      try {
        const fn = targetBridge.getFunction(mintFrag.name);
        const tx = await fn(...args, { gasLimit: mintGasLimit });
        console.log(`  srcTx=${log.transactionHash}`);
        console.log(`  dstTx=${tx.hash}`);
        const rc = await tx.wait();
        console.log(`  confirmed block=${rc.blockNumber}`);

        state.sepolia.lastProcessed = {
          nonce: nonce.toString(),
          blockNumber: log.blockNumber,
          srcTx: log.transactionHash,
          dstTx: tx.hash
        };

      } catch (e) {
        console.log(`[${nowIso()}] [fatal] mint tx failed nonce=${nonce.toString()} => ${e?.shortMessage || e?.message || e}`);
      }
    }

    state.sepolia.nextBlock = toBlock + 1;
    state.updatedAt = nowIso();
    saveJsonAtomic(stateFile, state);

    return logs.length > 0;
  }

  while (true) {
    try { await scanAndProcessSepolia(); }
    catch (e) { console.log(`[${nowIso()}] [Fatal] ${e?.stack || e?.message || e}`); }

    await new Promise(r => setTimeout(r, pollMs));
  }
}

main().catch((e) => {
  console.error(`[${nowIso()}] [Fatal]`, e?.stack || e?.message || e);
  process.exitCode = 1;
});
