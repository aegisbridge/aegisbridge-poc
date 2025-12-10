// scripts/bridge_status.js
const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const isSepolia = network === "sepolia";

  const tokenAddress = isSepolia
    ? process.env.ATT_SEPOLIA
    : process.env.WATT_AMOY;

  const bridgeAddress = isSepolia
    ? process.env.SOURCE_BRIDGE_SEPOLIA
    : process.env.TARGET_BRIDGE_AMOY;

  if (!tokenAddress || !bridgeAddress) {
    console.error("❌ ENV belum lengkap.");
    console.error(
      isSepolia
        ? "Butuh ATT_SEPOLIA dan SOURCE_BRIDGE_SEPOLIA di .env"
        : "Butuh WATT_AMOY dan TARGET_BRIDGE_AMOY di .env"
    );
    process.exit(1);
  }

  console.log("=== AegisBridge Status ===");
  console.log("Network   :", network);
  console.log("Signer    :", signer.address);
  console.log("Token     :", tokenAddress);
  console.log("Bridge    :", bridgeAddress);
  console.log("");

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  const token = await hre.ethers.getContractAt(erc20Abi, tokenAddress);

  const [rawUserBal, rawBridgeBal, decimals, symbol] = await Promise.all([
    token.balanceOf(signer.address),
    token.balanceOf(bridgeAddress),
    token.decimals(),
    token.symbol(),
  ]);

  const format =
    hre.ethers.formatUnits || hre.ethers.utils.formatUnits;

  const userBal = format(rawUserBal, decimals);
  const bridgeBal = format(rawBridgeBal, decimals);

  console.log(`Saldo ${symbol} user   : ${userBal}`);
  console.log(`Saldo ${symbol} bridge : ${bridgeBal}`);

  if (isSepolia) {
    // Coba baca nonce dari SourceBridge
    try {
      const SourceBridge = await hre.ethers.getContractFactory("SourceBridge");
      const bridge = SourceBridge.attach(bridgeAddress);

      let nonce = null;
      try {
        nonce = await bridge.currentNonce();
      } catch {
        try {
          nonce = await bridge.nonce();
        } catch {
          nonce = null;
        }
      }

      if (nonce !== null) {
        console.log(`Current nonce di SourceBridge : ${nonce.toString()}`);
      } else {
        console.log("Current nonce di SourceBridge : (tidak bisa dibaca)");
      }
    } catch (e) {
      console.log("Gagal attach SourceBridge untuk baca nonce (boleh diabaikan):");
      console.log(e.message || e);
    }
  }
}

main().catch((err) => {
  console.error("❌ Error bridge_status:", err);
  process.exitCode = 1;
});
