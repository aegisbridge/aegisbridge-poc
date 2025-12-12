require("dotenv").config();
const { ethers } = require("ethers");
const path = require("path");

async function main() {
  // 1. Setup provider & wallet (Sepolia)
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.TEST_SENDER_PRIVATE_KEY;
  if (!rpcUrl || !pk) {
    throw new Error("SEPOLIA_RPC_URL atau TEST_SENDER_PRIVATE_KEY belum di .env");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("Sender address :", wallet.address);
  console.log("Sepolia RPC    :", rpcUrl);

  // 2. Load ABI SourceBridge
  const sourceBridgeArtifact = require(
    path.join(
      __dirname,
      "..",
      "artifacts",
      "contracts",
      "SourceBridge.sol",
      "SourceBridge.json"
    )
  );

  const sourceBridgeAddress = process.env.SEPOLIA_BRIDGE_ADDRESS;
  if (!sourceBridgeAddress) {
    throw new Error("SEPOLIA_BRIDGE_ADDRESS belum di .env");
  }

  const bridge = new ethers.Contract(
    sourceBridgeAddress,
    sourceBridgeArtifact.abi,
    wallet
  );

  // 3. Param uji
  const recipient = process.env.TEST_RECIPIENT_AMOY || wallet.address;
  const amount = ethers.parseUnits("1000", 18); // 10 ATT (18 desimal)

  console.log("Recipient (Amoy):", recipient);
  console.log("Amount           :", amount.toString());

  // 4. Cari definisi fungsi lock di ABI
  const abi = sourceBridgeArtifact.abi;
  const lockFn = abi.find(
    (f) => f.type === "function" && f.name === "lock"
  );

  if (!lockFn) {
    console.log("Fungsi 'lock' tidak ditemukan di ABI SourceBridge.");
    console.log(
      "Daftar fungsi:",
      abi.filter((f) => f.type === "function").map((f) => f.name)
    );
    throw new Error("Tidak ada fungsi lock di SourceBridge");
  }

  console.log("lock() inputs:", lockFn.inputs.map((i) => `${i.name}:${i.type}`));

  let tx;

  if (lockFn.inputs.length === 1 && lockFn.inputs[0].type.startsWith("uint")) {
    // lock(uint256 amount)
    console.log("Memanggil: lock(amount)");
    tx = await bridge.lock(amount);
  } else if (
    lockFn.inputs.length === 2 &&
    lockFn.inputs[0].type === "address" &&
    lockFn.inputs[1].type.startsWith("uint")
  ) {
    // lock(address recipient, uint256 amount)
    console.log("Memanggil: lock(recipient, amount)");
    tx = await bridge.lock(recipient, amount);
  } else {
    console.log("Signature lock tidak dikenali.");
    console.log("Inputs lock():", lockFn.inputs);
    throw new Error("Signature lock() tidak didukung oleh script test ini");
  }

  console.log("Tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Tx confirmed in block:", receipt.blockNumber);
}

main().catch((err) => {
  console.error("Error in send_test_from_sepolia:", err);
  process.exit(1);
});
