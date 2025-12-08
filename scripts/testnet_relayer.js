const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const { ethers } = hre;

  
  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    "testnet_sepolia_amoy.json"
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      `deployments/testnet_sepolia_amoy.json tidak ditemukan di ${deploymentPath}`
    );
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const sepoliaInfo = deployments.sepolia;
  const amoyInfo = deployments.amoy;

  if (!sepoliaInfo || !amoyInfo) {
    throw new Error("Format testnet_sepolia_amoy.json tidak valid.");
  }

  const sourceBridgeAddress = sepoliaInfo.SourceBridge;
  const targetBridgeAddress = amoyInfo.TargetBridge;

  if (!sourceBridgeAddress || !targetBridgeAddress) {
    throw new Error(
      "SourceBridge / TargetBridge address tidak ada di testnet_sepolia_amoy.json"
    );
  }

  
  const sepoliaRpc = process.env.SEPOLIA_RPC_URL;
  const amoyRpc = process.env.AMOY_RPC_URL;
  const pk = process.env.PRIVATE_KEY;

  if (!sepoliaRpc || !amoyRpc || !pk) {
    throw new Error(
      "Pastikan SEPOLIA_RPC_URL, AMOY_RPC_URL, dan PRIVATE_KEY sudah di-set di .env"
    );
  }

  const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaRpc);
  const amoyProvider = new ethers.JsonRpcProvider(amoyRpc);

  const wallet = new ethers.Wallet(pk);
  const sepoliaSigner = wallet.connect(sepoliaProvider);
  const amoySigner = wallet.connect(amoyProvider);

  
  const sourceBridgeArtifact = await hre.artifacts.readArtifact("SourceBridge");
  const targetBridgeArtifact = await hre.artifacts.readArtifact("TargetBridge");

  const sourceBridge = new ethers.Contract(
    sourceBridgeAddress,
    sourceBridgeArtifact.abi,
    sepoliaSigner
  );

  const targetBridge = new ethers.Contract(
    targetBridgeAddress,
    targetBridgeArtifact.abi,
    amoySigner
  );

  console.log("=== AegisBridge Testnet Relayer (Sepolia → Amoy) ===");
  console.log("Sepolia SourceBridge :", sourceBridgeAddress);
  console.log("Amoy TargetBridge    :", targetBridgeAddress);
  console.log("Relayer wallet       :", await sepoliaSigner.getAddress());
  console.log("====================================================");

  const startBlock = await sepoliaProvider.getBlockNumber();
  console.log(`Listening Locked events from Sepolia starting at block ${startBlock}...\n`);
  console.log("Tips: jalankan relayer dulu, lalu jalankan sepolia_lock.js");

  
  sourceBridge.on(
    "Locked",
    async (sender, recipient, amount, nonce, event) => {
      try {
        console.log("--------------------------------------------------");
        console.log("[Locked event detected on Sepolia]");
        console.log("  from      :", sender);
        console.log("  recipient :", recipient);
        console.log("  amount    :", ethers.formatUnits(amount, 18)); 
        console.log("  nonce     :", nonce.toString());
        console.log("  txHash    :", event.transactionHash);

        
        const already = await targetBridge.processedNonces(nonce);
        if (already) {
          console.log("  -> Nonce sudah diproses di TargetBridge. Skip mint.");
          return;
        }

        
        console.log("  -> Kirim mintFromSource di Amoy...");
        const tx = await targetBridge.mintFromSource(
          recipient,
          amount,
          nonce
        );
        console.log("  -> Mint tx sent:", tx.hash);

        const receipt = await tx.wait();
        console.log(
          "  -> Mint confirmed in block",
          receipt.blockNumber
        );
        console.log("     (Sepolia → Amoy bridge sukses untuk nonce", nonce.toString() + ")");
      } catch (err) {
        console.error("  !! Error while handling Locked event:", err);
      }
    }
  );

  
  console.log("\nRelayer running. Tekan CTRL+C untuk stop.\n");
  process.stdin.resume();
}

main().catch((err) => {
  console.error(err);
  
  process.exitCode = 1;
});
