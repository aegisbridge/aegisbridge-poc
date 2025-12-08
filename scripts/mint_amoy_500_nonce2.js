const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);

  const WATT_ADDRESS       = "0x270387a7D6dF9E4d3315406aA4F639d3Cc414610";
  const DST_BRIDGE_ADDRESS = "0x8e0e8C997aBFc1eEbc7bEfC8E2Fb444c3B70020a";

  const wAtt      = await ethers.getContractAt("WrappedTestToken", WATT_ADDRESS);
  const dstBridge = await ethers.getContractAt("TargetBridge",     DST_BRIDGE_ADDRESS);

  const balBefore = await wAtt.balanceOf(deployer.address);
  console.log("wATT before:", ethers.formatUnits(balBefore, 18));

  const amount = ethers.parseUnits("500", 18);
  const nonce  = 2n;

  const already = await dstBridge.processedNonces(nonce);
  if (already) {
    console.log("Nonce", nonce.toString(), "already processed on target. Skip mint.");
    return;
  }

  const tx = await dstBridge.mintFromSource(
    deployer.address,
    amount,
    nonce
  );
  console.log("Mint tx hash:", tx.hash);
  await tx.wait();

  const balAfter = await wAtt.balanceOf(deployer.address);
  console.log("wATT after :", ethers.formatUnits(balAfter, 18));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
