// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./WrappedTestToken.sol";
import "./AegisMessage.sol";

/// @title TargetBridge
/// @notice Bridge di sisi chain tujuan (contoh: Polygon Amoy).
///         - mint wATT ketika ada lock di source
///         - burn wATT ketika user mau kembali ke source.
contract TargetBridge is Ownable, Pausable {
    using AegisMessage for AegisMessage.Message;

    /// @notice Token wrapped (wATT) di target chain.
    WrappedTestToken public immutable wrapped;

    /// @notice Nonce lock dari source yang sudah diproses → cegah replay mint.
    mapping(uint256 => bool) public processedNonces;

    /// @notice Nonce untuk setiap burn di target (dipakai di source untuk unlock).
    uint256 public burnNonce;

    /// (Opsional) konfigurasi remote (source) untuk message model.
    uint64 public dstChainId;
    address public dstBridge;
    address public dstToken; // token asli di source (mis. ATT di Sepolia)

    /// Emitted ketika mint dilakukan berdasarkan lock di source.
    event MintedFromSource(
        address indexed user,
        uint256 amount,
        uint256 indexed nonce
    );

    /// Emitted ketika user membakar wATT untuk kembali ke source.
    event BurnToSource(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 indexed burnNonce
    );

    /// Emitted ketika canonical Aegis message hash terbentuk (BurnToUnlock).
    event MessageHashEmitted(
        bytes32 indexed msgHash,
        AegisMessage.Direction direction,
        uint256 indexed nonce
    );

    constructor(address _wrapped) Ownable(msg.sender) {
        require(
            _wrapped != address(0),
            "Wrapped token address cannot be zero"
        );
        wrapped = WrappedTestToken(_wrapped);
    }

    // ============ Admin (owner) ============

    /// @notice Set konfigurasi remote (source) untuk message model.
    /// @dev Opsional, hanya dipakai untuk AegisMessage hash.
    function setRemote(
        uint64 _dstChainId,
        address _dstBridge,
        address _dstToken
    ) external onlyOwner {
        dstChainId = _dstChainId;
        dstBridge = _dstBridge;
        dstToken = _dstToken;
    }

    /// @notice Pause operasi state-changing (mint + burn).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause operasi state-changing.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Core bridge logic ============

    /// @notice Dipanggil oleh relayer/owner setelah melihat event Locked di source.
    /// @dev Satu `nonce` hanya boleh dipakai sekali di TargetBridge.
    function mintFromSource(
        address user,
        uint256 amount,
        uint256 nonce
    ) external onlyOwner whenNotPaused {
        require(user != address(0), "User cannot be zero");
        require(amount > 0, "Amount must be > 0");
        require(!processedNonces[nonce], "Nonce already processed");

        processedNonces[nonce] = true;

        // Mint wATT ke user. Hanya TargetBridge yang boleh mint di WrappedTestToken.
        wrapped.mintTo(user, amount);

        emit MintedFromSource(user, amount, nonce);

        // (Opsional) kalau mau, di sini juga bisa bentuk AegisMessage untuk LockToMint,
        // tapi biasanya sisi source sudah cukup untuk canonical hash-nya.
    }

    /// @notice Dipanggil user di target chain ketika ingin kembali ke source.
    /// @dev Membakar wATT dari user dan emmit event BurnToSource.
    function burnToSource(uint256 amount, address targetUser)
        external
        whenNotPaused
    {
        require(targetUser != address(0), "Target user cannot be zero");
        require(amount > 0, "Amount must be > 0");

        // Burn wATT dari wallet caller (msg.sender).
        // WrappedTestToken membatasi pemanggil ke bridge (TargetBridge),
        // sehingga pattern-nya:
        // - user approve TargetBridge
        // - TargetBridge memanggil burnFromBridge(from, amount)
        wrapped.burnFromBridge(msg.sender, amount);

        burnNonce += 1;

        emit BurnToSource(msg.sender, targetUser, amount, burnNonce);

        // Bentuk canonical Aegis message + hash (BurnToUnlock)
        AegisMessage.Message memory m = AegisMessage.Message({
            srcChainId: uint64(block.chainid),
            dstChainId: dstChainId, // boleh 0 kalau belum dikonfigurasi
            srcBridge: address(this),
            dstBridge: dstBridge,
            token: address(wrapped),
            user: targetUser, // penerima di source chain
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
