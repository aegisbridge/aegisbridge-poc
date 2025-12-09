# AegisBridge – Testnet v0.3.1

_AegisBridge_ adalah prototipe cross-chain bridge yang fokus ke **keamanan** dan **observability**.  
Versi ini berjalan di **testnet**:

- Ethereum **Sepolia**
- Polygon **Amoy**

Relayer off-chain akan memantau event di source chain dan mengeksekusi aksi di target chain (mint/burn/release).

---

## ✨ Status Versi v0.3.1

Progress saat ini:

- ✅ Kontrak bridge & token testnet telah dideploy di Sepolia & Amoy  
- ✅ Script relayer: `scripts/testnet_relayer.js`
- ✅ Relayer sudah bisa:
  - Membaca konfigurasi dari `.env`
  - Konek ke Sepolia & Amoy via Alchemy RPC
  - Menampilkan alamat deployer/relayer dan log dasar

Contoh output saat dijalankan:

```text
[dotenv@17.2.3] injecting env (9) from .env -- tip: ⚙️  suppress all logs with { quiet: true }
[2025-12-09T08:20:34.605Z] === AegisBridge v0.3.1 Testnet Relayer ===
[2025-12-09T08:20:34.608Z] Sepolia RPC : https://eth-sepolia.g.alchemy.com/v2/...
[2025-12-09T08:20:34.610Z] Amoy RPC    : https://polygon-amoy.g.alchemy.com/v2/...
[2025-12-09T08:20:34.610Z] Deployer/Relayer address: 0x36...
```

---

## 📂 Struktur Project (ringkas)

Struktur bisa kurang lebih seperti ini (sesuaikan dengan repo kamu):

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

## 🛠 Prasyarat

- Node.js **>= 18**
- NPM atau Yarn
- Akun Alchemy / RPC provider lain untuk:
  - Sepolia
  - Polygon Amoy
- Private key wallet untuk deployer/relayer (punya saldo testnet di kedua jaringan)

---

## ⚙️ Setup Project

Clone / buka folder project:

```bash
cd aegisbridge
```

Install dependencies:

```bash
npm install
# atau
yarn install
```

---

## 🔐 Konfigurasi `.env`

Buat file `.env` di root project (jangan di-commit).  
Contoh isi (sesuaikan dengan data kamu):

```env
# RPC endpoints
SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/XXXX"
AMOY_RPC_URL="https://polygon-amoy.g.alchemy.com/v2/XXXX"

# Private key deployer/relayer (tanpa spasi, tanpa tanda kutip 0x di depan kalau script kamu butuh format tertentu)
DEPLOYER_PRIVATE_KEY="0x...."

# Alamat kontrak bridge & token di masing-masing chain
BRIDGE_CONTRACT_SEPOLIA="0x..."
BRIDGE_CONTRACT_AMOY="0x..."
TEST_TOKEN_SEPOLIA="0x..."
TEST_TOKEN_AMOY="0x..."

# Pengaturan tambahan (kalau sudah dipakai di script)
RELAYER_POLL_INTERVAL_MS=5000
NETWORK_ENV="testnet"
```

> **Catatan:**  
> - Jangan pernah commit `.env` ke Git.  
> - Pastikan `.env` sudah masuk ke `.gitignore`.

---

## 🚀 Menjalankan Relayer Testnet

Pastikan `.env` sudah benar. Lalu jalankan:

```bash
node scripts/testnet_relayer.js
```

Kalau sukses, kamu akan melihat:

- Banner versi `AegisBridge v0.3.1 Testnet Relayer`
- URL RPC Sepolia & Amoy
- Alamat deployer/relayer yang dipakai
- Log tambahan saat relayer memantau event (akan diisi/diupdate lagi di versi berikutnya)

Biarkan proses ini berjalan di terminal selama kamu ingin bridge aktif.

---

## 📦 Deploy Kontrak (opsional, untuk setup ulang)

Jika butuh deploy ulang kontrak di testnet (nama script bisa berbeda, sesuaikan):

### Deploy di Sepolia

```bash
npx hardhat run scripts/deploy_sepolia.js --network sepolia
```

- Catat alamat kontrak bridge & token
- Update di `.env`

### Deploy di Amoy

```bash
npx hardhat run scripts/deploy_amoy.js --network amoy
```

- Catat alamat kontrak bridge & token
- Update di `.env` juga

---

## 🧭 Roadmap Dev (singkat)

Yang akan/masih dikerjakan dari versi ini:

- [ ] Tambah logic baca event lock/burn di source chain
- [ ] Eksekusi mint/release di target chain
- [ ] Tambah nonce/idempotency supaya relayer tidak double eksekusi
- [ ] Tambah batas minimal/maksimal amount per bridge
- [ ] Integrasi ke Base (sebagai calon home chain token AegisBridge)

---

## ⚠️ Disclaimer

Versi ini masih **PROTOTYPE TESTNET** dan hanya untuk riset & pengembangan.  
Jangan gunakan dengan dana real / mainnet sebelum:

- Kode direview
- Kontrak diaudit
- Arsitektur security dimatangkan

---

## 📜 Lisensi

Lisensi default: **MIT** (bisa kamu ubah sewaktu-waktu sesuai kebutuhan).
