# AegisBridge PoC – Sepolia ↔ Amoy Testnet Bridge

AegisBridge is a proof-of-concept cross-chain bridge between:

- **Ethereum Sepolia** (source chain)
- **Polygon Amoy** (target chain)

The design is intentionally simple and opinionated:

- One **source token** on Sepolia (`ATT`)
- One **wrapped token** on Amoy (`wATT`)
- Two bridge contracts:
  - `SourceBridge` on Sepolia (lock / unlock)
  - `TargetBridge` on Amoy (mint / burn)
- One **off-chain relayer**:
  - Listens to events on both chains
  - Mints / unlocks on the opposite chain
  - Exposes a simple `/health` HTTP endpoint

This repo contains:

- Hardhat contracts + deployments
- A minimal **testnet dApp** (v0.4) in `/frontend`
- A **testnet relayer** (v0.4.2) in `/scripts/testnet_relayer.js`

---

## Current Testnet Deployment

> These are **testnet only**. Subject to redeploys.

### Sepolia

- **SourceBridge**: `0x4Fb169EDA4C92de96634595d36571637CFbb4437`
- **ATT (ERC-20)**: `0xDc925c125DC7b51946031761c1693eA6238Bf3fb`

### Amoy

- **TargetBridge**: `0xA9E3bf15148EA340e76B851483486ca546eD8018`
- **wATT (wrapped ATT)**: `0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4`

### Relayer / Deployer Address

- **Deployer / Relayer EOA**: `0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a`

---

## What’s New in This Update (v0.4 / v0.4.2)

This README describes the state after the **local testnet run** where we successfully bridged 10 ATT round-trip (Sepolia → Amoy → Sepolia).

### v0.4 – Testnet dApp (frontend)

- Simple single-page dApp in `/frontend`:
  - Wallet connection via MetaMask / EIP-1193 provider
  - **Two directions**:
    - `Sepolia → Amoy` (lock → mint)
    - `Amoy → Sepolia` (burn → unlock)
  - Amount parsing + raw `wei` conversion
  - Auto-`approve()` if allowance is too low
  - Structured logs in the UI panel (`// logs will appear here…`)
- Manual flows successfully tested:
  - `approve` ATT on Sepolia
  - `lock` ATT on Sepolia
  - `burnToSource` on Amoy

### v0.4.2 – Testnet Relayer

`/scripts/testnet_relayer.js`:

- Listens for events:

  - On **Sepolia / SourceBridge**:
    - `Locked(user, recipient, amount, nonce)`
  - On **Amoy / TargetBridge**:
    - `BurnToSource(from, to, amount, burnNonce)`

- Sends transactions:

  - On **Amoy / TargetBridge**:
    - `mintFromSource(recipient, amount, nonce)`
  - On **Sepolia / SourceBridge**:
    - `unlockFromTarget(recipient, amount, burnNonce)`

- Features:

  - Reads RPC & keys from `.env`
  - Uses **Hardhat artifacts** for ABIs with fallback paths:
    - `artifacts/contracts/SourceBridge.sol/SourceBridge.json`
    - `artifacts/contracts/TargetBridge.sol/TargetBridge.json`
  - Idempotent processing:
    - Keeps a local `relayer_state.json` with processed `nonces` / `burnNonces`
    - Also optionally checks on-chain `processedNonces` / `processedBurnNonces`
  - **Retry + backoff** for transient failures
  - Support for **initial catch-up sync** (can be disabled)
  - **Health endpoint** on `http://127.0.0.1:8081/health`
  - **Gas limit override** for Polygon Amoy to avoid:
    - `INTERNAL_ERROR: gas limit is too high`

---

## Environment Setup

Create a `.env` file in the project root (same level as `package.json`), with at least:

```env
# RPC endpoints
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY

# Relayer / deployer private key (same EOA on both chains)
DEPLOYER_PRIVATE_KEY=0x...

# Optional: environment label
NETWORK_ENV=testnet

# Optional: relayer health / polling
HEALTH_PORT=8081
RELAYER_HEALTH_INTERVAL_MS=5000

# Optional: disable initial catch-up (only listen to new events)
RELAYER_DISABLE_SYNC=true
RELAYER_FROM_BLOCK_SEPOLIA=9800900
RELAYER_FROM_BLOCK_AMOY=30205500

# Optional: explicit gas limits (to avoid "gas limit is too high" on Amoy)
RELAYER_MINT_GAS_LIMIT=300000
RELAYER_UNLOCK_GAS_LIMIT=300000
```

> **Never commit real API keys / private keys** to Git.

---

## Running the Testnet Relayer Locally

From the project root:

```bash
# Install dependencies (if not done yet)
npm install

# Compile contracts (ensures artifacts are present)
npx hardhat compile

# Run the relayer
node scripts/testnet_relayer.js
```

If everything is wired correctly, you should see something like:

```text
=== AegisBridge v0.4.2 Testnet Relayer ===
Env           : testnet
Sepolia RPC   : ...
Amoy RPC      : ...
Relayer addr  : 0x36b9...

Sepolia chainId : 11155111
Amoy chainId    : 80002

SourceBridge (Sepolia): 0x4Fb1...
ATT (Sepolia)          : 0xDc92...
TargetBridge (Amoy)    : 0xA9E3...
wATT (Amoy)            : 0x9A06...
========================================
[CONFIG] ...
[STATE] Loaded relayer_state.json with 0 lock nonces and 0 burn nonces.
[HEALTH] HTTP health endpoint listening on port 8081
Subscribing to live events...
- Locked(...) on SourceBridge (Sepolia) → mintFromSource on Amoy
- BurnToSource(...) on TargetBridge (Amoy) → unlockFromTarget on Sepolia
Press Ctrl+C to exit.
```

### Health Endpoint

With the relayer running, you can check health from another terminal:

```bash
curl http://127.0.0.1:8081/health
```

Example JSON (pretty-printed):

```json
{
  "ok": true,
  "env": "testnet",
  "startedAt": "2025-12-09T13:45:26.374Z",
  "lastTickAt": "2025-12-09T13:47:57.538Z",
  "sepolia": {
    "ok": true,
    "lastBlock": 9803281,
    "lastError": null,
    "bridge": "0x4Fb169EDA4C92de96634595d36571637CFbb4437"
  },
  "amoy": {
    "ok": true,
    "lastBlock": 30225114,
    "lastError": null,
    "bridge": "0xA9E3bf15148EA340e76B851483486ca546eD8018"
  },
  "lastLockNonce": 10,
  "lastBurnNonce": 10,
  "lastError": null
}
```

- `ok: true` → both RPCs are reachable
- `lastLockNonce` / `lastBurnNonce` → last processed bridge events

---

## Running the Local Testnet dApp

The frontend is a minimal static dApp in `/frontend`.

### 1. Start a simple HTTP server

From the project root:

```bash
npx http-server .
```

You should see something like:

```text
Available on:
  http://127.0.0.1:8080
Hit CTRL-C to stop the server
```

### 2. Open the dApp in your browser

Visit:

```text
http://127.0.0.1:8080/frontend/index.html
```

Make sure MetaMask is configured with:

- **Sepolia** (chainId: `11155111`)
- **Polygon Amoy** (chainId: `80002`)
- Using the same EOA as the relayer (`0x36b9...50a`) for test runs.

---

## Example End-to-End Flow (Local Test)

This is the exact flow that was used to verify v0.4.2:

### A. Sepolia → Amoy (lock → mint)

1. In the dApp, select **“Sepolia → Amoy”** direction.
2. Enter amount, for example: `10`.
3. Click **Bridge Tokens**.

The dApp will:

- Send `approve()` if allowance is too low:
  ```text
  Allowance too low, sending approve()…
  approve() tx: 0x...
  approve() confirmed
  ```
- Then send `lock()`:
  ```text
  Calling bridge.lock(amount, recipient)…
  lock tx: 0xd6599c6b...
  ✅ Lock confirmed on Sepolia. Wait for relayer to mint wATT on Amoy.
  ```

The relayer logs:

```text
[LOCK EVENT] Sepolia Locked → nonce=10, amount=10.0, sender=0x36..., recipient=0x36..., tx=0xd6599c6b...
[MINT] Preparing mintFromSource on Amoy: user=0x36..., amount=10.0, nonce=10, gasLimit=300000
[TX] mintFromSource(nonce=10) — attempt 1/3
[TX] mintFromSource(nonce=10) sent: 0xf0c90eb...
[TX] mintFromSource(nonce=10) confirmed in block 30226020 (status=1)
[MINT] mintFromSource successful for nonce=10, tx=undefined
```

### B. Amoy → Sepolia (burn → unlock)

1. In the dApp, switch to **“Amoy → Sepolia”**.
2. Use the same amount, e.g. `10` (the wATT you just minted).
3. Click **Bridge Tokens**.

You may see an occasional RPC hiccup like:

```text
❌ could not coalesce error (error={ "code": -32603, "message": "Internal JSON-RPC error." }, ...)
```

If so, click **Bridge Tokens** again. On success:

```text
burn tx: 0xe1d764a8...
✅ Burn confirmed on Amoy. Wait for relayer to unlock ATT on Sepolia.
```

The relayer logs:

```text
[BURN EVENT] Amoy BurnToSource → burnNonce=10, amount=10.0, from=0x36..., to=0x36..., tx=0xe1d764a8...
[UNLOCK] Preparing unlockFromTarget on Sepolia: recipient=0x36..., amount=10.0, burnNonce=10, gasLimit=300000
[TX] unlockFromTarget(burnNonce=10) — attempt 1/3
[TX] unlockFromTarget(burnNonce=10) sent: 0x2dcf5cc1...
[TX] unlockFromTarget(burnNonce=10) confirmed in block 9803375 (status=1)
[UNLOCK] unlockFromTarget successful for burnNonce=10, tx=undefined
```

Result:

- 10 ATT was **locked** on Sepolia and **minted** as wATT on Amoy.
- 10 wATT was **burned** on Amoy and **unlocked** back as ATT on Sepolia.
- `lastLockNonce` and `lastBurnNonce` in `/health` are equal (10 in this test).

---

## Development Notes

- Contracts are managed with **Hardhat**.
- Frontend is a vanilla HTML/JS app in `/frontend` (no bundler).
- Relayer uses **ethers v6** and plain Node.js:
  - `scripts/testnet_relayer.js`

Useful commands:

```bash
# Compile contracts
npx hardhat compile

# Run a specific script
npx hardhat run scripts/deploy_sepolia.js --network sepolia
npx hardhat run scripts/deploy_amoy.js --network amoy

# Run the relayer
node scripts/testnet_relayer.js

# Run the local frontend
npx http-server .
```

---

## Git Workflow (Quick Reminder)

From the project root:

```bash
git status
git add .
git commit -m "feat: v0.4.2 relayer (gas tuning + health) & dApp testnet flow"
git push origin main
```

If `git push` is rejected because the remote is ahead:

```bash
git pull --rebase origin main
git push origin main
```

---

## Roadmap (High-Level)

- Improve dApp UX:
  - Better error messages for RPC failures
  - Small retries in the frontend for transient errors (`Internal JSON-RPC error`)
  - More explicit status indicators for each step
- Extend documentation:
  - Whitepaper draft (PQC message model, design goals)
  - Security considerations and trust assumptions
- Future networks:
  - Mainnet-grade environments (e.g. Base, Polygon mainnet, etc.)
  - Support for more asset types / chains
