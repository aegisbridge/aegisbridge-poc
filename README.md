# AegisBridge PoC – Sepolia ↔ Polygon Amoy

> **Status:** Internal testnet PoC (ATT ↔ wATT). **Do not use in production.**

AegisBridge is a minimal cross–chain bridge Proof‑of‑Concept between:

- **Ethereum Sepolia** (L1 testnet) – ERC‑20 **ATT**
- **Polygon Amoy** (L2 testnet) – ERC‑20 **wATT**

The flow:

- **Forward (Sepolia → Amoy)**  
  User locks **ATT** in `SourceBridge` on Sepolia → relayer watches `Locked` events → relayer calls `mintFromSource` on `TargetBridge` → mints **wATT** to the user on Amoy.
- **Reverse (Amoy → Sepolia)**  
  User approves + calls `requestReturnToSource` on `TargetBridge` with **wATT** → relayer watches `ReturnRequested` events → relayer calls `unlockFromTarget` on `SourceBridge` → unlocks **ATT** back to the user on Sepolia.

This repo contains:

- Solidity contracts (`contracts/`)
- Hardhat config + deploy scripts (`hardhat.config.js`, `scripts/deploy_*.js`)
- Node relayer (`scripts/testnet_relayer.js`)
- Helper scripts for testing (`scripts/*.js`)

---

## 1. Deployments (current test setup)

### Sepolia (Ethereum testnet)

- **ATT token**  
  `ATT_SEPOLIA = 0xDc925c125DC7b51946031761c1693eA6238Bf3fb`
- **SourceBridge v2 (active)**  
  `SEPOLIA_SOURCE_BRIDGE = 0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99`

### Polygon Amoy (Polygon testnet)

- **wATT token**  
  `AMOY_WATT_TOKEN = 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4`
- **TargetBridge v2 (active)**  
  `AMOY_TARGET_BRIDGE_V2 = 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5`

### Relayer wallet (both sides)

- **Relayer / test EOA**  
  `0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a`  
  This address:
  - Owns test **ATT** on Sepolia
  - Receives **wATT** on Amoy
  - Is also used as the relayer signer

---

## 2. Requirements

Locally (VS Code / Windows) and on VPS (Ubuntu 22.04):

- **Node.js 20 LTS** (tested with `v20.19.6`)
- **npm** (tested with `10.x`)
- **NVM** (optional but used on VPS)
- **Hardhat** (installed via `npm install`)
- **pm2** for running the relayer as a daemon (on VPS)

Quick check:

```bash
node -v
npm -v
npx hardhat --version
pm2 -v      # on VPS
```

---

## 3. Install & Compile

Clone and install:

```bash
git clone https://github.com/aegisbridge/aegisbridge-poc.git
cd aegisbridge-poc

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

You should see:

```bash
Compiled 14 Solidity files successfully (evm target: paris).
```

---

## 4. Environment (.env) layout

> **Important:** Never commit `.env`. Private keys and RPC keys must stay local.

Example `.env` structure (simplified, using actual PoC addresses but placeholder secrets):

```ini
##############################
# === RPC ENDPOINTS ===
##############################

# Sepolia RPC (primary + backups)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
SEPOLIA_RPC_URL_1=https://0xrpc.io/sep
SEPOLIA_RPC_URL_2=https://eth-sepolia-testnet.api.pocket.network
SEPOLIA_RPC_URL_3=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_RPC_URL_4=

# Amoy RPC (primary + backups)
AMOY_RPC_URL=https://polygon-amoy-public.nodies.app
AMOY_RPC_URL_1=https://polygon-amoy.drpc.org
AMOY_RPC_URL_2=https://rpc-amoy.polygon.technology
AMOY_RPC_URL_3=https://polygon-amoy.g.alchemy.com/v2/<YOUR_KEY>

##############################
# === KEYS (DO NOT COMMIT) ===
##############################

# Single test key used for deploy, tests, and relayer signer
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
DEPLOYER_PRIVATE_KEY=${PRIVATE_KEY}
TEST_SENDER_PRIVATE_KEY=${PRIVATE_KEY}

##############################
# === NETWORK / HEALTH ===
##############################

NETWORK_ENV=testnet
HEALTH_PORT=8081

##############################
# === TOKEN & BRIDGE ADDRESSES (ACTIVE v2) ===
##############################

# ATT on Sepolia
ATT_SEPOLIA=0xDc925c125DC7b51946031761c1693eA6238Bf3fb

# Source bridge v2 on Sepolia
SEPOLIA_SOURCE_BRIDGE=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SEPOLIA_SOURCE_BRIDGE_V2=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SOURCE_BRIDGE_SEPOLIA=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SEPOLIA_BRIDGE_ADDRESS=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99

# Target bridge v2 on Amoy
AMOY_TARGET_BRIDGE_V2=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
TARGET_BRIDGE_AMOY=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5

# Test addresses
TEST_SENDER_ADDRESS=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a
TEST_RECIPIENT_AMOY=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a

# wATT token on Amoy
AMOY_WATT_TOKEN=0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
WATT_AMOY=0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
AMOY_WATT=0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4

# TargetBridge / pool address (same as AMOY_TARGET_BRIDGE_V2)
AMOY_BRIDGE_ADDRESS=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5

##############################
# === RELAYER CONFIG (v2) ===
##############################

RELAYER_DRY_RUN=false
RELAYER_MAX_RETRIES=3
RELAYER_RETRY_DELAY_MS=10000

# Start syncing from these blocks (can be moved earlier if needed)
RELAYER_FROM_BLOCK_SEPOLIA=9810800
RELAYER_FROM_BLOCK_AMOY=30299500

RELAYER_DISABLE_SYNC=false
RELAYER_POLL_INTERVAL_MS=5000
RELAYER_MINT_GAS_LIMIT=300000
RELAYER_UNLOCK_GAS_LIMIT=300000

##############################
# === AUTO POOL / TOPUP CONFIG ===
##############################

# Range for eth_getLogs (10 blocks for Alchemy free tier)
SEPOLIA_LOG_MAX_RANGE=10

# Approx first block where SourceBridge v2 was used
SEPOLIA_LOCKED_FROM_BLOCK=9812700

# Max auto topup for Amoy bridge pool (in wATT units, not wei)
AMOY_BRIDGE_TOPUP_MAX_WATT=15000

# Optional: fixed topup value for legacy scripts
WATT_POOL_TOPUP=5000

##############################
# === SAMPLE RETURN FLOW (MANUAL TEST) ===
##############################

RETURN_USER=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a
RETURN_AMOUNT=1000
RETURN_NONCE=1

##############################
# === DEBUG / MISC ===
##############################

BRIDGE_RELAYER=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a
TX_HASH=0x478004662016a12c85498bf9a0309ae6f0cb231982e1c432c5c2f0792f15bffd
CHECK_NONCE=12

##############################
# === LEGACY V1 (ONLY FOR OLD SCRIPTS) ===
##############################

BRIDGE_CONTRACT_SEPOLIA=0x4Fb169EDA4C92de96634595d36571637CFbb4437
BRIDGE_CONTRACT_AMOY=0xA9E3bf15148EA340e76B851483486ca546eD8018
```

---

## 5. Relayer – run on VPS with pm2

On the VPS (Ubuntu), from `/home/<your_username>/aegisbridge-poc`:

### 5.1 Start relayer

```bash
# Make sure Node 20 is active
nvm use 20

# Start relayer
pm2 start scripts/testnet_relayer.js --name aegisbridge-relayer-testnet

# Optional: check logs
pm2 logs aegisbridge-relayer-testnet --lines 50

# Persist pm2 process list across reboot
pm2 save
```

You should see logs like:

```text
=== AegisBridge v2 Testnet Relayer (Node) ===
Env            : testnet
Sepolia RPC    : ...
Amoy RPC       : ...
SourceBridge   : 0x1B1B...
TargetBridge   : 0x3438...
ATT (Sepolia)  : 0xDc92...
wATT (Amoy)    : 0x9A06...
Relayer wallet : 0x36b9...
Dry run        : false
```

The relayer will:

- Watch **Sepolia SourceBridge** for `Locked` events
- Call **Amoy TargetBridge** `mintFromSource(to, amount, nonce)` for each new event
- Watch **Amoy TargetBridge** for `ReturnRequested` events
- Call **Sepolia SourceBridge** `releaseFromTarget(...)` to unlock ATT back

### 5.2 Stop relayer (to save RPC quota)

To stop the relayer but keep pm2 installed:

```bash
pm2 stop aegisbridge-relayer-testnet
pm2 delete aegisbridge-relayer-testnet
pm2 save --force
```

Check pm2 status:

```bash
pm2 status
```

(Optional) Disable pm2 autostart service completely:

```bash
sudo systemctl disable pm2-<your_username>
```

---

## 6. How to test bridge (Forward: Sepolia → Amoy)

All commands below are run **locally** from the project root (e.g. `D:\aegisbridge` in VS Code).  
Make sure `.env` is configured and the relayer on the VPS is **running**.

### 6.1 Check ATT balance & allowance on Sepolia

```bash
node scripts/check_att_state.js
```

Example output:

```text
Wallet        : 0x36b9...
ATT address   : 0xDc92...
Symbol/dec    : ATT / 18
Balance       : 982700.0
Allowance --> Bridge: 0.0
```

If `Allowance --> Bridge` is **0**, you must approve the bridge.

### 6.2 Approve ATT for SourceBridge

You can grant a large allowance once (e.g. 1,000,000 ATT) and reuse it for multiple locks.

```bash
node scripts/approve_att_for_bridge.js
```

Example:

```text
Wallet        : 0x36b9...
Token         : ATT ( 0xDc92... )
Balance       : 982700.0
Allowance now : 0.0
Approving     : 1000000.0 ATT to bridge 0x1B1B...
Approve tx hash: 0xc33489...
Status        : 1
Allowance new : 1000000.0
```

Re‑run the state check:

```bash
node scripts/check_att_state.js
```

You should now see:

```text
Allowance --> Bridge: 1000000.0
```

### 6.3 Lock ATT on Sepolia (forward bridge)

Use the helper script:

```bash
node scripts/send_test_from_sepolia.js
```

Example:

```text
Sender address : 0x36b9...
Sepolia RPC    : https://eth-sepolia.g.alchemy.com/v2/...
Recipient (Amoy): 0x36b9...
Amount           : 1000000000000000000000
lock() inputs: [ 'amount:uint256' ]
Memanggil: lock(amount)
Tx sent: 0xe9cafa95...
Tx confirmed in block: 9821907
```

Notes:

- The script currently uses a hard‑coded amount (`1_000 * 10^18` = `1000 ATT`).  
- To change it, edit `scripts/send_test_from_sepolia.js` or add an env like `BRIDGE_TEST_AMOUNT`.

### 6.4 Observe relayer processing Locked events

On the VPS, watch relayer logs:

```bash
pm2 logs aegisbridge-relayer-testnet --lines 80
```

Example snippet:

```text
[Forward[Past]] New Locked event: nonce=18, user=0x36b9..., amount=1000.0 ATT
[Forward[Past]] Calling mintFromSource on Amoy: to=0x36b9..., amount=1000.0 ATT, nonce=18
[Forward[Past]] mintFromSource(nonce=18) tx sent: 0x2d8dbc51...
[Forward[Past]] mintFromSource(nonce=18) tx confirmed in block 30374171, status=1
```

If the relayer is behind, it will:

- Catch up from `RELAYER_FROM_BLOCK_SEPOLIA`
- Process all past `Locked` events and mark processed nonces
- Then switch to live event streaming

### 6.5 Check wATT balance on Amoy (user wallet)

```bash
node scripts/check_watt_wallet_amoy.js
```

Example:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A06...
Wallet     : 0x36b9...
Balance    : 2030 wATT di 0x36b9...
```

### 6.6 Check wATT balance in bridge pool (Amoy)

This checks the **pool** address (TargetBridge itself), not the user:

```bash
node scripts/check_watt_amoy.js
```

Example:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A06...
Pool addr  : 0x3438B1...
Token   : wATT ( 0x9A06... )
Balance : 1670.0 wATT di 0x3438B1...
```

- When bridging **forward**, the relayer mints wATT **to the user**, not to the pool.
- The pool balance is used for **reverse** direction and/or top‑up flows (depending on config).

---

## 7. How to test bridge (Reverse: Amoy → Sepolia)

Reverse direction burns (or locks) wATT on Amoy and unlocks ATT on Sepolia.

Again, make sure:

- Relayer on VPS is **running**
- Wallet on Amoy holds enough wATT

### 7.1 Check wATT in user wallet (Amoy)

```bash
node scripts/check_watt_wallet_amoy.js
```

Example:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A06...
Wallet     : 0x36b9...
Balance    : 1030 wATT di 0x36b9...
```

### 7.2 Approve TargetBridge to spend wATT

Approve the amount you want to bridge back, in whole token units:

```bash
node scripts/approve_watt_for_bridge.js 1000
```

Example:

```text
Wallet        : 0x36b9...
Token         : wATT (0x9A06...)
Balance       : 2030.0
Allowance now : 0.0
Approving     : 1000 wATT to bridge 0x3438B1...
Approve tx hash: 0xa4fd92...
Status        : 1
Allowance new : 1000.0
```

### 7.3 Request return to Sepolia

Now call the reverse bridge function on `TargetBridge`:

```bash
node scripts/request_return_to_sepolia.js 1000
```

Example:

```text
RPC Amoy      : https://polygon-amoy-public.nodies.app
Wallet        : 0x36b9...
TargetBridge  : 0x3438B1...
wATT token    : 0x9A06... (wATT/18)
Current wATT  : 2030.0
Fungsi kandidat di TargetBridge: [ 'requestReturnToSource' ]
Dipilih fungsi: requestReturnToSource(amount)
Memanggil: requestReturnToSource(1000) pada TargetBridge...
Tx sent: 0x0b2bdce6...
Tx confirmed in block: 30375411 status: 1
```

If you see `execution reverted (unknown custom error)` during `estimateGas`, typical causes:

- **Allowance too low** – run `approve_watt_for_bridge.js` again with a higher value.
- **Balance too low** – check `check_watt_wallet_amoy.js`.
- **Bridge paused / invalid state** – check contract state or relayer logs.

### 7.4 Observe relayer processing ReturnRequested events

On VPS:

```bash
pm2 logs aegisbridge-relayer-testnet --lines 80
```

You should see something like:

```text
[Reverse] Catching up ReturnRequested events on Amoy from block ...
[Reverse[Past]] New ReturnRequested: nonce=..., user=0x36b9..., amount=1000.0 wATT
[Reverse[Past]] Calling releaseFromTarget on Sepolia: to=0x36b9..., amount=1000.0 ATT, nonce=...
[Reverse[Past]] releaseFromTarget(...) tx sent: 0x...
[Reverse[Past]] releaseFromTarget(...) tx confirmed in block ..., status=1
```

### 7.5 Verify balances after reverse bridge

#### On Amoy (wATT)

```bash
node scripts/check_watt_wallet_amoy.js
```

Expect the user’s wATT balance to **decrease** (e.g. from `2030` → `1030`).

#### On Sepolia (ATT)

```bash
node scripts/check_att_state.js
```

You should see ATT balance increased (and allowance decreased slightly if bridge consumes allowance):

```text
Wallet        : 0x36b9...
ATT address   : 0xDc92...
Balance       : 977670.0   # example balance after multiple cycles
Allowance --> Bridge: 994970.0
```

---

## 8. Troubleshooting

### 8.1 `Your app has exceeded its compute units per second capacity` (Alchemy 429)

If you see:

```text
code: 429,
message: "Your app has exceeded its compute units per second capacity..."
```

Then:

- RPC key is rate‑limited (especially when relayer is catching up logs).
- Fixes:
  - Switch to another RPC (`*_RPC_URL_1`, `_2`, `_3`)
  - Upgrade plan on the RPC provider
  - Reduce `RELAYER_POLL_INTERVAL_MS` or scan range if needed

### 8.2 `JsonRpcProvider failed to detect network and cannot start up`

Usually caused by:

- Invalid RPC URL
- RPC provider down / blocked

Check:

- `SEPOLIA_RPC_URL` / `AMOY_RPC_URL` in `.env`
- Test with simple scripts:

```bash
node scripts/test_rpc_sepolia.js
node scripts/test_rpc_amoy.js
```

(if present in this repo)

### 8.3 `execution reverted (unknown custom error)` on lock / requestReturn

For `send_test_from_sepolia.js` (lock):

- Check:
  - ATT balance is sufficient (`check_att_state.js`)
  - Allowance to the bridge is high enough (`Allowance --> Bridge`)
- If allowance is `0` or lower than the amount, run:

  ```bash
  node scripts/approve_att_for_bridge.js
  ```

For `request_return_to_sepolia.js`:

- Check:
  - wATT balance on Amoy (`check_watt_wallet_amoy.js`)
  - Allowance to TargetBridge (`approve_watt_for_bridge.js`)

---

## 9. Git workflow (local + VPS)

Simple mental model:

- **VS Code (Windows / `D:\aegisbridge`)** – main dev workspace
- **VPS (`~/aegisbridge-poc`)** – runtime for relayer

Typical flow:

```bash
# On VS Code
git status
git add .
git commit -m "feat: update README and bridge test scripts"
git push origin main
```

Then on VPS:

```bash
cd ~/aegisbridge-poc
git pull --rebase origin main

# Reinstall deps if package.json changed
npm install

# Restart relayer
pm2 restart aegisbridge-relayer-testnet
pm2 logs aegisbridge-relayer-testnet --lines 50
```

If `git pull --rebase` complains about unstaged changes:

```bash
git status        # inspect
git stash push -m "local tmp changes"   # or commit them properly
git pull --rebase origin main
# optionally: git stash pop
```

---

## 10. Safety & Limitations

- This is a **testnet PoC only** – not audited, not production‑ready.
- No slashing or sophisticated security; relayer is a single trusted signer.
- No pricing / oracle integration; values are 1:1 ATT ↔ wATT.

For any future refactor:

- Keep `How to test bridge` section and update command examples if script names change.
- Make sure `.env` comments stay in sync with actual deployed addresses.
