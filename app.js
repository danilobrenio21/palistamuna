// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// 1. Firebase Initialization with your project credentials
const firebaseConfig = {
  apiKey: "AIzaSyDoI1aKjSNnvLpWbpWcjFHVCdLcuWD4MaI",
  authDomain: "palistamuna-d2bb1.firebaseapp.com",
  projectId: "palistamuna-d2bb1",
  storageBucket: "palistamuna-d2bb1.firebasestorage.app",
  messagingSenderId: "1076687838949",
  appId: "1:1076687838949:web:8d31ae67f7d429da2f7e0c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Offline persistence
db.enablePersistence().catch((err) => {
  if (err.code !== 'failed-precondition') {
    console.warn("Persistence error:", err);
  }
});

const utangCol = db.collection("records");
const settingsDoc = db.collection("config").doc("store_settings");

// Philippine Product Barcode Catalog (Expandable)
const BARCODE_CATALOG = {
  "4800016644800": { name: "Lucky Me Instant Pancit Canton Kalamansi", price: 18 },
  "4800016654809": { name: "Lucky Me Instant Pancit Canton Original", price: 18 },
  "4801981110034": { name: "555 Sardines in Tomato Sauce 155g", price: 26 },
  "4800016054111": { name: "Mega Sardines Red 155g", price: 28 },
  "4800110024447": { name: "San Miguel Pale Pilsen 330ml", price: 65 },
  "4800016643018": { name: "Lucky Me Beef Mami", price: 15 }
};

// App State
let records = [];
let settings = { storeName: "Tindahan", gcash: "", maya: "" };
let activeFilter = "all";
let currentView = "ledger"; // "ledger" or "suki"
let html5QrCode = null;

// DOM Elements
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

// Modals
const modalAdd = document.getElementById("modal-add");
const modalPayment = document.getElementById("modal-payment");
const modalReminder = document.getElementById("modal-reminder");
const modalSettings = document.getElementById("modal-settings");
const toast = document.getElementById("toast");

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

// Realtime Cloud Listener for Records
utangCol.onSnapshot((snapshot) => {
  records = [];
  snapshot.forEach((doc) => {
    records.push({ id: doc.id, ...doc.data() });
  });
  renderLedger();
  renderSukiDirectory();
}, (err) => {
  console.error("Firestore listen error:", err);
});

// Realtime Cloud Listener for Settings
settingsDoc.onSnapshot((doc) => {
  if (doc.exists) {
    settings = doc.data();
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
          ${balance > 0 ? `<button class="table-btn" onclick="openPayment('${r.id}')">Pay</button>` : ''}
          ${balance > 0 ? `<button class="table-btn remind" onclick="openReminder('${r.id}')">Remind</button>` : ''}
          <button class="table-btn" onclick="deleteRecord('${r.id}')">Delete</button>
        </div>
      </td>
    `;
    ledgerBody.appendChild(tr);
  });
}

// 2. Customer Directory / Suki Profile Aggregation
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
        totalRecords: 0
      };
    }
    const balance = r.amount - (r.paid || 0);
    customers[key].totalBalance += balance;
    customers[key].totalPaid += (r.paid || 0);
    customers[key].totalRecords += 1;

    if (getRecordStatus(r) === "overdue") {
      customers[key].overdueCount += 1;
    }
  });

  const sukiList = Object.values(customers);

  if (sukiList.length === 0) {
    sukiBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted)">No customer profiles accumulated yet.</td></tr>`;
    return;
  }

  sukiList.forEach(c => {
    let scoreBadge = `<span class="badge badge-active">Good Payer (Suki)</span>`;
    if (c.overdueCount >= 2) {
      scoreBadge = `<span class="badge badge-overdue">High Risk (Delinquent)</span>`;
    } else if (c.overdueCount === 1) {
      scoreBadge = `<span class="badge" style="background: rgba(255, 170, 0, 0.15); color: #ffaa00; border: 1px solid rgba(255, 170, 0, 0.3);">Follow-Up Needed</span>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="suki-name">${c.name}</div>
        <div class="suki-phone">${c.phone}</div>
      </td>
      <td>${scoreBadge}</td>
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: ${c.totalBalance > 0 ? '#ff3366' : 'var(--accent)'}">
        ₱${c.totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
      </td>
      <td style="font-family: 'JetBrains Mono', monospace; color: var(--text-muted)">
        ₱${c.totalPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}
      </td>
      <td>${c.totalRecords} credit entries</td>
    `;
    sukiBody.appendChild(tr);
  });
}

// Toggle Views (Ledger vs Suki Directory)
btnToggleView.addEventListener("click", () => {
  if (currentView === "ledger") {
    currentView = "suki";
    sectionLedger.classList.add("hidden");
    sectionSuki.classList.remove("hidden");
    btnToggleView.innerText = "📋 View Ledger";
    renderSukiDirectory();
  } else {
    currentView = "ledger";
    sectionSuki.classList.add("hidden");
    sectionLedger.classList.remove("hidden");
    btnToggleView.innerText = "👥 Suki Directory";
    renderLedger();
  }
});

// 3. Quick Item Tally Buttons Handlers
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
  });
});

// 4. Camera Barcode Scanner Integration
const btnToggleScanner = document.getElementById("btn-toggle-scanner");
const btnStopScanner = document.getElementById("btn-stop-scanner");
const scannerWrapper = document.getElementById("scanner-wrapper");

btnToggleScanner.addEventListener("click", () => {
  scannerWrapper.classList.remove("hidden");
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

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
      stopScanner();
    },
    () => {}
  ).catch(err => {
    alert("Camera permission denied or camera not found: " + err);
    scannerWrapper.classList.add("hidden");
  });
});

function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {
      scannerWrapper.classList.add("hidden");
    }).catch(console.error);
  } else {
    scannerWrapper.classList.add("hidden");
  }
}

btnStopScanner.addEventListener("click", stopScanner);

// Quick Due Date Presets
document.querySelectorAll(".btn-preset:not(.tally-btn)").forEach(btn => {
  btn.addEventListener("click", () => {
    const today = new Date();
    if (btn.dataset.days) {
      today.setDate(today.getDate() + parseInt(btn.dataset.days));
    } else if (btn.dataset.preset === "15th") {
      today.setDate(15);
      if (new Date().getDate() >= 15) today.setMonth(today.getMonth() + 1);
    } else if (btn.dataset.preset === "30th") {
      today.setDate(30);
      if (new Date().getDate() >= 30) today.setMonth(today.getMonth() + 1);
    }
    document.getElementById("add-due-date").value = today.toISOString().split("T")[0];
  });
});

// Settings Handlers
document.getElementById("btn-open-settings").addEventListener("click", () => {
  document.getElementById("setting-store-name").value = settings.storeName || "";
  document.getElementById("setting-gcash").value = settings.gcash || "";
  document.getElementById("setting-maya").value = settings.maya || "";
  modalSettings.classList.remove("hidden");
});

document.getElementById("btn-close-settings").addEventListener("click", () => modalSettings.classList.add("hidden"));
document.getElementById("btn-cancel-settings").addEventListener("click", () => modalSettings.classList.add("hidden"));

document.getElementById("form-settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const updatedSettings = {
    storeName: document.getElementById("setting-store-name").value.trim() || "Tindahan",
    gcash: document.getElementById("setting-gcash").value.trim(),
    maya: document.getElementById("setting-maya").value.trim()
  };

  try {
    await settingsDoc.set(updatedSettings);
    modalSettings.classList.add("hidden");
    showToast("Settings saved to cloud!");
  } catch (err) {
    alert("Error saving settings: " + err.message);
  }
});

// Add Record Handlers
document.getElementById("btn-open-add").addEventListener("click", () => modalAdd.classList.remove("hidden"));
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
  const newRec = {
    name: document.getElementById("add-name").value.trim(),
    phone: document.getElementById("add-phone").value.trim(),
    amount: parseFloat(document.getElementById("add-amount").value),
    paid: 0,
    items: document.getElementById("add-items").value.trim(),
    dueDate: document.getElementById("add-due-date").value,
    createdAt: new Date().toISOString()
  };

  try {
    await utangCol.add(newRec);
    stopScanner();
    modalAdd.classList.add("hidden");
    e.target.reset();
    showToast("Saved to Firebase Cloud!");
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
  const id = document.getElementById("pay-id").value;
  const payAmt = parseFloat(document.getElementById("pay-amount").value);
  const record = records.find(r => r.id === id);

  if (!record) return;

  try {
    await utangCol.doc(id).update({
      paid: (record.paid || 0) + payAmt
    });
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
  if (confirm("Are you sure you want to delete this record?")) {
    try {
      await utangCol.doc(id).delete();
      showToast("Record deleted from cloud.");
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