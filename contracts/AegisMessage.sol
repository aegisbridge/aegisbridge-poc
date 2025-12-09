// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AegisMessage
/// @notice Canonical cross-chain message model & hash for AegisBridge.
library AegisMessage {
    /// @dev Direction of the bridge flow.
    /// - LockToMint   : source lock → target mint
    /// - BurnToUnlock : target burn → source unlock
    enum Direction {
        LockToMint,
        BurnToUnlock
    }

    /// @dev Canonical message format for AegisBridge.
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

    /// @dev Typehash used for hashing messages (must match off-chain relayer).
    bytes32 internal constant MESSAGE_TYPEHASH =
        keccak256(
            "AegisBridge.Message(uint64 srcChainId,uint64 dstChainId,address srcBridge,address dstBridge,address token,address user,uint256 amount,uint256 nonce,uint8 direction,uint64 timestamp)"
        );

    /// @notice Compute canonical hash of a message.
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
