// frontend/app.js

// Minimal ERC20 ABI fragments
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
];

// View-only ABI for bridge contracts (status & nonces)
const BRIDGE_VIEW_ABI = [
  "function lockNonce() view returns (uint256)",
  "function burnNonce() view returns (uint256)",
  "function paused() view returns (bool)",
];

function makeBridgeAbi(lockMethod, burnMethod) {
  const abi = [];
  if (lockMethod) {
    abi.push(`function ${lockMethod}(uint256 amount, address recipient)`);
  }
  if (burnMethod) {
    abi.push(`function ${burnMethod}(uint256 amount, address recipient)`);
  }
  // optional, kalau bridge punya flag paused()
  abi.push("function paused() view returns (bool)");
  return abi;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let provider = null;
let signer = null;
let currentAccount = null;

const connectButton = document.getElementById("connectButton");
const addressDisplay = document.getElementById("addressDisplay");
const networkDisplay = document.getElementById("networkDisplay");
const currentSideLabel = document.getElementById("currentSideLabel");
const balanceLabel = document.getElementById("balanceLabel");
const lockNonceLabel = document.getElementById("lockNonceLabel");
const burnNonceLabel = document.getElementById("burnNonceLabel");
const pausedLabel = document.getElementById("pausedLabel");
const bridgeButton = document.getElementById("bridgeButton");
const directionSelect = document.getElementById("directionSelect");
const amountInput = document.getElementById("amountInput");
const recipientInput = document.getElementById("recipientInput");
const logArea = document.getElementById("logArea");

function log(message) {
  const ts = new Date().toISOString().split("T")[1].replace("Z", "");
  logArea.textContent += `[${ts}] ${message}\n`;
  logArea.scrollTop = logArea.scrollHeight;
}

function shortAddress(addr) {
  if (!addr) return "-";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

async function ensureProvider() {
  if (!window.ethereum) {
    throw new Error("MetaMask / injected provider is not available.");
  }
  if (!provider) {
    provider = new ethers.BrowserProvider(window.ethereum);
  }
  if (!signer) {
    signer = await provider.getSigner();
  }
  return { provider, signer };
}

async function getChainIdHex() {
  if (!window.ethereum) return null;
  return await window.ethereum.request({ method: "eth_chainId" });
}

async function switchOrAddChain(target) {
  if (!window.ethereum) {
    throw new Error("MetaMask / injected provider is not available.");
  }

  const desiredChainId = target.chainIdHex;
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current === desiredChainId) {
    return;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: desiredChainId }],
    });
  } catch (switchError) {
    // 4902 = chain not added
    if (switchError.code === 4902 && target.rpcUrls && target.rpcUrls.length) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: desiredChainId,
            chainName: target.name,
            rpcUrls: target.rpcUrls,
            nativeCurrency: target.nativeCurrency,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }

  // Reset provider/signer setelah chain change
  provider = null;
  signer = null;
  await sleep(300);
}

async function updateUiState() {
  const chainId = await getChainIdHex();
  let label = "Not connected";
  let pillClass = "pill pill-muted";

  if (chainId === AEGIS_CONFIG.sepolia.chainIdHex) {
    label = "On Sepolia";
    pillClass = "pill pill-ok";
    currentSideLabel.textContent = "Sepolia (ATT side)";
  } else if (chainId === AEGIS_CONFIG.amoy.chainIdHex) {
    label = "On Amoy";
    pillClass = "pill pill-ok";
    currentSideLabel.textContent = "Amoy (wATT side)";
  } else if (chainId) {
    label = `Chain ${chainId}`;
    currentSideLabel.textContent = "Unknown / unsupported chain";
  } else {
    currentSideLabel.textContent = "Disconnected";
  }

  networkDisplay.textContent = label;
  networkDisplay.className = pillClass;

  // default values
  if (!chainId || !currentAccount) {
    balanceLabel.textContent = "-";
    lockNonceLabel.textContent = "-";
    burnNonceLabel.textContent = "-";
    pausedLabel.textContent = "-";
    return;
  }

  try {
    const { signer } = await ensureProvider();
    const addr = await signer.getAddress();

    let tokenAddress = null;
    let bridgeAddress = null;
    let side = null;

    if (chainId === AEGIS_CONFIG.sepolia.chainIdHex) {
      tokenAddress = AEGIS_CONFIG.sepolia.tokenAddress;
      bridgeAddress = AEGIS_CONFIG.sepolia.bridgeAddress;
      side = "sepolia";
    } else if (chainId === AEGIS_CONFIG.amoy.chainIdHex) {
      tokenAddress = AEGIS_CONFIG.amoy.tokenAddress;
      bridgeAddress = AEGIS_CONFIG.amoy.bridgeAddress;
      side = "amoy";
    }

    // Token balance
    if (tokenAddress && tokenAddress.startsWith("0x")) {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const rawBal = await token.balanceOf(addr);
      const decimals = AEGIS_CONFIG.tokenDecimals;
      const formatted = ethers.formatUnits(rawBal, decimals);
      balanceLabel.textContent = `${formatted} tokens`;
    } else {
      balanceLabel.textContent = "-";
    }

    // Reset status labels
    lockNonceLabel.textContent = "-";
    burnNonceLabel.textContent = "-";
    pausedLabel.textContent = "-";

    // Bridge status (lock/burn nonce + paused)
    if (bridgeAddress && bridgeAddress.startsWith("0x")) {
      const bridge = new ethers.Contract(
        bridgeAddress,
        BRIDGE_VIEW_ABI,
        signer
      );

      if (side === "sepolia") {
        try {
          const [lockNonce, paused] = await Promise.all([
            bridge.lockNonce().catch(() => null),
            bridge.paused().catch(() => null),
          ]);
          if (lockNonce !== null) {
            lockNonceLabel.textContent = lockNonce.toString();
          }
          if (paused !== null) {
            pausedLabel.textContent = paused
              ? "Paused (Sepolia)"
              : "Active (Sepolia)";
          }
        } catch (err) {
          console.warn("bridge status (sepolia) error:", err);
        }
      } else if (side === "amoy") {
        try {
          const [burnNonce, paused] = await Promise.all([
            bridge.burnNonce().catch(() => null),
            bridge.paused().catch(() => null),
          ]);
          if (burnNonce !== null) {
            burnNonceLabel.textContent = burnNonce.toString();
          }
          if (paused !== null) {
            pausedLabel.textContent = paused
              ? "Paused (Amoy)"
              : "Active (Amoy)";
          }
        } catch (err) {
          console.warn("bridge status (amoy) error:", err);
        }
      }
    }
  } catch (err) {
    console.warn("updateUiState error:", err);
    balanceLabel.textContent = "-";
    lockNonceLabel.textContent = "-";
    burnNonceLabel.textContent = "-";
    pausedLabel.textContent = "-";
  }
}

// ----------------------
// Connect wallet
// ----------------------
connectButton.addEventListener("click", async () => {
  try {
    if (!window.ethereum) {
      alert("MetaMask is not installed.");
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    currentAccount = accounts[0];
    addressDisplay.textContent = shortAddress(currentAccount);
    log(`Connected as ${currentAccount}`);
    await ensureProvider();
    await updateUiState();
  } catch (err) {
    console.error(err);
    log(`❌ Connect error: ${err.message || err}`);
  }
});

// Listen to network / account changes
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    currentAccount = accounts[0] || null;
    addressDisplay.textContent = currentAccount
      ? shortAddress(currentAccount)
      : "-";
    log("Accounts changed");
    updateUiState();
  });

  window.ethereum.on("chainChanged", () => {
    log("Chain changed");
    provider = null;
    signer = null;
    updateUiState();
  });
}

// ----------------------
// Bridge actions
// ----------------------
bridgeButton.addEventListener("click", async () => {
  try {
    if (!currentAccount) {
      throw new Error("Please connect your wallet first.");
    }

    const amountStr = amountInput.value.trim();
    if (!amountStr || Number(amountStr) <= 0) {
      throw new Error("Amount must be greater than 0.");
    }

    const direction = directionSelect.value;
    if (direction === "SEPOLIA_TO_AMOY") {
      await handleSepoliaToAmoy(amountStr);
    } else {
      await handleAmoyToSepolia(amountStr);
    }

    // refresh status after tx
    await updateUiState();
  } catch (err) {
    console.error(err);
    log(`❌ ${err.message || err}`);
  }
});

async function handleSepoliaToAmoy(amountStr) {
  const cfg = AEGIS_CONFIG.sepolia;
  const decimals = AEGIS_CONFIG.tokenDecimals;

  log("=== Sepolia → Amoy: lock → mint flow ===");

  await switchOrAddChain(cfg);
  await updateUiState();

  const { signer } = await ensureProvider();
  const userAddr = await signer.getAddress();

  const token = new ethers.Contract(cfg.tokenAddress, ERC20_ABI, signer);
  const bridgeAbi = makeBridgeAbi(cfg.lockMethod, null);
  const bridge = new ethers.Contract(cfg.bridgeAddress, bridgeAbi, signer);

  const amount = ethers.parseUnits(amountStr, decimals);
  const recipient =
    recipientInput.value.trim() !== ""
      ? recipientInput.value.trim()
      : userAddr;

  log(`Parsed amount: ${amountStr} (raw=${amount.toString()})`);
  log(`Target recipient on Amoy: ${recipient}`);

  // Step 1: ensure allowance (tahan error RPC)
  let allowance = 0n;
  try {
    allowance = await token.allowance(userAddr, cfg.bridgeAddress);
  } catch (err) {
    console.warn("allowance() RPC error:", err);
    log(
      `⚠️ allowance() RPC error, assuming 0 and forcing approve(). (${err.code || ""} ${
        err.message || err
      })`
    );
    allowance = 0n;
  }

  if (allowance < amount) {
    log("Allowance too low, sending approve()…");
    const approveTx = await token.approve(cfg.bridgeAddress, amount);
    log(`approve() tx: ${approveTx.hash}`);
    await approveTx.wait();
    log("approve() confirmed");
  } else {
    log("Allowance already sufficient, skipping approve()");
  }

  // Step 2: call lock function
  log(`Calling bridge.${cfg.lockMethod}(amount, recipient)…`);
  const tx = await bridge[cfg.lockMethod](amount, recipient);
  log(`lock tx: ${tx.hash}`);
  await tx.wait();
  log("✅ Lock confirmed on Sepolia. Wait for relayer to mint wATT on Amoy.");
}

async function handleAmoyToSepolia(amountStr) {
  const cfg = AEGIS_CONFIG.amoy;
  const decimals = AEGIS_CONFIG.tokenDecimals;

  log("=== Amoy → Sepolia: burn → unlock flow ===");

  await switchOrAddChain(cfg);
  await updateUiState();

  const { signer } = await ensureProvider();
  const userAddr = await signer.getAddress();

  const token = new ethers.Contract(cfg.tokenAddress, ERC20_ABI, signer);
  const bridgeAbi = makeBridgeAbi(null, cfg.burnMethod);
  const bridge = new ethers.Contract(cfg.bridgeAddress, bridgeAbi, signer);

  const amount = ethers.parseUnits(amountStr, decimals);
  const recipient =
    recipientInput.value.trim() !== ""
      ? recipientInput.value.trim()
      : userAddr;

  log(`Parsed amount: ${amountStr} (raw=${amount.toString()})`);
  log(`Target recipient on Sepolia: ${recipient}`);

  // Step 1: ensure allowance (tahan error RPC)
  let allowance = 0n;
  try {
    allowance = await token.allowance(userAddr, cfg.bridgeAddress);
  } catch (err) {
    console.warn("allowance() RPC error:", err);
    log(
      `⚠️ allowance() RPC error, assuming 0 and forcing approve(). (${err.code || ""} ${
        err.message || err
      })`
    );
    allowance = 0n;
  }

  if (allowance < amount) {
    log("Allowance too low, sending approve()…");
    const approveTx = await token.approve(cfg.bridgeAddress, amount);
    log(`approve() tx: ${approveTx.hash}`);
    await approveTx.wait();
    log("approve() confirmed");
  } else {
    log("Allowance already sufficient, skipping approve()");
  }

  // Step 2: call burn function
  log(`Calling bridge.${cfg.burnMethod}(amount, recipient)…`);
  const tx = await bridge[cfg.burnMethod](amount, recipient);
  log(`burn tx: ${tx.hash}`);
  await tx.wait();
  log("✅ Burn confirmed on Amoy. Wait for relayer to unlock ATT on Sepolia.");
}

// Initial UI sync
updateUiState().catch((err) => console.error(err));
