/**
 * AegisBridge - Request Return (Amoy -> Sepolia)
 *
 * This script initiates the RETURN flow on Amoy by calling a "burn/return/request" function
 * on TargetBridge (auto-detected from ABI unless you force it).
 *
 * Why: After you mint wATT on Amoy, you can burn/request return to unlock ATT back on Sepolia.
 *
 * Run:
 *   npx hardhat run --network amoy scripts/amoy_request_return.js
 *
 * Env (recommended):
 *   AMOY_TARGET_BRIDGE_ADDRESS=0x...
 *   AMOY_WATT_TOKEN=0x...                 (optional, used for auto-approve if needed)
 *
 *   RETURN_AMOUNT=10                      (human units, default 1)
 *   TOKEN_DECIMALS=18                     (default 18)
 *   RETURN_RECIPIENT=0x...                (optional; defaults to signer)
 *
 *   RETURN_FUNCTION=requestReturn         (optional; force TargetBridge function)
 *   RETURN_AUTO_APPROVE=true              (optional; approve bridge to spend wATT if needed)
 *
 * Notes:
 * - Hardhat `run` does NOT accept positional args reliably; use env vars.
 */

require("dotenv").config();
const hre = require("hardhat");

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
];

function env(name, def = "") {
  const v = process.env[name];
  return (v === undefined || v === null || String(v).trim() === "") ? def : String(v).trim();
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

function looksLikeRecipient(name) {
  const n = (name || "").toLowerCase();
  return n.includes("to") || n.includes("recipient") || n.includes("receiver") || n.includes("user") || n.includes("account");
}
function looksLikeAmount(name) {
  const n = (name || "").toLowerCase();
  return n.includes("amount") || n.includes("value") || n.includes("wad");
}

async function main() {
  const { ethers, network } = hre;

  const targetBridgeAddress = pickEnv(
    "AMOY_TARGET_BRIDGE_ADDRESS",
    "AMOY_TARGET_BRIDGE_V2",
    "TARGET_BRIDGE_AMOY",
    "AMOY_BRIDGE_ADDRESS"
  );
  if (!targetBridgeAddress) {
    throw new Error("Missing AMOY_TARGET_BRIDGE_ADDRESS (or AMOY_TARGET_BRIDGE_V2/TARGET_BRIDGE_AMOY) in .env");
  }

  const wattToken = pickEnv("AMOY_WATT_TOKEN", "AMOY_WATT_TOKEN", "WATT_AMOY", "AMOY_WATT");
  const amountHuman = env("RETURN_AMOUNT", "1");
  const decimals = Number(env("TOKEN_DECIMALS", "18"));
  const amount = ethers.parseUnits(amountHuman, decimals);

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  const recipient = env("RETURN_RECIPIENT", "") || signerAddr;

  const forcedFn = env("RETURN_FUNCTION", "");
  const autoApprove = envBool("RETURN_AUTO_APPROVE", false);

  console.log("=== AegisBridge Return Request (Amoy) ===");
  console.log("Network        :", network.name, `(chainId ${network.config.chainId})`);
  console.log("Signer         :", signerAddr);
  console.log("TargetBridge   :", targetBridgeAddress);
  if (wattToken) console.log("wATT token     :", wattToken);
  console.log("Recipient      :", recipient);
  console.log("Return amount  :", amountHuman, `(units: ${amount.toString()}, decimals: ${decimals})`);
  if (forcedFn) console.log("Return fn      :", forcedFn);
  console.log("");

  // Load TargetBridge ABI
  let targetArtifact;
  try {
    targetArtifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");
  } catch {
    targetArtifact = await hre.artifacts.readArtifact("TargetBridge");
  }
  const targetBridge = await ethers.getContractAt(targetArtifact.abi, targetBridgeAddress, signer);

  // Optional: approve wATT spending for bridge (some designs need transferFrom before burn)
  if (autoApprove && wattToken) {
    const token = await ethers.getContractAt(ERC20_ABI, wattToken, signer);
    let sym = "wATT";
    try { sym = await token.symbol(); } catch {}
    let dec = decimals;
    try { dec = Number(await token.decimals()); } catch {}

    const bal = await token.balanceOf(signerAddr);
    console.log(`[ERC20] ${sym} balance:`, ethers.formatUnits(bal, dec));

    const allowance = await token.allowance(signerAddr, targetBridgeAddress);
    console.log(`[ERC20] allowance -> TargetBridge:`, allowance.toString());

    if (allowance < amount) {
      console.log("[ERC20] approving MaxUint256...");
      const tx = await token.approve(targetBridgeAddress, ethers.MaxUint256);
      console.log("approve tx:", tx.hash);
      await tx.wait();
      console.log("[ERC20] approve confirmed\n");
    } else {
      console.log("[ERC20] allowance sufficient (skip approve)\n");
    }
  }

  const iface = targetBridge.interface;
  const frags = iface.fragments.filter(
    (f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure"
  );

  const nameRegex = /(burn|return|withdraw|redeem|unlock|request)/i;
  const candidates = frags.filter(f => nameRegex.test(f.name));

  async function tryCall(fnName, inputs) {
    const args = [];
    let usedAmount = false;

    for (const inp of inputs) {
      const t = inp.type;
      const n = inp.name || "";

      if (t === "address") {
        args.push(looksLikeRecipient(n) ? recipient : recipient);
        continue;
      }
      if (/^uint/.test(t)) {
        // Put AMOUNT into the first uint-ish param, then fill others with 0
        if (!usedAmount && looksLikeAmount(n)) {
          args.push(amount); usedAmount = true; continue;
        }
        if (!usedAmount) { args.push(amount); usedAmount = true; continue; }
        args.push(0n);
        continue;
      }
      if (t === "bytes32") { args.push(ethers.ZeroHash); continue; }
      if (t === "bytes") { args.push("0x"); continue; }
      if (t === "bool") { args.push(true); continue; }
      return { ok: false, reason: `unsupported param type ${t}` };
    }

    if (!usedAmount) return { ok: false, reason: "no uint param to place RETURN_AMOUNT" };

    const fn = targetBridge.getFunction(fnName);

    try {
      await fn.staticCall(...args);
    } catch (e) {
      return { ok: false, reason: `staticCall failed: ${e?.shortMessage || e?.message || e}` };
    }

    console.log(`Calling TargetBridge.${fnName}(${inputs.map(i => i.type).join(", ")})`);
    console.log("Args:", args.map(a => (typeof a === "bigint" ? a.toString() : a)));

    const gasLimitEnv = env("RETURN_GAS_LIMIT", "");
    const overrides = {};
    if (gasLimitEnv) overrides.gasLimit = BigInt(gasLimitEnv);

    const tx = await fn(...args, overrides);
    console.log("tx:", tx.hash);

    const receipt = await tx.wait();
    console.log("confirmed in block:", receipt.blockNumber);

    // Print events emitted by TargetBridge (this is how you see the return nonce)
    const logs = receipt.logs.filter(
      (l) => (l.address || "").toLowerCase() === targetBridgeAddress.toLowerCase()
    );
    if (logs.length) {
      console.log("\nEvents (TargetBridge):");
      for (const l of logs) {
        try {
          const parsed = iface.parseLog({ topics: l.topics, data: l.data });
          console.log(`- ${parsed.name}`, parsed.args);
        } catch {
          // ignore
        }
      }
    }
    return { ok: true };
  }

  if (forcedFn) {
    const fnFrag = frags.find((f) => f.name === forcedFn);
    if (!fnFrag) {
      const available = candidates.map((f) => f.name).sort();
      throw new Error(`RETURN_FUNCTION="${forcedFn}" not found. Candidate names: ${available.join(", ")}`);
    }
    const res = await tryCall(forcedFn, fnFrag.inputs);
    if (!res.ok) throw new Error(`Forced function failed: ${res.reason}`);
    return;
  }

  if (!candidates.length) {
    const available = frags.map((f) => `${f.name}(${f.inputs.map(i => i.type).join(",")})`);
    throw new Error(
      "No burn/return/withdraw/redeem/unlock/request function candidates found.\n" +
      "Non-view functions:\n" + available.join("\n")
    );
  }

  console.log("Auto-detect candidates:");
  for (const c of candidates) {
    console.log(`- ${c.name}(${c.inputs.map(i => i.type).join(", ")})`);
  }
  console.log("");

  for (const c of candidates) {
    const res = await tryCall(c.name, c.inputs);
    if (res.ok) return;
    console.log(`[skip] ${c.name}: ${res.reason}\n`);
  }

  throw new Error(
    "No candidate return function succeeded.\n" +
    "Set RETURN_FUNCTION in .env to the correct TargetBridge function name."
  );
}

main().catch((e) => {
  console.error("\n[FATAL]", e?.stack || e?.message || e);
  process.exitCode = 1;
});
