# AegisBridge PoC

AegisBridge is an experimental cross-chain bridge prototype designed as a stepping stone toward a **quantum-resilient, PQC-aware bridge protocol**.

This PoC focuses on:

- A simple **lock → mint → burn → unlock** model
- **Nonce-based replay protection** on the target chain
- A fully automated **local roundtrip** (lock + mint + burn + unlock)
- A **public testnet one-way bridge**: **Ethereum Sepolia → Polygon Amoy**

The long-term goal of AegisBridge is to evolve this design into a bridge that validates cross-chain messages using **post-quantum cryptography (PQC)** and secure relayer sets.

---

## Architecture Overview

This PoC uses a minimal set of contracts:

- **`TestToken` (ATT)**  
  ERC-20 token on the **source chain** (e.g. Sepolia).  
  Used as the asset being bridged.

- **`WrappedTestToken` (wATT)**  
  ERC-20 token on the **target chain** (e.g. Amoy).  
  Minted 1:1 to represent locked ATT on the source chain.

- **`SourceBridge`**  
  Lives on the source chain.  
  - Accepts `lock(amount, recipient)` calls  
  - Holds locked ATT  
  - Emits events with `(user, amount, nonce)`

- **`TargetBridge`**  
  Lives on the target chain.  
  - Mints wATT with `mintFromSource(user, amount, nonce)`  
  - (Optional) burns wATT with `burnToSource(...)` in local PoC  
  - Tracks `processedNonces[nonce]` to prevent replay

> **PQC integration (future):**  
> In later versions, cross-chain messages (lock → mint, burn → unlock) would be attested by PQC-signed proofs from relayers / committees, and the bridge contracts would verify those attestations on-chain.

---

## Project Layout

```txt
contracts/
  TestToken.sol          # ATT on source chain
  WrappedTestToken.sol   # wATT on target chain
  SourceBridge.sol       # Lock bridge on source
  TargetBridge.sol       # Mint/burn bridge on target

scripts/
  demo_local_roundtrip.js      # Full local lock → mint → burn → unlock demo
  deploy_local_for_relayer.js  # Deploy local contracts + save deployments/local_relayer.json
  local_relayer.js             # (WIP) local relayer skeleton using local_relayer.json

  deploy_sepolia_source.js     # Deploy ATT + SourceBridge on Sepolia
  deploy_amoy_target.js        # Deploy wATT + TargetBridge on Amoy

  sepolia_lock.js              # Lock ATT on Sepolia (prints nonce)
  amoy_mint_from_sepolia.js    # Mint wATT on Amoy using amount + nonce

  # Additional helper scripts (balances, test mints, etc.) may exist as experiments

deployments/
  local_relayer.json           # Local deployment addresses for relayer/local tests
  testnet_sepolia_amoy.json    # (Optional) Testnet deployment addresses (if created)
```

---

## 🔭 AegisBridge Roadmap

- [x] v0.1 – Basic lock → event → mint (Sepolia → Amoy)
- [ ] v0.2 – Burn → event → unlock (Amoy → Sepolia, arah sebaliknya)
- [ ] v0.3 – Simple relayer CLI (auto baca event + kirim tx ke chain target)
- [ ] v0.4 – Minimal web dashboard:
  - Connect wallet
  - Form bridge (source chain, target chain, amount)
  - Status history (tx hash source/target)
- [ ] v0.5 – PQC R&D:
  - Dokumentasi konsep penggunaan skema tanda tangan post-quantum di lapisan relayer
  - Draft whitepaper singkat


## Prerequisites

- Node.js (>= 18 recommended)
- npm
- Git
- A funded EOA on:
  - **Sepolia** (for gas + test ATT operations)
  - **Polygon Amoy** (for gas + wATT operations)

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
- The same deployer is used by `hardhat.config.js` to send all testnet txs.

---

## Local PoC – Full Roundtrip

This section demonstrates the full local flow:

- Mint 1,000 ATT
- Lock 1,000 ATT on `SourceBridge`
- Mint 1,000 wATT on `TargetBridge`
- Burn 400 wATT on `TargetBridge`
- Unlock 400 ATT back on `SourceBridge`
- Enforce replay-protection using `processedBurnNonces`

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

- Nonce on source increases each lock.
- Target chain tracks processed burn nonces.
- Funds move correctly between user ↔ bridge contracts.

> ⚠️ On Windows you may see:
> `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\winsync.c, line 76`  
> This is a known Node.js/Hardhat quirk on Windows. As long as the tx logs are correct, it is safe to ignore for this PoC.

---

## Testnet PoC – One-Way Bridge (Sepolia → Amoy)

This PoC also runs on public testnets:

- **Source chain:** Ethereum **Sepolia**
- **Target chain:** Polygon **Amoy**

The flow:

1. Lock ATT on Sepolia via `SourceBridge`
2. Mint wATT on Amoy via `TargetBridge.mintFromSource`
3. Protect the target chain with **nonce-based replay protection**

> 🔐 Currently, the relayer step is done manually via scripts.  
> In a future iteration, a dedicated relayer process will listen to events on Sepolia and call `mintFromSource` on Amoy automatically.

### 1. Deploy contracts on Amoy (Target)

```bash
npx hardhat run scripts/deploy_amoy_target.js --network amoy
```

Expected output (example):

```txt
=== Deploying TARGET contracts on amoy ===
Deployer: 0x36b9...
WrappedTestToken (wATT) deployed to: 0x2703...
TargetBridge deployed to: 0x8e0e...

wATT.bridge set to TargetBridge

=== TARGET (Amoy) SUMMARY ===
Deployer     : 0x36b9...
wATT         : 0x2703...
TargetBridge : 0x8e0e...
================================
```

### 2. Deploy contracts on Sepolia (Source)

```bash
npx hardhat run scripts/deploy_sepolia_source.js --network sepolia
```

Expected output (example):

```txt
=== Deploying SOURCE contracts on sepolia ===
Deployer: 0x36b9...
TestToken (ATT) deployed to: 0x2703...
SourceBridge deployed to: 0x8e0e...

=== SOURCE (Sepolia) SUMMARY ===
Deployer       : 0x36b9...
ATT (TestToken): 0x2703...
SourceBridge   : 0x8e0e...
=================================
```

The deploy scripts can optionally persist addresses into a JSON file (e.g. `deployments/testnet_sepolia_amoy.json`) for reuse by other scripts.

### 3. Lock ATT on Sepolia

Script: `scripts/sepolia_lock.js`

This script:

- Reads ATT + SourceBridge from config
- Approves SourceBridge to move ATT
- Locks a fixed amount (e.g. 1000 ATT)
- Prints the new bridge `nonce`

Run:

```bash
npx hardhat run scripts/sepolia_lock.js --network sepolia
```

Example output:

```txt
Network :  sepolia
Deployer: 0x36b9...
ATT before: 995500.0
Approve tx: 0x...
Lock tx   : 0x...
Locked in block: 9793442
Current nonce on SourceBridge: 6
ATT after (user): 994500.0
ATT after (bridge): 5500.0

➡️  Gunakan nonce ini di sisi Amoy untuk mintFromSource: 6
```

Take note of:

- `Current nonce on SourceBridge` → e.g. `6`
- Locked `amount` → e.g. `1000`

### 4. Mint wATT on Amoy

Script: `scripts/amoy_mint_from_sepolia.js`  
This script:

- Reads wATT + TargetBridge from config
- Uses a manually configured `AMOUNT` and `NONCE`
- Mints wATT on Amoy if the nonce has **not** been processed yet

Example configuration inside `amoy_mint_from_sepolia.js`:

```js
const AMOUNT = "1000"; // must match the locked amount on Sepolia
const NONCE  = 6;      // use the nonce printed by sepolia_lock.js
```

Then run:

```bash
npx hardhat run scripts/amoy_mint_from_sepolia.js --network amoy
```

Example output (first time):

```txt
Network : amoy
Deployer: 0x36b9...
wATT before: 3500.0
Mint tx: 0x1b71...
wATT after: 4500.0
```

If you run the same script again with the same `NONCE`, you should see:

```txt
Network : amoy
Deployer: 0x36b9...
wATT before: 4500.0
Nonce 6 already processed on target. Skip mint.
```

This confirms that:

- The one-way bridge **Sepolia → Amoy** is working.
- `TargetBridge` correctly enforces **nonce-based replay protection**.

---

## Known Issues / Notes

- On Windows, you may see assertions like:

  ```txt
  Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\winsync.c, line 76
  ```

  This is a Node.js/Hardhat/Windows interaction issue.  
  As long as transactions are mined and logs look correct, it does not affect PoC behavior.

- Scripts in `scripts/` are written for **experimentation** and PoC.  
  Some helper scripts or older experiments may not be wired into the main flow.

---

## Roadmap (High-Level)

This repository is an early exploration of AegisBridge. Next logical steps:

1. **Automated Testnet Relayer**
   - Long-running script that:
     - Listens to `Locked` events on Sepolia
     - Automatically calls `mintFromSource` on Amoy
     - Tracks processed nonces and logs events

2. **Message Model & PQC-Aware Design**
   - Define a canonical cross-chain message format:
     - `{ srcChainId, dstChainId, token, amount, user, nonce, timestamp }`
   - Plan how PQC signatures (e.g. Dilithium) could be used to attest these messages off-chain.

3. **Multi-Token / Multi-Chain Support**
   - Support multiple ERC-20 tokens
   - Extend PoC to additional EVM chains / L2s

4. **Frontend Demo**
   - Minimal dApp:
     - Connect wallet on Sepolia
     - Lock ATT
     - Show bridge status and resulting wATT balance on Amoy

---

## License

This is research / PoC code.  
Choose and add an appropriate license (e.g. MIT) before production use.
