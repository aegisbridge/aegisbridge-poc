// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SourceBridge
/// @notice Bridge di sisi chain asal:
///         - lock token ketika user mau pindah ke chain tujuan
///         - unlock token ketika ada burn di chain tujuan.
contract SourceBridge is Ownable {
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

    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "Token address cannot be zero");
        token = IERC20(_token);
    }

    /// @notice User mengunci token di sisi asal.
    /// @dev Event `Locked` ini yang akan dibaca relayer.
    function lock(uint256 amount, address recipient) external {
        require(amount > 0, "Amount must be > 0");
        require(recipient != address(0), "Recipient cannot be zero");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "Token transfer failed");

        nonce += 1;
        emit Locked(msg.sender, recipient, amount, nonce);
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
    }
}
