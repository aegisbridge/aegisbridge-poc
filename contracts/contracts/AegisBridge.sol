// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AegisBridge (versi latihan, 1-chain)
/// @notice Tahap awal: belajar konsep lock & unlock di satu chain.
/// Nanti kita kembangin jadi 2 chain + relayer.
contract AegisBridge is Ownable {
    IERC20 public immutable token;  // token yang di-bridge
    uint256 public nonce;           // counter unik tiap transfer

    event Locked(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        string targetChain,
        uint256 indexed nonce
    );

    event Unlocked(
        address indexed recipient,
        uint256 amount,
        uint256 indexed nonce
    );

    /// @param _token alamat token ERC20 yang akan di-bridge
    /// @dev Perhatikan: kita panggil constructor Ownable(msg.sender)
    ///      supaya deployer jadi owner kontrak bridge.
    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "Token address cannot be zero");
        token = IERC20(_token);
    }

    /// @notice User mengunci token di bridge.
    /// @dev Sebelum panggil ini, user harus approve dulu ke kontrak bridge.
    function lockTokens(
        uint256 amount,
        string calldata targetChain,  // contoh: "polygon-amoy"
        address recipient
    ) external {
        require(amount > 0, "Amount must be > 0");
        require(recipient != address(0), "Recipient cannot be zero");

        // Transfer token dari user ke kontrak bridge
        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "Token transfer failed");

        // Tambah nonce untuk id transfer unik
        nonce += 1;

        emit Locked(msg.sender, recipient, amount, targetChain, nonce);
    }

    /// @notice Owner (sementara kita anggap "relayer/admin") mengembalikan token ke user.
    /// @dev Nanti ini diganti sama mekanisme verifikasi dari chain lain.
    function unlockTokens(
        address recipient,
        uint256 amount,
        uint256 _nonce
    ) external onlyOwner {
        require(recipient != address(0), "Recipient cannot be zero");
        require(amount > 0, "Amount must be > 0");

        bool ok = token.transfer(recipient, amount);
        require(ok, "Token transfer failed");

        emit Unlocked(recipient, amount, _nonce);
    }
}
