const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("=== DEPLOY LOCAL FOR RELAYER ===");
  console.log("Network :", network.name);
  console.log("Deployer:", deployer.address);

  const TestToken        = await ethers.getContractFactory("TestToken");
  const SourceBridge     = await ethers.getContractFactory("SourceBridge");
  const WrappedTestToken = await ethers.getContractFactory("WrappedTestToken");
  const TargetBridge     = await ethers.getContractFactory("TargetBridge");

  const att = await TestToken.deploy();
  await att.waitForDeployment();
  const attAddress = await att.getAddress();

  const sourceBridge = await SourceBridge.deploy(attAddress);
  await sourceBridge.waitForDeployment();
  const sourceAddress = await sourceBridge.getAddress();

  const wAtt = await WrappedTestToken.deploy();
  await wAtt.waitForDeployment();
  const wAttAddress = await wAtt.getAddress();

  const targetBridge = await TargetBridge.deploy(wAttAddress);
  await targetBridge.waitForDeployment();
  const targetAddress = await targetBridge.getAddress();

  await (await wAtt.setBridge(targetAddress)).wait();

  console.log("\n=== DEPLOYED ADDRESSES ===");
  console.log("ATT          :", attAddress);
  console.log("SourceBridge :", sourceAddress);
  console.log("wATT         :", wAttAddress);
  console.log("TargetBridge :", targetAddress);

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  const configPath = path.join(outDir, "local_relayer.json");
  const data = {
    network: network.name,
    deployer: deployer.address,
    ATT: attAddress,
    SourceBridge: sourceAddress,
    wATT: wAttAddress,
    TargetBridge: targetAddress,
  };

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  console.log("\nSaved deployment to:", configPath);
  console.log("=== DONE DEPLOY LOCAL FOR RELAYER ===");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
