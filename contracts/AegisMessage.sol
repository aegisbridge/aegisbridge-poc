// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AegisMessage
/// @notice Canonical cross-chain message format for AegisBridge.
/// @dev This is an off-chain / relayer facing abstraction. v0.2 contracts
///      don't verify PQC signatures yet, but they can emit / consume these
///      message hashes for logging and future upgrades.
library AegisMessage {
    /// @notice Direction of the bridge flow.
    /// LockToMint   : source lock → target mint
    /// BurnToUnlock : target burn → source unlock
    enum Direction {
        LockToMint,
        BurnToUnlock
    }

    /// @notice Canonical message used for off-chain attestation.
    /// All fields should be fully determined from on-chain state/events.
    struct Message {
        uint64  srcChainId;   // e.g. 11155111 for Sepolia
        uint64  dstChainId;   // e.g. 80002 for Amoy
        address srcBridge;    // SourceBridge address
        address dstBridge;    // TargetBridge address (or inverse for BurnToUnlock)
        address token;        // ATT on source, wATT on target
        address user;         // end user wallet (the one bridging funds)
        uint256 amount;       // bridged amount (10**18 decimals)
        uint256 nonce;        // lock nonce or burn nonce
        Direction direction;  // LockToMint or BurnToUnlock
        uint64  timestamp;    // unix seconds when message was formed
    }

    /// @notice Typehash used to make hashing more structured (EIP-712 style).
    bytes32 internal constant MESSAGE_TYPEHASH =
        keccak256(
            "AegisBridge.Message(uint64 srcChainId,uint64 dstChainId,address srcBridge,address dstBridge,address token,address user,uint256 amount,uint256 nonce,uint8 direction,uint64 timestamp)"
        );

    /// @notice Compute the canonical hash of a message.
    /// This is what off-chain relayers / PQC signers would attest to.
    function hash(Message memory m) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MESSAGE_TYPEHASH,
                m.srcChainId,
                m.dstChainId,
                m.srcBridge,
                m.dstBridge,
                m.token,
                m.user,
                m.amount,
                m.nonce,
                uint8(m.direction),
                m.timestamp
            )
        );
    }
}
