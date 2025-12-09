// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./AegisMessage.sol";

/// @title SourceBridge
/// @notice Bridge di sisi chain asal:
///         - lock token ketika user mau pindah ke chain tujuan
///         - unlock token ketika ada burn di chain tujuan.
/// @dev v0.2: ditambah emit hash canonical AegisMessage saat lock
///      (bisa dipakai relayer/PQC layer di masa depan).
contract SourceBridge is Ownable {
    using AegisMessage for AegisMessage.Message;

    IERC20 public immutable token; // token asli (ATT)
    uint256 public nonce;          // id unik tiap lock

    // Burn nonce dari chain tujuan yang sudah diproses → cegah replay unlock.
    mapping(uint256 => bool) public processedBurnNonces;

    /// Emitted ketika user mengunci token di source.
    event Locked(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 indexed nonce
    );

    /// Emitted ketika token dibuka kembali setelah burn di target.
    event UnlockedFromTarget(
        address indexed recipient,
        uint256 amount,
        uint256 indexed burnNonce
    );

    /// Emitted ketika hash canonical AegisMessage terbentuk.
    /// Untuk v0.2, event ini dipakai hanya pada arah LockToMint.
    event MessageHashEmitted(
        bytes32 indexed msgHash,
        AegisMessage.Direction direction,
        uint256 indexed nonce
    );

    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "Token address cannot be zero");
        token = IERC20(_token);
    }

    /// @notice User mengunci token di sisi asal.
    /// @dev Event `Locked` ini yang akan dibaca relayer. Di v0.2 kita juga
    ///      emit hash canonical message via `MessageHashEmitted`.
    function lock(uint256 amount, address recipient) external {
        require(amount > 0, "Amount must be > 0");
        require(recipient != address(0), "Recipient cannot be zero");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "Token transfer failed");

        nonce += 1;

        // Event lama (tetap dipakai relayer v0.2)
        emit Locked(msg.sender, recipient, amount, nonce);

        // === AegisMessage canonical hash (LockToMint) ===
        //
        // Catatan:
        // - srcChainId diambil dari block.chainid.
        // - dstChainId & dstBridge masih di-set 0 di v0.2 PoC,
        //   nanti di v0.3 bisa diisi real target chain / bridge.
        //
        AegisMessage.Message memory m = AegisMessage.Message({
            srcChainId: uint64(block.chainid),
            dstChainId: 0,              // TODO: set 80002 untuk Amoy di versi berikutnya
            srcBridge: address(this),
            dstBridge: address(0),      // TODO: isi alamat TargetBridge kalau mau full
            token: address(token),
            // Tergantung desain, kita bisa pilih:
            // - msg.sender  = pengirim awal
            // - recipient   = penerima di chain tujuan
            // Untuk sekarang kita pakai recipient sebagai "user" canonical.
            user: recipient,
            amount: amount,
            nonce: nonce,
            direction: AegisMessage.Direction.LockToMint,
            timestamp: uint64(block.timestamp)
        });

        bytes32 msgHash = m.hash();
        emit MessageHashEmitted(msgHash, AegisMessage.Direction.LockToMint, nonce);
    }

    /// @notice Dipanggil relayer/owner setelah melihat event BurnToSource di chain tujuan.
    /// @dev Satu `burnNonce` hanya boleh dipakai sekali.
    function unlockFromTarget(
        address recipient,
        uint256 amount,
        uint256 burnNonce
    ) external onlyOwner {
        require(recipient != address(0), "Recipient cannot be zero");
        require(amount > 0, "Amount must be > 0");
        require(!processedBurnNonces[burnNonce], "Burn nonce already processed");

        processedBurnNonces[burnNonce] = true;

        bool ok = token.transfer(recipient, amount);
        require(ok, "Token transfer failed");

        emit UnlockedFromTarget(recipient, amount, burnNonce);

        // (Opsional v0.3+) Di sini kita juga bisa bentuk AegisMessage
        // untuk arah BurnToUnlock dan emit hash-nya, tapi di v0.2 PoC
        // cukup dari sisi lock (LockToMint) saja.
    }
}
