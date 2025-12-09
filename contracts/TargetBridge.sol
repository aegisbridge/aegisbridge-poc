// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./WrappedTestToken.sol";
import "./AegisMessage.sol";

/// @title TargetBridge
/// @notice Bridge di sisi chain tujuan:
///         - mint wATT saat ada lock di source
///         - burn wATT saat user mau balik ke source (nanti di-unlock di SourceBridge).
/// @dev v0.2: tambah emit hash canonical AegisMessage saat burnToSource (BurnToUnlock).
contract TargetBridge is Ownable {
    using AegisMessage for AegisMessage.Message;

    WrappedTestToken public immutable wrapped;

    // Nonce lock yang sudah diproses (dari SourceBridge) → cegah double mint.
    mapping(uint256 => bool) public processedNonces;

    // Counter burnNonce lokal di target chain.
    uint256 public burnNonce;

    event MintFromSource(address indexed to, uint256 amount, uint256 nonce);

    event BurnToSource(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 nonce
    );

    /// @notice Hash canonical AegisMessage yang dipakai off-chain / PQC layer.
    /// @dev Disamakan dengan SourceBridge untuk memudahkan indexing.
    event MessageHashEmitted(
        bytes32 indexed msgHash,
        AegisMessage.Direction direction,
        uint256 indexed nonce
    );

    constructor(address _wrapped) Ownable(msg.sender) {
        wrapped = WrappedTestToken(_wrapped);
    }

    /// @notice Dipanggil relayer/owner setelah melihat event Locked di source.
    /// @dev Satu `nonce` hanya boleh dipakai sekali.
    function mintFromSource(
        address to,
        uint256 amount,
        uint256 nonce
    ) external onlyOwner {
        require(!processedNonces[nonce], "Nonce already processed");
        processedNonces[nonce] = true;

        wrapped.mint(to, amount);

        emit MintFromSource(to, amount, nonce);
        // Catatan: untuk arah LockToMint kita sudah punya hash di SourceBridge.lock().
        // Di sini kita tidak perlu re-hash lagi di v0.2.
    }

    /// @notice User di target chain membakar wATT untuk kembali ke source chain.
    /// @dev Emit BurnToSource + hash canonical AegisMessage (BurnToUnlock).
    function burnToSource(uint256 amount, address to) external {
        require(amount > 0, "Amount must be > 0");
        require(to != address(0), "Target recipient cannot be zero");

        burnNonce++;

        // ✅ Kembali ke pola lama: panggil burn() di WrappedTestToken
        wrapped.burn(msg.sender, amount);

        emit BurnToSource(msg.sender, to, amount, burnNonce);

        // === AegisMessage canonical hash (BurnToUnlock) ===
        AegisMessage.Message memory m = AegisMessage.Message({
            srcChainId: uint64(block.chainid),
            dstChainId: 0,              // TODO: isi 11155111 (Sepolia) di versi berikutnya
            srcBridge: address(this),
            dstBridge: address(0),      // TODO: isi alamat SourceBridge kalau mau full
            token: address(wrapped),
            // Konsisten dengan SourceBridge.lock (user = penerima di chain tujuan),
            // di sini kita pakai 'to' (penerima di source) sebagai user canonical.
            user: to,
            amount: amount,
            nonce: burnNonce,
            direction: AegisMessage.Direction.BurnToUnlock,
            timestamp: uint64(block.timestamp)
        });

        bytes32 msgHash = m.hash();
        emit MessageHashEmitted(
            msgHash,
            AegisMessage.Direction.BurnToUnlock,
            burnNonce
        );
    }
}
