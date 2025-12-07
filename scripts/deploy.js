const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  // Deploy TestToken
  const TestToken = await hre.ethers.getContractFactory("TestToken");
  const testToken = await TestToken.deploy();

  // ethers v6: tunggu kontrak ter-deploy
  await testToken.waitForDeployment();

  const testTokenAddress = await testToken.getAddress();
  console.log("TestToken deployed to:", testTokenAddress);

  // Deploy AegisBridge dengan alamat TestToken
  const AegisBridge = await hre.ethers.getContractFactory("AegisBridge");
  const bridge = await AegisBridge.deploy(testTokenAddress);

  await bridge.waitForDeployment();

  const bridgeAddress = await bridge.getAddress();
  console.log("AegisBridge deployed to:", bridgeAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
