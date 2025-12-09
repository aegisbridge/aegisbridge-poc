// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WrappedTestToken (wATT)
/// @notice Token wrapped untuk AegisBridge di chain target.
///         Mint/burn hanya boleh lewat bridge yang terdaftar.
contract WrappedTestToken is ERC20, Ownable {
    address public bridge;

    event BridgeUpdated(address indexed oldBridge, address indexed newBridge);

    modifier onlyBridge() {
        require(msg.sender == bridge, "Only bridge");
        _;
    }

    constructor() ERC20("AegisBridge Wrapped Test Token", "wATT") Ownable(msg.sender) {
        // Tidak perlu mint di constructor; mint dilakukan via bridge.
    }

    /// @notice Set alamat bridge yang diizinkan untuk mint/burn.
    function setBridge(address _bridge) external onlyOwner {
        require(_bridge != address(0), "Bridge cannot be zero");
        address old = bridge;
        bridge = _bridge;
        emit BridgeUpdated(old, _bridge);
    }

    /// @notice Mint token ke `to`, hanya bisa oleh bridge.
    function mintTo(address to, uint256 amount) external onlyBridge {
        _mint(to, amount);
    }

    /// @notice Burn token dari wallet `from`, hanya bisa oleh bridge.
    function burnFromBridge(address from, uint256 amount) external onlyBridge {
        _burn(from, amount);
    }
}
