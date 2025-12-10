// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AegisBridge Source (Sepolia)
/// @notice Menjaga ATT yang di-lock saat bridging ke Amoy,
///         dan me–release kembali ATT saat ada return dari Amoy.
contract SourceBridge is Ownable {
    /// @notice Token canonical di Sepolia (ATT)
    IERC20 public immutable attToken;

    /// @notice Relayer yang diizinkan memproses mint/release
    address public relayer;

    /// @notice Nonce forward untuk arah Sepolia -> Amoy (lock)
    uint256 public currentNonce;

    /// @notice Nonce reverse (Amoy -> Sepolia) yang sudah diproses
    ///         untuk mencegah double-release
    mapping(uint256 => bool) public processedReturnNonces;

    /// @dev Event saat user mengunci ATT di Sepolia
    event Locked(address indexed user, uint256 amount, uint256 indexed nonce);

    /// @dev Event saat ATT dilepas kembali ke user dari pool bridge (reverse)
    event ReleasedFromTarget(
        address indexed user,
        uint256 amount,
        uint256 indexed nonce
    );

    /// @dev Event saat relayer diganti
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "AegisBridge: caller is not relayer");
        _;
    }

    /// @param _attToken alamat token ATT di Sepolia
    /// @param _relayer alamat relayer awal (biasanya deployer / EOA khusus)
    constructor(address _attToken, address _relayer)
        Ownable(msg.sender)     // ⬅️ penting: set owner untuk Ownable v5
    {
        require(_attToken != address(0), "AegisBridge: attToken = zero");
        require(_relayer != address(0), "AegisBridge: relayer = zero");

        attToken = IERC20(_attToken);
        relayer = _relayer;
    }

    /// @notice Ganti relayer yang diizinkan memanggil fungsi relayer-only
    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "AegisBridge: relayer = zero");
        address old = relayer;
        relayer = _relayer;
        emit RelayerUpdated(old, _relayer);
    }

    /// @notice User mengunci ATT di Sepolia untuk di–bridge ke Amoy.
    /// @dev User harus sudah `approve` ATT ke kontrak ini sebelum memanggil.
    /// @param amount jumlah ATT (dalam satuan token, bukan wei mentah)
    /// @return nonce nilai nonce terbaru sesudah lock
    function lock(uint256 amount) external returns (uint256 nonce) {
        require(amount > 0, "AegisBridge: amount = 0");

        // Tarik ATT dari user ke kontrak bridge
        bool ok = attToken.transferFrom(msg.sender, address(this), amount);
        require(ok, "AegisBridge: transferFrom failed");

        // Update nonce dan emit event
        nonce = ++currentNonce;

        emit Locked(msg.sender, amount, nonce);
    }

    /// @notice Relayer me–release ATT ke user berdasarkan request dari Amoy.
    /// @dev Hanya bisa dipanggil relayer, menggunakan data dari event ReturnRequested di Amoy.
    /// @param to penerima di Sepolia (biasanya address yang sama dengan di Amoy)
    /// @param amount jumlah ATT yang akan dikembalikan
    /// @param nonce return nonce dari Amoy (currentReturnNonce)
    function releaseFromTarget(
        address to,
        uint256 amount,
        uint256 nonce
    ) external onlyRelayer {
        require(to != address(0), "AegisBridge: invalid recipient");
        require(amount > 0, "AegisBridge: amount = 0");
        require(
            !processedReturnNonces[nonce],
            "AegisBridge: return nonce already processed"
        );

        processedReturnNonces[nonce] = true;

        bool ok = attToken.transfer(to, amount);
        require(ok, "AegisBridge: transfer failed");

        emit ReleasedFromTarget(to, amount, nonce);
    }

    /// @notice Helper untuk melihat saldo ATT yang sedang "terkunci" di bridge.
    function lockedLiquidity() external view returns (uint256) {
        return attToken.balanceOf(address(this));
    }
}
