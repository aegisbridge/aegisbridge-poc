// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WrappedTestToken (wATT)
/// @notice Representasi wrapped dari ATT di chain tujuan.
///         Mint & burn hanya boleh dilakukan oleh bridge.
contract WrappedTestToken is ERC20, Ownable {
    address public bridge;

    constructor()
        ERC20("Wrapped Aegis Test Token", "wATT")
        Ownable(msg.sender)
    {}

    function setBridge(address _bridge) external onlyOwner {
        require(bridge == address(0), "Bridge already set");
        require(_bridge != address(0), "Bridge cannot be zero");
        bridge = _bridge;
    }

    modifier onlyBridge() {
        require(msg.sender == bridge, "Only bridge can mint/burn");
        _;
    }

    function mint(address to, uint256 amount) external onlyBridge {
        _mint(to, amount);
    }

    /// @notice Dipanggil bridge untuk membakar wATT dari `from`.
    function burn(address from, uint256 amount) external onlyBridge {
        _burn(from, amount);
    }
}
