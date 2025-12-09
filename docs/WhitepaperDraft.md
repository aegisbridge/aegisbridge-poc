# AegisBridge – Security-First Cross-Chain Bridge (Whitepaper Draft v0.1)

> **Status:** Draft · Testnet prototype (Sepolia ⇄ Polygon Amoy) · No mainnet deployment yet  

## 1. Abstract

AegisBridge is a security-focused cross-chain bridge that connects EVM-compatible networks using a simple architecture: minimal on-chain logic, an auditable off-chain relayer, and a transparent monitoring surface (logs + dApp).  
The current proof-of-concept supports ERC‑20 style test tokens (ATT on Sepolia, wATT on Polygon Amoy) and demonstrates a fully working two-way flow:

- Sepolia → Amoy: **lock** native token → **mint** wrapped token  
- Amoy → Sepolia: **burn** wrapped token → **unlock** native token  

Future iterations will extend AegisBridge to additional networks (with Base as the primary home chain) and introduce a post‑quantum cryptography (PQC)–aware message model for relayer attestations.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- **Safety first:**  
  - Make it easy to reason about the security properties.  
  - Prefer explicit limits and circuit breakers over complex yield mechanics.
- **Observability:**  
  - All important actions (lock, mint, burn, unlock, pause/unpause, relayer errors) must be visible through logs, events, and a simple UI.
- **Simplicity of implementation:**  
  - Minimal contracts with clear responsibilities.  
  - Off-chain relayer code that can be audited and extended.
- **Extensibility:**  
  - Easy to add new chains and new token mappings.  
  - Designed so that a future PQC message layer can be added without redesigning everything from scratch.

### 2.2 Non-Goals (for the POC)

- No multi-relayer consensus or validator set yet (single relayer / operator).  
- No bridge token / economic model in the POC.  
- No production-grade monitoring or alerting stack.  
- No on-chain PQC verification (too expensive and premature); PQC is introduced at the message design level first.

---

## 3. Architecture Overview

### 3.1 Components

1. **Source Bridge Contract (`SourceBridge`) – Sepolia**

   - Holds the native token (ATT) in custody.  
   - Exposes:
     - `lock(uint256 amount, address recipient)`  
       - Transfers `amount` ATT from the user to the bridge.  
       - Increments `lockNonce`.  
       - Emits a `Locked` event with:
         - `from` (user address),
         - `to` (recipient on target chain),
         - `amount`,
         - `lockNonce`.

     - `unlockFromTarget(...)` (called by relayer on the way back).  
   - Includes admin features:
     - `pause()` / `unpause()` (Pausable).  
     - Access control (only owner / admin can perform certain actions).

2. **Target Bridge Contract (`TargetBridge`) – Polygon Amoy**

   - Mints and burns wrapped tokens (`wATT`).  
   - Exposes:
     - `mintFromSource(address to, uint256 amount, uint256 lockNonce, bytes relayerData)`  
       - Called by the relayer when a `Locked` event is observed on Sepolia.  
       - Checks that `lockNonce` has not been processed before.  
       - Mints `amount` wATT to `to`.  
       - Marks the nonce as processed (`processedLockNonces[lockNonce] = true`).

     - `burnToSource(uint256 amount, address targetUser)`  
       - Burns the user’s `amount` of wATT.  
       - Increments `burnNonce`.  
       - Emits a `BurnToSource` event with:
         - `from` (user on Amoy),
         - `to` (recipient on Sepolia),
         - `amount`,
         - `burnNonce`.

3. **Test Tokens**

   - `ATT` (Sepolia): simple ERC‑20 test token.  
   - `wATT` (Amoy): wrapped ERC‑20 token representing locked ATT.

4. **Relayer (off-chain, Node.js)**

   - Watches `Locked` events on `SourceBridge` (Sepolia).  
   - Watches `BurnToSource` events on `TargetBridge` (Amoy).  
   - For each new event:
     - Checks local state (`relayer_state.json`) to ensure the nonce was not processed.  
     - Builds and broadcasts the corresponding transaction:
       - `mintFromSource(...)` on Amoy for `Locked` events.  
       - `unlockFromTarget(...)` on Sepolia for `BurnToSource` events.
     - Retries failed transactions with backoff.  
     - Writes structured logs to `relayer.log`.

5. **Frontend dApp (v0.4)**

   - Pure client-side app (HTML + JS + ethers.js) served from `frontend/`.  
   - Key features:
     - Connect wallet via MetaMask.  
     - Select direction:
       - Sepolia → Amoy (lock → mint).  
       - Amoy → Sepolia (burn → unlock).  
     - Input amount & optional custom recipient.  
     - Automatic `approve()` calls if allowance is too low.  
     - Shows transaction hashes and a simple log timeline in the UI.  

---

## 4. Message & State Model

### 4.1 Nonces and Idempotency

Each bridge direction uses a monotonically increasing nonce:

- `lockNonce` in `SourceBridge`.  
- `burnNonce` in `TargetBridge`.

The relayer stores a local view of processed nonces in `relayer_state.json`:

```json
{
  "processedLockNonces": {
    "1": true,
    "2": true
  },
  "processedBurnNonces": {
    "1": true
  }
}
```

On-chain, each bridge contract also stores “processed” flags, so even if the relayer retries the same transaction, the bridge contract will ignore already processed nonces.  
This double-layer idempotency (on-chain + off-chain) prevents accidental double mints or double unlocks.

### 4.2 Informal Message Format (Current POC)

At the moment, the message structure is implicit in the event fields and function parameters:

- **Lock message (source → target):**

  - Source: `Locked(from, to, amount, lockNonce)` event.  
  - Target call: `mintFromSource(to, amount, lockNonce, relayerData)`.

- **Burn message (target → source):**

  - Source: `BurnToSource(from, to, amount, burnNonce)` event.  
  - Target call: `unlockFromTarget(to, amount, burnNonce, relayerData)`.

`relayerData` is currently unused in the POC, but reserved for future metadata such as PQC signatures or additional proofs.

---

## 5. Security Model (POC)

### 5.1 Trust Assumptions

- A single relayer key is trusted to:
  - Observe events correctly on both chains.
  - Broadcast the correct mint/unlock transactions.  
- Source and target chains are assumed to have standard finality guarantees (Ethereum L1 derivative for Sepolia, Polygon’s testnet guarantees for Amoy).  
- There is no economic slashing or validator set; this is a technology and UX prototype, not a fully permissionless bridge yet.

### 5.2 Controls & Safety Features

- **Pause/unpause:**  
  - Admin can pause bridge contracts to block new lock/burn actions during incidents or upgrades.

- **Nonce-based replay protection:**  
  - Each `lockNonce` / `burnNonce` can only be processed once.  
  - Repeated relayer calls with an already processed nonce must be rejected on-chain.

- **Limits & configuration (roadmap):**  
  - Per-transaction minimum and maximum amount.  
  - Per-day or per-epoch global limits for a given token pair.  
  - Optional allowlist/denylist of tokens and destination chains.

### 5.3 Attack Surface (High-Level)

- **Relayer compromise:**
  - A compromised relayer key can attempt to mint/unlock incorrectly.  
  - Mitigation roadmap:
    - Multisig or threshold relayers.  
    - Time-delayed execution with monitoring & veto systems.  
    - Eventually, committee-based or light-client-based validation.

- **Admin key compromise:**
  - Admin can pause/unpause and potentially change critical parameters.  
  - Mitigation roadmap:
    - Move ownership to multisig / DAO.  
    - Time-locked governance for parameter changes.

- **PQC-relevant threats (future):**
  - Long-term security of ECDSA under quantum adversaries.  
  - AegisBridge’s PQC message model is designed so that migration to PQC-friendly schemes can be done incrementally.

---

## 6. PQC Message Model (Vision)

### 6.1 Motivation

In a post-quantum world, ECDSA and typical blockchain signatures may be vulnerable to powerful adversaries.  
While on-chain verification of PQC signatures is currently too expensive, we can **start by designing the message envelope** so that:

- Off-chain relayers and watchers can sign and verify PQC signatures.  
- Additional security layers (watchtowers, committees) can rely on PQC without requiring immediate changes to the L1/L2 signature schemes.

### 6.2 Proposed Bridge Message Envelope

We define an abstract `BridgeMessage`:

```jsonc
{
  "version": 1,
  "direction": "SOURCE_TO_TARGET", // or "TARGET_TO_SOURCE"
  "sourceChainId": 11155111,
  "targetChainId": 80002,
  "nonce": 42,
  "token": "0xATT_or_wATT",
  "amount": "10000000000000000000",
  "sender": "0xUserOnSource",
  "recipient": "0xUserOnTarget",
  "eventTxHash": "0x...",
  "eventBlockNumber": 1234567,
  "timestamp": 1733700000
}
```

The PQC envelope wraps this message:

```jsonc
{
  "message": { /* BridgeMessage */ },
  "hash": "0xSHA256_or_Keccak_of_message",
  "pqcSignature": "<bytes>",        // e.g., Dilithium / SPHINCS+ signature
  "pqcPublicKeyId": "relayer-key-1",
  "relayerEcdsaAddress": "0xRelayerEvmAddress"
}
```

### 6.3 How It Fits the Current POC

In the current POC:

- The relayer already constructs an implicit `BridgeMessage` to know what to call and where.  
- We can gradually:
  1. Make this explicit in the relayer code (build a JSON object and a deterministic hash).  
  2. Add optional PQC signing and verification off-chain (for audit logs and watchtowers).  
  3. Only later explore on-chain consumption of this envelope on chains that support PQC-friendly precompiles or zk-proofs.

This approach lets AegisBridge be **“PQC-ready”** at the message layer, without blocking on the current limitations of on-chain PQC verification.

---

## 7. Roadmap

### 7.1 Near-Term (v0.4.x)

- [ ] Add status panel to the dApp:
  - Display `lockNonce`, `burnNonce`, and paused state directly from contracts.
  - Show last processed events with links to explorers.
- [ ] Expose a small HTTP status endpoint from the relayer (health & last processed block).
- [ ] Harden relayer configuration:
  - Required environment variables.
  - Per-token min/max bridge amounts.
  - Safer defaults for retries & timeouts.

### 7.2 Mid-Term (v0.5+)

- [ ] Integrate **Base** testnet/mainnet as a primary chain:
  - Move “home” token and canonical state to Base.  
  - Keep Sepolia/Amoy as demo & testing networks.
- [ ] Introduce a governance/operations model:
  - Admin multisig.
  - Clear operational runbook for incident response (pause, drain, resume).

### 7.3 PQC Evolution

- [ ] Implement explicit `BridgeMessage` & hashing in the relayer.  
- [ ] Integrate a PQC library (e.g., Dilithium/Sphincs+ bindings) for signing envelopes.  
- [ ] Build a simple off-chain verifier / watcher that validates PQC signatures and compares them to on-chain activity.  
- [ ] Explore zk-proof or rollup-based mechanisms to attest PQC-verified messages on-chain.

---

## 8. Disclaimer

This document describes an experimental prototype.  
Nothing here should be interpreted as production security guarantees or financial advice.  
Mainnet deployment of AegisBridge **must** be preceded by:

- Thorough code reviews.  
- Professional security audits.  
- Formal threat modeling.  
- Robust operational procedures and monitoring.

