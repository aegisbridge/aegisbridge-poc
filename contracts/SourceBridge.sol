// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SourceBridge
/// @notice Bridge di sisi chain asal: cuma lock token + emit event Locked.
contract SourceBridge is Ownable {
    IERC20 public immutable token;  // token asli (ATT)
    uint256 public nonce;           // id unik tiap lock

    event Locked(
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint256 indexed nonce
    );

    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "Token address cannot be zero");
        token = IERC20(_token);
    }

    /// @notice User mengunci token di sisi asal.
    /// @dev Nanti event Locked ini yang bakal dibaca relayer.
    function lock(uint256 amount, address recipient) external {
        require(amount > 0, "Amount must be > 0");
        require(recipient != address(0), "Recipient cannot be zero");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "Token transfer failed");

        nonce += 1;
        emit Locked(msg.sender, recipient, amount, nonce);
    }
}
