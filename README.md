# AegisBridge – Sepolia ↔ Polygon Amoy Testnet Bridge (v2, Two-Way)

AegisBridge is a minimal two-way bridge prototype between:

- **Ethereum Sepolia** (canonical token: `ATT`)
- **Polygon Amoy** (wrapped token: `wATT`)

The bridge supports:

- **Forward**: Sepolia → Amoy (lock `ATT` → mint `wATT`)
- **Reverse**: Amoy → Sepolia (request a return with `wATT` → release `ATT`)

All operations are protected with **nonce tracking** to prevent double-minting and double-release.

---

## 1. Contracts & Addresses (Current Test Deployment)

> These addresses come from the latest local test deployment.  
> If you redeploy, update both your `.env` and this section accordingly.

### Sepolia

- **ATT (canonical token)**  
  `0xDc925c125DC7b51946031761c1693eA6238Bf3fb`

- **SourceBridge v2**  
  `0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99`

### Polygon Amoy

- **wATT (wrapped token)**  
  `0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4`

- **TargetBridge v2**  
  `0x682E40B79E79adCC8CeFED7C42f5f268386B0c66`

### Roles

- **Owner** – the deployer (currently `0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a`)
- **Relayer** – the EOA allowed to call `mintFromSource` and `releaseFromTarget`  
  (currently the same address as the owner, and can be updated via `setRelayer()` on each bridge).

---

## 2. High-Level Architecture

### Forward Direction: Sepolia → Amoy

1. User on Sepolia:
   - Calls `ATT.approve(SourceBridge, amount)`
   - Calls `SourceBridge.lock(amount)`

2. `SourceBridge` on Sepolia:
   - Pulls `amount` of `ATT` from the user into the bridge contract
   - Increments `currentNonce`
   - Emits `Locked(user, amount, nonce)`

3. Relayer (off-chain) on Amoy:
   - Listens to `Locked` events on Sepolia
   - Calls `TargetBridge.mintFromSource(user, amount, nonce)` on Amoy

4. `TargetBridge` on Amoy:
   - Checks `processedNonces[nonce] == false`
   - Sets `processedNonces[nonce] = true`
   - Mints `amount` of `wATT` to `user`
   - Emits `MintedFromSource(user, amount, nonce)`

---

### Reverse Direction: Amoy → Sepolia

1. User on Amoy:
   - Calls `wATT.approve(TargetBridge, amount)`
   - Calls `TargetBridge.requestReturnToSource(amount)`

2. `TargetBridge` on Amoy:
   - Transfers `amount` of `wATT` from the user to the bridge contract  
     (`transferFrom(msg.sender, address(this), amount)`)
   - Increments `currentReturnNonce`
   - Emits `ReturnRequested(user, amount, returnNonce)`

3. Relayer (off-chain) on Sepolia:
   - Listens to `ReturnRequested` events on Amoy
   - Calls `SourceBridge.releaseFromTarget(user, amount, returnNonce)`

4. `SourceBridge` on Sepolia:
   - Checks `processedReturnNonces[returnNonce] == false`
   - Sets `processedReturnNonces[returnNonce] = true`
   - Transfers `amount` of `ATT` from the bridge contract to `user`
   - Emits `ReleasedFromTarget(user, amount, returnNonce)`

---

## 3. Contract Interfaces (Summary)

### SourceBridge (Sepolia)

Main responsibilities:

- Lock canonical `ATT` for forward bridging
- Release locked `ATT` when a valid reverse request is observed

Key functions:

```solidity
// Lock ATT for bridging to Amoy
function lock(uint256 amount) external returns (uint256 nonce);

// Release ATT based on a return request from Amoy
function releaseFromTarget(
    address to,
    uint256 amount,
    uint256 nonce
) external onlyRelayer;

// Forward nonce (Sepolia -> Amoy)
uint256 public currentNonce;

// Reverse nonces (Amoy -> Sepolia) that have been processed
mapping(uint256 => bool) public processedReturnNonces;

// Update the relayer address
function setRelayer(address _relayer) external onlyOwner;
```

Key events:

```solidity
event Locked(address indexed user, uint256 amount, uint256 indexed nonce);
event ReleasedFromTarget(address indexed user, uint256 amount, uint256 indexed nonce);
event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
```

---

### TargetBridge (Amoy)

Main responsibilities:

- Mint `wATT` when a valid lock is detected on Sepolia
- Accept return requests and hold `wATT` for reverse bridging

Key functions:

```solidity
// Mint wATT based on a lock on Sepolia
function mintFromSource(
    address to,
    uint256 amount,
    uint256 nonce
) external onlyRelayer;

// Request a return to Sepolia by surrendering wATT to the bridge
function requestReturnToSource(uint256 amount) external;

// Forward nonces (Sepolia -> Amoy) that have been processed
mapping(uint256 => bool) public processedNonces;

// Reverse nonce counter (Amoy -> Sepolia)
uint256 public currentReturnNonce;

// Update the relayer address
function setRelayer(address _relayer) external onlyOwner;
```

Key events:

```solidity
event MintedFromSource(address indexed to, uint256 amount, uint256 indexed nonce);
event ReturnRequested(address indexed user, uint256 amount, uint256 indexed nonce);
event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
```

---

## 4. Project Setup

### Install dependencies

```bash
npm install
# or
yarn install
```

### Example `.env`

Create a `.env` file in the project root:

```dotenv
# RPC endpoints
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY

# Private key used by Hardhat (deployer/relayer)
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
BRIDGE_RELAYER=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a

# Tokens
ATT_SEPOLIA=0xDc925c125DC7b51946031761c1693eA6238Bf3fb
WATT_AMOY=0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4

# Bridge v2 contracts
SOURCE_BRIDGE_SEPOLIA=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
TARGET_BRIDGE_AMOY=0x682E40B79E79adCC8CeFED7C42f5f268386B0c66

# Default amounts for scripts (optional)
AEGIS_LOCK_AMOUNT=1000
AEGIS_RETURN_AMOUNT=1000

# Reverse release parameters (used by sepolia_release_from_amoy.js)
RETURN_USER=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a
RETURN_AMOUNT=1000
RETURN_NONCE=1
```

Make sure your `hardhat.config.js` reads this `.env` and configures the `sepolia` and `amoy` networks with the appropriate RPC URLs and private key.

---

## 5. Deploying Bridge v2 Contracts

### 5.1. Deploy SourceBridge v2 (Sepolia)

Script: `scripts/deploy_source_bridge_v2.js`

```bash
npx hardhat run scripts/deploy_source_bridge_v2.js --network sepolia
```

Example output:

```text
=== Deploy SourceBridge v2 (Sepolia) ===
Network  : sepolia
Deployer : 0x36b9...
ATT      : 0xDc92...
Relayer  : 0x36b9...
✅ SourceBridge v2 deployed at: 0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
```

Update `.env`:

```dotenv
SOURCE_BRIDGE_SEPOLIA=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
```

---

### 5.2. Deploy TargetBridge v2 (Amoy)

Script: `scripts/deploy_target_bridge_v2.js`

```bash
npx hardhat run scripts/deploy_target_bridge_v2.js --network amoy
```

Example output:

```text
=== Deploy TargetBridge v2 (Amoy) ===
Deployer : 0x36b9...
wATT     : 0x9A06...
Relayer  : 0x36b9...
✅ TargetBridge v2 deployed at: 0x682E40B79E79adCC8CeFED7C42f5f268386B0c66
```

Update `.env`:

```dotenv
TARGET_BRIDGE_AMOY=0x682E40B79E79adCC8CeFED7C42f5f268386B0c66
```

---

## 6. Forward Flow: Sepolia → Amoy

### 6.1. Lock ATT on Sepolia

Script: `scripts/sepolia_lock.js`

```bash
npx hardhat run scripts/sepolia_lock.js --network sepolia
```

Example output:

```text
Network :  sepolia
Deployer: 0x36b9...
ATT before: 994700.0
ATT bridge before: 0.0
Approve tx: 0x83cc...
Lock tx   : 0xe9e4...
Locked in block: 9807029
ATT after (user)  : 993700.0
ATT after (bridge): 1000.0

➡️  Current nonce on SourceBridge v2: 1
```

This means:

- 1000 `ATT` is now locked in `SourceBridge v2`
- `currentNonce` is `1` for the forward direction

---

### 6.2. Mint wATT on Amoy (manual forward)

If you do not have an automatic relayer yet, you can mint manually using a script like `scripts/amoy_mint_from_sepolia.js`.

Typical usage:

```powershell
$env:AMOY_MINT_NONCE = "1"
npx hardhat run scripts/amoy_mint_from_sepolia.js --network amoy
```

The script should:

- Check `processedNonces[nonce]`
- If not processed yet → call `mintFromSource(user, amount, nonce)` on `TargetBridge`
- If already processed → log and skip

---

## 7. Reverse Flow: Amoy → Sepolia

This is the new v2 feature: return `wATT` on Amoy and get `ATT` back on Sepolia.

### 7.1. Request a Return on Amoy (user side)

Script: `scripts/amoy_request_return.js`

Set the amount of `wATT` you want to return:

```powershell
$env:AEGIS_RETURN_AMOUNT = "1000"
```

Then run:

```bash
npx hardhat run scripts/amoy_request_return.js --network amoy
```

Example output:

```text
=== AegisBridge: Amoy -> Sepolia (requestReturnToSource) ===
Network      : amoy
User         : 0x36b9...
Token (wATT) : 0x9A06...
Bridge       : 0x682E40B7...
Amount       : 1000 wATT
User balance before   : 3700.0
Bridge balance before : 0.0
Approve tx : 0xef55...
Return request tx: 0x22ad...
Return request confirmed in block: 30256306

=== After requestReturnToSource ===
Current return nonce (Amoy -> Sepolia): 1
User balance after   : 2700.0
Bridge balance after : 1000.0

➡️  Use this return nonce on Sepolia for releaseFromTarget: 1
```

Interpretation:

- User surrenders 1000 `wATT` to `TargetBridge v2`
- `currentReturnNonce` becomes `1`
- This `(user, amount, returnNonce)` triple is what the relayer uses on Sepolia

---

### 7.2. Release ATT on Sepolia (relayer side)

Script: `scripts/sepolia_release_from_amoy.js`

Provide the data via environment variables:

```powershell
$env:RETURN_USER   = "0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a"
$env:RETURN_AMOUNT = "1000"
$env:RETURN_NONCE  = "1"
```

Then run:

```bash
npx hardhat run scripts/sepolia_release_from_amoy.js --network sepolia
```

Example output:

```text
=== AegisBridge: Release from Amoy -> Sepolia ===
Network         : sepolia
Relayer signer  : 0x36b9...
Bridge (Source) : 0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
Token (ATT)     : 0xDc92...
Recipient       : 0x36b9...
Amount          : 1000 ATT
Return nonce    : 1
User balance before   : 993700.0
Bridge balance before : 1000.0
Release tx: 0x3c82...
Release confirmed in block: 9807064

=== After releaseFromTarget ===
User balance after   : 994700.0
Bridge balance after : 0.0

✅ Release completed for nonce: 1
```

After this:

- The user’s `ATT` balance on Sepolia is back to `994700.0`
- `SourceBridge v2` holds `0` `ATT` (fully released)
- `processedReturnNonces[1]` is now `true`, preventing any replay with the same return nonce

---

## 8. Helper Scripts

### 8.1. `bridge_status.js`

Checks bridge status on a given network.

Example (Sepolia):

```bash
npx hardhat run scripts/bridge_status.js --network sepolia
```

Example output:

```text
=== AegisBridge Status ===
Network   : sepolia
Signer    : 0x36b9...
Token     : 0xDc92...
Bridge    : 0x1B1B61bf...

Saldo ATT user   : 994700.0
Saldo ATT bridge : 0.0
Current nonce di SourceBridge : 1
```

You can adjust the logging to pure English if desired; the key values are:

- User balance
- Bridge balance
- `currentNonce` on `SourceBridge`

---

### 8.2. `amoy_check_balance.js`

Checks the `wATT` balance of the configured owner on Amoy:

```bash
npx hardhat run scripts/amoy_check_balance.js --network amoy
```

Example output:

```text
=== Cek wATT di Amoy ===
Network : amoy
Owner   : 0x36b9...
Token   : 0x9A06...
Balance wATT di Amoy: 2700.0
```

Again, you can rename labels to full English; the logic is simply reading `balanceOf(owner)`.

---

### 8.3. `check_target_nonce.js`

Checks whether a specific forward nonce has been processed on the target bridge (Amoy).

```powershell
$env:CHECK_NONCE = "12"
npx hardhat run scripts/check_target_nonce.js --network amoy
```

Example output:

```text
=== Check nonce on TargetBridge (Amoy) ===
Network : amoy
Signer  : 0x36b9...
Bridge  : 0x682E40B7...
Nonce   : 12
processedNonces(12) = true
```

If `true`, this nonce has already been used for minting `wATT` and cannot be reused.

---

## 9. Notes & Troubleshooting

### 9.1. `Error HH308: Unrecognized positional argument 1000`

Avoid passing arguments directly to `hardhat run` like:

```bash
npx hardhat run scripts/sepolia_lock.js --network sepolia -- 1000
```

Instead, configure the amount using an environment variable, for example:

```powershell
$env:AEGIS_LOCK_AMOUNT = "1000"
npx hardhat run scripts/sepolia_lock.js --network sepolia
```

---

### 9.2. `no matching fragment (lock...)`

This means the function signature you are calling from JS does not match the Solidity function.

In v2, `lock` takes **exactly one argument**:

```solidity
function lock(uint256 amount) external returns (uint256 nonce);
```

So the script must call:

```js
await bridge.lock(amount);
```

and **not** `lock(amount, user)` or any other overload.

---

### 9.3. `execution reverted` in `requestReturnToSource`

The original design tried to call `burnFrom`, which failed because `wATT` does not implement `burnFrom` with the expected permissions.

The v2 design uses:

```solidity
bool ok = wattToken.transferFrom(msg.sender, address(this), amount);
require(ok, "AegisBridge: transferFrom failed");
```

Make sure:

- The user has enough `wATT`
- The user has approved `TargetBridge` as a spender

---

### 9.4. `insufficient funds` during deployment

If you see:

```text
ProviderError: INTERNAL_ERROR: insufficient funds
```

on Amoy, your deployer/relayer address does not have enough test MATIC.  
Send some MATIC on Polygon Amoy testnet to the deployer address and redeploy.

---

## 10. Roadmap

Planned improvements:

- **Relayer v2 (two-way)**
  - Listen to `Locked` events on Sepolia → automatically call `mintFromSource` on Amoy
  - Listen to `ReturnRequested` events on Amoy → automatically call `releaseFromTarget` on Sepolia
- **Frontend (Next.js)**
  - Tabs for `Sepolia → Amoy` and `Amoy → Sepolia`
  - Amount input, slippage display (optional), and clear status messages
- **Monitoring & Analytics**
  - Simple dashboard to display:
    - Total locked `ATT`
    - Total minted `wATT`
    - Processed forward and reverse nonces

---

AegisBridge v2 is now fully capable of:

- Locking canonical `ATT` on Sepolia
- Minting `wATT` on Amoy
- Accepting reverse requests on Amoy
- Releasing `ATT` back on Sepolia using tracked reverse nonces

This makes it a clean, testnet-ready foundation for building a real UI and more advanced, production-grade relayer logic.
