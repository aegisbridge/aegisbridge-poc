# AegisBridge PoC (v0.2)

AegisBridge is an experimental cross-chain bridge prototype designed as a stepping stone toward a **quantum-resilient, PQC-aware bridge protocol**.

This PoC focuses on:

- A simple **lock → mint → burn → unlock** value flow  
- **Nonce-based replay protection** in both directions  
- A fully automated **local roundtrip** (lock + mint + burn + unlock)  
- A **public testnet v0.2 two-way bridge**: **Ethereum Sepolia ↔ Polygon Amoy**  
- A clear separation between **v0.1 (legacy one-way)** and **v0.2 (two-way)** testnet deployments  
- An emergency **pause / unpause** mechanism on both bridges  
- A canonical **AegisMessage** model with on-chain message hashes for future PQC integration  

The long-term goal of AegisBridge is to evolve this design into a bridge that validates cross-chain messages using **post-quantum cryptography (PQC)** and secure relayer sets.

---

## Architecture Overview

This PoC uses a minimal set of contracts:

- **`TestToken` (ATT)**  
  ERC-20 token on the **source chain** (e.g. Sepolia).  
  Used as the asset being bridged. In the current PoC, it is a simple test token.

- **`WrappedTestToken` (wATT)**  
  ERC-20 token on the **target chain** (e.g. Amoy).  
  Minted 1:1 to represent locked ATT on the source chain. Only the bridge can mint and burn.

- **`SourceBridge`**  
  Lives on the source chain.  
  - Accepts `lock(amount, recipient)` calls  
  - Holds locked ATT  
  - Emits events with `(user, amount, nonce)`  
  - In v0.2, also exposes `unlockFromTarget(user, amount, burnNonce)` and tracks a mapping of processed burn nonces to prevent replay

- **`TargetBridge`**  
  Lives on the target chain.  
  - Mints wATT with `mintFromSource(user, amount, nonce)`  
  - Burns wATT with `burnToSource(amount, targetUser)`  
  - Tracks `processedNonces[nonce]` to prevent replay on **lock → mint**  
  - Emits `BurnToSource` events used to drive **burn → unlock** on the source chain

> **PQC integration (future):**  
> In later versions, cross-chain messages (lock → mint, burn → unlock) would be attested by PQC-signed proofs from relayers / committees, and the bridge contracts would verify those attestations on-chain. The current PoC treats the relayer as trusted.

---

## Project Layout

```txt
contracts/
  TestToken.sol           # ATT on source chain
  WrappedTestToken.sol    # wATT on target chain
  SourceBridge.sol        # Lock + unlock bridge on source
  TargetBridge.sol        # Mint + burn bridge on target

scripts/
  # Local (Hardhat node) PoC
  demo_local_roundtrip.js       # Full local lock → mint → burn → unlock demo
  deploy_local_for_relayer.js   # Deploy local contracts + save deployments/local_relayer.json
  local_relayer.js              # (WIP) local relayer skeleton using local_relayer.json

  # Testnet deploy scripts (v0.2)
  deploy_sepolia_source_v2.js   # Deploy ATT + SourceBridge v0.2 on Sepolia
  deploy_amoy_target.js         # Deploy wATT + TargetBridge v0.2 on Amoy

  # Testnet flow scripts
  sepolia_lock.js               # Lock ATT on Sepolia (prints nonce)
  amoy_mint_from_sepolia.js     # Mint wATT on Amoy using amount + nonce

  amoy_burn_to_sepolia.js       # Burn wATT on Amoy (emits BurnToSource event)
  sepolia_unlock_from_amoy.js   # Unlock ATT on Sepolia based on burnNonce

  testnet_relayer.js            # (Optional) future relayer to automate events → tx

deployments/
  local_relayer.json            # Local deployment addresses for relayer/local tests
  testnet_sepolia_amoy.json     # Testnet deployment addresses (Sepolia + Amoy)

docs/
  AegisMessageModel.md          # Message format & hash model for PQC-aware design
```

> **Note:** Old v0.1 testnet contracts (one-way Sepolia → Amoy) may still exist on-chain but are considered **legacy**.  
> The **v0.2 flow** and deployment addresses in `deployments/testnet_sepolia_amoy.json` are the current reference.

---

## Prerequisites

- Node.js (>= 18 recommended)  
- npm  
- Git  
- A funded EOA on:
  - **Sepolia** (for gas + ATT operations)
  - **Polygon Amoy** (for gas + wATT operations)

You will also need valid RPC URLs for both testnets.

---

## Install & Compile

Clone and install dependencies:

```bash
git clone https://github.com/aegisbridge/aegisbridge-poc.git
cd aegisbridge-poc
npm install
```

Compile contracts:

```bash
npx hardhat compile
```

---

## Environment Configuration

Create a `.env` file in the project root (do **not** commit this file):

```bash
SEPOLIA_RPC_URL="https://..."
AMOY_RPC_URL="https://..."
PRIVATE_KEY="0xYOUR_PRIVATE_KEY_WITH_FUNDS_ON_BOTH_TESTNETS"
```

- `PRIVATE_KEY` should be the **same EOA** used as deployer on both Sepolia & Amoy.  
- The same deployer is used by `hardhat.config.js` to send all testnet transactions.  
- This EOA will:
  - Own initial ATT supply on Sepolia (depending on `TestToken` implementation)
  - Own minted wATT on Amoy

---

## Local PoC – Full Roundtrip

This section demonstrates the full **local** flow on a Hardhat node:

- Mint initial ATT to the user (local default account)  
- Lock ATT on `SourceBridge` (local)  
- Mint wATT on `TargetBridge` (local)  
- Burn wATT on `TargetBridge` (local)  
- Unlock ATT on `SourceBridge` (local)  
- Enforce replay-protection using nonces  

### 1. Start local Hardhat node

In one terminal:

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

```txt
=== LOCAL ROUNDTRIP DEMO ===
Network : localhost
User    : 0xf39F...

ATT          : 0x...
SourceBridge : 0x...
wATT         : 0x...
TargetBridge : 0x...

ATT user (awal)         : 1000000.0

[LOCK]
Lock nonce              : 1
ATT user (setelah lock) : 999000.0
ATT bridge (setelah lock): 1000.0

[MINT DI TARGET]
wATT user (setelah mint): 1000.0

[BURN DI TARGET]
wATT user (setelah burn): 600.0
Burn nonce               : 1

[UNLOCK DI SOURCE]
processedBurnNonces before: false
ATT user (sebelum unlock) : 999000.0
ATT bridge (sebelum unlock): 1000.0
ATT user (setelah unlock): 999400.0
ATT bridge (setelah unlock): 600.0
processedBurnNonces after : true

=== DONE LOCAL ROUNDTRIP ===
```

This confirms:

- The source nonce increases with each `lock`.  
- The target chain tracks processed lock nonces (to prevent replay on mint).  
- The source chain tracks processed burn nonces (to prevent replay on unlock).  
- Funds move correctly between user ↔ bridge contracts.

> ⚠️ On Windows you may see:
> `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\winsync.c, line 76`  
> This is a known Node.js/Hardhat quirk on Windows. As long as the tx logs are correct, it is safe to ignore for this PoC.

---

## Testnet PoC v0.2 – Full Roundtrip (Sepolia ↔ Amoy)

The **v0.2** PoC supports a full two-way testnet flow:

1. **Source chain:** Ethereum **Sepolia**  
2. **Target chain:** Polygon **Amoy**  

The flow:

1. Lock ATT on Sepolia via `SourceBridge.lock(...)`  
2. Mint wATT on Amoy via `TargetBridge.mintFromSource(...)`  
3. Burn wATT on Amoy via `TargetBridge.burnToSource(...)`  
4. Unlock ATT on Sepolia via `SourceBridge.unlockFromTarget(...)`  
5. Protect both directions using **nonce-based replay protection**  
6. Optionally run a **relayer** to automate both directions  

> 🔐 Currently, the relayer step is done manually via scripts.  
> In a future iteration, a dedicated relayer process will listen to events on one chain and call the corresponding function on the other chain automatically.

These addresses are examples from a recent v0.2 deployment and **will change if you redeploy**.  
The canonical source of truth is always `deployments/testnet_sepolia_amoy.json`.

```txt
Sepolia (source v0.2)
  ATT (TestToken)  : <from deployments/testnet_sepolia_amoy.json>
  SourceBridge     : <from deployments/testnet_sepolia_amoy.json>

Polygon Amoy (target v0.2)
  wATT (Wrapped)   : <from deployments/testnet_sepolia_amoy.json>
  TargetBridge     : <from deployments/testnet_sepolia_amoy.json>
```

Always check the JSON file before interacting with the contracts.

---

### 1. Deploy Source v0.2 on Sepolia

```bash
npx hardhat run scripts/deploy_sepolia_source_v2.js --network sepolia
```

This script:

- Deploys `TestToken` (ATT) on Sepolia  
- Deploys `SourceBridge` linked to the new ATT  
- Updates the `"sepolia"` section inside `deployments/testnet_sepolia_amoy.json`  

---

### 2. Deploy Target v0.2 on Amoy

```bash
npx hardhat run scripts/deploy_amoy_target.js --network amoy
```

This script:

- Deploys `WrappedTestToken` (wATT) on Amoy  
- Deploys `TargetBridge` linked to the new wATT  
- Calls `wATT.setBridge(TargetBridge)` if available  
- Updates the `"amoy"` section inside `deployments/testnet_sepolia_amoy.json`  

---

### 3. Start the Testnet Relayer (Optional but Recommended)

The v0.2 relayer is implemented in `scripts/testnet_relayer.js`.

It:

- Listens to `Locked` events on Sepolia → calls `mintFromSource` on Amoy  
- Listens to `BurnToSource` events on Amoy → calls `unlockFromTarget` on Sepolia  
- Logs both directions and uses the deployment JSON for addresses  

Run:

```bash
node scripts/testnet_relayer.js
```

You should see output similar to:

```txt
=== AegisBridge v0.2 Testnet Relayer ===
Sepolia RPC : ...
Amoy RPC    : ...
Deployer/Relayer address: 0x...

SourceBridge (Sepolia): 0x...
ATT (Sepolia)        : 0x...
TargetBridge (Amoy)  : 0x...
wATT (Amoy)          : 0x...
========================================

Subscribing to events...
- Locked(user, recipient, amount, nonce) on SourceBridge (Sepolia) → mintFromSource on Amoy
- BurnToSource(from, to, amount, burnNonce) on TargetBridge (Amoy) → unlockFromTarget on Sepolia
```

Leave this process running while you perform lock/mint/burn operations.

---

### 4. Lock ATT on Sepolia

Script: `scripts/sepolia_lock.js`

```bash
npx hardhat run scripts/sepolia_lock.js --network sepolia
```

This script:

- Reads ATT + SourceBridge from `deployments/testnet_sepolia_amoy.json`  
- Approves SourceBridge to move ATT  
- Locks a fixed amount (e.g. 1000 ATT)  
- Prints the updated `nonce` on SourceBridge  

Example output:

```txt
Network :  sepolia
Deployer: 0x...
ATT before: 1000000.0
Approve tx: 0x...
Lock tx   : 0x...
Locked in block: 98xxxxx
Current nonce on SourceBridge: 1
ATT after (user): 999000.0
ATT after (bridge): 1000.0

➡️  Use this nonce on the Amoy side for mintFromSource: 1
```

If the relayer is running, it should automatically pick up this `Locked` event and send a `mintFromSource` transaction on Amoy.

---

### 5. Mint wATT on Amoy (Manual Mode)

If you want to run without the relayer, you can manually mint on Amoy via:

```bash
npx hardhat run scripts/amoy_mint_from_sepolia.js --network amoy
```

Inside `amoy_mint_from_sepolia.js`, configure:

```js
const AMOUNT = "1000"; // must match the locked amount on Sepolia
const NONCE  = 1;      // use the nonce printed by sepolia_lock.js
```

When the relayer is on, it will do this step automatically.

---

### 6. Burn wATT on Amoy

Script: `scripts/amoy_burn_to_sepolia.js`  

This script:

- Reads wATT + TargetBridge from `deployments/testnet_sepolia_amoy.json`  
- Ensures allowance (approve) for TargetBridge if needed  
- Simulates `burnToSource` via `staticCall` to check for reverts  
- Sends a real `burnToSource(amount, targetUser)` transaction  
- Prints wATT balance before/after  

Configuration inside `amoy_burn_to_sepolia.js`:

```js
const BURN_AMOUNT = process.env.BURN_AMOUNT || "400"; // wATT
const TARGET_ON_SEPOLIA =
  process.env.TARGET_ON_SEPOLIA || deployer;          // receiver on Sepolia
```

Run:

```bash
npx hardhat run scripts/amoy_burn_to_sepolia.js --network amoy
```

Example output:

```txt
=== Amoy burn → Sepolia unlock demo ===
Network : amoy
Deployer / holder wATT : 0x...
wATT         : 0x...
TargetBridge : 0x...
wATT.bridge()           : 0x...
TargetBridge (expected) : 0x...
wATT balance before: 1600.0

Simulating burnToSource(400 wATT → 0x...) via staticCall...
✅ staticCall burnToSource() SUCCESS (no revert).

Burning 400 wATT on Amoy → unlock ATT to 0x... on Sepolia...
Burn tx sent: 0x...
Burn confirmed in block: 30xxxxx
wATT balance after : 1200.0
```

If the relayer is running, it will detect the `BurnToSource` event and then call `unlockFromTarget` on Sepolia automatically.

---

### 7. Unlock ATT on Sepolia (Manual Mode)

Script: `scripts/sepolia_unlock_from_amoy.js`  

This script:

- Reads ATT + SourceBridge v0.2 from `deployments/testnet_sepolia_amoy.json`  
- Uses a configured `BURN_NONCE` and `UNLOCK_AMOUNT`  
- Simulates `unlockFromTarget` via `staticCall`  
- Sends a real `unlockFromTarget` transaction  
- Prints ATT balances before/after  

Configuration inside `sepolia_unlock_from_amoy.js`:

```js
const BURN_NONCE    = Number(process.env.BURN_NONCE || 1); // burn nonce from Amoy
const UNLOCK_AMOUNT = process.env.UNLOCK_AMOUNT || "400";  // must match BURN_AMOUNT
```

Run:

```bash
npx hardhat run scripts/sepolia_unlock_from_amoy.js --network sepolia
```

Example output:

```txt
=== Sepolia unlockFromTarget demo ===
Network : sepolia
Deployer (receiver ATT) : 0x36b9...
SourceBridge : 0x571949...
ATT (TestToken): 0x0e61F6...

Config:
  BURN_NONCE    : 1
  UNLOCK_AMOUNT : 400
ATT user   (before): 999000.0
ATT bridge (before): 1000.0

Simulating unlockFromTarget(0x36b9..., 400, burnNonce=1) via staticCall...
✅ staticCall unlockFromTarget() SUCCESS (no revert).

Calling unlockFromTarget(0x36b9..., 400, burnNonce=1) on Sepolia...
Unlock tx sent: 0x9cfd24...
Unlock confirmed in block: 9799675
ATT user   (after): 999400.0
ATT bridge (after): 600.0

=== DONE Sepolia unlockFromTarget ===
```

This confirms:

- **v0.2 roundtrip is working on testnet**:
  - Lock 1000 ATT → Mint 1000 wATT → Burn 400 wATT → Unlock 400 ATT
- Nonce-based replay protection is enforced for both directions.

---

## Known Issues / Notes

- On Windows, you may see assertions like:

  ```txt
  Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
  ```

  This is a Node.js/Hardhat/Windows interaction issue.  
  As long as transactions are mined and logs look correct, it does not affect PoC behavior.

- Some older scripts and contracts (v0.1) may still exist in the repository or on testnets.  
  The **v0.2 flow described in this README** is the current reference.

- Test tokens (ATT, wATT) have **no real value** and should never be used in production.

---

## Roadmap (High-Level)

This repository is an early exploration of AegisBridge. Next logical steps:

1. **Automated Testnet Relayer (PQC-aware)**  
   - Extend the existing relayer to:
     - Optionally sign `AegisMessage.hash` with PQC signatures  
     - Verify multi-relayer signatures or quorum off-chain  
     - Persist a local index of processed messages  

2. **Message Model & PQC-Aware Design**
   - Define a canonical cross-chain message format, e.g.:

     ```txt
     { srcChainId, dstChainId, token, amount, user, nonce, direction, timestamp }
     ```

   - Plan how PQC signatures (e.g. Dilithium) could be used to attest these messages off-chain.
   - Design how the bridge contracts would verify PQC-based attestations.

3. **Multi-Token / Multi-Chain Support**  
   - Support multiple ERC-20 tokens  
   - Extend PoC to additional EVM chains / L2s  
   - Config-driven deployments and routing  

4. **Frontend Demo**  
   - Minimal dApp:
     - Connect wallet on Sepolia & Amoy  
     - Lock ATT  
     - Show bridge status and resulting wATT balance on Amoy  
     - Show burn/unlock history and status  
     - Display message hashes for advanced users / auditors  

5. **PQC R&D & Documentation**  
   - Conceptual documentation for integrating post-quantum signature schemes into the relayer layer  
   - A short whitepaper-style document outlining:
     - Threat model (classical vs quantum)  
     - PQC algorithm choices  
     - Message formats and signature flows  

---

## License

This is research / PoC code.  
Choose and add an appropriate license (e.g. MIT) before any production use.
