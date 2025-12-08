// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./WrappedTestToken.sol";

/// @title TargetBridge
/// @notice Bridge di sisi chain tujuan:
///         - mint wATT berdasarkan lock di source
///         - burn wATT untuk klaim balik ATT di source.
contract TargetBridge is Ownable {
    WrappedTestToken public immutable wrappedToken;

    // Nonce lock dari chain asal yang sudah diproses → cegah double-mint.
    mapping(uint256 => bool) public processedNonces;

    // Counter burn di chain tujuan → dipakai sebagai id unik untuk unlock di source.
    uint256 public burnNonce;

    event Minted(
        address indexed recipient,
        uint256 amount,
        uint256 indexed nonce
    );

    event BurnToSource(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 indexed burnNonce
    );

    constructor(address _wrappedToken) Ownable(msg.sender) {
        require(_wrappedToken != address(0), "Token address cannot be zero");
        wrappedToken = WrappedTestToken(_wrappedToken);
    }

    /// @notice Dipanggil oleh relayer/owner setelah ada lock di SourceBridge.
    /// @dev Di versi simple ini belum ada verifikasi cryptographic proof, hanya nonce guard.
    function mintFromSource(
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external onlyOwner {
        require(recipient != address(0), "Recipient cannot be zero");
        require(amount > 0, "Amount must be > 0");
        require(!processedNonces[nonce], "Nonce already processed");

        processedNonces[nonce] = true;
        wrappedToken.mint(recipient, amount);

        emit Minted(recipient, amount, nonce);
    }

    /// @notice User membakar wATT di chain tujuan untuk klaim balik ATT di chain asal.
    /// @param amount   Jumlah wATT yang dibakar.
    /// @param recipient Alamat yang akan menerima ATT di source chain.
    function burnToSource(uint256 amount, address recipient) external {
        require(amount > 0, "Amount must be > 0");
        require(recipient != address(0), "Recipient cannot be zero");

        burnNonce += 1;

        // Burn wATT dari wallet pemanggil (user).
        wrappedToken.burn(msg.sender, amount);

        emit BurnToSource(msg.sender, recipient, amount, burnNonce);
    }
}
