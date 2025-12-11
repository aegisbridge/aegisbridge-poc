// scripts/providers.js
// Helper provider multi-RPC (FallbackProvider) untuk Sepolia & Amoy

require("dotenv").config();
const { JsonRpcProvider, FallbackProvider } = require("ethers");

/**
 * Build FallbackProvider dari list URL.
 * - Kalau cuma 1 URL: langsung pakai JsonRpcProvider.
 * - Kalau >1 URL: pakai FallbackProvider dengan prioritas berurutan.
 */
function buildFallbackProvider(name, urls) {
  const cleaned = urls
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => u.length > 0);

  if (cleaned.length === 0) {
    throw new Error(`No RPC URL configured for ${name}. Cek .env (${name}_RPC_URL dll).`);
  }

  if (cleaned.length === 1) {
    // Single RPC, simple provider
    return new JsonRpcProvider(cleaned[0]);
  }

  // Multi RPC → FallbackProvider dengan prioritas
  const providerConfigs = cleaned.map((url, index) => ({
    provider: new JsonRpcProvider(url),
    priority: index + 1,          // URL pertama = prioritas tertinggi
    weight: 1,
    stallTimeout: 1000 * (index + 1), // tiap provider punya stall timeout beda
  }));

  return new FallbackProvider(providerConfigs);
}

function getSepoliaProvider() {
  const urls = [
    process.env.SEPOLIA_RPC_URL,
    process.env.SEPOLIA_RPC_URL_1,
    process.env.SEPOLIA_RPC_URL_2,
    process.env.SEPOLIA_RPC_URL_3,
  ];
  return buildFallbackProvider("SEPOLIA", urls);
}

function getAmoyProvider() {
  const urls = [
    process.env.AMOY_RPC_URL,
    process.env.AMOY_RPC_URL_1,
    process.env.AMOY_RPC_URL_2,
    process.env.AMOY_RPC_URL_3,
  ];
  return buildFallbackProvider("AMOY", urls);
}

module.exports = {
  getSepoliaProvider,
  getAmoyProvider,
};
