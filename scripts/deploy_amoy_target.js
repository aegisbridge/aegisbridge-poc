const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  console.log(`\n=== Deploying TARGET contracts on ${network.name} ===`);
  console.log("Deployer:", deployer.address);

  // 1) Deploy WrappedTestToken (wATT) di Amoy
  const WrappedTestToken = await ethers.getContractFactory("WrappedTestToken");
  const wrappedToken = await WrappedTestToken.deploy();
  await wrappedToken.waitForDeployment();
  const wAttAddress = await wrappedToken.getAddress();
  console.log("WrappedTestToken (wATT) deployed to:", wAttAddress);

  // 2) Deploy TargetBridge pakai wATT
  const TargetBridge = await ethers.getContractFactory("TargetBridge");
  const targetBridge = await TargetBridge.deploy(wAttAddress);
  await targetBridge.waitForDeployment();
  const targetBridgeAddress = await targetBridge.getAddress();
  console.log("TargetBridge deployed to:", targetBridgeAddress);

  // 3) Set bridge di wATT
  const txSetBridge = await wrappedToken.setBridge(targetBridgeAddress);
  await txSetBridge.wait();
  console.log("wATT.bridge set to TargetBridge");

  console.log("\n=== TARGET (Amoy) SUMMARY ===");
  console.log("Deployer     :", deployer.address);
  console.log("wATT         :", wAttAddress);
  console.log("TargetBridge :", targetBridgeAddress);
  console.log("================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Deploy TARGET failed:", err);
    process.exit(1);
  });
