// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./WrappedTestToken.sol";

/// @title TargetBridge
/// @notice Bridge di sisi chain tujuan: mint wATT berdasarkan bukti dari source.
contract TargetBridge is Ownable {
    WrappedTestToken public immutable wrappedToken;
    mapping(uint256 => bool) public processedNonces;

    event Minted(
        address indexed recipient,
        uint256 amount,
        uint256 indexed nonce
    );

    constructor(address _wrappedToken) Ownable(msg.sender) {
        require(_wrappedToken != address(0), "Token address cannot be zero");
        wrappedToken = WrappedTestToken(_wrappedToken);
    }

    /// @notice Dipanggil oleh relayer/owner setelah ada lock di SourceBridge.
    /// @dev Di versi simple ini belum ada verifikasi cryptographic proof, baru nonce guard.
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
}
