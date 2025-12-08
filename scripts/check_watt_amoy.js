const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  const wAtt = await ethers.getContractAt(
    "WrappedTestToken",
    "0x270387a7D6dF9E4d3315406aA4F639d3Cc414610"
  );

  const bal = await wAtt.balanceOf(deployer.address);

  console.log("Network :", network.name);
  console.log("Deployer:", deployer.address);
  console.log("wATT    :", ethers.formatUnits(bal, 18));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
