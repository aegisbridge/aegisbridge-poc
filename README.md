# AegisBridge PoC

AegisBridge is an experimental cross-chain bridge prototype designed as a stepping stone toward a **quantum-resilient, PQC-aware bridge protocol**.

This PoC focuses on:

- Lock tokens on a **source side**
- Mint wrapped tokens on a **target side**
- Prevent double-mint using a nonce-based replay protection

> ⚠️ **Security disclaimer:**  
> This is experimental PoC code for learning and prototyping.  
> **Do not use on mainnet** or for real value.

---

## High-Level Idea

The long-term vision of AegisBridge:

- Become a **secure backbone for multi-chain interoperability**.
- Be designed to survive the **post-quantum era**, where classical ECDSA/ECC signatures may be broken.
- Start from a simple, understandable PoC → then evolve into:
  - multi-validator bridge,
  - post-quantum–aware relayer design,
  - and eventually, standardized PQC-based security primitives.

This repo is **Phase 0: Local PoC**.

---

## Contracts Overview

### 1. `TestToken.sol` (ATT)

- Simple ERC20 token used as the **native asset on the source side**.
- Mints a fixed supply (e.g. 1,000,000 ATT) to the deployer.
- Used to simulate users locking assets into the bridge.

### 2. `AegisBridge.sol` (single-chain prototype)

- Early, 1-chain version of a bridge-like contract.
- Can lock/unlock `TestToken` on a single network.
- Useful for understanding the basic **approve → lock → unlock** flow before going multi-side.

### 3. `SourceBridge.sol`

- Deployed on the **source side**.
- Holds a reference to the original `TestToken` (ATT).
- Exposes:

  ```solidity
  function lock(uint256 amount, address recipient) external;
  ```

- When called:
  - `transferFrom(msg.sender → SourceBridge, amount)`  
  - increments a `nonce` counter,
  - emits event:

    ```solidity
    event Locked(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 indexed nonce
    );
    ```

- The `nonce` value and event act as the **message** that a relayer will read.

### 4. `WrappedTestToken.sol` (wATT)

- Represents the **wrapped version of ATT** on the target side.
- Standard ERC20 with:

  ```solidity
  function setBridge(address _bridge) external onlyOwner;
  function mint(address to, uint256 amount) external onlyBridge;
  ```

- Only the configured bridge (TargetBridge) can mint `wATT`.

### 5. `TargetBridge.sol`

- Deployed on the **target side**.
- Holds a reference to `WrappedTestToken`.
- Provides:

  ```solidity
  function mintFromSource(
      address recipient,
      uint256 amount,
      uint256 nonce
  ) external onlyOwner;
  ```

- Maintains:

  ```solidity
  mapping(uint256 => bool) public processedNonces;
  ```

- Each `nonce` from `SourceBridge` can be used **exactly once**.  
  If someone tries to mint again with the same `nonce`, the call reverts with:

  > `Nonce already processed`

- This is a basic form of **replay protection**, which becomes crucial for secure bridges.

---

## Scripts

### `scripts/deploy.js`

Deploys:

- `TestToken`
- `AegisBridge` (single-chain prototype)

Useful as an introductory/demo setup.

### `scripts/deploy_bridges_v2.js`

Deploys the **multi-side PoC**:

1. `TestToken` (ATT)
2. `WrappedTestToken` (wATT)
3. `SourceBridge` (using ATT address)
4. `TargetBridge` (using wATT address)
5. Calls `wrappedToken.setBridge(TargetBridge)` so only `TargetBridge` can mint.

This is the main entrypoint for the **Source/Target bridge model**.

---

## Install & Compile

Clone and install dependencies:

```bash
git clone https://github.com/aegisbridge/aegisbridge-poc.git
cd aegisbridge-poc
npm install
```

### 2. Run a local Hardhat node

```bash
npx hardhat node
```

This exposes `http://127.0.0.1:8545` with funded local accounts.

### 2. Deploy local contracts for relayer/demo

In another terminal:

```bash
npx hardhat run scripts/deploy_local_for_relayer.js --network localhost
```

This script prints something like:

```txt
=== DEPLOY LOCAL FOR RELAYER ===
Network : localhost
Deployer: 0xf39F...

=== DEPLOYED ADDRESSES ===
ATT          : 0x...
SourceBridge : 0x...
wATT         : 0x...
TargetBridge : 0x...

Saved deployment to: deployments/local_relayer.json
=== DONE DEPLOY LOCAL FOR RELAYER ===
```

The addresses are saved to `deployments/local_relayer.json` and used by other local scripts.

### 3. Run the local roundtrip demo

```bash
npx hardhat run scripts/demo_local_roundtrip.js --network localhost
```

Expected output (example):

```text
TestToken (ATT) deployed to:      0x...
WrappedTestToken (wATT) deployed to: 0x...
SourceBridge deployed to:         0x...
TargetBridge deployed to:         0x...
WrappedTestToken.bridge set to TargetBridge
```

Copy these addresses for the next step.

---

## Manual Demo: Lock → Mint on Localhost

### 1. Open Hardhat console

```bash
npx hardhat console --network localhost
```

### 2. Attach to the contracts

Replace the `0x...` with the actual addresses from the deploy script.

```js
const [deployer] = await ethers.getSigners();
console.log("deployer:", deployer.address);

const ATT_ADDRESS        = "0x..."; // TestToken
const WATT_ADDRESS       = "0x..."; // WrappedTestToken
const SRC_BRIDGE_ADDRESS = "0x..."; // SourceBridge
const DST_BRIDGE_ADDRESS = "0x..."; // TargetBridge

const att       = await ethers.getContractAt("TestToken",        ATT_ADDRESS);
const wAtt      = await ethers.getContractAt("WrappedTestToken", WATT_ADDRESS);
const srcBridge = await ethers.getContractAt("SourceBridge",     SRC_BRIDGE_ADDRESS);
const dstBridge = await ethers.getContractAt("TargetBridge",     DST_BRIDGE_ADDRESS);
```

### 3. Check initial balances

```js
ethers.formatUnits(await att.balanceOf(deployer.address), 18);
ethers.formatUnits(await wAtt.balanceOf(deployer.address), 18);
```

Expected:

- ATT ≈ `1000000.0`
- wATT = `0.0`

### 4. Lock 1000 ATT in SourceBridge

```js
const amount = ethers.parseUnits("1000", 18);

// Approve SourceBridge to take ATT
await (await att.approve(SRC_BRIDGE_ADDRESS, amount)).wait();

// Lock into SourceBridge
await (await srcBridge.lock(amount, deployer.address)).wait();
```

Check:

```js
ethers.formatUnits(await att.balanceOf(deployer.address), 18);
ethers.formatUnits(await att.balanceOf(SRC_BRIDGE_ADDRESS), 18);

await srcBridge.nonce(); // should be 1n for the first lock
```

### 5. Mint 1000 wATT on the target side

```js
await (await dstBridge.mintFromSource(
  deployer.address,
  amount,
  1 // nonce from SourceBridge
)).wait();

ethers.formatUnits(await wAtt.balanceOf(deployer.address), 18);
```

Trying to call `mintFromSource` again with the **same nonce (1)** will revert with  
`Nonce already processed` → replay protection is working as intended.

---

## Roadmap

This repo is **Phase 0: Local PoC**. Planned evolution:

### Phase 1 – Testnets

- Deploy `SourceBridge` and `TargetBridge` to real testnets (e.g. Ethereum Sepolia & Polygon Amoy).
- Implement a simple **off-chain relayer** that:
  - listens to `Locked` events on the source chain,
  - sends `mintFromSource` txs on the target chain.

### Phase 2 – Multi-Validator Bridge

- Replace single `onlyOwner` with:
  - a **validator set** (multiple signers),
  - threshold/majority for message approval.
- Define canonical message format:

  ```text
  hash(chainIdSource, chainIdTarget, token, recipient, amount, nonce, ...)
  ```

### Phase 3 – PQC-Aware Design

- Integrate **Post-Quantum Cryptography (PQC)** at the relayer/validator layer:
  - PQC signatures on bridge messages.
  - Key rotation and upgrade paths.
- Explore on-chain verification or zk-friendly proofs for PQC schemes (where feasible).

### Phase 4 – Production-Grade Architecture

- Robust monitoring, slashing conditions, and economic security.
- Standardization-oriented design to become a candidate **“Aegis” bridge security standard** for multi-chain ecosystems.

---

## Disclaimer

This repository is:

- for **education, experimentation, and R&D**,
- not audited,
- **not intended for mainnet** or production.

Use at your own risk.  
AegisBridge is still at an early design and prototyping stage.
