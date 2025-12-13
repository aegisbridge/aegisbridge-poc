/**
 * AegisBridge v2 - Bidirectional Relayer (No FallbackProvider) + Health Server
 *
 * Run:
 *   node scripts/relayer_bidir_service_nofb.js
 *
 * Health:
 *   http://127.0.0.1:8081/healthz
 *   http://127.0.0.1:8081/state
 *   http://127.0.0.1:8081/version
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const http = require("http");
const { ethers } = require("ethers");

const VERSION = "v2.0.0-stepE";

function nowIso() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
function loadAbi(artifactPath) { return require(artifactPath).abi; }

function makeProviders(urls, network) {
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

      if (String(msg).toLowerCase().includes("network changed")) {
        console.log(`[${nowIso()}] [rpc-skip][${label}] removing endpoint #${i}: ${msg}`);
        providers.splice(i, 1);
        i--;
        continue;
      }
    }
  }
  return { ok: false, err: lastErr || "all providers failed" };
}

function scoreEvent(frag) {
  const types = frag.inputs.map(i => i.type);
  const addr = types.filter(t => t === "address").length;
  const uints = types.filter(t => /^uint/.test(t)).length;
  let s = 0;
  if (addr >= 1) s += 3;
  if (uints >= 2) s += 3;
  if (/return|burn|withdraw|redeem|unlock/i.test(frag.name)) s += 2;
  return s;
}
function pickReturnEvent(targetIface, forcedEventName = "") {
  const events = targetIface.fragments.filter(f => f.type === "event");
  if (forcedEventName) {
    const ev = events.find(e => e.name === forcedEventName);
    if (!ev) throw new Error(`RELAYER_RETURN_EVENT="${forcedEventName}" not found in TargetBridge ABI`);
    return ev;
  }
  const candidates = events.filter(e => /return|burn|withdraw|redeem|unlock/i.test(e.name));
  candidates.sort((a,b) => scoreEvent(b) - scoreEvent(a));
  if (!candidates.length) throw new Error("Could not auto-detect return/burn event on TargetBridge. Set RELAYER_RETURN_EVENT.");
  return candidates[0];
}

function pickExecFunction(iface, forcedName, regex, minInputs = 1) {
  const frags = iface.fragments
    .filter(f => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure")
    .filter(f => regex.test(f.name))
    .filter(f => (f.inputs?.length ?? 0) >= minInputs);

  if (forcedName) {
    const frag = iface.fragments.find(f => f.type === "function" && f.name === forcedName);
    if (!frag) throw new Error(`Function "${forcedName}" not found in ABI`);
    return frag;
  }

  const score = (frag) => {
    const types = frag.inputs.map(i => i.type);
    const hasAddr = types.includes("address");
    const uints = types.filter(t => /^uint/.test(t)).length;
    let s = 0;
    if (hasAddr) s += 2;
    if (uints >= 2) s += 2;
    if (/mint/i.test(frag.name)) s += 2;
    if (/unlock|release/i.test(frag.name)) s += 2;
    if (types.join(",").includes("bytes")) s -= 1;
    return s;
  };

  frags.sort((a,b) => score(b) - score(a));
  if (!frags.length) throw new Error(`Could not auto-detect function for ${regex}. Set override env.`);
  return frags[0];
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
    throw new Error(`Unsupported param type: ${t}`);
  }
  return args;
}

function isAlreadyProcessedMsg(msg) {
  const m = String(msg || "").toLowerCase();
  return m.includes("already processed") || m.includes("nonce already processed") || m.includes("already-processed");
}

function safePublicState(state, runtime) {
  return {
    version: VERSION,
    time: nowIso(),
    env: runtime.ENV,
    mode: runtime.MODE,
    contracts: runtime.contracts,
    rpc: runtime.rpc,
    state: {
      file: runtime.stateFile,
      updatedAt: state.updatedAt || null,
      sepolia: { nextBlock: state.sepolia?.nextBlock ?? null, lastSeenBlock: state.sepolia?.lastSeenBlock ?? null },
      amoy: { nextBlock: state.amoy?.nextBlock ?? null, lastSeenBlock: state.amoy?.lastSeenBlock ?? null },
    },
    last: runtime.last,
  };
}

async function main() {
  const runtime = {
    ENV: env("NETWORK_ENV", "testnet"),
    MODE: env("RELAYER_MODE", "bidir"), // bidir|forward|return
    last: { forwardAt: null, returnAt: null, errorAt: null, error: null },
    rpc: {},
    contracts: {},
    stateFile: env("RELAYER_STATE_FILE", path.join(".", "data", "relayer_state_bidir.json")),
  };

  const DRY_RUN = envBool("RELAYER_DRY_RUN", false);
  const HEALTH_PORT = envInt("HEALTH_PORT", 8081);

  const sepoliaUrls = collectRpc("SEPOLIA");
  const amoyUrls = collectRpc("AMOY");
  if (!sepoliaUrls.length) throw new Error("No Sepolia RPC URLs found.");
  if (!amoyUrls.length) throw new Error("No Amoy RPC URLs found.");

  const pk = pickEnv("DEPLOYER_PRIVATE_KEY", "PRIVATE_KEY");
  if (!pk) throw new Error("Missing PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) in .env");

  const sourceBridgeAddress = pickEnv("SEPOLIA_SOURCE_BRIDGE_V2","SEPOLIA_SOURCE_BRIDGE","SOURCE_BRIDGE_SEPOLIA","SEPOLIA_BRIDGE_ADDRESS");
  const targetBridgeAddress = pickEnv("AMOY_TARGET_BRIDGE_V2","TARGET_BRIDGE_AMOY","AMOY_BRIDGE_ADDRESS");
  if (!sourceBridgeAddress) throw new Error("Missing SourceBridge address env.");
  if (!targetBridgeAddress) throw new Error("Missing TargetBridge address env.");

  runtime.contracts = { sourceBridge: sourceBridgeAddress, targetBridge: targetBridgeAddress };
  runtime.rpc = { sepolia: sepoliaUrls, amoy: amoyUrls };

  const sepoliaProviders = makeProviders(sepoliaUrls, { name: "sepolia", chainId: 11155111 });
  const amoyProviders = makeProviders(amoyUrls, { name: "amoy", chainId: 80002 });

  const sourceAbi = loadAbi("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
  const targetAbi = loadAbi("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");
  const sourceIface = new ethers.Interface(sourceAbi);
  const targetIface = new ethers.Interface(targetAbi);

  console.log(`[dotenv] loaded at ${nowIso()}\n`);
  console.log("==================================================");
  console.log("=== AegisBridge v2 Relayer Service (NoFB) ========");
  console.log("==================================================");
  console.log("Version       :", VERSION);
  console.log("Env           :", runtime.ENV);
  console.log("Mode          :", runtime.MODE);
  console.log("Dry run       :", DRY_RUN);
  console.log("Health port   :", HEALTH_PORT);
  console.log("SourceBridge  :", sourceBridgeAddress);
  console.log("TargetBridge  :", targetBridgeAddress);
  console.log("");

  const resetState = envBool("RELAYER_RESET_STATE", false);
  const defaultState = {
    schema: 1,
    updatedAt: null,
    sepolia: { nextBlock: envInt("RELAYER_FROM_BLOCK_SEPOLIA", 0) || 0, lastSeenBlock: 0 },
    amoy: { nextBlock: envInt("RELAYER_FROM_BLOCK_AMOY", 0) || 0, lastSeenBlock: 0 },
    skip: { returnNonces: {} }
  };
  const state = resetState ? defaultState : loadJson(runtime.stateFile, defaultState);
  if (!state.skip) state.skip = { returnNonces: {} };
  if (!state.skip.returnNonces) state.skip.returnNonces = {};

  const pollMs = envInt("RELAYER_POLL_INTERVAL_MS", 5000);
  const sepoliaMaxRange = envInt("SEPOLIA_LOG_MAX_RANGE", 10);
  const amoyMaxRange = envInt("AMOY_LOG_MAX_RANGE", 2000);
  const confSepolia = envInt("RELAYER_CONFIRMATIONS_SEPOLIA", 2);
  const confAmoy = envInt("RELAYER_CONFIRMATIONS_AMOY", 2);
  const mintGasLimit = BigInt(env("RELAYER_MINT_GAS_LIMIT", "300000"));
  const unlockGasLimit = BigInt(env("RELAYER_UNLOCK_GAS_LIMIT", "300000"));

  const mintFrag = pickExecFunction(targetIface, env("RELAYER_MINT_FUNCTION",""), /mint|release|finalize|claim|bridge/i, 3);
  const unlockFrag = pickExecFunction(sourceIface, env("RELAYER_UNLOCK_FUNCTION",""), /unlock|release|finalize|withdraw|redeem/i, 2);
  const returnEvent = pickReturnEvent(targetIface, env("RELAYER_RETURN_EVENT",""));

  const lockedTopic = ethers.id("Locked(address,uint256,uint256)");

  console.log(`[forward] mint function : ${mintFrag.name}(${mintFrag.inputs.map(i=>i.type).join(",")})`);
  console.log(`[return ] unlock function: ${unlockFrag.name}(${unlockFrag.inputs.map(i=>i.type).join(",")})`);
  console.log(`[return ] event         : ${returnEvent.name}(${returnEvent.inputs.map(i=>i.type).join(",")})`);
  console.log("");
  console.log(`[state] file=${runtime.stateFile}`);
  console.log(`[state] sepolia.nextBlock=${state.sepolia.nextBlock || "(auto)"}`);
  console.log(`[state] amoy.nextBlock=${state.amoy.nextBlock || "(auto)"}`);
  console.log("");

  const server = http.createServer((req, res) => {
    if (!req.url) { res.writeHead(400); return res.end("bad request"); }
    if (req.url === "/healthz") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(safePublicState(state, runtime))); }
    if (req.url === "/state") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ...safePublicState(state, runtime), raw: state })); }
    if (req.url === "/version") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ version: VERSION, time: nowIso() })); }
    res.writeHead(404); res.end("not found");
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`[health] listening on http://127.0.0.1:${HEALTH_PORT} (endpoints: /healthz, /state, /version)\n`);
  });

  let shouldStop = false;
  const stop = async (signal) => {
    if (shouldStop) return;
    shouldStop = true;
    console.log(`\n[${nowIso()}] [shutdown] received ${signal}, saving state...`);
    try { state.updatedAt = nowIso(); saveJsonAtomic(runtime.stateFile, state); } catch {}
    try { server.close(); } catch {}
    console.log(`[${nowIso()}] [shutdown] bye`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  async function getSafeLatest(providers, confirmations, label) {
    const r = await tryProviders(providers, async (p) => {
      const latest = await p.getBlockNumber();
      return Math.max(0, latest - confirmations);
    }, label);
    if (!r.ok) throw new Error(`${label} getBlockNumber failed: ${r.err}`);
    return r.res;
  }

  async function getLogs(providers, label, filter) {
    const r = await tryProviders(providers, async (p) => p.getLogs(filter), label);
    if (!r.ok) throw new Error(`${label} getLogs failed: ${r.err}`);
    return r.res;
  }

  async function callViewProcessed(contractAddress, abi, providers, label, nonce) {
    try { new ethers.Interface(abi).getFunction("processedNonces"); } catch { return null; }
    const r = await tryProviders(providers, async (p) => {
      const c = new ethers.Contract(contractAddress, abi, p);
      return await c.processedNonces(nonce);
    }, label);
    if (!r.ok) throw new Error(`${label} processedNonces failed: ${r.err}`);
    return r.res;
  }

  async function sendTx(contractAddress, abi, providers, label, fnName, args, gasLimit) {
    if (DRY_RUN) return { dry: true };
    const r = await tryProviders(providers, async (p, idx) => {
      const w = new ethers.Wallet(normalizePk(pk), p);
      const c = new ethers.Contract(contractAddress, abi, w);
      const fn = c.getFunction(fnName);
      await fn.staticCall(...args);
      const tx = await fn(...args, { gasLimit });
      const rc = await tx.wait();
      return { txHash: tx.hash, blockNumber: rc.blockNumber, providerIndex: idx };
    }, label);
    if (!r.ok) throw new Error(`${label} tx failed: ${r.err}`);
    return r.res;
  }

  async function tickForward() {
    const safeLatest = await getSafeLatest(sepoliaProviders, confSepolia, "sepolia");
    if (!state.sepolia.nextBlock || state.sepolia.nextBlock <= 0) state.sepolia.nextBlock = safeLatest;

    const fromBlock = state.sepolia.nextBlock;
    if (fromBlock > safeLatest) return;

    const toBlock = Math.min(safeLatest, fromBlock + sepoliaMaxRange - 1);
    const filter = { address: sourceBridgeAddress, fromBlock, toBlock, topics: [lockedTopic] };

    const logs = await getLogs(sepoliaProviders, "sepolia", filter);
    state.sepolia.lastSeenBlock = toBlock;

    if (logs.length) console.log(`[${nowIso()}] [sepolia] Locked logs=${logs.length} range=${fromBlock}-${toBlock}`);

    for (const log of logs) {
      let parsed;
      try { parsed = sourceIface.parseLog({ topics: log.topics, data: log.data }); } catch { continue; }
      const user = parsed.args[0];
      const amount = parsed.args[1];
      const nonce = parsed.args[2];

      const already = await callViewProcessed(targetBridgeAddress, targetAbi, amoyProviders, "amoy", nonce);
      if (already === true) {
        console.log(`[${nowIso()}] [skip] forward nonce=${nonce.toString()} already processed (target)`);
        continue;
      }

      const ctx = { to: user, amount, nonce, sourceChainId: 11155111n, targetChainId: 80002n };
      const args = buildArgsByHeuristic(mintFrag, ctx);

      console.log(`[${nowIso()}] [mint] forward nonce=${nonce.toString()} amount=${amount.toString()} to=${user}`);
      const out = await sendTx(targetBridgeAddress, targetAbi, amoyProviders, "amoy", mintFrag.name, args, mintGasLimit);

      if (!out.dry) {
        console.log(`  srcTx=${log.transactionHash}`);
        console.log(`  dstTx=${out.txHash}`);
        console.log(`  confirmed block=${out.blockNumber} (amoy provider #${out.providerIndex})`);
      }
    }

    state.sepolia.nextBlock = toBlock + 1;
    state.updatedAt = nowIso();
    saveJsonAtomic(runtime.stateFile, state);
    runtime.last.forwardAt = nowIso();
  }

  async function tickReturn() {
    const safeLatest = await getSafeLatest(amoyProviders, confAmoy, "amoy");
    if (!state.amoy.nextBlock || state.amoy.nextBlock <= 0) state.amoy.nextBlock = safeLatest;

    const fromBlock = state.amoy.nextBlock;
    if (fromBlock > safeLatest) return;

    const toBlock = Math.min(safeLatest, fromBlock + amoyMaxRange - 1);
    const filter = { address: targetBridgeAddress, fromBlock, toBlock, topics: [returnEvent.topicHash] };

    const logs = await getLogs(amoyProviders, "amoy", filter);
    state.amoy.lastSeenBlock = toBlock;

    if (logs.length) console.log(`[${nowIso()}] [amoy] ${returnEvent.name} logs=${logs.length} range=${fromBlock}-${toBlock}`);

    for (const log of logs) {
      let parsed;
      try { parsed = targetIface.parseLog({ topics: log.topics, data: log.data }); } catch { continue; }

      const vals = [];
      for (const v of parsed.args) vals.push(v);

      const user = vals.find(v => typeof v === "string" && v.startsWith("0x")) || null;
      const uints = vals.filter(v => typeof v === "bigint");
      const amount = uints[0] ?? null;
      const nonce = uints[1] ?? null;

      if (!user || amount === null || nonce === null) continue;

      const nonceKey = nonce.toString();
      if (state.skip.returnNonces[nonceKey]) {
        console.log(`[${nowIso()}] [skip] return nonce=${nonceKey} (cached): ${state.skip.returnNonces[nonceKey]}`);
        continue;
      }

      try {
        const already = await callViewProcessed(sourceBridgeAddress, sourceAbi, sepoliaProviders, "sepolia", nonce);
        if (already === true) {
          console.log(`[${nowIso()}] [skip] return nonce=${nonceKey} already processed (source view)`);
          state.skip.returnNonces[nonceKey] = "already processed (source view)";
          continue;
        }
      } catch {}

      const ctx = { to: user, amount, nonce, sourceChainId: 11155111n, targetChainId: 80002n };
      const args = buildArgsByHeuristic(unlockFrag, ctx);

      console.log(`[${nowIso()}] [unlock] return nonce=${nonceKey} amount=${amount.toString()} to=${user}`);
      try {
        const out = await sendTx(sourceBridgeAddress, sourceAbi, sepoliaProviders, "sepolia", unlockFrag.name, args, unlockGasLimit);
        if (!out.dry) {
          console.log(`  srcTx=${log.transactionHash}`);
          console.log(`  dstTx=${out.txHash}`);
          console.log(`  confirmed block=${out.blockNumber} (sepolia provider #${out.providerIndex})`);
        }
      } catch (e) {
        const msg = e?.message || e;
        if (isAlreadyProcessedMsg(msg)) {
          console.log(`[${nowIso()}] [skip] return nonce=${nonceKey} => ${msg}`);
          state.skip.returnNonces[nonceKey] = "already processed (revert)";
        } else {
          console.log(`[${nowIso()}] [warn] unlock failed nonce=${nonceKey}: ${msg}`);
        }
      }
    }

    state.amoy.nextBlock = toBlock + 1;
    state.updatedAt = nowIso();
    saveJsonAtomic(runtime.stateFile, state);
    runtime.last.returnAt = nowIso();
  }

  console.log(`[loop] poll=${pollMs}ms | forwardRange=${sepoliaMaxRange} | returnRange=${amoyMaxRange}\n`);

  while (!shouldStop) {
    try {
      if (runtime.MODE === "bidir" || runtime.MODE === "forward") await tickForward();
      if (runtime.MODE === "bidir" || runtime.MODE === "return") await tickReturn();
      runtime.last.error = null;
    } catch (e) {
      runtime.last.errorAt = nowIso();
      runtime.last.error = String(e?.message || e);
      console.log(`[${nowIso()}] [Fatal] ${e?.stack || e?.message || e}`);
    }
    await sleep(pollMs);
  }
}

main().catch((e) => {
  console.error(`[${nowIso()}] [Fatal]`, e?.stack || e?.message || e);
  process.exitCode = 1;
});
