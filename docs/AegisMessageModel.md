# AegisBridge – AegisMessage Model (v0.2)

This document describes the canonical cross-chain message format used by AegisBridge v0.2 and how it is emitted on-chain as a hash. The goal is to provide a stable foundation for future PQC-aware relayers and off-chain verifiers.

---

## 1. Motivation

AegisBridge transmits value between two chains (e.g. Sepolia ↔ Amoy) using a simple lock/mint/burn/unlock pattern.

Beyond the raw events (`Locked`, `MintedFromSource`, `BurnToSource`, `UnlockedFromTarget`), it is useful to have a **canonical, chain-agnostic message format** that describes “what happened” in a way that:

- Can be hashed deterministically
- Can be signed off-chain by relayers or committees (e.g. using PQC signatures)
- Can be verified by users, dashboards, and future on-chain contracts

This is the role of `AegisMessage`.

---

## 2. Message Structure

The message is defined in `contracts/AegisMessage.sol`:

```solidity
enum Direction {
    LockToMint,
    BurnToUnlock
}

struct Message {
    uint64 srcChainId;
    uint64 dstChainId;
    address srcBridge;
    address dstBridge;
    address token;
    address user;
    uint256 amount;
    uint256 nonce;
    Direction direction;
    uint64 timestamp;
}
