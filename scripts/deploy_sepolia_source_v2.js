// scripts/deploy_sepolia_source_v2.js
//
// Deploy TestToken (ATT) + SourceBridge v0.2 di Sepolia
// dan simpan alamat ke deployments/testnet_sepolia_amoy.json

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function deployTestToken(ethers, deployer) {
  const artifact = await hre.artifacts.readArtifact("TestToken");
  const ctor = artifact.abi.find((i) => i.type === "constructor");
  const TestToken = await ethers.getContractFactory("TestToken", deployer);

  let args = [];

  if (!ctor || (ctor.inputs || []).length === 0) {
    console.log("TestToken constructor: no args");
    args = [];
  } else if (
    ctor.inputs.length === 2 &&
    ctor.inputs[0].type === "string" &&
    ctor.inputs[1].type === "string"
  ) {
    console.log(
      'TestToken constructor: (string name, string symbol) → using "Aegis Test Token", "ATT"'
    );
    args = ["Aegis Test Token", "ATT"];
  } else {
    console.log("TestToken constructor ABI:", ctor);
    throw new Error(
      "Unsupported TestToken constructor signature. Please adjust deploy script."
    );
  }

  const token = await TestToken.deploy(...args);
  await token.waitForDeployment();

  // Coba mint initial supply kalau ada fungsi mint(address,uint256)
  const hasMint = artifact.abi.some(
    (i) =>
      i.type === "function" &&
      i.name === "mint" &&
      i.inputs.length === 2 &&
      i.inputs[0].type === "address" &&
      i.inputs[1].type === "uint256"
  );

  if (hasMint) {
    console.log("TestToken has mint(address,uint256). Minting 1,000,000 ATT to deployer...");
    const decimals = 18n;
    const amount = 1_000_000n * 10n ** decimals;
    const txMint = await token.mint(await deployer.getAddress(), amount);
    console.log("mint tx:", txMint.hash);
    await txMint.wait();
    console.log("Minted initial ATT to deployer.");
  } else {
    console.log("TestToken has no mint() function. Skipping initial mint.");
  }

  return token;
}

async function deploySourceBridge(ethers, deployer, attAddress) {
  const artifact = await hre.artifacts.readArtifact("SourceBridge");
  const ctor = artifact.abi.find((i) => i.type === "constructor");
  const SourceBridge = await ethers.getContractFactory(
    "SourceBridge",
    deployer
  );

  let args = [];

  if (!ctor || (ctor.inputs || []).length === 0) {
    console.log("SourceBridge constructor: no args");
    args = [];
  } else if (
    ctor.inputs.length === 1 &&
    ctor.inputs[0].type === "address"
  ) {
    console.log(
      "SourceBridge constructor: (address token) → passing ATT address"
    );
    args = [attAddress];
  } else {
    console.log("SourceBridge constructor ABI:", ctor);
    throw new Error(
      "Unsupported SourceBridge constructor signature. Please adjust deploy script."
    );
  }

  const bridge = await SourceBridge.deploy(...args);
  await bridge.waitForDeployment();
  return bridge;
}

async function main() {
  const { ethers, network } = hre;

  console.log("=== Deploying SOURCE contracts on", network.name, "===");
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  console.log("Deployer:", deployerAddr);

  // 1) Deploy TestToken (ATT)
  const att = await deployTestToken(ethers, deployer);
  const attAddress = await att.getAddress();
  console.log("TestToken (ATT) deployed to:", attAddress);

  // 2) Deploy SourceBridge v0.2
  const sourceBridge = await deploySourceBridge(ethers, deployer, attAddress);
  const sourceBridgeAddress = await sourceBridge.getAddress();
  console.log("SourceBridge deployed to:", sourceBridgeAddress);

  console.log("\n=== SOURCE (Sepolia) SUMMARY ===");
  console.log("Deployer       :", deployerAddr);
  console.log("ATT (TestToken):", attAddress);
  console.log("SourceBridge   :", sourceBridgeAddress);
  console.log("=================================\n");

  // 3) Update deployments/testnet_sepolia_amoy.json
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

  baseJson.sepolia = {
    ...(baseJson.sepolia || {}),
    deployer: deployerAddr,
    ATT: attAddress,
    SourceBridge: sourceBridgeAddress,
  };

  fs.writeFileSync(deploymentsPath, JSON.stringify(baseJson, null, 2));
  console.log("Saved Sepolia deployments to:", deploymentsPath);
  console.log("=== DONE DEPLOY SOURCE (Sepolia v0.2) ===");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
