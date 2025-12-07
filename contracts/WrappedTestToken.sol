// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WrappedTestToken (wATT)
/// @notice Representasi wrapped dari ATT di chain tujuan.
/// Mint hanya boleh dilakukan oleh bridge tujuan.
contract WrappedTestToken is ERC20, Ownable {
    address public bridge;

    constructor() ERC20("Wrapped Aegis Test Token", "wATT") Ownable(msg.sender) {}

    function setBridge(address _bridge) external onlyOwner {
        require(bridge == address(0), "Bridge already set");
        require(_bridge != address(0), "Bridge cannot be zero");
        bridge = _bridge;
    }

    modifier onlyBridge() {
        require(msg.sender == bridge, "Only bridge can mint");
        _;
    }

    function mint(address to, uint256 amount) external onlyBridge {
        _mint(to, amount);
    }
}
