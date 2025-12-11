// scripts/helpers/multiRpc.js
// Helper multi-RPC sederhana untuk Sepolia & Amoy

require("dotenv").config();
const { ethers } = require("ethers");

/**
 * Pilih RPC pertama yang tidak kosong dari list, log ke console,
 * dan balikin JsonRpcProvider.
 */
function createMultiRpcProvider(name, urls) {
  const list = urls
    .filter((u) => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (list.length === 0) {
    throw new Error(`[multiRpc] Tidak ada RPC URL untuk ${name} di .env`);
  }

  const url = list[0];
  console.log(`[multiRpc] Using ${name} RPC: ${url}`);
  return new ethers.JsonRpcProvider(url);
}

/**
 * Provider Sepolia dengan fallback dari:
 * SEPOLIA_RPC_URL, SEPOLIA_RPC_URL_1, _2, _3
 */
function getSepoliaProvider() {
  return createMultiRpcProvider("sepolia", [
    process.env.SEPOLIA_RPC_URL,
    process.env.SEPOLIA_RPC_URL_1,
    process.env.SEPOLIA_RPC_URL_2,
    process.env.SEPOLIA_RPC_URL_3,
  ]);
}

/**
 * Provider Amoy dengan fallback dari:
 * AMOY_RPC_URL, AMOY_RPC_URL_1, _2, _3
 */
function getAmoyProvider() {
  return createMultiRpcProvider("amoy", [
    process.env.AMOY_RPC_URL,
    process.env.AMOY_RPC_URL_1,
    process.env.AMOY_RPC_URL_2,
    process.env.AMOY_RPC_URL_3,
  ]);
}

// Export beberapa nama sekaligus biar kompatibel dengan semua script
module.exports = {
  createMultiRpcProvider,
  getSepoliaProvider,
  getAmoyProvider,

  // alias, kalau ada script lama yang pakai nama ini
  getSepoliaProviderWithFallback: getSepoliaProvider,
  getAmoyProviderWithFallback: getAmoyProvider,
};
