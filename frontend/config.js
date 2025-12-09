// frontend/config.js
// AegisBridge frontend config for Sepolia ⇄ Polygon Amoy (testnet)

const AEGIS_CONFIG = {
  // ATT & wATT use 18 decimals (OZ ERC20 default)
  tokenDecimals: 18,

  sepolia: {
    // Ethereum Sepolia
    chainIdHex: "0xAA36A7", // 11155111
    chainIdDec: 11155111,
    name: "Ethereum Sepolia",

    // Pakai public RPC yang nggak butuh API key
    // (Metamask akan pakai ini kalau kita tambah network)
    rpcUrls: ["https://rpc.sepolia.org"],

    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "SEP",
      decimals: 18,
    },

    // Dari deployments/testnet_sepolia_amoy.json
    // "ATT":          "0xDc925c125DC7b51946031761c1693eA6238Bf3fb"
    // "SourceBridge": "0x4Fb169EDA4C92de96634595d36571637CFbb4437"
    bridgeAddress: "0x4Fb169EDA4C92de96634595d36571637CFbb4437",
    tokenAddress: "0xDc925c125DC7b51946031761c1693eA6238Bf3fb",

    // Nama fungsi di SourceBridge.sol
    // function lock(uint256 amount, address recipient)
    lockMethod: "lock",
  },

  amoy: {
    // Polygon Amoy
    chainIdHex: "0x13882", // 80002
    chainIdDec: 80002,
    name: "Polygon Amoy",

    // RPC resmi Polygon Amoy
    rpcUrls: ["https://rpc-amoy.polygon.technology"],

    nativeCurrency: {
      name: "Amoy MATIC",
      symbol: "MATIC",
      decimals: 18,
    },

    // Dari deployments/testnet_sepolia_amoy.json
    // "wATT":         "0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4"
    // "TargetBridge": "0xA9E3bf15148EA340e76B851483486ca546eD8018"
    bridgeAddress: "0xA9E3bf15148EA340e76B851483486ca546eD8018",
    tokenAddress: "0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4",

    // Nama fungsi di TargetBridge.sol:
    // function burnToSource(uint256 amount, address targetUser)
    burnMethod: "burnToSource",
  },
};
