const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Network :", network.name);
  console.log("Deployer:", deployer.address);

  const WATT_ADDRESS       = "0x270387a7D6dF9E4d3315406aA4F639d3Cc414610";
  const DST_BRIDGE_ADDRESS = "0x8e0e8C997aBFc1eEbc7bEfC8E2Fb444c3B70020a";

  const wAtt      = await ethers.getContractAt("WrappedTestToken", WATT_ADDRESS);
  const dstBridge = await ethers.getContractAt("TargetBridge",     DST_BRIDGE_ADDRESS);

  const balBefore = await wAtt.balanceOf(deployer.address);
  console.log("wATT before:", ethers.formatUnits(balBefore, 18));

  const amount = ethers.parseUnits("200", 18);
  const sepoliaRecipient = deployer.address; // atau address lain di Sepolia

  const tx = await dstBridge.burnToSource(amount, sepoliaRecipient);
  console.log("Burn tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Burned in block:", receipt.blockNumber);

  const balAfter = await wAtt.balanceOf(deployer.address);
  console.log("wATT after :", ethers.formatUnits(balAfter, 18));

  const burnNonce = await dstBridge.burnNonce();
  console.log("Current burnNonce:", burnNonce.toString());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
