/**
 * AegisBridge - Sepolia initiate bridge script
 *
 * Usage (PowerShell):
 *   # Put these in your .env (recommended) OR export per session:
 *   #   SEPOLIA_SOURCE_BRIDGE_ADDRESS=0x...
 *   #   TARGET_CHAIN_ID=80002
 *   #   RECIPIENT=0x...                (optional; defaults to your signer)
 *   #   AMOUNT=1000                    (human units)
 *   #   TOKEN_DECIMALS=18              (optional; default 18)
 *   #   SEPOLIA_TOKEN_ADDRESS=0x...    (optional; only needed if SourceBridge pulls ERC20)
 *   #   AUTO_APPROVE=true              (optional; if token allowance is required)
 *   #   BRIDGE_FUNCTION=initiateBridge (optional; force a specific function name)
 *
 *   npx hardhat run --network sepolia scripts/sepolia_initiate_bridge.js
 *
 * Notes:
 * - Hardhat `run` does NOT accept positional args after `--`. Use .env variables instead.
 * - This script will auto-detect a suitable non-view function on SourceBridge if you don't
 *   specify BRIDGE_FUNCTION.
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

function envBool(name, defaultValue = false) {
  const v = (process.env[name] ?? "").toLowerCase().trim();
  if (!v) return defaultValue;
  return ["1", "true", "yes", "y", "on"].includes(v);
}

function pickEnv(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim().length > 0) return String(v).trim();
  }
  return "";
}

function isUintType(t) {
  return /^uint(\d+)?$/.test(t);
}
function isIntType(t) {
  return /^int(\d+)?$/.test(t);
}

function looksLikeChainId(inputName) {
  const n = (inputName ?? "").toLowerCase();
  return n.includes("chain") || n.includes("dst") || n.includes("target");
}

function looksLikeRecipient(inputName) {
  const n = (inputName ?? "").toLowerCase();
  return (
    n.includes("to") ||
    n.includes("recipient") ||
    n.includes("receiver") ||
    n.includes("beneficiary") ||
    n.includes("account")
  );
}

function looksLikeToken(inputName) {
  const n = (inputName ?? "").toLowerCase();
  return n.includes("token") || n.includes("asset");
}

async function main() {
  const { ethers, network } = hre;

  const sourceBridgeAddress = pickEnv(
    "SEPOLIA_SOURCE_BRIDGE_ADDRESS",
    "SOURCE_BRIDGE_SEPOLIA",
    "SOURCE_BRIDGE_ADDRESS"
  );
  if (!sourceBridgeAddress) {
    throw new Error(
      "Missing SEPOLIA_SOURCE_BRIDGE_ADDRESS (or SOURCE_BRIDGE_SEPOLIA) in .env"
    );
  }

  const amountHuman = pickEnv("AMOUNT") || "1000";
  const tokenDecimals = Number(pickEnv("TOKEN_DECIMALS") || "18");
  const amount = ethers.parseUnits(amountHuman, tokenDecimals);

  const targetChainId = BigInt(pickEnv("TARGET_CHAIN_ID") || "80002"); // Amoy default
  const forcedFn = pickEnv("BRIDGE_FUNCTION");
  const autoApprove = envBool("AUTO_APPROVE", false);

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  const recipient = pickEnv("RECIPIENT") || signerAddr;
  const tokenAddress = pickEnv("SEPOLIA_TOKEN_ADDRESS", "TOKEN_ADDRESS", "ROOT_TOKEN_ADDRESS");

  console.log("=== AegisBridge Initiate (Sepolia) ===");
  console.log("Network       :", network.name, `(chainId ${network.config.chainId})`);
  console.log("Signer        :", signerAddr);
  console.log("SourceBridge  :", sourceBridgeAddress);
  console.log("Recipient     :", recipient);
  console.log("TargetChainId :", targetChainId.toString());
  console.log("Amount        :", amountHuman, `(units: ${amount.toString()}, decimals: ${tokenDecimals})`);
  if (tokenAddress) console.log("Token         :", tokenAddress);
  if (forcedFn) console.log("Bridge fn     :", forcedFn);
  console.log("");

  // Load ABI from compiled artifacts path used by your relayer logs
  let sourceArtifact;
  try {
    sourceArtifact = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
  } catch {
    // fallback: allow Hardhat artifact loader
    sourceArtifact = await hre.artifacts.readArtifact("SourceBridge");
  }

  const sourceBridge = await ethers.getContractAt(sourceArtifact.abi, sourceBridgeAddress, signer);

  // Optional: auto-approve if your SourceBridge uses transferFrom on an ERC20
  if (autoApprove && tokenAddress) {
    const token = await ethers.getContractAt(ERC20_ABI, tokenAddress, signer);

    let sym = "TOKEN";
    try { sym = await token.symbol(); } catch {}
    let dec = tokenDecimals;
    try { dec = Number(await token.decimals()); } catch {}

    const bal = await token.balanceOf(signerAddr);
    console.log(`[ERC20] ${sym} balance:`, ethers.formatUnits(bal, dec));

    const allowance = await token.allowance(signerAddr, sourceBridgeAddress);
    console.log(`[ERC20] allowance -> SourceBridge:`, allowance.toString());

    if (allowance < amount) {
      console.log("[ERC20] approving MaxUint256...");
      const tx = await token.approve(sourceBridgeAddress, ethers.MaxUint256);
      console.log("approve tx:", tx.hash);
      await tx.wait();
      console.log("[ERC20] approve confirmed\n");
    } else {
      console.log("[ERC20] allowance sufficient (skip approve)\n");
    }
  }

  // Choose function to call
  const iface = sourceBridge.interface;
  const frags = iface.fragments.filter(
    (f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure"
  );

  const candidateNameRegex = /(initiate|bridge|lock|deposit|send|request)/i;

  const candidates = frags
    .filter((f) => candidateNameRegex.test(f.name))
    .map((f) => ({
      name: f.name,
      inputs: f.inputs.map((i) => ({ name: i.name, type: i.type })),
    }));

  async function tryCall(fnName, inputs) {
    // Build args by input types/names heuristics
    const args = [];
    let usedAmount = false;

    for (const inp of inputs) {
      const t = inp.type;
      const n = inp.name || "";

      if (isUintType(t) || isIntType(t)) {
        if (!usedAmount) {
          args.push(amount);
          usedAmount = true;
        } else if (looksLikeChainId(n)) {
          args.push(targetChainId);
        } else if ((n.toLowerCase().includes("nonce") || n.toLowerCase().includes("id"))) {
          args.push(BigInt(pickEnv("NONCE") || "0"));
        } else {
          // fallback for extra numeric params
          args.push(BigInt(pickEnv(n.toUpperCase()) || "0"));
        }
        continue;
      }

      if (t === "address") {
        if (looksLikeToken(n) && tokenAddress) args.push(tokenAddress);
        else if (looksLikeRecipient(n)) args.push(recipient);
        else args.push(recipient);
        continue;
      }

      if (t === "bool") {
        args.push(envBool(n.toUpperCase(), true));
        continue;
      }

      if (t === "bytes" || t === "bytes32") {
        args.push(t === "bytes32" ? ethers.ZeroHash : "0x");
        continue;
      }

      // Unsupported complex types: skip this candidate
      return { ok: false, reason: `Unsupported param type: ${t}` };
    }

    // Must have used amount at least once, otherwise likely not an initiate function
    if (!usedAmount) return { ok: false, reason: "No uint/int param to place AMOUNT" };

    // Simulate first (staticCall)
    const fn = sourceBridge.getFunction(fnName);

    try {
      await fn.staticCall(...args);
    } catch (e) {
      return { ok: false, reason: `staticCall failed: ${e?.shortMessage || e?.message || e}` };
    }

    console.log(`Calling SourceBridge.${fnName}(${inputs.map(i => i.type).join(", ")})`);
    console.log("Args:", args.map((a) => (typeof a === "bigint" ? a.toString() : a)));

    const gasLimitEnv = pickEnv("GAS_LIMIT");
    const overrides = {};
    if (gasLimitEnv) overrides.gasLimit = BigInt(gasLimitEnv);

    const tx = await fn(...args, overrides);
    console.log("tx:", tx.hash);

    const receipt = await tx.wait();
    console.log("confirmed in block:", receipt.blockNumber);

    // Parse events emitted by SourceBridge for quick debugging
    const logs = receipt.logs.filter(
      (l) => (l.address || "").toLowerCase() === sourceBridgeAddress.toLowerCase()
    );
    if (logs.length) {
      console.log("\nEvents (SourceBridge):");
      for (const l of logs) {
        try {
          const parsed = iface.parseLog({ topics: l.topics, data: l.data });
          console.log(`- ${parsed.name}`, parsed.args);
        } catch {
          // ignore unparsed
        }
      }
    }

    return { ok: true };
  }

  if (forcedFn) {
    const fnFrag = frags.find((f) => f.name === forcedFn);
    if (!fnFrag) {
      const available = frags.map((f) => f.name).sort();
      throw new Error(`BRIDGE_FUNCTION="${forcedFn}" not found. Available: ${available.join(", ")}`);
    }
    const res = await tryCall(forcedFn, fnFrag.inputs.map((i) => ({ name: i.name, type: i.type })));
    if (!res.ok) throw new Error(`Forced function failed: ${res.reason}`);
    return;
  }

  // Auto-detect
  if (!candidates.length) {
    const available = frags.map((f) => `${f.name}(${f.inputs.map(i => i.type).join(",")})`);
    throw new Error(
      "No suitable initiate/bridge/lock function candidates found.\n" +
      "Non-view functions found:\n" + available.join("\n")
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
    "No candidate function succeeded.\n" +
    "Set BRIDGE_FUNCTION in .env to the correct function name, and/or provide needed env vars " +
    "(SEPOLIA_TOKEN_ADDRESS, RECIPIENT, TARGET_CHAIN_ID, NONCE, etc.)."
  );
}

main().catch((e) => {
  console.error("\n[FATAL]", e?.stack || e?.message || e);
  process.exitCode = 1;
});
