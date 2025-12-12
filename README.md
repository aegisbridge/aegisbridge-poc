# AegisBridge PoC v2 – Sepolia ↔ Polygon Amoy

AegisBridge is a minimal cross-chain bridge proof‑of‑concept (PoC) between **Ethereum Sepolia** and **Polygon Amoy** testnets.

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

Clone repo & install dependencies:

```bash
git clone https://github.com/aegisbridge/aegisbridge-poc.git
cd aegisbridge-poc

npm install
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

# Sepolia RPC (utama + backup)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
SEPOLIA_RPC_URL_1=https://0xrpc.io/sep
SEPOLIA_RPC_URL_2=https://eth-sepolia-testnet.api.pocket.network
SEPOLIA_RPC_URL_3=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_RPC_URL_4=

# Amoy RPC (utama + backup)
AMOY_RPC_URL=https://polygon-amoy-public.nodies.app
AMOY_RPC_URL_1=https://polygon-amoy.drpc.org
AMOY_RPC_URL_2=https://rpc-amoy.polygon.technology
AMOY_RPC_URL_3=https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY


##############################
# === KEYS (JANGAN DI-COMMIT) ===
##############################

# Wallet yang dipakai untuk deploy + test (harus sama di Sepolia & Amoy)
# PENTING: JANGAN PERNAH commit isi ini ke repo publik
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
TEST_SENDER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY


##############################
# === NETWORK / HEALTH ===
##############################

NETWORK_ENV=testnet
HEALTH_PORT=8081


##############################
# === TOKEN & BRIDGE ADDRESSES (AKTIF v2) ===
##############################

# ATT di Sepolia
ATT_SEPOLIA=0xDc925c125DC7b51946031761c1693eA6238Bf3fb

# Source bridge v2 di Sepolia (aktif)
SEPOLIA_SOURCE_BRIDGE=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SEPOLIA_SOURCE_BRIDGE_V2=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SOURCE_BRIDGE_SEPOLIA=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99
SEPOLIA_BRIDGE_ADDRESS=0x1B1B61bfc1922b3ACB0cd52a00F6472A84820D99

# Target bridge v2 di Amoy
AMOY_TARGET_BRIDGE_V2=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
TARGET_BRIDGE_AMOY=0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5

# Test user / recipient
TEST_SENDER_ADDRESS=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a
TEST_RECIPIENT_AMOY=0x36b95469dd6eA8d1e17c6bC65513e8c9f53ec50a

# wATT token di Amoy
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

# Mulai sync dari sekitar block terakhir lock (boleh dimundurkan sedikit)
RELAYER_FROM_BLOCK_SEPOLIA=9810800
RELAYER_FROM_BLOCK_AMOY=30299500

RELAYER_DISABLE_SYNC=false
RELAYER_POLL_INTERVAL_MS=5000
RELAYER_MINT_GAS_LIMIT=300000
RELAYER_UNLOCK_GAS_LIMIT=300000


##############################
# === AUTO POOL / TOPUP CONFIG ===
##############################

# Range scan eth_getLogs (mis. max 10 block untuk tier free)
SEPOLIA_LOG_MAX_RANGE=10

# Block kira-kira awal SourceBridge v2 mulai dipakai lock
SEPOLIA_LOCKED_FROM_BLOCK=9812700

# Batas maksimal topup otomatis (unit wATT, bukan wei)
AMOY_BRIDGE_TOPUP_MAX_WATT=15000

# Optional: nilai tetap untuk topup manual
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
# === LEGACY V1 (OPSIONAL) ===
##############################

BRIDGE_CONTRACT_SEPOLIA=0x4Fb169EDA4C92de96634595d36571637CFbb4437
BRIDGE_CONTRACT_AMOY=0xA9E3bf15148EA340e76B851483486ca546eD8018
```

> Note: alamat ATT/wATT/bridge di atas sudah diisi dengan **alamat v2 aktif** di environment pengujian ini. Sesuaikan jika kamu deploy ulang.

---

## 4. Running the Relayer

Relayer adalah Node.js service yang:

- Listen event `Locked` di `SourceBridge` (Sepolia), lalu memanggil `mintFromSource` di `TargetBridge` (Amoy)
- Listen event `ReturnRequested` di `TargetBridge` (Amoy), lalu memanggil `releaseFromTarget` di `SourceBridge` (Sepolia)

### 4.1 Run relayer secara lokal (dev)

```bash
node scripts/testnet_relayer.js
```

Kamu akan melihat log kurang lebih seperti:

```text
[RPC][sepolia] dipakai:
  - (primary) https://eth-sepolia.g.alchemy.com/v2/...
[RPC][amoy] dipakai:
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

### 4.2 Run relayer di VPS dengan PM2

Di VPS (misal user `qolandanii`, folder `~/aegisbridge-poc`):

```bash
cd ~/aegisbridge-poc

# Start relayer
pm2 start scripts/testnet_relayer.js --name aegisbridge-relayer-testnet

# Lihat log
pm2 logs aegisbridge-relayer-testnet --lines 80

# Simpan process list agar auto-start saat reboot
pm2 save
```

Untuk menghentikan:

```bash
pm2 stop aegisbridge-relayer-testnet
```

---

## 5. How to Test the Bridge (Forward + Reverse)

Section ini jelasin alur uji coba end‑to‑end:

- **Forward bridge:** Sepolia (ATT) → Amoy (wATT)
- **Reverse bridge:** Amoy (wATT) → Sepolia (ATT)

Semua contoh command di bawah diasumsikan dijalankan dari folder project, misal di Windows:

```bash
PS D:\aegisbridge>
```

### 5.0 Prerequisites Singkat

- Kontrak sudah dideploy (ATT, wATT, SourceBridge v2, TargetBridge v2)
- `.env` sudah diisi seperti di atas
- Relayer **sudah berjalan** (lihat section 4)

---

### 5.1 Forward Bridge: Sepolia → Amoy

Alur: **lock ATT di Sepolia** → relayer detect event `Locked` → **mint wATT di Amoy** ke wallet user.

#### 5.1.1 Cek saldo & allowance ATT di Sepolia

```bash
node scripts/check_att_state.js
```

Contoh output:

```text
Wallet        : 0x36b9...
ATT address   : 0xDc925c125DC7b51946031761c1693eA6238Bf3fb
Symbol/dec    : ATT / 18
Balance       : 982700.0
Allowance --> Bridge: 0.0
```

Jika **allowance = 0**, lanjut ke approve.

#### 5.1.2 Approve ATT untuk SourceBridge

Script ini approve ATT ke `SEPOLIA_SOURCE_BRIDGE` (SourceBridge v2):

```bash
# Contoh: approve 1000 ATT
node scripts/approve_att_for_bridge.js 1000
```

Contoh output:

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

#### 5.1.3 Lock ATT dari Sepolia ke Amoy

Script ini:

- Menggunakan `TEST_SENDER_PRIVATE_KEY` di Sepolia
- Memanggil `SourceBridge.lock(amount)`
- Mengirim event `Locked(nonce, user, amount)`

```bash
node scripts/send_test_from_sepolia.js
```

Contoh output:

```text
Sender address : 0x36b9...
Sepolia RPC    : https://eth-sepolia.g.alchemy.com/v2/...
Recipient (Amoy): 0x36b9...
Amount           : 1000000000000000000000
lock() inputs: [ 'amount:uint256' ]
Memanggil: lock(amount)
Tx sent: 0xe9cafa957c044879e0b0bd59f4b8505e03ba9f1ab58719c4ee360b1e5bcbf875
Tx confirmed in block: 9821907
```

Kamu bisa menjalankan lagi untuk test kedua:

```bash
node scripts/send_test_from_sepolia.js
```

---

#### 5.1.4 Relayer memproses `Locked` → `mintFromSource` di Amoy

Di log relayer (PM2) akan muncul pola seperti:

```text
[Forward[Past]] New Locked event: nonce=18, user=0x36b9..., amount=1000.0 ATT
[Forward[Past]] Calling mintFromSource on Amoy: to=0x36b9..., amount=1000.0 ATT, nonce=18
[Forward[Past]] mintFromSource(nonce=18) tx sent: 0x2d8dbc51...
[Forward[Past]] mintFromSource(nonce=18) tx confirmed in block 30374171, status=1
```

Artinya relayer sudah sukses mint wATT untuk user di Amoy.

---

#### 5.1.5 Cek wATT di Amoy (wallet + pool)

**Cek saldo wATT wallet user:**

```bash
node scripts/check_watt_wallet_amoy.js
```

Contoh output:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
Wallet     : 0x36b9...
Balance    : 2030 wATT di 0x36b9...
```

**Cek saldo wATT di pool bridge (TargetBridge):**

```bash
node scripts/check_watt_amoy.js
```

Contoh output:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4
Pool addr  : 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
Token   : wATT ( 0x9A0687... )
Balance : 1670.0 wATT di 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
```

Forward flow dinyatakan **sukses** jika:

- Saldo ATT di Sepolia **berkurang** sesuai amount yang di‑lock
- Saldo wATT di wallet Amoy **bertambah**
- Saldo wATT di pool Amoy berubah konsisten dengan histori lock/return

---

### 5.2 Reverse Bridge: Amoy → Sepolia

Alur: **burn/lock wATT di Amoy** via `TargetBridge.requestReturnToSource` → relayer detect event `ReturnRequested` → **release ATT di Sepolia** ke user.

#### 5.2.1 Approve wATT untuk TargetBridge di Amoy

Script ini approve wATT ke `TARGET_BRIDGE_AMOY`:

```bash
node scripts/approve_watt_for_bridge.js 1000
```

Contoh output:

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

#### 5.2.2 Request return ke Sepolia

Script ini memanggil `TargetBridge.requestReturnToSource(amount)` di Amoy:

```bash
node scripts/request_return_to_sepolia.js 1000
```

Contoh output:

```text
RPC Amoy      : https://polygon-amoy-public.nodies.app
Wallet        : 0x36b9...
TargetBridge  : 0x3438B1700C8c08eB3F7eF9bc2D5115bE1B0343A5
wATT token    : 0x9A068771D7FcdB50b1ce41dfFb184099b5f32Dc4 (wATT/18)
Current wATT  : 2030.0
Fungsi kandidat di TargetBridge: [ 'requestReturnToSource' ]
Dipilih fungsi: requestReturnToSource(amount)
Memanggil: requestReturnToSource(1000) pada TargetBridge...
Tx sent: 0x0b2bdce6f4861d037039132cf0ef2a41036ef5025bc2934f0d26ec201dc8f186
Tx confirmed in block: 30375411 status: 1
```

Setelah ini, event `ReturnRequested` sudah emit di Amoy.

---

#### 5.2.3 Relayer memproses `ReturnRequested` → `releaseFromTarget` di Sepolia

Di log relayer akan muncul pola seperti:

```text
[Reverse[Past]] New ReturnRequested: nonce=..., user=0x36b9..., amount=1000.0
[Reverse[Past]] Calling releaseFromTarget on Sepolia ...
[Reverse[Past]] releaseFromTarget(...) tx sent: 0x...
[Reverse[Past]] releaseFromTarget(...) tx confirmed in block ..., status=1
```

Ini artinya relayer sudah melepas ATT di Sepolia ke user.

---

#### 5.2.4 Verifikasi hasil: wATT turun, ATT naik

**Cek saldo wATT wallet di Amoy:**

```bash
node scripts/check_watt_wallet_amoy.js
```

Contoh setelah reverse:

```text
RPC Amoy   : https://polygon-amoy-public.nodies.app
wATT token : 0x9A0687...
Wallet     : 0x36b9...
Balance    : 1030 wATT di 0x36b9...
```

**Cek saldo ATT di Sepolia:**

```bash
node scripts/check_att_state.js
```

Contoh:

```text
Wallet        : 0x36b9...
ATT address   : 0xDc925c125DC7b51946031761c1693eA6238Bf3fb
Symbol/dec    : ATT / 18
Balance       : 977670.0
Allowance --> Bridge: 994970.0
```

Jika:

- wATT di Amoy **berkurang** sesuai amount yang di‑return
- ATT di Sepolia **bertambah / kembali** konsisten dengan histori lock/return

maka **reverse flow Amoy → Sepolia sudah berjalan dengan benar.**

---

## 6. Relayer’s Role (Ringkasan)

**Forward (Sepolia → Amoy):**

1. Listen event `Locked(nonce, user, amount)` di `SourceBridge` (Sepolia).
2. Cek ke `TargetBridge` apakah nonce sudah pernah diproses.
3. Jika belum, panggil `mintFromSource(user, amount, nonce)` di Amoy.
4. Tandai nonce sebagai processed di `TargetBridge` (anti double‑mint).

**Reverse (Amoy → Sepolia):**

1. Listen event `ReturnRequested(nonce, user, amount)` di `TargetBridge` (Amoy).
2. Cek status nonce di `SourceBridge` (Sepolia).
3. Panggil `releaseFromTarget(user, amount, nonce)` untuk melepas ATT.
4. Tandai nonce sebagai processed di `SourceBridge` (idempotent).

Selama relayer **online** dan kedua RPC sehat, semua test di section 5 dapat dijalankan berulang untuk demo / R&D.

---

## 7. Troubleshooting (Singkat)

Beberapa error umum yang mungkin muncul:

### 7.1 `execution reverted (unknown custom error)` saat lock

- Cek apakah:
  - Saldo ATT cukup di Sepolia.
  - Allowance ke `SEPOLIA_SOURCE_BRIDGE` cukup besar.
- Gunakan:
  ```bash
  node scripts/check_att_state.js
  ```

### 7.2 Error 429 dari Alchemy (`Your app has exceeded its compute units per second capacity`)

- Artinya rate limit tercapai.
- Solusi:
  - Tambah backup RPC (`SEPOLIA_RPC_URL_1/2/3`, `AMOY_RPC_URL_1/2/3`).
  - Kurangi interval polling (`RELAYER_POLL_INTERVAL_MS`) jika terlalu agresif.
  - Atau upgrade plan di provider RPC.

### 7.3 Relayer tidak menemukan network (`JsonRpcProvider failed to detect network and cannot start up`)

- Cek apakah `SEPOLIA_RPC_URL` dan `AMOY_RPC_URL` valid.
- Test dengan script kecil:
  ```bash
  node scripts/test_rpc_amoy.js
  ```

---

## 8. Disclaimer

AegisBridge PoC v2 ini dibuat untuk **tujuan riset & edukasi saja** di testnet.  
Jangan gunakan desain ini **sebagai‑is** untuk mainnet tanpa audit keamanan yang serius dan review arsitektur yang lebih dalam (signing, relayer set, fee model, dsb.).
