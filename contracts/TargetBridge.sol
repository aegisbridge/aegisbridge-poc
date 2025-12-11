// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TargetBridge is Ownable, ReentrancyGuard {
    IERC20 public immutable wrappedToken; // wATT di Amoy
    address public relayer;

    // Forward direction: Sepolia -> Amoy
    mapping(uint256 => bool) public processedNonces;

    // Reverse direction: Amoy -> Sepolia
    mapping(uint256 => bool) public processedReturnNonces;
    uint256 public currentReturnNonce;

    /// Emitted when relayer mengirim wATT ke user (bridge dari Sepolia)
    event MintFromSource(address indexed user, uint256 amount, uint256 nonce);

    /// Emitted ketika user minta return (Amoy -> Sepolia)
    event ReturnRequested(address indexed user, uint256 amount, uint256 returnNonce);

    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event PoolWithdrawn(address indexed to, uint256 amount);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "TargetBridge: not relayer");
        _;
    }

    constructor(
        address _wrappedToken,
        address _relayer,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_wrappedToken != address(0), "TargetBridge: wrappedToken=0");
        require(_relayer != address(0), "TargetBridge: relayer=0");

        wrappedToken = IERC20(_wrappedToken);
        relayer = _relayer;
    }

    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "TargetBridge: relayer=0");
        emit RelayerUpdated(relayer, _relayer);
        relayer = _relayer;
    }

    /// Dipanggil relayer ketika ada event Locked di Sepolia
    /// NOTE: sekarang pakai token pool, bukan mint
    function mintFromSource(
        address to,
        uint256 amount,
        uint256 nonce
    ) external nonReentrant onlyRelayer {
        require(to != address(0), "TargetBridge: to=0");
        require(amount > 0, "TargetBridge: amount=0");
        require(!processedNonces[nonce], "TargetBridge: nonce already processed");

        processedNonces[nonce] = true;

        uint256 poolBal = wrappedToken.balanceOf(address(this));
        require(poolBal >= amount, "TargetBridge: insufficient wATT in pool");

        bool ok = wrappedToken.transfer(to, amount);
        require(ok, "TargetBridge: wATT transfer failed");

        emit MintFromSource(to, amount, nonce);
    }

    /// User kirim wATT ke bridge, dan nanti di-release ATT di Sepolia
    function requestReturnToSource(uint256 amount) external nonReentrant {
        require(amount > 0, "TargetBridge: amount=0");

        currentReturnNonce += 1;

        bool ok = wrappedToken.transferFrom(msg.sender, address(this), amount);
        require(ok, "TargetBridge: transferFrom failed");

        // Disimpan hanya kalau kamu mau pakai di masa depan
        processedReturnNonces[currentReturnNonce] = true;

        emit ReturnRequested(msg.sender, amount, currentReturnNonce);
    }

    /// View helper: saldo wATT yang dipegang bridge
    function poolBalance() external view returns (uint256) {
        return wrappedToken.balanceOf(address(this));
    }

    /// Owner bisa tarik wATT dari pool kalau butuh (misal reset testnet)
    function ownerWithdraw(uint256 amount, address to) external onlyOwner {
        require(to != address(0), "TargetBridge: to=0");
        bool ok = wrappedToken.transfer(to, amount);
        require(ok, "TargetBridge: withdraw failed");
        emit PoolWithdrawn(to, amount);
    }
}
