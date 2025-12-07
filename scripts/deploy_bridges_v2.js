const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1) Deploy token asli (ATT)
  const TestToken = await hre.ethers.getContractFactory("TestToken");
  const testToken = await TestToken.deploy();
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  console.log("TestToken (ATT) deployed to:", testTokenAddress);

  // 2) Deploy wrapped token (wATT) di chain tujuan
  const WrappedTestToken = await hre.ethers.getContractFactory("WrappedTestToken");
  const wrappedToken = await WrappedTestToken.deploy();
  await wrappedToken.waitForDeployment();
  const wrappedTokenAddress = await wrappedToken.getAddress();
  console.log("WrappedTestToken (wATT) deployed to:", wrappedTokenAddress);

  // 3) Deploy SourceBridge (lock di sisi asal)
  const SourceBridge = await hre.ethers.getContractFactory("SourceBridge");
  const sourceBridge = await SourceBridge.deploy(testTokenAddress);
  await sourceBridge.waitForDeployment();
  const sourceBridgeAddress = await sourceBridge.getAddress();
  console.log("SourceBridge deployed to:", sourceBridgeAddress);

  // 4) Deploy TargetBridge (mint wATT di sisi tujuan)
  const TargetBridge = await hre.ethers.getContractFactory("TargetBridge");
  const targetBridge = await TargetBridge.deploy(wrappedTokenAddress);
  await targetBridge.waitForDeployment();
  const targetBridgeAddress = await targetBridge.getAddress();
  console.log("TargetBridge deployed to:", targetBridgeAddress);

  // 5) Set bridge address di wrapped token (biar cuma TargetBridge yang boleh mint)
  const txSetBridge = await wrappedToken.setBridge(targetBridgeAddress);
  await txSetBridge.wait();
  console.log("WrappedTestToken.bridge set to TargetBridge");

  console.log("\n=== DEPLOY SUMMARY ===");
  console.log("Deployer       :", deployer.address);
  console.log("ATT            :", testTokenAddress);
  console.log("wATT           :", wrappedTokenAddress);
  console.log("SourceBridge   :", sourceBridgeAddress);
  console.log("TargetBridge   :", targetBridgeAddress);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
