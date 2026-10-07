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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code !== 'failed-precondition') console.warn("Persistence note:", err.code);
});

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

// Modals
const modalAdd = document.getElementById("modal-add");
const modalPayment = document.getElementById("modal-payment");
const modalReminder = document.getElementById("modal-reminder");
const modalSettings = document.getElementById("modal-settings");
const modalClosing = document.getElementById("modal-closing");
const modalPrivacy = document.getElementById("modal-privacy");
const modalRecovery = document.getElementById("modal-recovery");
const printableContract = document.getElementById("printable-contract");
const pinScreen = document.getElementById("pin-screen");
const toast = document.getElementById("toast");

// Store ID Input Calculation Fields
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

// Tour Elements
const tourSteps = [
  {
    targetId: null,
    title: "Maligayang Pagdating sa Palista Muna!",
    desc: "Gabay ito kung paano gamitin ang bawat button para protektado at hindi malugi ang tindahan."
  },
  {
    targetId: "btn-open-add",
    title: "+ Add Record Button",
    desc: "Dito ka magtatala ng bagong pautang. Pwede kang maglagay ng sariling credit limit bawat borrower para iwas-lugi!"
  },
  {
    targetId: "btn-toggle-view",
    title: "Suki Directory",
    desc: "I-click ito para makita ang credit reliability score ng bawat customer (Good Payer, Follow-Up Needed, o High Risk)."
  },
  {
    targetId: "btn-open-contract",
    title: "Print Agreement Form",
    desc: "I-click ito para mag-print ng opisyal na kasunduan na lalagdaan ng umuutang (may kasamang Data Privacy consent)."
  },
  {
    targetId: "btn-open-closing",
    title: "Daily Closing Summary",
    desc: "Pagpatak ng gabi, i-click ito para sa buong tally ng nasingil mo ngayong araw at sino ang dapat singilin bukas."
  },
  {
    targetId: "btn-open-settings",
    title: "Settings, Store ID & PIN",
    desc: "Dito mo bubuuin ang iyong 6-digit Store ID at 4-digit security PIN para manatiling secured ang records mo!"
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

// Neon Ripple Touch Effect
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

// Compute 6-Digit Store ID: Last 3 digits of Year + Last 3 digits of Phone
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
  const calcId = computeStoreId(birthYearInput.value, phoneInput.value);
  computedStoreIdBadge.innerText = calcId;
}

birthYearInput.addEventListener("input", updateStoreIdPreview);
phoneInput.addEventListener("input", updateStoreIdPreview);

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
  }, console.error);

  settingsUnsub = settingsDoc.onSnapshot((doc) => {
    if (doc.exists) {
      settings = doc.data();
      document.getElementById("print-store-name").innerText = settings.storeName || "Tindahan";
      
      // Enforce PIN lock on fresh browser session
      if (settings.pin && settings.pin.length === 4) {
        const isUnlocked = sessionStorage.getItem("pm_unlocked");
        if (!isUnlocked) {
          enteredPin = "";
          updatePinDots();
          pinScreen.classList.remove("hidden");
        }
      }
    }
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
    pinScreen.classList.add("hidden");
    showToast("Welcome back! Na-unlock ang iyong records.");
  } else {
    showToast("Maling PIN code! Pakisubukan muli.");
    enteredPin = "";
    updatePinDots();
  }
}

// Initial Startup & Auth Isolation
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    await auth.signInAnonymously().catch(console.error);
    return;
  }

  if (!activeVaultId) {
    activeVaultId = user.uid;
    localStorage.setItem("palista_vault_id", activeVaultId);
  }

  bindVault(activeVaultId);
});

// Recovery Modal Handlers
document.getElementById("btn-show-recovery").addEventListener("click", () => {
  pinScreen.classList.add("hidden");
  modalRecovery.classList.remove("hidden");
});

document.getElementById("link-open-recovery").addEventListener("click", (e) => {
  e.preventDefault();
  modalRecovery.classList.remove("hidden");
});

document.getElementById("btn-close-recovery").addEventListener("click", () => modalRecovery.classList.add("hidden"));
document.getElementById("btn-cancel-recovery").addEventListener("click", () => modalRecovery.classList.add("hidden"));

// Account Recovery by 6-Digit Store ID + 4-Digit PIN
document.getElementById("form-recovery").addEventListener("submit", async (e) => {
  e.preventDefault();
  const storeId = document.getElementById("rec-store-id").value.trim();
  const pin = document.getElementById("rec-pin").value.trim();

  if (storeId.length !== 6) {
    alert("Kailangan ng eksaktong 6-digit Store ID (Hal. 988128).");
    return;
  }

  try {
    const targetVaultId = `store_${storeId}`;
    const testDoc = await db.collection("vaults").doc(targetVaultId).collection("config").doc("store_settings").get();

    if (!testDoc.exists) {
      alert("Walang nahanap na records gamit ang Store ID na ito. Tiyakin na nai-save ito sa Settings noon.");
      return;
    }

    const vaultSettings = testDoc.data();
    if (vaultSettings.pin !== pin) {
      alert("Maling 4-digit PIN para sa Store ID na ito!");
      return;
    }

    // Success: Permanently link this browser to the store vault
    bindVault(targetVaultId);
    sessionStorage.setItem("pm_unlocked", "true");
    modalRecovery.classList.add("hidden");
    showToast("Tagumpay! Naibalik ang lahat ng records ng iyong tindahan.");
  } catch (err) {
    alert("Error sa pag-recover: " + err.message);
  }
});

function renderLedger() {
  const query = searchInput.value.toLowerCase();
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

  document.getElementById("count-all").innerText = counts.all;
  document.getElementById("count-overdue").innerText = counts.overdue;
  document.getElementById("count-pending").innerText = counts.pending;
  document.getElementById("count-settled").innerText = counts.settled;

  totalCollectibleEl.innerText = `₱${totalCollectible.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  totalOverdueEl.innerText = `₱${totalOverdue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  totalCollectedEl.innerText = `₱${totalCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
  activeSukiEl.innerText = `${pendingCount + overdueCount} active accounts`;
  overdueCountEl.innerText = `${overdueCount} overdue accounts`;

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

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
    sukiBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted)">No customer profiles accumulated yet.</td></tr>`;
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
btnToggleView.addEventListener("click", () => {
  if (currentView === "ledger") {
    currentView = "suki";
    sectionLedger.classList.add("hidden");
    sectionSuki.classList.remove("hidden");
    btnToggleText.innerText = "View Ledger";
    renderSukiDirectory();
  } else {
    currentView = "ledger";
    sectionSuki.classList.add("hidden");
    sectionLedger.classList.remove("hidden");
    btnToggleText.innerText = "Suki Directory";
    renderLedger();
  }
});

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
  if (activeLimit <= 0) {
    document.getElementById("credit-limit-warning").classList.add("hidden");
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

  const warningEl = document.getElementById("credit-limit-warning");
  if (existingBal + addingAmt > activeLimit) {
    warningEl.innerHTML = `⚠️ <strong>Babala:</strong> Lampas sa ₱${activeLimit.toFixed(2)} limit ng customer na ito! Total utang magiging: <strong>₱${(existingBal + addingAmt).toFixed(2)}</strong>`;
    warningEl.classList.remove("hidden");
  } else {
    warningEl.classList.add("hidden");
  }
}

document.getElementById("add-phone").addEventListener("input", checkCreditLimit);
document.getElementById("add-name").addEventListener("input", checkCreditLimit);
document.getElementById("add-amount").addEventListener("input", checkCreditLimit);
document.getElementById("add-manual-limit").addEventListener("input", checkCreditLimit);

// Barcode Scanner
const btnToggleScanner = document.getElementById("btn-toggle-scanner");
const btnStopScanner = document.getElementById("btn-stop-scanner");
const scannerWrapper = document.getElementById("scanner-wrapper");

btnToggleScanner.addEventListener("click", () => {
  scannerWrapper.classList.remove("hidden");
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
    scannerWrapper.classList.add("hidden");
  });
});

function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => scannerWrapper.classList.add("hidden")).catch(console.error);
  } else {
    scannerWrapper.classList.add("hidden");
  }
}

btnStopScanner.addEventListener("click", stopScanner);

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
    document.getElementById("add-due-date").value = today.toISOString().split("T")[0];
  });
});

// Daily Closing Summary Report
document.getElementById("btn-open-closing").addEventListener("click", () => {
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

  document.getElementById("closing-report-text").value = report;
  modalClosing.classList.remove("hidden");
});

document.getElementById("btn-close-closing").addEventListener("click", () => modalClosing.classList.add("hidden"));
document.getElementById("btn-done-closing").addEventListener("click", () => modalClosing.classList.add("hidden"));
document.getElementById("btn-copy-closing").addEventListener("click", () => {
  const text = document.getElementById("closing-report-text").value;
  navigator.clipboard.writeText(text);
  showToast("Report copied to clipboard!");
});

// Settings Handlers (Calculates 6-Digit Store ID and Saves to Cloud Vault)
document.getElementById("btn-open-settings").addEventListener("click", () => {
  document.getElementById("setting-store-name").value = settings.storeName || "";
  document.getElementById("setting-birth-year").value = settings.birthYear || "";
  document.getElementById("setting-gcash").value = settings.gcash || "";
  document.getElementById("setting-pin").value = settings.pin || "";
  document.getElementById("setting-credit-limit").value = settings.creditLimit || "";
  document.getElementById("setting-maya").value = settings.maya || "";
  updateStoreIdPreview();
  modalSettings.classList.remove("hidden");
});

document.getElementById("btn-close-settings").addEventListener("click", () => modalSettings.classList.add("hidden"));
document.getElementById("btn-cancel-settings").addEventListener("click", () => modalSettings.classList.add("hidden"));

document.getElementById("form-settings").addEventListener("submit", async (e) => {
  e.preventDefault();

  const birthYear = document.getElementById("setting-birth-year").value.trim();
  const phone = document.getElementById("setting-gcash").value.trim();
  const pinVal = document.getElementById("setting-pin").value.trim();

  if (pinVal.length !== 4) {
    alert("Kailangan ng eksaktong 4-digit PIN.");
    return;
  }

  const computedStoreId = computeStoreId(birthYear, phone);
  if (computedStoreId === "------" || computedStoreId.length !== 6) {
    alert("Pakisiguradong tama ang nilagay na taon (Hal. 1988) at 11-digit mobile number.");
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
    // If transitioning from temporary vault, migrate existing records over
    if (activeVaultId !== targetVaultId && records.length > 0) {
      for (const rec of records) {
        await db.collection("vaults").doc(targetVaultId).collection("records").add(rec);
      }
    }

    await db.collection("vaults").doc(targetVaultId).collection("config").doc("store_settings").set(updatedSettings);

    bindVault(targetVaultId);
    sessionStorage.setItem("pm_unlocked", "true");
    modalSettings.classList.add("hidden");
    document.getElementById("print-store-name").innerText = updatedSettings.storeName;
    alert(`Nai-save ang iyong settings!\n\nIyong 6-Digit Store ID: ${computedStoreId}\n\nTandaan ang Store ID na ito at ang iyong 4-digit PIN upang maibalik ang data kung sakaling lumipat ka ng cellphone!`);
    showToast("Settings and Store ID secured permanently!");
  } catch (err) {
    alert("Error saving settings: " + err.message);
  }
});

// Add Record Handlers
document.getElementById("btn-open-add").addEventListener("click", () => {
  document.getElementById("credit-limit-warning").classList.add("hidden");
  modalAdd.classList.remove("hidden");
});
document.getElementById("btn-close-add").addEventListener("click", () => {
  stopScanner();
  modalAdd.classList.add("hidden");
});
document.getElementById("btn-cancel-add").addEventListener("click", () => {
  stopScanner();
  modalAdd.classList.add("hidden");
});

document.getElementById("form-add").addEventListener("submit", async (e) => {
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
  modalPayment.classList.remove("hidden");
};

document.getElementById("btn-close-payment").addEventListener("click", () => modalPayment.classList.add("hidden"));
document.getElementById("btn-cancel-pay").addEventListener("click", () => modalPayment.classList.add("hidden"));

document.getElementById("form-payment").addEventListener("submit", async (e) => {
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

// Reminder Handlers
window.openReminder = function(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  const balance = record.amount - (record.paid || 0);

  let paymentDetails = "";
  if (settings.gcash) paymentDetails += `\nGCash: ${settings.gcash}`;
  if (settings.maya) paymentDetails += `\nMaya: ${settings.maya}`;

  const msg = `Good day ${record.name}! This is a reminder from ${settings.storeName || 'Tindahan'} regarding your outstanding balance of ₱${balance.toFixed(2)} due on ${record.dueDate}.${paymentDetails ? '\n\nYou may send payment via:' + paymentDetails : ''}\n\nThank you!`;

  document.getElementById("remind-name").innerText = record.name;
  document.getElementById("remind-phone").innerText = record.phone;
  document.getElementById("remind-text").value = msg;

  const smsBtn = document.getElementById("btn-trigger-sms");
  smsBtn.href = `sms:${record.phone}?&body=${encodeURIComponent(msg)}`;

  modalReminder.classList.remove("hidden");
};

document.getElementById("btn-close-reminder").addEventListener("click", () => modalReminder.classList.add("hidden"));
document.getElementById("btn-copy-sms").addEventListener("click", () => {
  const text = document.getElementById("remind-text").value;
  navigator.clipboard.writeText(text);
  showToast("Message copied to clipboard!");
});

// Delete Record
window.deleteRecord = async function(id) {
  if (!utangCol) return;
  if (confirm("Sigurado ka bang nais mong burahin ang record na ito?")) {
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

searchInput.addEventListener("input", renderLedger);

// CSV Export
document.getElementById("btn-export").addEventListener("click", () => {
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

// Printable Contract
document.getElementById("btn-open-contract").addEventListener("click", () => {
  printableContract.classList.remove("hidden");
});
document.getElementById("btn-close-print").addEventListener("click", () => {
  printableContract.classList.add("hidden");
});

// Privacy Policy Modal
document.getElementById("link-open-privacy").addEventListener("click", (e) => {
  e.preventDefault();
  modalPrivacy.classList.remove("hidden");
});
document.getElementById("btn-close-privacy").addEventListener("click", () => modalPrivacy.classList.add("hidden"));
document.getElementById("btn-ok-privacy").addEventListener("click", () => modalPrivacy.classList.add("hidden"));

// Onboarding Tour
function showTourStep(index) {
  document.querySelectorAll(".tour-highlight").forEach(el => el.classList.remove("tour-highlight"));

  const step = tourSteps[index];
  tourStepBadge.innerText = `STEP ${index + 1} NG ${tourSteps.length}`;
  tourTitle.innerText = step.title;
  tourDesc.innerText = step.desc;

  btnTourPrev.style.display = index === 0 ? "none" : "block";
  btnTourNext.innerText = index === tourSteps.length - 1 ? "Tapos Na! 🎉" : "Susunod ➔";

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
  tourOverlay.classList.remove("hidden");
  showTourStep(currentTourStep);
}

function endTour() {
  document.querySelectorAll(".tour-highlight").forEach(el => el.classList.remove("tour-highlight"));
  tourOverlay.classList.add("hidden");
  localStorage.setItem("palistamuna_tour_done", "true");
}

btnTourNext.addEventListener("click", () => {
  if (currentTourStep < tourSteps.length - 1) {
    currentTourStep++;
    showTourStep(currentTourStep);
  } else {
    endTour();
    showToast("Tour completed! Pwede ka nang maglista.");
  }
});

btnTourPrev.addEventListener("click", () => {
  if (currentTourStep > 0) {
    currentTourStep--;
    showTourStep(currentTourStep);
  }
});

btnTourSkip.addEventListener("click", endTour);

window.addEventListener("DOMContentLoaded", () => {
  const isDone = localStorage.getItem("palistamuna_tour_done");
  if (!isDone) {
    setTimeout(startTour, 600);
  }
});

// Ate Lisa AI Assistant Knowledge Base
const AI_KNOWLEDGE = [
  {
    triggers: ["hi", "hello", "kamusta", "kumusta", "magandang", "good morning", "ate lisa"],
    response: "Hello po! Ako si Ate Lisa. Nandito ako para gabayan ka sa paggamit ng Palista Muna para protektado ang kita ng iyong tindahan!"
  },
  {
    triggers: ["store id", "compute", "formula", "paano makuha"],
    response: "Madali lang kunin ang iyong 6-digit **Store ID**! Ito ay ang kombinasyon ng **Huling 3 digits ng taon ng iyong kapanganakan** at **Huling 3 digits ng iyong mobile number**.<br><br>Halimbawa: Kung ipinanganak ka noong 1988 at ang cellphone mo ay 09673467128, ang iyong Store ID ay: **988128**."
  },
  {
    triggers: ["bawal", "wallet pin", "gcash pin", "bangko", "banking pin", "same pin"],
    response: "🛡️ **Mahigpit na Paalala:** Huwag na huwag pong gagamitin ang parehong PIN ng inyong **GCash, Maya, o Online Banking**! Gumamit ng kakaibang 4-digit PIN sa Palista Muna para kahit anong mangyari, manatiling ligtas ang inyong pera sa bangko o e-wallet."
  },
  {
    triggers: ["recover", "nawala", "lumipat", "bagong phone", "bura", "paano ibalik"],
    response: "Kung lumipat ka ng cellphone o na-clear ang data, i-click lamang ang **'Switch Device / Store ID Recovery'** sa PIN screen o sa footer. Ilagay ang iyong 6-digit Store ID (hal. 988128) at 4-digit PIN, at kusa nitong ibabalik ang iyong records!"
  },
  {
    triggers: ["safe ba", "ligtas ba", "safe", "secure", "manakaw", "leak", "hacked"],
    response: "Opo, 100% safe at secured ang Palista Muna! Ang iyong listahan ay nakatago sa sarili mong pribadong cloud vault. Ikaw lamang ang may hawak ng iyong Store ID at 4-digit PIN."
  },
  {
    triggers: ["privacy", "dpa", "ra 10173", "data"],
    response: "Sumusunod ang Palista Muna sa Data Privacy Act (RA 10173). Hindi namin ibinebenta ang numero ng mga customer mo at ikaw lamang ang may access sa iyong listahan."
  },
  {
    triggers: ["credit limit", "limit", "cap"],
    response: "Kapag nag-a-add ng utang via **'+ Add Record'**, ilagay ang nais mong limitasyon sa **'Customer Specific Credit Limit (₱)'**. Magbibigay ng babala ang app kapag sosobra na sa limit ang pautang sa kanya!"
  },
  {
    triggers: ["print", "agreement", "kasunduan", "form"],
    response: "I-click ang **'Print Agreement'** button sa itaas para mag-print ng pormal na Kasunduan sa Pagpapautang na may kumpletong lagdaan ng tindahan at umuutang!"
  }
];

function getAiAnswer(input) {
  const clean = input.toLowerCase();
  for (const item of AI_KNOWLEDGE) {
    if (item.triggers.some(t => clean.includes(t))) {
      return item.response;
    }
  }
  return "Nandito si Ate Lisa para tumulong! Pwede mong itanong: 'Paano makuha ang Store ID?', 'Bawal ba gamitin ang GCash PIN ko?', 'Paano mag-recover ng data?', o 'Safe ba gamitin ito?'.";
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

aiChatBtn.addEventListener("click", () => {
  aiChatWindow.classList.toggle("hidden");
  if (!aiChatWindow.classList.contains("hidden")) {
    aiInput.focus();
  }
});

btnCloseAi.addEventListener("click", () => {
  aiChatWindow.classList.add("hidden");
});