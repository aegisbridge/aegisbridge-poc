// scripts/testnet_relayer.js
//
// AegisBridge v0.2 Testnet Relayer
// - Listens to Locked on Sepolia → calls mintFromSource on Amoy
// - Listens to BurnToSource on Amoy → calls unlockFromTarget on Sepolia
// - Reconstructs AegisMessage.Message off-chain and logs its hash
//
// Run with:
//   node scripts/testnet_relayer.js

require("dotenv").config();
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

// ---------- Config & helpers ----------

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !AMOY_RPC_URL || !PRIVATE_KEY) {
  console.error(
    "[config] Missing SEPOLIA_RPC_URL / AMOY_RPC_URL / PRIVATE_KEY in .env"
  );
  process.exit(1);
}

// Load deployments JSON
const deploymentsPath = path.join(
  __dirname,
  "..",
  "deployments",
  "testnet_sepolia_amoy.json"
);

if (!fs.existsSync(deploymentsPath)) {
  console.error(
    `[deployments] File not found: ${deploymentsPath}. Deploy v0.2 contracts first.`
  );
  process.exit(1);
}

const deployments = require(deploymentsPath);

if (!deployments.sepolia || !deployments.amoy) {
  console.error(
    "[deployments] Missing sepolia/amoy sections in testnet_sepolia_amoy.json"
  );
  process.exit(1);
}

const SEPOLIA_SOURCE_BRIDGE = deployments.sepolia.SourceBridge;
const SEPOLIA_ATT = deployments.sepolia.ATT;
const AMOY_TARGET_BRIDGE = deployments.amoy.TargetBridge;
const AMOY_WATT = deployments.amoy.wATT;

// Load ABIs from Hardhat artifacts
const sourceBridgeArtifact = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
const targetBridgeArtifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

// AegisMessage typehash (must match contracts/AegisMessage.sol)
const MESSAGE_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes(
    "AegisBridge.Message(uint64 srcChainId,uint64 dstChainId,address srcBridge,address dstBridge,address token,address user,uint256 amount,uint256 nonce,uint8 direction,uint64 timestamp)"
  )
);

// Direction enum mapping (must match AegisMessage.Direction)
const Direction = {
  LockToMint: 0,
  BurnToUnlock: 1,
};

function computeMessageHash(msg) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    [
      "bytes32",
      "uint64",
      "uint64",
      "address",
      "address",
      "address",
      "address",
      "uint256",
      "uint256",
      "uint8",
      "uint64",
    ],
    [
      MESSAGE_TYPEHASH,
      msg.srcChainId,
      msg.dstChainId,
      msg.srcBridge,
      msg.dstBridge,
      msg.token,
      msg.user,
      msg.amount,
      msg.nonce,
      msg.direction,
      msg.timestamp,
    ]
  );
  return ethers.keccak256(encoded);
}

function short(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ---------- Main relayer ----------

async function main() {
  // Providers & signers
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);

  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const sepoliaSigner = wallet.connect(sepoliaProvider);
  const amoySigner = wallet.connect(amoyProvider);

  const sepoliaNet = await sepoliaProvider.getNetwork();
  const amoyNet = await amoyProvider.getNetwork();

  const sepoliaChainId = BigInt(sepoliaNet.chainId);
  const amoyChainId = BigInt(amoyNet.chainId);

  const deployer = await sepoliaSigner.getAddress();

  const sourceBridge = new ethers.Contract(
    SEPOLIA_SOURCE_BRIDGE,
    sourceBridgeArtifact.abi,
    sepoliaSigner
  );

  const targetBridge = new ethers.Contract(
    AMOY_TARGET_BRIDGE,
    targetBridgeArtifact.abi,
    amoySigner
  );

  console.log("=== AegisBridge v0.2 Testnet Relayer ===");
  console.log("Sepolia RPC :", SEPOLIA_RPC_URL);
  console.log("Amoy RPC    :", AMOY_RPC_URL);
  console.log("Deployer/Relayer address:", deployer);
  console.log();
  console.log("Sepolia chainId :", sepoliaNet.chainId.toString());
  console.log("Amoy    chainId :", amoyNet.chainId.toString());
  console.log();
  console.log("SourceBridge (Sepolia):", SEPOLIA_SOURCE_BRIDGE);
  console.log("ATT (Sepolia)        :", SEPOLIA_ATT);
  console.log("TargetBridge (Amoy)  :", AMOY_TARGET_BRIDGE);
  console.log("wATT (Amoy)          :", AMOY_WATT);
  console.log("========================================");
  console.log();
  console.log("Subscribing to events...");
  console.log(
    "- Locked(user, recipient, amount, nonce) on SourceBridge (Sepolia) → mintFromSource on Amoy"
  );
  console.log(
    "- BurnToSource(from, to, amount, burnNonce) on TargetBridge (Amoy) → unlockFromTarget on Sepolia"
  );
  console.log();
  console.log("Press Ctrl+C to exit.\n");

  // ----- Handler: Locked on Sepolia → mintFromSource on Amoy -----

  sourceBridge.on(
    "Locked",
    async (sender, recipient, amount, nonce, event) => {
      try {
        console.log("\n[Locked event detected on Sepolia]");
        console.log(
          `  sender    : ${short(sender)}  → recipient: ${short(recipient)}`
        );
        console.log(`  amount    : ${ethers.formatUnits(amount, 18)}`);
        console.log(`  nonce     : ${nonce.toString()}`);
        console.log(`  tx hash   : ${event.log.transactionHash}`);

        // Fetch block timestamp to reconstruct Message
        const block = await sepoliaProvider.getBlock(event.blockNumber);
        const timestamp = BigInt(block.timestamp);

        const msg = {
          srcChainId: sepoliaChainId,
          dstChainId: amoyChainId, // v0.2: we know destination is Amoy
          srcBridge: SEPOLIA_SOURCE_BRIDGE,
          dstBridge: AMOY_TARGET_BRIDGE,
          token: SEPOLIA_ATT,
          // Design choice: user = recipient on target chain
          user: recipient,
          amount: amount,
          nonce: BigInt(nonce.toString()),
          direction: Direction.LockToMint,
          timestamp,
        };

        const msgHash = computeMessageHash(msg);

        console.log("  [AegisMessage]");
        console.log(
          `    direction : LockToMint (0)\n    srcChainId: ${msg.srcChainId.toString()}\n    dstChainId: ${msg.dstChainId.toString()}\n    user      : ${short(msg.user)}\n    amount    : ${ethers.formatUnits(msg.amount, 18)}\n    nonce     : ${msg.nonce.toString()}\n    timestamp : ${msg.timestamp.toString()}`
        );
        console.log(`  message hash (off-chain computed): ${msgHash}`);

        // Optional: check if this nonce is already processed on target
        const alreadyProcessed = await targetBridge.processedNonces(nonce);
        if (alreadyProcessed) {
          console.log(
            "  [Relayer] TargetBridge.processedNonces already true. Skipping mintFromSource."
          );
          return;
        }

        console.log(
          "  [Relayer] Calling TargetBridge.mintFromSource(...) on Amoy..."
        );
        const tx = await targetBridge.mintFromSource(
          recipient,
          amount,
          nonce,
          {
            gasLimit: 300000n,
          }
        );
        console.log(`  → mint tx sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(
          `  → mint tx confirmed in block: ${receipt.blockNumber.toString()}`
        );
      } catch (err) {
        console.error("[Relayer] Error handling Locked event:", err);
      }
    }
  );

  // ----- Handler: BurnToSource on Amoy → unlockFromTarget on Sepolia -----

  targetBridge.on(
    "BurnToSource",
    async (from, to, amount, burnNonce, event) => {
      try {
        console.log("\n[BurnToSource event detected on Amoy]");
        console.log(
          `  from      : ${short(from)}  → to (Sepolia): ${short(to)}`
        );
        console.log(`  amount    : ${ethers.formatUnits(amount, 18)}`);
        console.log(`  burnNonce : ${burnNonce.toString()}`);
        console.log(`  tx hash   : ${event.log.transactionHash}`);

        // Fetch block timestamp to reconstruct Message
        const block = await amoyProvider.getBlock(event.blockNumber);
        const timestamp = BigInt(block.timestamp);

        const msg = {
          srcChainId: amoyChainId,
          dstChainId: sepoliaChainId,
          srcBridge: AMOY_TARGET_BRIDGE,
          dstBridge: SEPOLIA_SOURCE_BRIDGE,
          token: AMOY_WATT,
          // Design choice: user = receiver on source chain (to)
          user: to,
          amount: amount,
          nonce: BigInt(burnNonce.toString()),
          direction: Direction.BurnToUnlock,
          timestamp,
        };

        const msgHash = computeMessageHash(msg);

        console.log("  [AegisMessage]");
        console.log(
          `    direction : BurnToUnlock (1)\n    srcChainId: ${msg.srcChainId.toString()}\n    dstChainId: ${msg.dstChainId.toString()}\n    user      : ${short(msg.user)}\n    amount    : ${ethers.formatUnits(msg.amount, 18)}\n    nonce     : ${msg.nonce.toString()}\n    timestamp : ${msg.timestamp.toString()}`
        );
        console.log(`  message hash (off-chain computed): ${msgHash}`);

        // Check if burnNonce already processed on SourceBridge
        const processed = await sourceBridge.processedBurnNonces(burnNonce);
        if (processed) {
          console.log(
            "  [Relayer] SourceBridge.processedBurnNonces already true. Skipping unlockFromTarget."
          );
          return;
        }

        console.log(
          "  [Relayer] Calling SourceBridge.unlockFromTarget(...) on Sepolia..."
        );
        const tx = await sourceBridge.unlockFromTarget(to, amount, burnNonce, {
          gasLimit: 300000n,
        });
        console.log(`  → unlock tx sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(
          `  → unlock tx confirmed in block: ${receipt.blockNumber.toString()}`
        );
      } catch (err) {
        console.error("[Relayer] Error handling BurnToSource event:", err);
      }
    }
  );
}

main().catch((err) => {
  console.error("Fatal relayer error:", err);
  process.exit(1);
});
