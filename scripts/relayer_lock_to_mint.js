require("dotenv/config");
const { ethers } = require("ethers");

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const AMOY_RPC_URL = process.env.AMOY_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const SRC_BRIDGE_ADDRESS = "0x8e0e8C997aBFc1eEbc7bEfC8E2Fb444c3B70020a";
const DST_BRIDGE_ADDRESS = "0x8e0e8C997aBFc1eEbc7bEfC8E2Fb444c3B70020a";

const srcBridgeArtifact = require("../artifacts/contracts/SourceBridge.sol/SourceBridge.json");
const dstBridgeArtifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

async function main() {
  const srcProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const dstProvider = new ethers.JsonRpcProvider(AMOY_RPC_URL);

  const walletDst = new ethers.Wallet(PRIVATE_KEY, dstProvider);

  const srcBridge = new ethers.Contract(
    SRC_BRIDGE_ADDRESS,
    srcBridgeArtifact.abi,
    srcProvider
  );

  const dstBridge = new ethers.Contract(
    DST_BRIDGE_ADDRESS,
    dstBridgeArtifact.abi,
    walletDst
  );

  console.log("Relayer started");
  console.log("SourceBridge (Sepolia):", SRC_BRIDGE_ADDRESS);
  console.log("TargetBridge (Amoy)   :", DST_BRIDGE_ADDRESS);
  console.log("Relayer wallet        :", walletDst.address);

  srcBridge.on("Locked", async (from, to, amount, nonce, event) => {
    try {
      console.log("\n[Locked detected]");
      console.log(" from  :", from);
      console.log(" to    :", to);
      console.log(" amount:", ethers.formatUnits(amount, 18));
      console.log(" nonce :", nonce.toString());

      const already = await dstBridge.processedNonces(nonce);
      if (already) {
        console.log(" nonce already processed on target, skip");
        return;
      }

      const tx = await dstBridge.mintFromSource(to, amount, nonce);
      console.log(" sent mint tx:", tx.hash);
      const receipt = await tx.wait();
      console.log(" confirmed in block:", receipt.blockNumber);
    } catch (err) {
      console.error(" error while relaying:", err);
    }
  });

  console.log("Waiting for Locked events on Sepolia...");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
