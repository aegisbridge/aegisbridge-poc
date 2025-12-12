// scripts/request_return_to_sepolia.js
require("dotenv").config();
const { ethers } = require("ethers");
const targetArtifact = require("../artifacts/contracts/TargetBridge.sol/TargetBridge.json");

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)"
];

async function main() {
  const RPC = process.env.AMOY_RPC_URL;
  const PK = process.env.TEST_SENDER_PRIVATE_KEY;
  const BRIDGE =
    process.env.AMOY_BRIDGE_ADDRESS ||
    process.env.AMOY_TARGET_BRIDGE ||
    process.env.TARGET_BRIDGE_ADDRESS;
  const WATT = process.env.AMOY_WATT_TOKEN;

  if (!RPC) throw new Error("AMOY_RPC_URL belum di .env");
  if (!PK) throw new Error("TEST_SENDER_PRIVATE_KEY belum di .env");
  if (!BRIDGE) throw new Error("AMOY_BRIDGE_ADDRESS / AMOY_TARGET_BRIDGE belum di .env");
  if (!WATT) throw new Error("AMOY_WATT_TOKEN belum di .env");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);

  const watt = new ethers.Contract(WATT, ERC20_ABI, provider);
  const [symbol, decimals, rawBal] = await Promise.all([
    watt.symbol(),
    watt.decimals(),
    watt.balanceOf(wallet.address),
  ]);

  const bal = ethers.formatUnits(rawBal, decimals);

  console.log("RPC Amoy      :", RPC);
  console.log("Wallet        :", wallet.address);
  console.log("TargetBridge  :", BRIDGE);
  console.log("wATT token    :", WATT, `(${symbol}/${decimals})`);
  console.log("Current wATT  :", bal);

  const amountTokens = process.argv[2] || "1000"; // default 1000 wATT
  const amount = ethers.parseUnits(amountTokens, decimals);

  if (amount > rawBal) {
    throw new Error(
      `Balance wATT tidak cukup. Balance=${bal}, diminta=${amountTokens}`
    );
  }

  const bridge = new ethers.Contract(BRIDGE, targetArtifact.abi, wallet);
  const iface = bridge.interface;

  const nonViewFns = iface.fragments.filter(
    (f) =>
      f.type === "function" &&
      (f.stateMutability === "nonpayable" || f.stateMutability === "payable")
  );

  let fnName = process.env.TARGET_RETURN_FN || null;

  if (!fnName) {
    const candidates = nonViewFns
      .filter(
        (f) =>
          f.inputs.length === 1 &&
          f.inputs[0].type.startsWith("uint")
      )
      .map((f) => f.name);

    if (candidates.length === 0) {
      throw new Error(
        "Tidak ada fungsi kandidat dengan 1 argumen uint pada TargetBridge. Set manual via env TARGET_RETURN_FN."
      );
    }

    const preferred =
      candidates.find((n) => /return/i.test(n)) ||
      candidates.find((n) => /back/i.test(n));

    fnName = preferred || candidates[0];

    console.log("Fungsi kandidat di TargetBridge:", candidates);
    console.log(`Dipilih fungsi: ${fnName}(amount)`);
  } else {
    console.log(`Memakai fungsi dari env TARGET_RETURN_FN: ${fnName}(amount)`);
  }

  console.log(`Memanggil: ${fnName}(${amountTokens}) pada TargetBridge...`);

  const tx = await bridge[fnName](amount);
  console.log("Tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Tx confirmed in block:", receipt.blockNumber, "status:", receipt.status);
}

main().catch((err) => {
  console.error("Error in request_return_to_sepolia:", err);
  process.exit(1);
});
