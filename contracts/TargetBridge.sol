// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Interface token wATT yang bisa di-mint dan di-burn.
///      Pastikan token wATT di Amoy mengimplementasikan fungsi ini.
interface IMintableBurnableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
    function burnFrom(address account, uint256 amount) external;
}

/// @title AegisBridge Target (Amoy)
/// @notice Mint wATT ketika ada lock di Sepolia,
///         dan burn wATT + emit event ketika user minta return ke Sepolia.
contract TargetBridge is Ownable {
    /// @notice Token wrapped di Amoy (wATT)
    IMintableBurnableERC20 public immutable wattToken;

    /// @notice Relayer yang diizinkan memproses mint dari Sepolia
    address public relayer;

    /// @notice Nonce-from-Source (Sepolia -> Amoy) yang sudah diproses
    ///         untuk mencegah double-mint
    mapping(uint256 => bool) public processedNonces;

    /// @notice Nonce untuk arah Amoy -> Sepolia (reverse bridge)
    uint256 public currentReturnNonce;

    /// @dev Event ketika relayer memproses mint dari Sepolia
    event MintedFromSource(
        address indexed to,
        uint256 amount,
        uint256 indexed nonce
    );

    /// @dev Event ketika user minta kirim balik ke Sepolia
    event ReturnRequested(
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

    /// @param _wattToken alamat wATT di Amoy
    /// @param _relayer alamat relayer awal (biasanya deployer / EOA khusus)
    constructor(address _wattToken, address _relayer)
        Ownable(msg.sender)     // ⬅️ penting: set owner untuk Ownable v5
    {
        require(_wattToken != address(0), "AegisBridge: wattToken = zero");
        require(_relayer != address(0), "AegisBridge: relayer = zero");

        wattToken = IMintableBurnableERC20(_wattToken);
        relayer = _relayer;
    }

    /// @notice Ganti relayer yang diizinkan memanggil mintFromSource
    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "AegisBridge: relayer = zero");
        address old = relayer;
        relayer = _relayer;
        emit RelayerUpdated(old, _relayer);
    }

    // -------------------------------------------------------------------------
    // FORWARD DIRECTION: Sepolia -> Amoy
    // -------------------------------------------------------------------------

    /// @notice Relayer memint wATT di Amoy berdasarkan lock di Sepolia.
    /// @dev Dipanggil menggunakan data dari event Locked di SourceBridge (Sepolia).
    /// @param to penerima wATT di Amoy
    /// @param amount jumlah wATT yang akan di-mint
    /// @param nonce nonce dari SourceBridge (currentNonce)
    function mintFromSource(
        address to,
        uint256 amount,
        uint256 nonce
    ) external onlyRelayer {
        require(to != address(0), "AegisBridge: invalid recipient");
        require(amount > 0, "AegisBridge: amount = 0");
        require(!processedNonces[nonce], "AegisBridge: nonce already processed");

        processedNonces[nonce] = true;

        // Mint wATT ke user. Pastikan wattToken mengizinkan kontrak ini untuk mint.
        wattToken.mint(to, amount);

        emit MintedFromSource(to, amount, nonce);
    }

    // -------------------------------------------------------------------------
    // REVERSE DIRECTION: Amoy -> Sepolia
    // -------------------------------------------------------------------------

    /// @notice User di Amoy minta kirim balik ke Sepolia.
    /// @dev User harus `approve` wATT ke kontrak bridge ini sebelum memanggil.
    ///      Kontrak akan memanggil `burnFrom(msg.sender, amount)` pada wATT.
    /// @param amount jumlah wATT yang akan di-burn dan direquest return-nya
    function requestReturnToSource(uint256 amount) external {
    require(amount > 0, "AegisBridge: amount = 0");

    // Ambil wATT dari user ke kontrak bridge (escrow).
    bool ok = wattToken.transferFrom(msg.sender, address(this), amount);
    require(ok, "AegisBridge: transferFrom failed");

    uint256 nonce = ++currentReturnNonce;

    emit ReturnRequested(msg.sender, amount, nonce);
}

    /// @notice Helper untuk mengecek apakah nonce forward sudah pernah dipakai.
    function isNonceProcessed(uint256 nonce) external view returns (bool) {
        return processedNonces[nonce];
    }
}
