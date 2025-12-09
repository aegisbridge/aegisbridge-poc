# AegisBridge: PQC-Aware Cross-Chain Bridge (Whitepaper Draft)

> **Status:** Draft – AegisBridge v0.2 Implementation  
> **Scope:** Conceptual and technical overview of the AegisBridge protocol, current PoC, and PQC-aware roadmap.

---

## 1. Introduction

Public blockchains have enabled a rich ecosystem of assets and applications across multiple chains and rollups. As this ecosystem fragments, **bridges** become critical infrastructure for moving liquidity and state between domains. However, bridges are also among the most security-sensitive components in the stack: a single failure can compromise user funds across multiple networks.

In parallel, advances in quantum computing present a long-term threat to classical public-key cryptography. While practical quantum computers capable of breaking elliptic-curve cryptography (ECC) are not yet available, **post-quantum cryptography (PQC)** is moving from theory to standardization. Bridge designs that depend heavily on long-lived classical keys may be at risk in the future.

**AegisBridge** is an experimental research project exploring a **PQC-aware cross-chain bridge architecture**. It starts with a simple, auditable value flow and progressively introduces a canonical message model and relayer design that can support PQC-based attestations in later phases.

This document describes:

- The **problem space** and **threat model** addressed by AegisBridge.
- The current **v0.2 proof-of-concept (PoC)** implementation on Ethereum Sepolia and Polygon Amoy.
- The **AegisMessage** model for canonical cross-chain messages.
- A forward-looking design for **PQC-secured relayers and committees**.
- The limitations and roadmap toward a more robust production-ready system.

---

## 2. Goals and Non-Goals

### 2.1 Goals

AegisBridge aims to:

1. **Demonstrate a minimal yet complete bridge value flow**
   - Lock on source → mint on target.
   - Burn on target → unlock on source.
   - Enforced by **nonce-based replay protection** on both sides.

2. **Provide a canonical message model**
   - A chain-agnostic `AegisMessage` representation of bridge operations.
   - Deterministic `keccak256` hashes for each cross-chain message.
   - Easy to integrate with off-chain tooling, explorers, and PQC primitives.

3. **Enable a PQC-aware relayer design**
   - Define how messages should be hashed and signed by relayers.
   - Allow future replacement of classical signatures with PQC signatures.
   - Support quorum-based validation and multi-relayer committees.

4. **Offer safety mechanisms for experimentation**
   - `Ownable + Pausable` bridges with an **emergency brake**.
   - Clear separation between legacy one-way deployments and v0.2 two-way flow.
   - Scripts and documentation focused on clarity and reproducibility.

### 2.2 Non-Goals

In its current form, AegisBridge **does not** aim to:

- Provide a production-ready bridge or carry real-value assets.
- Compete with existing battle-tested bridges in terms of features or performance.
- Solve all aspects of decentralized relayer selection, staking, or slashing.
- Implement on-chain PQC verification (which likely requires precompiles or specialized contracts).

Instead, this PoC is intentionally constrained to highlight the **message model**, **value flow**, and **PQC-aware architecture**, leaving advanced decentralization and economics for future work.

---

## 3. Threat Model and Security Assumptions

### 3.1 Adversary Capabilities

We consider an attacker that may:

- Control arbitrary user accounts on either chain.
- Attempt to **replay** old messages (lock/mint, burn/unlock) to drain liquidity.
- Attempt to **forge** cross-chain messages or modify them in transit.
- Exploit **implementation bugs** in bridge contracts or scripts.
- In the long term, possess a **quantum computer** capable of breaking classical signature schemes.

We do **not** assume the attacker can:

- Break the underlying consensus of Ethereum or the target EVM chains.
- Modify chain history without performing a major consensus attack.

### 3.2 Security Properties Targeted

AegisBridge v0.2 aims to provide:

- **No double-mint**: Each lock on the source should drive at most one mint on the target.
- **No double-unlock**: Each burn on the target should drive at most one unlock on the source.
- **No unauthorized mint/unlock**: Only messages that correspond to valid on-chain events should lead to value transfer.
- **Emergency halting**: An administrator can pause bridges to stop new operations in case of detected issues.

### 3.3 Trust Assumptions (v0.2)

The current PoC makes the following strong assumptions:

- A **trusted relayer** (or operator) is responsible for:
  - Observing events on one chain.
  - Constructing `AegisMessage` objects.
  - Calling the appropriate function on the other chain.
- The bridge admin (owner) is trusted to:
  - Use `pause()` and `unpause()` responsibly.
  - Configure remote bridge/token addresses correctly.
- PQC is **not yet enforced on-chain**; PQC is only a design target, not an implemented security guarantee.

These assumptions will be progressively weakened as AegisBridge evolves toward multi-relayer PQC-secured deployments.

---

## 4. System Overview

### 4.1 Roles

- **User**: Holds ATT on the source chain and wATT on the target chain; initiates lock and burn operations.
- **SourceBridge**: Smart contract on the source chain that holds locked ATT and releases it upon valid unlocks.
- **TargetBridge**: Smart contract on the target chain that mints and burns wATT corresponding to locked ATT.
- **Relayer**:
  - Observes events (`Locked`, `BurnToSource`) on one chain.
  - Constructs `AegisMessage` instances.
  - Initiates `mintFromSource` or `unlockFromTarget` transactions on the other chain.
- **Admin / Operator**:
  - Owns and configures bridges.
  - Can pause/unpause operations.
  - Runs or supervises relayers.

### 4.2 Assets and Chains

- **Source chain**: Ethereum Sepolia (testnet)
  - Native token: ETH (for gas)
  - Bridged asset: `TestToken` (ATT)

- **Target chain**: Polygon Amoy (testnet)
  - Native token: MATIC (for gas)
  - Bridged asset: `WrappedTestToken` (wATT), representing locked ATT at a 1:1 ratio.

Other EVM chains and tokens can be added in future versions by following the same pattern.

---

## 5. Protocol Design

### 5.1 Contracts

#### 5.1.1 TestToken (ATT)

- ERC-20 token on the source chain.
- Used solely as a **test asset** for bridging.
- May mint initial supply to the deployer at construction time.
- No special privileges beyond standard ERC-20 semantics.

#### 5.1.2 WrappedTestToken (wATT)

- ERC-20 token on the target chain.
- Minted and burned exclusively by the `TargetBridge`.
- Settable bridge address via `setBridge(...)` (owner-only).
- Represents a claim on ATT locked in `SourceBridge`.

#### 5.1.3 SourceBridge

Key responsibilities:

- Accept `lock(amount, recipient)` calls:
  - Transfers `amount` of ATT from user to itself.
  - Increments `lockNonce`.
  - Emits `Locked(sender, recipient, amount, nonce)`.
  - Constructs an `AegisMessage` of type `LockToMint`.
  - Emits `MessageHashEmitted(msgHash, direction, nonce)`.

- Accept `unlockFromTarget(recipient, amount, burnNonce)` calls:
  - Only callable by the owner (or a designated relayer in future designs).
  - Ensures `burnNonce` has not been processed.
  - Transfers `amount` of ATT to `recipient`.
  - Marks `burnNonce` as processed.
  - Emits `UnlockedFromTarget(recipient, amount, burnNonce)`.

- Administrative capabilities:
  - `pause()` / `unpause()` (emergency stop).
  - Remote configuration for message model (destination chain/bridge/token).

#### 5.1.4 TargetBridge

Key responsibilities:

- Accept `mintFromSource(user, amount, nonce)` calls:
  - Only callable by the owner (trusted relayer in v0.2).
  - Ensures `nonce` has not been processed before.
  - Mints `amount` of wATT to `user`.
  - Marks `nonce` as processed.
  - Emits a `MessageHashEmitted` for traceability.

- Accept `burnToSource(amount, targetUser)` calls:
  - Burns `amount` of wATT from the caller.
  - Increments `burnNonce`.
  - Emits `BurnToSource(from, to, amount, burnNonce)`.
  - Constructs an `AegisMessage` of type `BurnToUnlock`.
  - Emits `MessageHashEmitted(msgHash, direction, burnNonce)`.

- Administrative capabilities:
  - `pause()` / `unpause()` (emergency stop).
  - Remote configuration for message model (destination chain/bridge/token).

### 5.2 AegisMessage Model

AegisBridge introduces a canonical message struct:

```solidity
enum Direction {
    LockToMint,
    BurnToUnlock
}

struct Message {
    Direction direction;
    uint256 srcChainId;
    uint256 dstChainId;
    address srcBridge;
    address dstBridge;
    address token;
    address user;
    uint256 amount;
    uint256 nonce;
    uint256 timestamp;
}
```

The message is hashed as:

```solidity
bytes32 msgHash = keccak256(
    abi.encode(
        keccak256("AegisMessage_v1"),
        direction,
        srcChainId,
        dstChainId,
        srcBridge,
        dstBridge,
        token,
        user,
        amount,
        nonce,
        timestamp
    )
);
```

Both bridges emit `MessageHashEmitted` events containing:

- `msgHash`
- `direction`
- `nonce`

These hashes are intended to be used by off-chain PQC-aware relayers and explorers.

### 5.3 Replay Protection

Replay protection is enforced through:

- **Lock nonces** (`lockNonce` on SourceBridge) for the lock → mint direction, and
- **Burn nonces** (`burnNonce` on TargetBridge) for the burn → unlock direction.

Each nonce can only be processed once:

- On the target side, `processedLockNonces[nonce]` prevents double-minting.
- On the source side, `processedBurnNonces[burnNonce]` prevents double-unlock.

Combined with chain IDs and bridge addresses in the `AegisMessage`, this significantly reduces the risk of cross-domain replay.

### 5.4 Pause / Unpause Semantics

Both bridges inherit from `Pausable`:

- When a bridge is **paused**:
  - `lock`, `mintFromSource`, `burnToSource`, `unlockFromTarget` operations revert.
- When **unpaused**:
  - Operations resume, subject to nonce and balance checks.

Admin scripts in the repository demonstrate that:

- Calling `pause()` on the source bridge causes subsequent `lock` calls to revert.
- Calling `pause()` on the target bridge causes subsequent `burnToSource` calls to revert.
- After `unpause()`, operations regain normal behavior.

This mechanism is essential for experimental deployments where quick reaction to issues is required.

---

## 6. Implementation Status (v0.2)

AegisBridge v0.2 includes:

- Source and target bridge contracts with:
  - Nonce-based replay protection.
  - `Ownable + Pausable`.
  - A canonical `AegisMessage` model with on-chain hash emission.
- A pair of testnet deployments on:
  - Ethereum Sepolia (source).
  - Polygon Amoy (target).
- A **local Hardhat** demo:
  - Fully automated lock → mint → burn → unlock.
- A **testnet scripting suite**:
  - Deployment scripts for both chains.
  - Scripts for lock, mint, burn, unlock flows.
  - An optional **testnet relayer**:
    - Listens to `Locked` on Sepolia → calls `mintFromSource` on Amoy.
    - Listens to `BurnToSource` on Amoy → calls `unlockFromTarget` on Sepolia.
- Admin scripts to:
  - Pause/unpause source and target bridges.
  - Inspect balances on both chains.

The v0.2 PoC has been exercised end-to-end for:

- Lock ATT on Sepolia → Mint wATT on Amoy.
- Burn wATT on Amoy → Unlock ATT on Sepolia.
- Confirming balances with `check_balances_testnet.js`.
- Validating the effect of `pause()` and `unpause()`.

---

## 7. PQC-Aware Relayer Design

### 7.1 Motivation

Relayers are one of the weakest points in many bridge designs. Centralized relayers introduce a single point of failure, while decentralized relayers must coordinate in a secure and efficient way. Looking ahead, relayer keys may eventually need to be **post-quantum secure** to resist future adversaries.

AegisBridge’s `AegisMessage` model is designed to make relayer logic as simple and transparent as possible:

- Each message has a canonical encoding and hash.
- Each hash is emitted on-chain.
- Multiple relayers can arrive at the same `msgHash` independently.

This reduces ambiguity and makes it straightforward to introduce **PQC-based signatures** in later iterations.

### 7.2 Single Relayer (Current PoC)

In v0.2, the relayer is effectively a **single trusted process** that:

1. Watches for:
   - `Locked` events on the source chain.
   - `BurnToSource` events on the target chain.
2. Reconstructs `AegisMessage` instances off-chain.
3. Executes the corresponding on-chain functions:
   - `mintFromSource` on the target chain.
   - `unlockFromTarget` on the source chain.

This is simple and suitable for early experiments, but still relies on a trusted operator.

### 7.3 Multi-Relayer Committees (Future)

A future version of AegisBridge envisions:

- Multiple independent relayers forming a **committee**.
- Each relayer:
  - Observes events.
  - Reconstructs the message.
  - Computes `msgHash`.
  - Signs `msgHash` with a **PQC private key**.
- A coordinator (on-chain or off-chain) aggregates signatures and enforces:
  - A minimum threshold of valid signatures (e.g. 2-of-3, 3-of-5).
  - Optional timeouts or slashing for misbehavior.

This architecture allows the bridge to become:

- **Byzantine fault tolerant** against a subset of malicious relayers.
- Ready to migrate to PQC-only relay keys when the ecosystem supports it.

### 7.4 PQC Algorithm Choices (Exploratory)

While AegisBridge does not hard-code any specific PQC scheme, typical candidates include:

- **CRYSTALS-Dilithium** (lattice-based signatures).
- **Falcon** (also lattice-based).
- **SPHINCS+** (hash-based signatures).

Key considerations for choosing a PQC scheme in a bridge context:

- Signature size vs. on-chain verification cost.
- Key size and distribution.
- Implementation complexity and auditability.
- Compatibility with precompiles or off-chain verification arrangements.

These design choices will be explored in future versions and may depend on EVM-level support for PQC verification.

---

## 8. Limitations and Risks

AegisBridge v0.2 is subject to several important limitations:

1. **Trusted Relayer**  
   - A compromised or malicious relayer can steal funds by minting/unlocking without proper intent.
   - PQC does not solve this on its own; decentralization and quorum enforcement are necessary.

2. **Admin Centralization**  
   - Bridges are owned and controlled by a single admin account.
   - Admin keys must be protected; compromise can lead to loss of funds.

3. **No On-Chain PQC Verification Yet**  
   - Messages are hashed, but only classical EVM semantics are used.
   - PQC signatures and their verification remain off-chain design targets.

4. **Testnet-Only**  
   - Deployments use Ethereum Sepolia and Polygon Amoy.
   - Test tokens (ATT, wATT) have no real economic value and are not audited for production.

5. **Upgrade and Governance Model**  
   - The PoC does not define a robust upgrade or governance mechanism.
   - Future versions must consider controlled upgrades, governance, and user consent.

---

## 9. Future Work

Key directions for continued development:

1. **PQC-Backed Relayer Prototype**
   - Implement off-chain signing of `AegisMessage.hash` with a PQC library.
   - Store signatures alongside relayer logs.
   - Provide a verifier tool to check logs against on-chain events.

2. **Threshold Relayer Committees**
   - Introduce multiple relayers and a basic quorum system.
   - Explore off-chain aggregation and on-chain verification strategies.

3. **On-Chain PQC Support**
   - Investigate feasibility of:
     - PQC precompiles or specialized verification contracts.
     - Hybrid approaches combining classical and PQC proofs.

4. **Expanded Asset and Chain Support**
   - Multi-token configuration (multiple ERC-20s).
   - Additional EVM networks and rollups.

5. **Formal Verification and Auditing**
   - Apply formal methods to verify bridge invariants.
   - Commission external security audits before any mainnet deployment.

6. **User-Facing Frontend**
   - Minimal web UI for:
     - Connecting wallets.
     - Initiating lock/burn flows.
     - Displaying message hashes and relayer status.
   - Educational materials about PQC and bridging risks.

---

## 10. Conclusion

AegisBridge v0.2 demonstrates a focused, research-oriented approach to bridge design:

- A minimal, auditable lock/mint and burn/unlock value flow.
- Nonce-based replay protection in both directions.
- A canonical `AegisMessage` model that emits deterministic message hashes.
- A clear path toward PQC-aware relayers and committees.

While the current implementation is not production-ready and carries significant trust assumptions, it establishes a solid foundation for **post-quantum-secure cross-chain communication**. By evolving the relayer model, integrating PQC signatures, and decentralizing control, AegisBridge aims to become a blueprint for the next generation of resilient bridge protocols.

---

*This document is a working draft and will evolve alongside the AegisBridge codebase and research roadmap.* 
