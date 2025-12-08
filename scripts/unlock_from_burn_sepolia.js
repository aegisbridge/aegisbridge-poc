const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Network :", network.name);
  console.log("Deployer:", deployer.address);

  const ATT_ADDRESS        = "0x270387a7D6dF9E4d3315406aA4F639d3Cc414610";
  const SRC_BRIDGE_ADDRESS = "0x8e0e8C997aBFc1eEbc7bEfC8E2Fb444c3B70020a";

  const att       = await ethers.getContractAt("TestToken",    ATT_ADDRESS);
  const srcBridge = await ethers.getContractAt("SourceBridge", SRC_BRIDGE_ADDRESS);

  const balUserBefore   = await att.balanceOf(deployer.address);
  const balBridgeBefore = await att.balanceOf(SRC_BRIDGE_ADDRESS);

  console.log("ATT before (user)  :", ethers.formatUnits(balUserBefore, 18));
  console.log("ATT before (bridge):", ethers.formatUnits(balBridgeBefore, 18));

  const amount    = ethers.parseUnits("200", 18);
  const burnNonce = 1n;
  const recipient = deployer.address;

  const already = await srcBridge.processedBurnNonces(burnNonce);
  if (already) {
    console.log("Burn nonce", burnNonce.toString(), "already processed. Skip unlock.");
    return;
  }

  const tx = await srcBridge.unlockFromTarget(recipient, amount, burnNonce);
  console.log("Unlock tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Unlocked in block:", receipt.blockNumber);

  const balUserAfter   = await att.balanceOf(deployer.address);
  const balBridgeAfter = await att.balanceOf(SRC_BRIDGE_ADDRESS);

  console.log("ATT after (user)  :", ethers.formatUnits(balUserAfter, 18));
  console.log("ATT after (bridge):", ethers.formatUnits(balBridgeAfter, 18));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
