# AegisBridge PoC v2 – Sepolia ↔ Polygon Amoy

AegisBridge is a minimal cross‑chain bridge proof‑of‑concept (PoC) between **Ethereum Sepolia** and **Polygon Amoy** testnets.

The current v2 design bridges a single ERC‑20 test token:

- **ATT** on Sepolia → locked in a **SourceBridge**
- **wATT** on Amoy → minted/burned via a **TargetBridge**
- A **Node.js relayer** watches events on both chains and routes the messages:
  - `Locked` on Sepolia → `mintFromSource` on Amoy  
  - `ReturnRequested` on Amoy → `releaseFromTarget` on Sepolia

This repo contains:

- Solidity contracts (SourceBridge, TargetBridge, ATT & wATT)
- Hardhat config + deployment scripts
- Relayer script (`scripts/testnet_relayer.js`)
- Helper scripts for approvals, balance checks, and manual test flows

---

## 1. Requirements

- Node.js **>= 20** (tested with Node 20.x)
- npm **>= 10**
- `git`
- A wallet with test ETH on Sepolia & test MATIC on Amoy
- RPC endpoints for Sepolia & Amoy (Alchemy, public RPC, etc.)

Global tools (optional but recommended):

```bash
npm install -g pm2
```

---

## 2. Installation

Clone the repo & install dependencies:

```bash
git clone https://github.com/aegisbridge/aegisbridge-poc.git
cd aegisbridge-poc

# (Optional but recommended if you use nvm)
nvm install 20
nvm use 20

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

You should see something like:

```text
Compiled X Solidity files successfully (evm target: paris).
```

---

## 3. Environment Configuration (`.env`)

Create a `.env` file in the project root. Below is a **sanitized example** – **never commit real private keys**.

```env
##############################
# === RPC ENDPOINTS ===
##############################

# Sepolia RPC (primary + backups)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
SEPOLIA_RPC_URL_1=https://0xrpc.io/sep
SEPOLIA_RPC_URL_2=https://eth-sepolia-testnet.api.pocket.network
SEPOLIA_RPC_URL_3=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_RPC_URL_4=

# Amoy RPC (primary + backups)
AMOY_RPC_URL=https://polygon-amoy-public.nodies.app
AMOY_RPC_URL_1=https://polygon-amoy.drpc.org
AMOY_RPC_URL_2=https://rpc-amoy.polygon.technology
AMOY_RPC_URL_3=https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY


##############################
# === KEYS (DO NOT COMMIT) ===
##############################

# Wallet used for deploy + tests (must be the same on Sepolia & Amoy)
# IMPORTANT: NEVER commit real private keys to a public repo
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
TEST_SENDER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY


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

# SourceBridge v2 on Sepolia (active)
SEPOLIA_SOURCE_BRIDGE=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SEPOLIA_SOURCE_BRIDGE_V2=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SOURCE_BRIDGE_SEPOLIA=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SEPOLIA_BRIDGE_ADDRESS=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99

# TargetBridge v2 on Amoy
AMOY_TARGET_BRIDGE_V2=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
TARGET_BRIDGE_AMOY=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5

# Test user / recipient
TEST_SENDER_ADDRESS=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a
TEST_RECIPIENT_AMOY=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a

# wATT token on Amoy
AMOY_WATT_TOKEN=0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
WATT_AMOY=0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
AMOY_WATT=0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
AMOY_BRIDGE_ADDRESS=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5


##############################
# === RELAYER CONFIG (v2) ===
##############################

RELAYER_DRY_RUN=false
RELAYER_MAX_RETRIES=3
RELAYER_RETRY_DELAY_MS=10000

# Start syncing from around the first lock block (can be shifted earlier)
RELAYER_FROM_BLOCK_SEPOLIA=9810800
RELAYER_FROM_BLOCK_AMOY=30299500

RELAYER_DISABLE_SYNC=false
RELAYER_POLL_INTERVAL_MS=5000
RELAYER_MINT_GAS_LIMIT=300000
RELAYER_UNLOCK_GAS_LIMIT=300000


##############################
# === AUTO POOL / TOP-UP CONFIG ===
##############################

# eth_getLogs range (e.g. max 10 blocks for free tiers)
SEPOLIA_LOG_MAX_RANGE=10

# Approximate block where SourceBridge v2 started locking
SEPOLIA_LOCKED_FROM_BLOCK=9812700

# Maximum automatic top-up (in wATT units, not wei)
AMOY_BRIDGE_TOPUP_MAX_WATT=15000

# Optional: fixed amount for manual top-up scripts
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
# === LEGACY V1 (OPTIONAL) ===
##############################

BRIDGE_CONTRACT_SEPOLIA=0x4Fb169EDA4C92de96634595d36571637CFbb4437
BRIDGE_CONTRACT_AMOY=0xA9E3bf15148EA340e76B851483486ca546eD8018
```

> Note: the ATT/wATT/bridge addresses above are filled with **active v2 addresses** from this specific test environment. Adjust them if you redeploy.

---

## 4. Running the Relayer

The relayer is a Node.js service that:

- Listens for `Locked` events on the `SourceBridge` (Sepolia) and calls `mintFromSource` on `TargetBridge` (Amoy)
- Listens for `ReturnRequested` events on the `TargetBridge` (Amoy) and calls `releaseFromTarget` on the `SourceBridge` (Sepolia)

### 4.1 Run the relayer locally (dev)

```bash
node scripts/testnet_relayer.js
```

You should see logs similar to:

```text
[RPC][sepolia] in use:
  - (primary) https://eth-sepolia.g.alchemy.com/v2/...

[RPC][amoy] in use:
  - (primary) https://polygon-amoy-public.nodies.app
  - (backup #1) https://rpc-amoy.polygon.technology
  - (backup #2) https://polygon-amoy.g.alchemy.com/v2/...

=== AegisBridge v2 Testnet Relayer (Node) ====
Env            : testnet
SourceBridge   : 0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
TargetBridge   : 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
ATT (Sepolia)  : 0xDc925c125DC7b51946031761c1693eA6238Bf3fb
wATT (Amoy)    : 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
Relayer wallet : 0x36b9...
Dry run        : false
```

### 4.2 Run the relayer on a VPS with PM2

On your VPS (for example user `<your_username>`, folder `~/aegisbridge-poc`):

```bash
cd ~/aegisbridge-poc

# Start relayer
pm2 start scripts/testnet_relayer.js --name aegisbridge-relayer-testnet

# Tail logs
pm2 logs aegisbridge-relayer-testnet --lines 80

# Persist the process list so it auto-starts on reboot
pm2 save
```

To stop:

```bash
pm2 stop aegisbridge-relayer-testnet
```

---

## 5. How to Test the Bridge (Forward + Reverse)

This section explains the end‑to‑end test flows:

- **Forward bridge:** Sepolia (ATT) → Amoy (wATT)
- **Reverse bridge:** Amoy (wATT) → Sepolia (ATT)

All commands below are assumed to be run from the project folder, for example on Windows:

```bash
PS D:\aegisbridge>
```

### 5.0 Quick prerequisites

- Contracts are already deployed (ATT, wATT, SourceBridge v2, TargetBridge v2)
- `.env` is filled as described above
- The relayer is **running** (see section 4)

---

### 5.1 Forward Bridge: Sepolia → Amoy

Flow: **lock ATT on Sepolia** → relayer detects `Locked` → **mint wATT on Amoy** to the user wallet.

#### 5.1.1 Check ATT balance & allowance on Sepolia

```bash
node scripts/check_att_state.js
```

Example output:

```text
Wallet        : 0x36b9...
ATT address   : 0xDc925c125DC7b51946031761c1693eA6238Bf3fb
Symbol/dec    : ATT / 18
Balance       : 982700.0
Allowance --> Bridge: 0.0
```

If **allowance = 0**, continue to approve.

#### 5.1.2 Approve ATT for the SourceBridge

This script approves ATT for `SEPOLIA_SOURCE_BRIDGE` (SourceBridge v2):

```bash
# Example: approve 1000 ATT
node scripts/approve_att_for_bridge.js 1000
```

Example output:

```text
Wallet        : 0x36b9...
Token         : ATT ( 0xDc92... )
Balance       : 982700.0
Allowance now : 0.0
Approving     : 1000.0 ATT to bridge 0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
Approve tx hash: 0xc33489ee...
Status        : 1
Allowance new : 1000.0
```

#### 5.1.3 Lock ATT from Sepolia to Amoy

This script:

- Uses `TEST_SENDER_PRIVATE_KEY` on Sepolia
- Calls `SourceBridge.lock(amount)`
- Emits `Locked(nonce, user, amount)`

```bash
node scripts/send_test_from_sepolia.js
```

Example output:

```text
Sender address : 0x36b9...
Sepolia RPC    : https://eth-sepolia.g.alchemy.com/v2/...
Recipient (Amoy): 0x36b9...
Amount           : 1000000000000000000000
lock() inputs: [ 'amount:uint256' ]
Calling: lock(amount)
Tx sent: 0xe9cafa957c044879e0b0bd59f4b8505e03ba9f1ab58719c4ee360b1e5bcbf875
Tx confirmed in block: 9821907
```

You can run it again for a second test:

```bash
node scripts/send_test_from_sepolia.js
```

---

#### 5.1.4 Relayer processes `Locked` → `mintFromSource` on Amoy

In the relayer logs (PM2) you should see something like:

```text
[Forward[Past]] New Locked event: nonce=18, user=0x36b9..., amount=1000.0 ATT
[Forward[Past]] Calling mintFromSource on Amoy: to=0x36b9..., amount=1000.0 ATT, nonce=18
[Forward[Past]] mintFromSource(nonce=18) tx sent: 0x2d8dbc51...
[Forward[Past]] mintFromSource(nonce=18) tx confirmed in block 30374171, status=1
```

This means the relayer already minted wATT for the user on Amoy.

---

#### 5.1.5 Check wATT on Amoy (wallet + pool)

**Check the user wallet wATT balance:**

```bash
node scripts/check_watt_wallet_amoy.js
```

Example output:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
Wallet     : 0x36b9...
Balance    : 2030 wATT in 0x36b9...
```

**Check wATT in the bridge pool (TargetBridge):**

```bash
node scripts/check_watt_amoy.js
```

Example output:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
Pool addr  : 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
Token   : wATT ( 0x9A0687... )
Balance : 1670.0 wATT in 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
```

Forward flow is **successful** if:

- ATT balance on Sepolia **decreases** by the locked amount
- wATT balance on Amoy wallet **increases**
- wATT pool balance on Amoy changes consistently with your lock/return history

---

### 5.2 Reverse Bridge: Amoy → Sepolia

Flow: **burn/lock wATT on Amoy** via `TargetBridge.requestReturnToSource` → relayer detects `ReturnRequested` → **release ATT on Sepolia** to the user.

#### 5.2.1 Approve wATT for the TargetBridge on Amoy

This script approves wATT for `TARGET_BRIDGE_AMOY`:

```bash
node scripts/approve_watt_for_bridge.js 1000
```

Example output:

```text
Wallet        : 0x36b9...
Token         : wATT (0x9A0687...)
Balance       : 2030.0
Allowance now : 0.0
Approving     : 1000 wATT to bridge 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
Approve tx hash: 0xa4fd922a4f4a30ec8ce8740654777faebf3c325855c61b52b8caf2808e834280
Status        : 1
Allowance new : 1000.0
```

#### 5.2.2 Request return back to Sepolia

This script calls `TargetBridge.requestReturnToSource(amount)` on Amoy:

```bash
node scripts/request_return_to_sepolia.js 1000
```

Example output:

```text
RPC Amoy      : https://polygon-amoy-public.nodies.app
Wallet        : 0x36b9...
TargetBridge  : 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
wATT token    : 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4 (wATT/18)
Current wATT  : 2030.0
Candidate functions in TargetBridge: [ 'requestReturnToSource' ]
Chosen function: requestReturnToSource(amount)
Calling: requestReturnToSource(1000) on TargetBridge...
Tx sent: 0x0b2bdce6f4861d037039132cf0ef2a41036ef5025bc2934f0d26ec201dc8f186
Tx confirmed in block: 30375411 status: 1
```

After this, a `ReturnRequested` event has been emitted on Amoy.

---

#### 5.2.3 Relayer processes `ReturnRequested` → `releaseFromTarget` on Sepolia

In the relayer logs you should see something like:

```text
[Reverse[Past]] New ReturnRequested: nonce=..., user=0x36b9..., amount=1000.0
[Reverse[Past]] Calling releaseFromTarget on Sepolia ...
[Reverse[Past]] releaseFromTarget(...) tx sent: 0x...
[Reverse[Past]] releaseFromTarget(...) tx confirmed in block ..., status=1
```

This means the relayer has released ATT on Sepolia to the user.

---

#### 5.2.4 Verify results: wATT decreases, ATT increases

**Check the wATT wallet balance on Amoy:**

```bash
node scripts/check_watt_wallet_amoy.js
```

Example after reverse:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A0687...
Wallet     : 0x36b9...
Balance    : 1030 wATT in 0x36b9...
```

**Check the ATT balance on Sepolia:**

```bash
node scripts/check_att_state.js
```

Example:

```text
Wallet        : 0x36b9...
ATT address   : 0xDc925c125DC7b51946031761c1693eA6238Bf3fb
Symbol/dec    : ATT / 18
Balance       : 977670.0
Allowance --> Bridge: 994970.0
```

If:

- wATT on Amoy **decreases** by the requested return amount
- ATT on Sepolia **increases / returns** consistently with your lock/return history

then the **reverse flow Amoy → Sepolia is working correctly**.

---

## 6. Relayer’s Role (Summary)

**Forward (Sepolia → Amoy):**

1. Listens for `Locked(nonce, user, amount)` on the `SourceBridge` (Sepolia).
2. Checks on `TargetBridge` whether the nonce has already been processed.
3. If not, calls `mintFromSource(user, amount, nonce)` on Amoy.
4. Marks the nonce as processed on `TargetBridge` (prevents double‑mint).

**Reverse (Amoy → Sepolia):**

1. Listens for `ReturnRequested(nonce, user, amount)` on `TargetBridge` (Amoy).
2. Checks nonce status on `SourceBridge` (Sepolia).
3. Calls `releaseFromTarget(user, amount, nonce)` to release ATT.
4. Marks the nonce as processed on `SourceBridge` (idempotent).

As long as the relayer is **online** and both RPC endpoints are healthy, all tests in section 5 can be repeated for demos and R&D.

---

## 7. Troubleshooting (Short)

Some common errors:

### 7.1 `execution reverted (unknown custom error)` when locking

- Check that:
  - ATT balance on Sepolia is sufficient.
  - Allowance to `SEPOLIA_SOURCE_BRIDGE` is large enough.
- Use:
  ```bash
  node scripts/check_att_state.js
  ```

### 7.2 Error 429 from Alchemy (`Your app has exceeded its compute units per second capacity`)

- This means your request throughput limit was reached.
- Possible mitigations:
  - Use backup RPCs (`SEPOLIA_RPC_URL_1/2/3`, `AMOY_RPC_URL_1/2/3`).
  - Increase `RELAYER_POLL_INTERVAL_MS` if the relayer is polling too aggressively.
  - Upgrade the RPC provider plan.

### 7.3 Relayer cannot detect network (`JsonRpcProvider failed to detect network and cannot start up`)

- Check that `SEPOLIA_RPC_URL` and `AMOY_RPC_URL` are valid working endpoints.
- Test with a simple script:
  ```bash
  node scripts/test_rpc_amoy.js
  ```

---

## 8. Disclaimer

AegisBridge PoC v2 is built for **research and educational purposes on testnets only**.  
Do **not** use this design as‑is on mainnet without serious security audits and deeper architectural review (signing model, relayer sets, fee model, slashing, etc.).
