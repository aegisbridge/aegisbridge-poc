const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Network :", network.name);
  console.log("Deployer:", deployer.address);

  const ATT_ADDRESS        = "0x270387a7D6dF9E4d3315406aA4F639d3Cc414610";
  const SRC_BRIDGE_ADDRESS = "0x8e0e8C997aBFc1eEbc7bEfC8E2Fb444c3B70020a";

  const att       = await ethers.getContractAt("TestToken",   ATT_ADDRESS);
  const srcBridge = await ethers.getContractAt("SourceBridge", SRC_BRIDGE_ADDRESS);

  const balBefore = await att.balanceOf(deployer.address);
  console.log("ATT before:", ethers.formatUnits(balBefore, 18));

  const amount = ethers.parseUnits("500", 18);

  const txApprove = await att.approve(SRC_BRIDGE_ADDRESS, amount);
  console.log("Approve tx:", txApprove.hash);
  await txApprove.wait();

  const txLock = await srcBridge.lock(amount, deployer.address);
  console.log("Lock tx   :", txLock.hash);
  const receipt = await txLock.wait();
  console.log("Locked in block:", receipt.blockNumber);

  const nonce = await srcBridge.nonce();
  console.log("Current nonce:", nonce.toString());

  const balAfterUser   = await att.balanceOf(deployer.address);
  const balAfterBridge = await att.balanceOf(SRC_BRIDGE_ADDRESS);

  console.log("ATT after (user)  :", ethers.formatUnits(balAfterUser, 18));
  console.log("ATT after (bridge):", ethers.formatUnits(balAfterBridge, 18));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
