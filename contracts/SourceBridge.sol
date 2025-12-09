// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./AegisMessage.sol";

/// @title SourceBridge
/// @notice Bridge di sisi chain asal (contoh: Sepolia):
///         - lock token ketika user mau pindah ke chain tujuan
///         - unlock token ketika ada burn di chain tujuan.
contract SourceBridge is Ownable, Pausable {
    using AegisMessage for AegisMessage.Message;

    /// @notice Token asli (ATT) di source chain.
    IERC20 public immutable token;

    /// @notice Nonce unik untuk setiap lock di source.
    uint256 public nonce;

    /// @notice Burn nonce dari chain tujuan yang sudah diproses → cegah replay unlock.
    mapping(uint256 => bool) public processedBurnNonces;

    /// @notice (Opsional) konfigurasi remote bridge (tujuan).
    ///         Tidak wajib di-set untuk PoC; default 0 berarti belum dikonfigurasi.
    uint64 public dstChainId;
    address public dstBridge;
    address public dstToken; // token representasi di chain tujuan (mis. wATT)

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

    /// Emitted ketika message hash canonical AegisBridge terbentuk.
    /// Digunakan untuk future PQC-aware relayers.
    event MessageHashEmitted(
        bytes32 indexed msgHash,
        AegisMessage.Direction direction,
        uint256 indexed nonce
    );

    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "Token address cannot be zero");
        token = IERC20(_token);
    }

    // ============ Admin (owner) ============

    /// @notice Set konfigurasi remote (tujuan) untuk message model.
    /// @dev Opsional, hanya dipakai untuk AegisMessage hash (tidak mempengaruhi logika lock/unlock).
    function setDestination(
        uint64 _dstChainId,
        address _dstBridge,
        address _dstToken
    ) external onlyOwner {
        dstChainId = _dstChainId;
        dstBridge = _dstBridge;
        dstToken = _dstToken;
    }

    /// @notice Pause seluruh operasi state-changing (lock + unlockFromTarget).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause seluruh operasi state-changing.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Core bridge logic ============

    /// @notice User mengunci token di sisi asal.
    /// @dev Event `Locked` ini yang akan dibaca relayer.
    function lock(uint256 amount, address recipient) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(recipient != address(0), "Recipient cannot be zero");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "Token transfer failed");

        nonce += 1;

        emit Locked(msg.sender, recipient, amount, nonce);

        // Bentuk canonical Aegis message + hash (LockToMint)
        AegisMessage.Message memory m = AegisMessage.Message({
            srcChainId: uint64(block.chainid),
            dstChainId: dstChainId, // boleh 0 jika belum dikonfigurasi
            srcBridge: address(this),
            dstBridge: dstBridge,
            token: address(token),
            user: recipient, // penerima di chain tujuan
            amount: amount,
            nonce: nonce,
            direction: AegisMessage.Direction.LockToMint,
            timestamp: uint64(block.timestamp)
        });

        bytes32 msgHash = m.hash();
        emit MessageHashEmitted(
            msgHash,
            AegisMessage.Direction.LockToMint,
            nonce
        );
    }

    /// @notice Dipanggil relayer/owner setelah melihat event BurnToSource di chain tujuan.
    /// @dev Satu `burnNonce` hanya boleh dipakai sekali.
    function unlockFromTarget(
        address recipient,
        uint256 amount,
        uint256 burnNonce
    ) external onlyOwner whenNotPaused {
        require(recipient != address(0), "Recipient cannot be zero");
        require(amount > 0, "Amount must be > 0");
        require(
            !processedBurnNonces[burnNonce],
            "Burn nonce already processed"
        );

        processedBurnNonces[burnNonce] = true;

        bool ok = token.transfer(recipient, amount);
        require(ok, "Token transfer failed");

        emit UnlockedFromTarget(recipient, amount, burnNonce);

        // (Opsional) bisa juga bentuk AegisMessage di sini untuk BurnToUnlock,
        // tetapi di desain v0.2, canonical hash utama untuk arah ini
        // diekspose dari sisi target (TargetBridge.burnToSource).
    }
}
