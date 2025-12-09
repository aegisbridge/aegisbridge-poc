// scripts/deploy_amoy_target.js
//
// Deploy WrappedTestToken (wATT) + TargetBridge di Polygon Amoy,
// dengan mendeteksi constructor dari ABI supaya tidak salah jumlah argumen.
// Lalu simpan alamat ke deployments/testnet_sepolia_amoy.json

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function deployWrappedTestToken(ethers, deployer) {
  const artifact = await hre.artifacts.readArtifact("WrappedTestToken");
  const ctor = artifact.abi.find((i) => i.type === "constructor");
  const WrappedTestToken = await ethers.getContractFactory(
    "WrappedTestToken",
    deployer
  );

  let args = [];

  if (!ctor || (ctor.inputs || []).length === 0) {
    // constructor() external { ... }
    console.log("WrappedTestToken constructor: no args");
    args = [];
  } else if (
    ctor.inputs.length === 2 &&
    ctor.inputs[0].type === "string" &&
    ctor.inputs[1].type === "string"
  ) {
    // constructor(string name, string symbol)
    console.log(
      'WrappedTestToken constructor: (string name, string symbol) → using "Wrapped Aegis Test Token", "wATT"'
    );
    args = ["Wrapped Aegis Test Token", "wATT"];
  } else {
    console.log("WrappedTestToken constructor ABI:", ctor);
    throw new Error(
      "Unsupported WrappedTestToken constructor signature. Please adjust deploy script."
    );
  }

  const wATT = await WrappedTestToken.deploy(...args);
  await wATT.waitForDeployment();
  return wATT;
}

async function deployTargetBridge(ethers, deployer, wATTAddress) {
  const artifact = await hre.artifacts.readArtifact("TargetBridge");
  const ctor = artifact.abi.find((i) => i.type === "constructor");
  const TargetBridge = await ethers.getContractFactory(
    "TargetBridge",
    deployer
  );

  let args = [];

  if (!ctor || (ctor.inputs || []).length === 0) {
    console.log("TargetBridge constructor: no args");
    args = [];
  } else if (
    ctor.inputs.length === 1 &&
    ctor.inputs[0].type === "address"
  ) {
    console.log(
      "TargetBridge constructor: (address wToken) → passing WrappedTestToken address"
    );
    args = [wATTAddress];
  } else {
    console.log("TargetBridge constructor ABI:", ctor);
    throw new Error(
      "Unsupported TargetBridge constructor signature. Please adjust deploy script."
    );
  }

  const bridge = await TargetBridge.deploy(...args);
  await bridge.waitForDeployment();
  return bridge;
}

async function main() {
  const { ethers, network } = hre;

  console.log("=== Deploying TARGET contracts on", network.name, "===");
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  console.log("Deployer:", deployerAddr);

  // 1) Deploy WrappedTestToken (wATT)
  const wATT = await deployWrappedTestToken(ethers, deployer);
  const wATTAddress = await wATT.getAddress();
  console.log("WrappedTestToken (wATT) deployed to:", wATTAddress);

  // 2) Deploy TargetBridge
  const targetBridge = await deployTargetBridge(ethers, deployer, wATTAddress);
  const targetBridgeAddress = await targetBridge.getAddress();
  console.log("TargetBridge deployed to:", targetBridgeAddress);

  // 3) Set bridge di wATT (kalau fungsi setBridge tersedia)
  if (typeof wATT.setBridge === "function") {
    console.log("Calling wATT.setBridge(TargetBridge)...");
    const txSetBridge = await wATT.setBridge(targetBridgeAddress);
    console.log("wATT.setBridge tx:", txSetBridge.hash);
    await txSetBridge.wait();
    console.log("wATT.bridge set to TargetBridge");
  } else {
    console.log(
      "⚠️ WrappedTestToken does not have setBridge() function (skip setting bridge)."
    );
  }

  console.log("\n=== TARGET (Amoy) SUMMARY ===");
  console.log("Deployer     :", deployerAddr);
  console.log("wATT         :", wATTAddress);
  console.log("TargetBridge :", targetBridgeAddress);
  console.log("================================\n");

  // 4) Update deployments/testnet_sepolia_amoy.json
  const deploymentsPath = path.join(
    __dirname,
    "..",
    "deployments",
    "testnet_sepolia_amoy.json"
  );

  let baseJson = {};
  if (fs.existsSync(deploymentsPath)) {
    baseJson = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }

  baseJson.amoy = {
    ...(baseJson.amoy || {}),
    deployer: deployerAddr,
    wATT: wATTAddress,
    TargetBridge: targetBridgeAddress,
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(baseJson, null, 2));
  console.log("Saved Amoy deployments to:", deploymentsPath);
  console.log("=== DONE DEPLOY TARGET (Amoy) ===");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
