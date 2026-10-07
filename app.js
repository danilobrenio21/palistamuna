// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// 1. Firebase Initialization
const firebaseConfig = {
  apiKey: "AIzaSyDoI1aKjSNnvLpWbpWcjFHVCdLcuWD4MaI",
  authDomain: "palistamuna-d2bb1.firebaseapp.com",
  projectId: "palistamuna-d2bb1",
  storageBucket: "palistamuna-d2bb1.firebasestorage.app",
  messagingSenderId: "1076687838949",
  appId: "1:1076687838949:web:8d31ae67f7d429da2f7e0c"
};

// Initialize Firebase only once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Safely handle persistence without crashing in Safari Private Browsing mode
if (typeof window !== 'undefined' && window.indexedDB) {
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.warn("Firestore offline persistence skipped (Private/Restricted browsing):", err.code);
  });
}

// Vault ID Anchor
let activeVaultId = localStorage.getItem("palista_vault_id") || null;
let utangCol = null;
let settingsDoc = null;
let recordsUnsub = null;
let settingsUnsub = null;

// Product Catalog
const BARCODE_CATALOG = {
  "4800016644800": { name: "Lucky Me Instant Pancit Canton Kalamansi", price: 18 },
  "4800016654809": { name: "Lucky Me Instant Pancit Canton Original", price: 18 },
  "4801981110034": { name: "555 Sardines in Tomato Sauce 155g", price: 26 },
  "4800016054111": { name: "Mega Sardines Red 155g", price: 28 },
  "4800110024447": { name: "San Miguel Pale Pilsen 330ml", price: 65 },
  "4800016643018": { name: "Lucky Me Beef Mami", price: 15 }
};

// Application State
let records = [];
let settings = { storeName: "Tindahan", birthYear: "", gcash: "", storeId: "", maya: "", pin: "", creditLimit: 0 };
let activeFilter = "all";
let currentView = "ledger";
let html5QrCode = null;
let enteredPin = "";

// Element Selectors
const ledgerBody = document.getElementById("ledger-body");
const sukiBody = document.getElementById("suki-body");
const emptyState = document.getElementById("empty-state");
const totalCollectibleEl = document.getElementById("total-collectible");
const totalOverdueEl = document.getElementById("total-overdue");
const totalCollectedEl = document.getElementById("total-collected");
const activeSukiEl = document.getElementById("active-suki-count");
const overdueCountEl = document.getElementById("overdue-count");
const searchInput = document.getElementById("search-input");
const filterTabs = document.querySelectorAll(".tab-btn");

const sectionLedger = document.getElementById("section-ledger");
const sectionSuki = document.getElementById("section-suki");
const btnToggleView = document.getElementById("btn-toggle-view");
const btnToggleText = document.getElementById("btn-toggle-text");

// Modals & Sheets
const modalAdd = document.getElementById("modal-add");
const modalPayment = document.getElementById("modal-payment");
const modalReminder = document.getElementById("modal-reminder");
const modalSettings = document.getElementById("modal-settings");
const modalClosing = document.getElementById("modal-closing");
const modalPrivacy = document.getElementById("modal-privacy");
const modalRecovery = document.getElementById("modal-recovery");
const modalPrintHub = document.getElementById("modal-print-hub");
const printableContract = document.getElementById("printable-contract");
const printableSignage = document.getElementById("printable-signage");
const pinScreen = document.getElementById("pin-screen");
const toast = document.getElementById("toast");

// Store ID Calculation Fields
const birthYearInput = document.getElementById("setting-birth-year");
const phoneInput = document.getElementById("setting-gcash");
const computedStoreIdBadge = document.getElementById("setting-computed-store-id");

// AI Elements
const aiChatBtn = document.getElementById("ai-chat-btn");
const aiChatWindow = document.getElementById("ai-chat-window");
const btnCloseAi = document.getElementById("btn-close-ai");
const aiMessages = document.getElementById("ai-messages");
const aiChatForm = document.getElementById("ai-chat-form");
const aiInput = document.getElementById("ai-input");

// Tour Steps
const tourSteps = [
  {
    targetId: null,
    title: "Welcome to Palista Muna!",
    desc: "A quick walkthrough to help you maximize features and eliminate store credit losses."
  },
  {
    targetId: "btn-open-add",
    title: "+ Add Record",
    desc: "Record new credit entries here. Set per-customer credit limits to prevent financial defaults."
  },
  {
    targetId: "btn-toggle-view",
    title: "Customer Directory",
    desc: "View customer credit reliability scores (Good Payer, Follow-Up Needed, or High Risk)."
  },
  {
    targetId: "btn-open-print-hub",
    title: "Forms & Posters Hub",
    desc: "Print or download borrower credit agreements and the storefront signage poster as PDF files."
  },
  {
    targetId: "btn-open-closing",
    title: "Daily Summary",
    desc: "At closing time, tap here to review today's collected cash and customers due tomorrow."
  },
  {
    targetId: "btn-open-settings",
    title: "Settings & Security",
    desc: "Manage your 6-digit Store ID, 4-digit PIN lock, and GCash/Maya payment details."
  }
];

let currentTourStep = 0;
const tourOverlay = document.getElementById("tour-overlay");
const tourStepBadge = document.getElementById("tour-step-badge");
const tourTitle = document.getElementById("tour-title");
const tourDesc = document.getElementById("tour-desc");
const btnTourPrev = document.getElementById("btn-tour-prev");
const btnTourNext = document.getElementById("btn-tour-next");
const btnTourSkip = document.getElementById("btn-tour-skip");

// Neon Ripple Touch Feedback
document.addEventListener("click", (e) => {
  const target = e.target.closest(".interactive-fx, .btn, .btn-preset, .tab-btn, .table-btn, .btn-key, .ai-fab, .ai-chip");
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "ripple";

  const size = Math.max(rect.width, rect.height);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  target.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
});

function showToast(msg) {
  toast.innerText = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

function getRecordStatus(record) {
  const balance = record.amount - (record.paid || 0);
  if (balance <= 0) return "settled";
  const today = new Date().toISOString().split("T")[0];
  return record.dueDate < today ? "overdue" : "pending";
}

// Compute 6-Digit Store ID: Last 3 digits of Year + Last 3 digits of Mobile Phone
function computeStoreId(year, phone) {
  const cleanYear = (year || "").toString().trim();
  const cleanPhone = (phone || "").toString().trim();

  if (cleanYear.length >= 3 && cleanPhone.length >= 3) {
    const yearPart = cleanYear.slice(-3);
    const phonePart = cleanPhone.slice(-3);
    return `${yearPart}${phonePart}`;
  }
  return "------";
}

function updateStoreIdPreview() {
  if (birthYearInput && phoneInput && computedStoreIdBadge) {
    const calcId = computeStoreId(birthYearInput.value, phoneInput.value);
    computedStoreIdBadge.innerText = calcId;
  }
}

if (birthYearInput) birthYearInput.addEventListener("input", updateStoreIdPreview);
if (phoneInput) phoneInput.addEventListener("input", updateStoreIdPreview);

// Attach Active Vault Listeners
function bindVault(vaultId) {
  if (recordsUnsub) recordsUnsub();
  if (settingsUnsub) settingsUnsub();

  activeVaultId = vaultId;
  localStorage.setItem("palista_vault_id", vaultId);

  utangCol = db.collection("vaults").doc(vaultId).collection("records");
  settingsDoc = db.collection("vaults").doc(vaultId).collection("config").doc("store_settings");

  recordsUnsub = utangCol.onSnapshot((snapshot) => {
    records = [];
    snapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });
    renderLedger();
    renderSukiDirectory();
  }, (err) => {
    console.warn("Records snapshot listener warning:", err);
  });

  settingsUnsub = settingsDoc.onSnapshot((doc) => {
    if (doc.exists) {
      settings = doc.data();
      const storeNameDisplay = settings.storeName || "Tindahan";
      
      const printStoreEl = document.getElementById("print-store-name");
      const signStoreEl = document.getElementById("signage-store-name");
      if (printStoreEl) printStoreEl.innerText = storeNameDisplay;
      if (signStoreEl) signStoreEl.innerText = storeNameDisplay.toUpperCase();
      
      if (settings.pin && settings.pin.length === 4) {
        const isUnlocked = sessionStorage.getItem("pm_unlocked");
        if (!isUnlocked && pinScreen) {
          enteredPin = "";
          updatePinDots();
          pinScreen.classList.remove("hidden");
        }
      }
    }
  }, (err) => {
    console.warn("Settings snapshot listener warning:", err);
  });
}

// PIN Screen Handling
window.handlePinInput = function(num) {
  if (enteredPin.length < 4) {
    enteredPin += num;
    updatePinDots();
    if (enteredPin.length === 4) setTimeout(verifyPin, 100);
  }
};

window.deletePinDigit = function() {
  enteredPin = enteredPin.slice(0, -1);
  updatePinDots();
};

window.clearPin = function() {
  enteredPin = "";
  updatePinDots();
};

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) {
      if (i < enteredPin.length) dot.classList.add("filled");
      else dot.classList.remove("filled");
    }
  }
}

function verifyPin() {
  if (settings.pin && enteredPin === settings.pin) {
    sessionStorage.setItem("pm_unlocked", "true");
    if (pinScreen) pinScreen.classList.add("hidden");
    showToast("Welcome back! Unlocked your records.");
  } else {
    showToast("Incorrect PIN code! Please try again.");
    enteredPin = "";
    updatePinDots();
  }
}

// Initial Startup & Auth Isolation
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    try {
      await auth.signInAnonymously();
    } catch (e) {
      console.warn("Anonymous authentication error:", e);
    }
    return;
  }

  if (!activeVaultId) {
    activeVaultId = user.uid;
    localStorage.setItem("palista_vault_id", activeVaultId);
  }

  bindVault(activeVaultId);
});

// Recovery Modal Handlers
const btnShowRec = document.getElementById("btn-show-recovery");
if (btnShowRec) {
  btnShowRec.addEventListener("click", () => {
    if (pinScreen) pinScreen.classList.add("hidden");
    if (modalRecovery) modalRecovery.classList.remove("hidden");
  });
}

const linkOpenRec = document.getElementById("link-open-recovery");
if (linkOpenRec) {
  linkOpenRec.addEventListener("click", (e) => {
    e.preventDefault();
    if (modalRecovery) modalRecovery.classList.remove("hidden");
  });
}

const btnCloseRec = document.getElementById("btn-close-recovery");
if (btnCloseRec) btnCloseRec.addEventListener("click", () => modalRecovery.classList.add("hidden"));

const btnCancelRec = document.getElementById("btn-cancel-recovery");
if (btnCancelRec) btnCancelRec.addEventListener("click", () => modalRecovery.classList.add("hidden"));

// Account Recovery by 6-Digit Store ID + 4-Digit PIN
const formRecovery = document.getElementById("form-recovery");
if (formRecovery) {
  formRecovery.addEventListener("submit", async (e) => {
    e.preventDefault();
    const storeId = document.getElementById("rec-store-id").value.trim();
    const pin = document.getElementById("rec-pin").value.trim();

    if (storeId.length !== 6) {
      alert("Please enter your exact 6-digit Store ID (e.g. 988128).");
      return;
    }

    try {
      const targetVaultId = `store_${storeId}`;
      const testDoc = await db.collection("vaults").doc(targetVaultId).collection("config").doc("store_settings").get();

      if (!testDoc.exists) {
        alert("No store found matching this Store ID. Please verify your details.");
        return;
      }

      const vaultSettings = testDoc.data();
      if (vaultSettings.pin !== pin) {
        alert("Incorrect 4-digit PIN for this Store ID!");
        return;
      }

      bindVault(targetVaultId);
      sessionStorage.setItem("pm_unlocked", "true");
      modalRecovery.classList.add("hidden");
      showToast("Success! Restored all store records.");
    } catch (err) {
      alert("Error during recovery: " + err.message);
    }
  });
}

function renderLedger() {
  if (!ledgerBody) return;
  const query = (searchInput ? searchInput.value : "").toLowerCase();
  ledgerBody.innerHTML = "";

  let totalCollectible = 0;
  let totalOverdue = 0;
  let totalCollected = 0;
  let overdueCount = 0;
  let pendingCount = 0;
  let counts = { all: records.length, overdue: 0, pending: 0, settled: 0 };

  const filtered = records.filter(r => {
    const status = getRecordStatus(r);
    const balance = r.amount - (r.paid || 0);

    counts[status]++;
    if (balance > 0) {
      totalCollectible += balance;
      if (status === "overdue") {
        totalOverdue += balance;
        overdueCount++;
      } else {
        pendingCount++;
      }
    }
    totalCollected += (r.paid || 0);

    const matchesFilter = (activeFilter === "all" || status === activeFilter);
    const matchesSearch = (r.name || "").toLowerCase().includes(query) || (r.phone || "").includes(query);
    return matchesFilter && matchesSearch;
  });

  const countAllEl = document.getElementById("count-all");
  const countOverdueEl = document.getElementById("count-overdue");
  const countPendingEl = document.getElementById("count-pending");
  const countSettledEl = document.getElementById("count-settled");

  if (countAllEl) countAllEl.innerText = counts.all;
  if (countOverdueEl) countOverdueEl.innerText = counts.overdue;
  if (countPendingEl) countPendingEl.innerText = counts.pending;
  if (countSettledEl) countSettledEl.innerText = counts.settled;

  if (totalCollectibleEl) totalCollectibleEl.innerText = `₱${totalCollectible.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  if (totalOverdueEl) totalOverdueEl.innerText = `₱${totalOverdue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  if (totalCollectedEl) totalCollectedEl.innerText = `₱${totalCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  if (activeSukiEl) activeSukiEl.innerText = `${pendingCount + overdueCount} active accounts`;
  if (overdueCountEl) overdueCountEl.innerText = `${overdueCount} overdue accounts`;

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");

  filtered.forEach(r => {
    const balance = r.amount - (r.paid || 0);
    const status = getRecordStatus(r);
    const tr = document.createElement("tr");

    let badgeClass = status === "overdue" ? "badge-overdue" : (status === "settled" ? "badge-settled" : "badge-active");
    let statusLabel = status === "overdue" ? "Overdue" : (status === "settled" ? "Settled" : "Active");

    tr.innerHTML = `
      <td>
        <div class="suki-name">${r.name}</div>
        <div class="suki-phone">${r.phone}</div>
      </td>
      <td>${r.items || "—"}</td>
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700;">
        ₱${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}
        ${(r.paid || 0) > 0 ? `<div style="font-size: 11px; color: var(--text-muted)">Paid: ₱${r.paid}</div>` : ''}
      </td>
      <td>${r.dueDate}</td>
      <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
      <td style="text-align: right;">
        <div class="table-actions">
          ${balance > 0 ? `<button class="table-btn interactive-fx" onclick="openPayment('${r.id}')">Pay</button>` : ''}
          ${balance > 0 ? `<button class="table-btn remind interactive-fx" onclick="openReminder('${r.id}')">Remind</button>` : ''}
          <button class="table-btn interactive-fx" onclick="deleteRecord('${r.id}')">Delete</button>
        </div>
      </td>
    `;
    ledgerBody.appendChild(tr);
  });
}

function renderSukiDirectory() {
  if (!sukiBody) return;
  sukiBody.innerHTML = "";
  const customers = {};

  records.forEach(r => {
    const key = (r.phone || r.name).trim();
    if (!customers[key]) {
      customers[key] = {
        name: r.name,
        phone: r.phone,
        totalBalance: 0,
        totalPaid: 0,
        overdueCount: 0,
        customLimit: r.manualLimit || 0,
        totalRecords: 0
      };
    }
    const balance = r.amount - (r.paid || 0);
    customers[key].totalBalance += balance;
    customers[key].totalPaid += (r.paid || 0);
    customers[key].totalRecords += 1;
    if (r.manualLimit) customers[key].customLimit = r.manualLimit;

    if (getRecordStatus(r) === "overdue") {
      customers[key].overdueCount += 1;
    }
  });

  const sukiList = Object.values(customers);

  if (sukiList.length === 0) {
    sukiBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted)">No customer profiles recorded yet.</td></tr>`;
    return;
  }

  sukiList.forEach(c => {
    let scoreBadge = `<span class="badge badge-active">Good Payer (Suki)</span>`;
    if (c.overdueCount >= 2) {
      scoreBadge = `<span class="badge badge-overdue">High Risk (Delinquent)</span>`;
    } else if (c.overdueCount === 1) {
      scoreBadge = `<span class="badge" style="background: rgba(255, 170, 0, 0.15); color: #ffaa00; border: 1px solid rgba(255, 170, 0, 0.3);">Follow-Up Needed</span>`;
    }

    const effectiveLimit = c.customLimit > 0 ? `₱${c.customLimit.toFixed(2)} (Custom)` : (settings.creditLimit > 0 ? `₱${settings.creditLimit.toFixed(2)} (Default)` : 'No Cap');

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="suki-name">${c.name}</div>
        <div class="suki-phone">${c.phone}</div>
      </td>
      <td>${scoreBadge}</td>
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: ${c.totalBalance > 0 ? '#ff3860' : 'var(--accent-lime)'}">
        ₱${c.totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
      </td>
      <td style="font-size: 11px; color: var(--text-muted);">${effectiveLimit}</td>
      <td style="font-family: 'JetBrains Mono', monospace; color: var(--text-muted)">
        ₱${c.totalPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}
      </td>
      <td>${c.totalRecords} credit entries</td>
    `;
    sukiBody.appendChild(tr);
  });
}

// Toggle Views
if (btnToggleView) {
  btnToggleView.addEventListener("click", () => {
    if (currentView === "ledger") {
      currentView = "suki";
      if (sectionLedger) sectionLedger.classList.add("hidden");
      if (sectionSuki) sectionSuki.classList.remove("hidden");
      if (btnToggleText) btnToggleText.innerText = "View Ledger";
      renderSukiDirectory();
    } else {
      currentView = "ledger";
      if (sectionSuki) sectionSuki.classList.add("hidden");
      if (sectionLedger) sectionLedger.classList.remove("hidden");
      if (btnToggleText) btnToggleText.innerText = "Customer Directory";
      renderLedger();
    }
  });
}

// Quick Item Tally
document.querySelectorAll(".tally-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const itemName = btn.dataset.name;
    const price = parseFloat(btn.dataset.price);

    const amountInput = document.getElementById("add-amount");
    const itemsInput = document.getElementById("add-items");

    const currentAmt = parseFloat(amountInput.value) || 0;
    amountInput.value = (currentAmt + price).toFixed(2);

    if (itemsInput.value.trim().length > 0) {
      itemsInput.value += `, ${itemName}`;
    } else {
      itemsInput.value = itemName;
    }
    checkCreditLimit();
  });
});

// Per-Customer Manual Credit Limit Check
function checkCreditLimit() {
  const manualLimitInput = parseFloat(document.getElementById("add-manual-limit").value);
  const defaultLimit = parseFloat(settings.creditLimit) || 0;
  
  const activeLimit = !isNaN(manualLimitInput) && manualLimitInput > 0 ? manualLimitInput : defaultLimit;
  const warningEl = document.getElementById("credit-limit-warning");
  if (activeLimit <= 0) {
    if (warningEl) warningEl.classList.add("hidden");
    return;
  }

  const phone = document.getElementById("add-phone").value.trim();
  const name = document.getElementById("add-name").value.trim().toLowerCase();
  const addingAmt = parseFloat(document.getElementById("add-amount").value) || 0;

  let existingBal = 0;
  records.forEach(r => {
    if ((phone && r.phone === phone) || (name && (r.name || "").toLowerCase() === name)) {
      existingBal += (r.amount - (r.paid || 0));
    }
  });

  if (warningEl) {
    if (existingBal + addingAmt > activeLimit) {
      warningEl.innerHTML = `⚠️ <strong>Warning:</strong> Exceeds ₱${activeLimit.toFixed(2)} limit for this customer! Total balance will be: <strong>₱${(existingBal + addingAmt).toFixed(2)}</strong>`;
      warningEl.classList.remove("hidden");
    } else {
      warningEl.classList.add("hidden");
    }
  }
}

const addPhoneEl = document.getElementById("add-phone");
const addNameEl = document.getElementById("add-name");
const addAmountEl = document.getElementById("add-amount");
const addManualLimitEl = document.getElementById("add-manual-limit");

if (addPhoneEl) addPhoneEl.addEventListener("input", checkCreditLimit);
if (addNameEl) addNameEl.addEventListener("input", checkCreditLimit);
if (addAmountEl) addAmountEl.addEventListener("input", checkCreditLimit);
if (addManualLimitEl) addManualLimitEl.addEventListener("input", checkCreditLimit);

// Barcode Scanner
const btnToggleScanner = document.getElementById("btn-toggle-scanner");
const btnStopScanner = document.getElementById("btn-stop-scanner");
const scannerWrapper = document.getElementById("scanner-wrapper");

if (btnToggleScanner) {
  btnToggleScanner.addEventListener("click", () => {
    if (scannerWrapper) scannerWrapper.classList.remove("hidden");
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

    const qrConfig = { fps: 10, qrbox: { width: 250, height: 150 } };
    html5QrCode.start(
      { facingMode: "environment" },
      qrConfig,
      (decodedText) => {
        const product = BARCODE_CATALOG[decodedText];
        const amountInput = document.getElementById("add-amount");
        const itemsInput = document.getElementById("add-items");

        if (product) {
          const curAmt = parseFloat(amountInput.value) || 0;
          amountInput.value = (curAmt + product.price).toFixed(2);
          itemsInput.value = itemsInput.value ? `${itemsInput.value}, ${product.name}` : product.name;
          showToast(`Scanned: ${product.name} (+₱${product.price})`);
        } else {
          itemsInput.value = itemsInput.value ? `${itemsInput.value}, Barcode: ${decodedText}` : `Barcode: ${decodedText}`;
          showToast(`Barcode scanned: ${decodedText}`);
        }
        checkCreditLimit();
        stopScanner();
      },
      () => {}
    ).catch(err => {
      alert("Camera permission denied: " + err);
      if (scannerWrapper) scannerWrapper.classList.add("hidden");
    });
  });
}

function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {
      if (scannerWrapper) scannerWrapper.classList.add("hidden");
    }).catch(console.error);
  } else {
    if (scannerWrapper) scannerWrapper.classList.add("hidden");
  }
}

if (btnStopScanner) btnStopScanner.addEventListener("click", stopScanner);

// Due Date Presets
document.querySelectorAll(".btn-preset:not(.tally-btn)").forEach(btn => {
  btn.addEventListener("click", () => {
    const today = new Date();
    if (btn.dataset.days) today.setDate(today.getDate() + parseInt(btn.dataset.days));
    else if (btn.dataset.preset === "15th") {
      today.setDate(15);
      if (new Date().getDate() >= 15) today.setMonth(today.getMonth() + 1);
    } else if (btn.dataset.preset === "30th") {
      today.setDate(30);
      if (new Date().getDate() >= 30) today.setMonth(today.getMonth() + 1);
    }
    const dueEl = document.getElementById("add-due-date");
    if (dueEl) dueEl.value = today.toISOString().split("T")[0];
  });
});

// Daily Closing Summary Report
const btnOpenClosing = document.getElementById("btn-open-closing");
if (btnOpenClosing) {
  btnOpenClosing.addEventListener("click", () => {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    let totalActiveCollectible = 0;
    let overdueCollectible = 0;
    let dueTomorrowList = [];

    records.forEach(r => {
      const bal = r.amount - (r.paid || 0);
      if (bal > 0) {
        totalActiveCollectible += bal;
        if (r.dueDate < today) overdueCollectible += bal;
        if (r.dueDate === tomorrowStr) dueTomorrowList.push(`${r.name} (₱${bal.toFixed(2)})`);
      }
    });

    const report = `📊 PALISTA MUNA - DAILY CLOSING REPORT\nStore: ${settings.storeName || 'Tindahan'}\nDate: ${today}\n-----------------------------------\n• Total Active Collectibles: ₱${totalActiveCollectible.toFixed(2)}\n• Total Overdue Amount: ₱${overdueCollectible.toFixed(2)}\n\n⏰ ACCOUNTS DUE TOMORROW (${tomorrowStr}):\n${dueTomorrowList.length > 0 ? dueTomorrowList.join('\n') : 'No accounts due tomorrow.'}\n-----------------------------------`;

    const repText = document.getElementById("closing-report-text");
    if (repText) repText.value = report;
    if (modalClosing) modalClosing.classList.remove("hidden");
  });
}

const btnCloseClosing = document.getElementById("btn-close-closing");
if (btnCloseClosing) btnCloseClosing.addEventListener("click", () => modalClosing.classList.add("hidden"));

const btnDoneClosing = document.getElementById("btn-done-closing");
if (btnDoneClosing) btnDoneClosing.addEventListener("click", () => modalClosing.classList.add("hidden"));

const btnCopyClosing = document.getElementById("btn-copy-closing");
if (btnCopyClosing) {
  btnCopyClosing.addEventListener("click", () => {
    const text = document.getElementById("closing-report-text").value;
    navigator.clipboard.writeText(text);
    showToast("Report copied to clipboard!");
  });
}

// Settings Handlers
const btnOpenSettings = document.getElementById("btn-open-settings");
if (btnOpenSettings) {
  btnOpenSettings.addEventListener("click", () => {
    document.getElementById("setting-store-name").value = settings.storeName || "";
    document.getElementById("setting-birth-year").value = settings.birthYear || "";
    document.getElementById("setting-gcash").value = settings.gcash || "";
    document.getElementById("setting-pin").value = settings.pin || "";
    document.getElementById("setting-credit-limit").value = settings.creditLimit || "";
    document.getElementById("setting-maya").value = settings.maya || "";
    updateStoreIdPreview();
    if (modalSettings) modalSettings.classList.remove("hidden");
  });
}

const btnCloseSettings = document.getElementById("btn-close-settings");
if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => modalSettings.classList.add("hidden"));

const btnCancelSettings = document.getElementById("btn-cancel-settings");
if (btnCancelSettings) btnCancelSettings.addEventListener("click", () => modalSettings.classList.add("hidden"));

const formSettings = document.getElementById("form-settings");
if (formSettings) {
  formSettings.addEventListener("submit", async (e) => {
    e.preventDefault();

    const birthYear = document.getElementById("setting-birth-year").value.trim();
    const phone = document.getElementById("setting-gcash").value.trim();
    const pinVal = document.getElementById("setting-pin").value.trim();

    if (pinVal.length !== 4) {
      alert("Please enter an exact 4-digit PIN.");
      return;
    }

    const computedStoreId = computeStoreId(birthYear, phone);
    if (computedStoreId === "------" || computedStoreId.length !== 6) {
      alert("Please ensure your birth year (e.g. 1988) and 11-digit mobile number are valid.");
      return;
    }

    const targetVaultId = `store_${computedStoreId}`;

    const updatedSettings = {
      storeName: document.getElementById("setting-store-name").value.trim() || "Tindahan",
      birthYear: birthYear,
      gcash: phone,
      storeId: computedStoreId,
      pin: pinVal,
      creditLimit: parseFloat(document.getElementById("setting-credit-limit").value) || 0,
      maya: document.getElementById("setting-maya").value.trim()
    };

    try {
      if (activeVaultId !== targetVaultId && records.length > 0) {
        for (const rec of records) {
          await db.collection("vaults").doc(targetVaultId).collection("records").add(rec);
        }
      }

      await db.collection("vaults").doc(targetVaultId).collection("config").doc("store_settings").set(updatedSettings);

      bindVault(targetVaultId);
      sessionStorage.setItem("pm_unlocked", "true");
      modalSettings.classList.add("hidden");
      
      const printStoreEl = document.getElementById("print-store-name");
      const signStoreEl = document.getElementById("signage-store-name");
      if (printStoreEl) printStoreEl.innerText = updatedSettings.storeName;
      if (signStoreEl) signStoreEl.innerText = updatedSettings.storeName.toUpperCase();
      
      alert(`Settings saved successfully!\n\nYour 6-Digit Store ID: ${computedStoreId}\n\nKeep your Store ID and 4-digit PIN safe to recover your data anytime!`);
      showToast("Settings and Store ID saved permanently!");
    } catch (err) {
      alert("Error saving settings: " + err.message);
    }
  });
}

// Add Record Handlers
const btnOpenAdd = document.getElementById("btn-open-add");
if (btnOpenAdd) {
  btnOpenAdd.addEventListener("click", () => {
    const warnEl = document.getElementById("credit-limit-warning");
    if (warnEl) warnEl.classList.add("hidden");
    if (modalAdd) modalAdd.classList.remove("hidden");
  });
}

const btnCloseAdd = document.getElementById("btn-close-add");
if (btnCloseAdd) {
  btnCloseAdd.addEventListener("click", () => {
    stopScanner();
    modalAdd.classList.add("hidden");
  });
}

const btnCancelAdd = document.getElementById("btn-cancel-add");
if (btnCancelAdd) {
  btnCancelAdd.addEventListener("click", () => {
    stopScanner();
    modalAdd.classList.add("hidden");
  });
}

const formAdd = document.getElementById("form-add");
if (formAdd) {
  formAdd.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!utangCol) return;

    const manualLimit = parseFloat(document.getElementById("add-manual-limit").value) || 0;

    const newRec = {
      name: document.getElementById("add-name").value.trim(),
      phone: document.getElementById("add-phone").value.trim(),
      amount: parseFloat(document.getElementById("add-amount").value),
      paid: 0,
      items: document.getElementById("add-items").value.trim(),
      dueDate: document.getElementById("add-due-date").value,
      manualLimit: manualLimit,
      createdAt: new Date().toISOString()
    };

    try {
      await utangCol.add(newRec);
      stopScanner();
      modalAdd.classList.add("hidden");
      e.target.reset();
      showToast("Saved to your private ledger!");
    } catch (err) {
      alert("Error saving record: " + err.message);
    }
  });
}

// Payment Handlers
window.openPayment = function(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  const balance = record.amount - (record.paid || 0);

  document.getElementById("pay-id").value = record.id;
  document.getElementById("pay-name").innerText = record.name;
  document.getElementById("pay-balance").innerText = `₱${balance.toFixed(2)}`;
  document.getElementById("pay-amount").max = balance;
  document.getElementById("pay-amount").value = "";
  if (modalPayment) modalPayment.classList.remove("hidden");
};

const btnClosePayment = document.getElementById("btn-close-payment");
if (btnClosePayment) btnClosePayment.addEventListener("click", () => modalPayment.classList.add("hidden"));

const btnCancelPay = document.getElementById("btn-cancel-pay");
if (btnCancelPay) btnCancelPay.addEventListener("click", () => modalPayment.classList.add("hidden"));

const formPayment = document.getElementById("form-payment");
if (formPayment) {
  formPayment.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!utangCol) return;

    const id = document.getElementById("pay-id").value;
    const payAmt = parseFloat(document.getElementById("pay-amount").value);
    const record = records.find(r => r.id === id);

    if (!record) return;

    try {
      await utangCol.doc(id).update({ paid: (record.paid || 0) + payAmt });
      modalPayment.classList.add("hidden");
      showToast("Payment recorded!");
    } catch (err) {
      alert("Error recording payment: " + err.message);
    }
  });
}

// Reminder Handlers
window.openReminder = function(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  const balance = record.amount - (record.paid || 0);

  let paymentDetails = "";
  if (settings.gcash) paymentDetails += `\nGCash: ${settings.gcash}`;
  if (settings.maya) paymentDetails += `\nMaya: ${settings.maya}`;

  const msg = `Good day, ${record.name}! This is a friendly reminder from ${settings.storeName || 'Tindahan'} regarding your outstanding store credit balance of ₱${balance.toFixed(2)} due on ${record.dueDate}.${paymentDetails ? '\n\nYou may send your payment via:' + paymentDetails : ''}\n\nThank you very much!`;

  document.getElementById("remind-name").innerText = record.name;
  document.getElementById("remind-phone").innerText = record.phone;
  document.getElementById("remind-text").value = msg;

  const smsBtn = document.getElementById("btn-trigger-sms");
  smsBtn.href = `sms:${record.phone}?&body=${encodeURIComponent(msg)}`;

  if (modalReminder) modalReminder.classList.remove("hidden");
};

const btnCloseRemind = document.getElementById("btn-close-reminder");
if (btnCloseRemind) btnCloseRemind.addEventListener("click", () => modalReminder.classList.add("hidden"));

const btnCopySms = document.getElementById("btn-copy-sms");
if (btnCopySms) {
  btnCopySms.addEventListener("click", () => {
    const text = document.getElementById("remind-text").value;
    navigator.clipboard.writeText(text);
    showToast("Message copied to clipboard!");
  });
}

// Delete Record
window.deleteRecord = async function(id) {
  if (!utangCol) return;
  if (confirm("Are you sure you want to permanently delete this credit entry?")) {
    try {
      await utangCol.doc(id).delete();
      showToast("Record permanently deleted.");
    } catch (err) {
      alert("Error deleting record: " + err.message);
    }
  }
};

// Filter & Search Listeners
filterTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    filterTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeFilter = tab.dataset.filter;
    renderLedger();
  });
});

if (searchInput) searchInput.addEventListener("input", renderLedger);

// CSV Export
const btnExport = document.getElementById("btn-export");
if (btnExport) {
  btnExport.addEventListener("click", () => {
    let csv = "Customer Name,Phone,Items,Total Amount,Balance,Due Date,Status\n";
    records.forEach(r => {
      const bal = r.amount - (r.paid || 0);
      csv += `"${r.name}","${r.phone}","${r.items || ''}",${r.amount},${bal},${r.dueDate},${getRecordStatus(r)}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PalistaMuna_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  });
}

// Print & Download Center Hub Navigation
const btnOpenPrintHub = document.getElementById("btn-open-print-hub");
if (btnOpenPrintHub) btnOpenPrintHub.addEventListener("click", () => modalPrintHub.classList.remove("hidden"));

const btnClosePrintHub = document.getElementById("btn-close-print-hub");
if (btnClosePrintHub) btnClosePrintHub.addEventListener("click", () => modalPrintHub.classList.add("hidden"));

const btnCancelPrintHub = document.getElementById("btn-cancel-print-hub");
if (btnCancelPrintHub) btnCancelPrintHub.addEventListener("click", () => modalPrintHub.classList.add("hidden"));

// Switch Views
const btnShowContract = document.getElementById("btn-show-contract");
if (btnShowContract) {
  btnShowContract.addEventListener("click", () => {
    modalPrintHub.classList.add("hidden");
    printableContract.classList.remove("hidden");
  });
}

const btnBackContract = document.getElementById("btn-back-contract");
if (btnBackContract) {
  btnBackContract.addEventListener("click", () => {
    printableContract.classList.add("hidden");
  });
}

const btnShowSignage = document.getElementById("btn-show-signage");
if (btnShowSignage) {
  btnShowSignage.addEventListener("click", () => {
    modalPrintHub.classList.add("hidden");
    printableSignage.classList.remove("hidden");
  });
}

const btnBackSignage = document.getElementById("btn-back-signage");
if (btnBackSignage) {
  btnBackSignage.addEventListener("click", () => {
    printableSignage.classList.add("hidden");
  });
}

// PDF Generation via html2pdf.js
const btnDlContract = document.getElementById("btn-dl-contract-pdf");
if (btnDlContract) {
  btnDlContract.addEventListener("click", () => {
    showToast("Generating Agreement PDF...");
    const element = document.getElementById("contract-doc-content");
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `PalistaMuna_Agreement_${settings.storeId || 'Store'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save().then(() => showToast("PDF downloaded!"));
  });
}

const btnDlSignage = document.getElementById("btn-dl-signage-pdf");
if (btnDlSignage) {
  btnDlSignage.addEventListener("click", () => {
    showToast("Generating Poster PDF...");
    const element = document.getElementById("signage-doc-content");
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `PalistaMuna_Signage_${settings.storeId || 'Store'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save().then(() => showToast("PDF downloaded!"));
  });
}

// Privacy Policy Modal
const linkOpenPriv = document.getElementById("link-open-privacy");
if (linkOpenPriv) {
  linkOpenPriv.addEventListener("click", (e) => {
    e.preventDefault();
    modalPrivacy.classList.remove("hidden");
  });
}

const btnClosePriv = document.getElementById("btn-close-privacy");
if (btnClosePriv) btnClosePriv.addEventListener("click", () => modalPrivacy.classList.add("hidden"));

const btnOkPriv = document.getElementById("btn-ok-privacy");
if (btnOkPriv) btnOkPriv.addEventListener("click", () => modalPrivacy.classList.add("hidden"));

// Onboarding Tour Logic
function showTourStep(index) {
  document.querySelectorAll(".tour-highlight").forEach(el => el.classList.remove("tour-highlight"));

  const step = tourSteps[index];
  if (tourStepBadge) tourStepBadge.innerText = `STEP ${index + 1} OF ${tourSteps.length}`;
  if (tourTitle) tourTitle.innerText = step.title;
  if (tourDesc) tourDesc.innerText = step.desc;

  if (btnTourPrev) btnTourPrev.style.display = index === 0 ? "none" : "block";
  if (btnTourNext) btnTourNext.innerText = index === tourSteps.length - 1 ? "Get Started! 🎉" : "Next ➔";

  if (step.targetId) {
    const el = document.getElementById(step.targetId);
    if (el) {
      el.classList.add("tour-highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function startTour() {
  currentTourStep = 0;
  if (tourOverlay) {
    tourOverlay.classList.remove("hidden");
    showTourStep(currentTourStep);
  }
}

function endTour() {
  document.querySelectorAll(".tour-highlight").forEach(el => el.classList.remove("tour-highlight"));
  if (tourOverlay) tourOverlay.classList.add("hidden");
  localStorage.setItem("palistamuna_tour_done", "true");
}

if (btnTourNext) {
  btnTourNext.addEventListener("click", () => {
    if (currentTourStep < tourSteps.length - 1) {
      currentTourStep++;
      showTourStep(currentTourStep);
    } else {
      endTour();
      showToast("Tour completed! You are ready to log entries.");
    }
  });
}

if (btnTourPrev) {
  btnTourPrev.addEventListener("click", () => {
    if (currentTourStep > 0) {
      currentTourStep--;
      showTourStep(currentTourStep);
    }
  });
}

if (btnTourSkip) btnTourSkip.addEventListener("click", endTour);

window.addEventListener("DOMContentLoaded", () => {
  const isDone = localStorage.getItem("palistamuna_tour_done");
  if (!isDone) {
    setTimeout(startTour, 600);
  }
});

// Ate Lisa AI Assistant Knowledge Base
const AI_KNOWLEDGE = [
  {
    triggers: ["hi", "hello", "good morning", "good afternoon", "good day", "ate lisa"],
    response: "Hello! I'm Ate Lisa, your assistant for Palista Muna. How can I help protect your store from credit losses today?"
  },
  {
    triggers: ["pdf", "download", "agreement", "contract", "kasunduan"],
    response: "To print or download the Borrower Agreement as a PDF, click on the **'Forms & Posters'** button in the header. Choose **'Borrower Credit Agreement'**, and tap **'📥 Download PDF'** or **'🖨️ Print Document'**!"
  },
  {
    triggers: ["poster", "signage", "mag-palista", "counter", "print poster"],
    response: "You can download or print our official storefront poster! Click **'Forms & Posters'** at the top, select **'Official Storefront Signage Poster'**, and download the PDF. You can post it at your store counter: *'Mag-PALISTA MUNA Kung Marunong Kang Magbayad'*!"
  },
  {
    triggers: ["safe", "secure", "privacy", "bank pin", "wallet pin"],
    response: "Palista Muna is 100% private and secured. Each store operates inside its own cloud vault using a 6-digit Store ID and 4-digit PIN. As a rule of thumb, **never use your GCash, Maya, or bank PIN** as your app PIN to keep your bank accounts completely safe!"
  },
  {
    triggers: ["store id", "how to get store id", "formula"],
    response: "Your 6-Digit Store ID is calculated in Settings by taking the **Last 3 digits of your birth year** + **Last 3 digits of your phone number** (e.g. Born in 1988 + Mobile ending in 128 = **988128**)."
  },
  {
    triggers: ["credit limit", "customer limit", "cap"],
    response: "You can set custom credit caps per borrower! When clicking **'+ Add Record'**, enter the amount in **'Customer Specific Credit Limit (₱)'**. If their balance exceeds this cap, the app immediately raises a warning banner!"
  }
];

function getAiAnswer(input) {
  const clean = input.toLowerCase();
  for (const item of AI_KNOWLEDGE) {
    if (item.triggers.some(t => clean.includes(t))) {
      return item.response;
    }
  }
  return "I'm here to help! You can ask: 'How do I download the agreement PDF?', 'How do I print the storefront poster?', 'How do I set a credit limit?', or 'Is this app safe?'.";
}

function appendMessage(sender, text) {
  const div = document.createElement("div");
  div.className = `ai-msg ${sender}`;
  div.innerHTML = text;
  aiMessages.appendChild(div);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

window.sendQuickPrompt = function(promptText) {
  appendMessage("user", promptText);
  setTimeout(() => {
    const reply = getAiAnswer(promptText);
    appendMessage("bot", reply);
  }, 350);
};

if (aiChatForm) {
  aiChatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = aiInput.value.trim();
    if (!text) return;
    appendMessage("user", text);
    aiInput.value = "";

    setTimeout(() => {
      const reply = getAiAnswer(text);
      appendMessage("bot", reply);
    }, 350);
  });
}

if (aiChatBtn) {
  aiChatBtn.addEventListener("click", () => {
    aiChatWindow.classList.toggle("hidden");
    if (!aiChatWindow.classList.contains("hidden")) {
      aiInput.focus();
    }
  });
}

if (btnCloseAi) {
  btnCloseAi.addEventListener("click", () => {
    aiChatWindow.classList.add("hidden");
  });
}