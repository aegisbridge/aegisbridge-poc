// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WrappedTestToken is ERC20, Ownable {
    address public bridge;

    modifier onlyBridge() {
        require(msg.sender == bridge, "Only bridge");
        _;
    }

    constructor() ERC20("Aegis Wrapped Test Token", "wATT") Ownable(msg.sender) {}

    function setBridge(address _bridge) external onlyOwner {
        bridge = _bridge;
    }

    function mint(address to, uint256 amount) external onlyBridge {
        _mint(to, amount);
    }

    function burnFromBridge(address from, uint256 amount) external onlyBridge {
        _burn(from, amount);
    }
}
