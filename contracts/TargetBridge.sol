// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./WrappedTestToken.sol";

contract TargetBridge is Ownable {
    WrappedTestToken public immutable wrapped;
    mapping(uint256 => bool) public processedNonces;
    uint256 public burnNonce;

    event MintFromSource(address indexed to, uint256 amount, uint256 nonce);
    event BurnToSource(address indexed from, address indexed to, uint256 amount, uint256 nonce);

    constructor(address _wrapped) Ownable(msg.sender) {
        wrapped = WrappedTestToken(_wrapped);
    }

    function mintFromSource(address to, uint256 amount, uint256 nonce) external onlyOwner {
        require(!processedNonces[nonce], "Nonce already processed");
        processedNonces[nonce] = true;
        wrapped.mint(to, amount);
        emit MintFromSource(to, amount, nonce);
    }

    function burnToSource(uint256 amount, address to) external {
        burnNonce++;
        wrapped.burnFromBridge(msg.sender, amount);
        emit BurnToSource(msg.sender, to, amount, burnNonce);
    }
}
