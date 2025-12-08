const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  console.log(`\n=== Deploying SOURCE contracts on ${network.name} ===`);
  console.log("Deployer:", deployer.address);

  // 1) Deploy TestToken (ATT) di Sepolia
  const TestToken = await ethers.getContractFactory("TestToken");
  const testToken = await TestToken.deploy();
  await testToken.waitForDeployment();
  const attAddress = await testToken.getAddress();
  console.log("TestToken (ATT) deployed to:", attAddress);

  // 2) Deploy SourceBridge pakai ATT
  const SourceBridge = await ethers.getContractFactory("SourceBridge");
  const sourceBridge = await SourceBridge.deploy(attAddress);
  await sourceBridge.waitForDeployment();
  const srcBridgeAddress = await sourceBridge.getAddress();
  console.log("SourceBridge deployed to:", srcBridgeAddress);

  console.log("\n=== SOURCE (Sepolia) SUMMARY ===");
  console.log("Deployer      :", deployer.address);
  console.log("ATT (TestToken):", attAddress);
  console.log("SourceBridge  :", srcBridgeAddress);
  console.log("=================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Deploy SOURCE failed:", err);
    process.exit(1);
  });
