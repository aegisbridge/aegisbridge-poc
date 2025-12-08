// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SourceBridge is Ownable {
    IERC20 public immutable token;
    uint256 public nonce;
    mapping(uint256 => bool) public processedBurnNonces;

    event Locked(address indexed from, address indexed to, uint256 amount, uint256 nonce);
    event UnlockedFromTarget(address indexed to, uint256 amount, uint256 burnNonce);

    constructor(address _token) Ownable(msg.sender) {
        token = IERC20(_token);
    }

    function lock(uint256 amount, address to) external {
        nonce++;
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Locked(msg.sender, to, amount, nonce);
    }

    function unlockFromTarget(address to, uint256 amount, uint256 burnNonce) external onlyOwner {
        require(!processedBurnNonces[burnNonce], "Burn nonce already processed");
        processedBurnNonces[burnNonce] = true;
        require(token.transfer(to, amount), "transfer failed");
        emit UnlockedFromTarget(to, amount, burnNonce);
    }
}
