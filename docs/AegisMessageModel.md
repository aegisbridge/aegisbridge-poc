# AegisMessage Model (AegisBridge v0.2)

This document describes the canonical **AegisMessage** model used by AegisBridge v0.2 to represent
cross-chain bridge operations as structured messages with deterministic hashes.

The goal is to have a stable, chain-agnostic message format that can later be:

- Signed by **post-quantum (PQC)** schemes off-chain  
- Verified by **relayers / committees**  
- Indexed and audited by explorers or monitoring tools  

Even though v0.2 still treats the relayer as trusted, the contracts already emit a canonical
`AegisMessage` hash for each important bridge operation.

---

## 1. Design Goals

The message model is designed to:

1. **Uniquely identify a bridge action**  
   Each lock, mint, burn, and unlock should map to a deterministic message hash.

2. **Be chain-agnostic**  
   The same logical action can be understood and verified off-chain without needing internal
   contract state.

3. **Be PQC-ready**  
   Message hashes should be compatible with PQC signature schemes (e.g. Dilithium, Falcon, etc.).  
   The on-chain contracts only emit hashes; relayers or committees sign / verify off-chain.

4. **Avoid replay attacks**  
   Use chain IDs + bridge addresses + nonces so that a message is only valid for a specific
   source/target pair and direction.

---

## 2. Solidity Structs & Enums

The message model is implemented in **`contracts/AegisMessage.sol`**.

At a high level, we have:

```solidity
pragma solidity ^0.8.20;

library AegisMessage {
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
        address user;     // recipient on target (for lock→mint) or source (for burn→unlock)
        uint256 amount;
        uint256 nonce;    // lockNonce or burnNonce

        uint256 timestamp; // block.timestamp at the time of emission
    }

    function hash(Message memory m) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("AegisMessage_v1"),
                m.direction,
                m.srcChainId,
                m.dstChainId,
                m.srcBridge,
                m.dstBridge,
                m.token,
                m.user,
                m.amount,
                m.nonce,
                m.timestamp
            )
        );
    }
}
