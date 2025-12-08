const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;
  const [user] = await ethers.getSigners();

  console.log("=== LOCAL ROUNDTRIP DEMO ===");
  console.log("Network :", network.name);
  console.log("User    :", user.address);
  console.log("------------------------------");

  // 1. Deploy kontrak-kontrak
  const TestToken       = await ethers.getContractFactory("TestToken");
  const SourceBridge    = await ethers.getContractFactory("SourceBridge");
  const WrappedTestToken = await ethers.getContractFactory("WrappedTestToken");
  const TargetBridge    = await ethers.getContractFactory("TargetBridge");

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

  // Set bridge di wATT
  await (await wAtt.setBridge(targetAddress)).wait();

  console.log("ATT          :", attAddress);
  console.log("SourceBridge :", sourceAddress);
  console.log("wATT         :", wAttAddress);
  console.log("TargetBridge :", targetAddress);
  console.log("------------------------------");

  // 2. Cek saldo awal ATT user
  let balATTUser = await att.balanceOf(user.address);
  console.log("ATT user (awal)         :", ethers.formatUnits(balATTUser, 18));

  // 3. LOCK 1000 ATT di SourceBridge (simulasi chain SEPOLIA)
  const lockAmount = ethers.parseUnits("1000", 18);

  const txApprove = await att.approve(sourceAddress, lockAmount);
  await txApprove.wait();

  const txLock = await sourceBridge.lock(lockAmount, user.address);
  await txLock.wait();

  const nonce = await sourceBridge.nonce();
  console.log("\n[LOCK]");
  console.log("Lock nonce              :", nonce.toString());

  balATTUser = await att.balanceOf(user.address);
  const balATTSource = await att.balanceOf(sourceAddress);
  console.log("ATT user (setelah lock) :", ethers.formatUnits(balATTUser, 18));
  console.log("ATT bridge (setelah lock):", ethers.formatUnits(balATTSource, 18));

  // 4. MINT 1000 wATT di TargetBridge (simulasi chain AMOY)
  const txMint = await targetBridge.mintFromSource(user.address, lockAmount, nonce);
  await txMint.wait();

  let balWATTUser = await wAtt.balanceOf(user.address);
  console.log("\n[MINT DI TARGET]");
  console.log("wATT user (setelah mint):", ethers.formatUnits(balWATTUser, 18));

  // 5. BURN 400 wATT di TargetBridge (burnToSource)
  const burnAmount = ethers.parseUnits("400", 18);
  const txBurn = await targetBridge.burnToSource(burnAmount, user.address);
  await txBurn.wait();

  balWATTUser = await wAtt.balanceOf(user.address);
  const burnNonce = await targetBridge.burnNonce();
  console.log("\n[BURN DI TARGET]");
  console.log("wATT user (setelah burn):", ethers.formatUnits(balWATTUser, 18));
  console.log("Burn nonce               :", burnNonce.toString());

  // 6. UNLOCK 400 ATT di SourceBridge (unlockFromTarget)
  const processedBefore = await sourceBridge.processedBurnNonces(burnNonce);
  console.log("\n[UNLOCK DI SOURCE]");
  console.log("processedBurnNonces before:", processedBefore);

  const balATTUserBeforeUnlock   = await att.balanceOf(user.address);
  const balATTSourceBeforeUnlock = await att.balanceOf(sourceAddress);
  console.log("ATT user (sebelum unlock) :", ethers.formatUnits(balATTUserBeforeUnlock, 18));
  console.log("ATT bridge (sebelum unlock):", ethers.formatUnits(balATTSourceBeforeUnlock, 18));

  const txUnlock = await sourceBridge.unlockFromTarget(
    user.address,
    burnAmount,
    burnNonce
  );
  await txUnlock.wait();

  const balATTUserAfter   = await att.balanceOf(user.address);
  const balATTSourceAfter = await att.balanceOf(sourceAddress);
  const processedAfter    = await sourceBridge.processedBurnNonces(burnNonce);

  console.log("ATT user (setelah unlock):", ethers.formatUnits(balATTUserAfter, 18));
  console.log("ATT bridge (setelah unlock):", ethers.formatUnits(balATTSourceAfter, 18));
  console.log("processedBurnNonces after :", processedAfter);

  console.log("\n=== DONE LOCAL ROUNDTRIP ===");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
