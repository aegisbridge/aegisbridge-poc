const hre = require("hardhat");
const cfg = require("../deployments/testnet_sepolia_amoy.json");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  if (network.name !== "amoy") {
    throw new Error("Run this with --network amoy");
  }

  const wAtt = await ethers.getContractAt("WrappedTestToken", cfg.amoy.wATT);
  const targetBridge = await ethers.getContractAt(
    "TargetBridge",
    cfg.amoy.TargetBridge
  );

  const amount = ethers.parseUnits("600", 18);

  console.log("Network :", network.name);
  console.log("Deployer:", deployer.address);
  console.log(
    "wATT before:",
    await ethers.formatUnits(await wAtt.balanceOf(deployer.address), 18)
  );

  const txBurn = await targetBridge.burnToSource(amount, deployer.address);
  const receipt = await txBurn.wait();
  console.log("Burn tx       :", txBurn.hash);
  console.log("Burned in block:", receipt.blockNumber);

  const burnNonce = await targetBridge.burnNonce();
  console.log("Current burnNonce on TargetBridge:", burnNonce.toString());

  console.log(
    "wATT after:",
    await ethers.formatUnits(await wAtt.balanceOf(deployer.address), 18)
  );

  console.log(
    "\n➡️  Gunakan burnNonce ini di sepolia_unlock_600.js:",
    burnNonce.toString()
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
