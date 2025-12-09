# AegisBridge – Testnet v0.3.1

_AegisBridge_ is a prototype cross-chain bridge focused on **security** and **observability**.  
This version runs on **testnet** networks:

- Ethereum **Sepolia**
- Polygon **Amoy**

An off-chain relayer watches events on the source chain and executes actions on the target chain (mint/burn/release).

---

## ✨ Version v0.3.1 Status

Current progress:

- ✅ Bridge & test token contracts deployed on Sepolia & Amoy  
- ✅ Relayer script: `scripts/testnet_relayer.js`
- ✅ Relayer can:
  - Read configuration from `.env`
  - Connect to Sepolia & Amoy via Alchemy RPC
  - Print deployer/relayer address and basic logs

Example output when running:

```text
[dotenv@17.2.3] injecting env (9) from .env -- tip: ⚙️  suppress all logs with { quiet: true }
[2025-12-09T08:20:34.605Z] === AegisBridge v0.3.1 Testnet Relayer ===
[2025-12-09T08:20:34.608Z] Sepolia RPC : https://eth-sepolia.g.alchemy.com/v2/...
[2025-12-09T08:20:34.610Z] Amoy RPC    : https://polygon-amoy.g.alchemy.com/v2/...
[2025-12-09T08:20:34.610Z] Deployer/Relayer address: 0x36...
```

---

## 📂 Project Structure (overview)

Your actual structure might differ, but typically looks like:

```bash
aegisbridge/
├─ contracts/
│  ├─ AegisBridge.sol
│  └─ TestToken.sol
├─ scripts/
│  ├─ deploy_sepolia.js
│  ├─ deploy_amoy.js
│  ├─ sepolia_lock_and_mint.js
│  ├─ amoy_burn_and_release.js
│  └─ testnet_relayer.js
├─ .env
├─ hardhat.config.js
├─ package.json
├─ .gitignore
└─ README.md
```

---

## 🛠 Requirements

- Node.js **>= 18**
- NPM or Yarn
- Alchemy account or another RPC provider for:
  - Sepolia
  - Polygon Amoy
- Wallet private key for deployer/relayer (with enough testnet funds on both networks)

---

## ⚙️ Project Setup

Open your project folder:

```bash
cd aegisbridge
```

Install dependencies:

```bash
npm install
# or
yarn install
```

---

## 🔐 `.env` Configuration

Create a `.env` file in the project root (do **not** commit this file).  
Example content (adjust to your own values):

```env
# RPC endpoints
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/XXXX"
AMOY_RPC_URL="https://polygon-amoy.g.alchemy.com/v2/XXXX"

# Deployer/relayer private key (no spaces)
DEPLOYER_PRIVATE_KEY="0x...."

# Bridge & token contract addresses on each chain
BRIDGE_CONTRACT_SEPOLIA="0x..."
BRIDGE_CONTRACT_AMOY="0x..."
TEST_TOKEN_SEPOLIA="0x..."
TEST_TOKEN_AMOY="0x..."

# Additional settings (if used in your scripts)
RELAYER_POLL_INTERVAL_MS=5000
NETWORK_ENV="testnet"
```

> **Notes:**  
> - Never commit `.env` to Git.  
> - Make sure `.env` is listed in `.gitignore`.

---

## 🚀 Running the Testnet Relayer

Once `.env` is configured correctly, run:

```bash
node scripts/testnet_relayer.js
```

If everything is set up properly, you should see:

- The `AegisBridge v0.3.1 Testnet Relayer` banner
- Sepolia & Amoy RPC URLs
- The deployer/relayer address in use
- Additional logs as the relayer watches events (to be expanded in future versions)

Keep this process running in your terminal as long as you want the bridge to be active.

---

## 📦 (Optional) Deploying Contracts Again

If you need to redeploy contracts to testnets (script names may differ for your repo), you can use:

### Deploy to Sepolia

```bash
npx hardhat run scripts/deploy_sepolia.js --network sepolia
```

- Copy the new bridge & token contract addresses
- Update them in `.env`

### Deploy to Amoy

```bash
npx hardhat run scripts/deploy_amoy.js --network amoy
```

- Copy the new bridge & token contract addresses
- Update `.env` accordingly

---

## 🧭 Dev Roadmap (short)

Planned work from this version:

- [ ] Add logic to read lock/burn events on the source chain
- [ ] Execute mint/release on the target chain
- [ ] Add nonce/idempotency to prevent double execution by the relayer
- [ ] Add min/max amount limits per bridge
- [ ] Integrate Base as the future home chain for the AegisBridge token

---

## ⚠️ Disclaimer

This is a **TESTNET PROTOTYPE** for research & development purposes only.  
Do not use it with real/mainnet funds before:

- Code is reviewed
- Contracts are audited
- Security architecture is properly validated

---

## 📜 License

Default license: **MIT** (you can change it later if needed).
