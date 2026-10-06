// Initial Seed Data
const DEFAULT_RECORDS = [
  {
    id: "rec-1",
    name: "Aling Marites",
    phone: "09171234567",
    items: "1 Rice (5kg), 2 Canned Tuna, 1 Cooking Oil",
    amount: 540,
    paid: 100,
    dueDate: "2026-04-05"
  },
  {
    id: "rec-2",
    name: "Kuya Jun Jun",
    phone: "09289876543",
    items: "5 Beers, 1 Snack Pack",
    amount: 650,
    paid: 0,
    dueDate: "2026-04-15"
  }
];

let records = JSON.parse(localStorage.getItem("palista_records")) || DEFAULT_RECORDS;
let activeFilter = "all";

// DOM Elements
const ledgerBody = document.getElementById("ledger-body");
const emptyState = document.getElementById("empty-state");
const totalCollectibleEl = document.getElementById("total-collectible");
const totalOverdueEl = document.getElementById("total-overdue");
const totalCollectedEl = document.getElementById("total-collected");
const activeSukiEl = document.getElementById("active-suki-count");
const overdueCountEl = document.getElementById("overdue-count");
const searchInput = document.getElementById("search-input");
const filterTabs = document.querySelectorAll(".tab-btn");

// Modals
const modalAdd = document.getElementById("modal-add");
const modalPayment = document.getElementById("modal-payment");
const modalReminder = document.getElementById("modal-reminder");
const toast = document.getElementById("toast");

function saveRecords() {
  localStorage.setItem("palista_records", JSON.stringify(records));
  renderLedger();
}

function showToast(msg) {
  toast.innerText = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

function getRecordStatus(record) {
  const balance = record.amount - record.paid;
  if (balance <= 0) return "settled";
  const today = new Date().toISOString().split("T")[0];
  return record.dueDate < today ? "overdue" : "pending";
}

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
    const balance = r.amount - r.paid;

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
    totalCollected += r.paid;

    const matchesFilter = (activeFilter === "all" || status === activeFilter);
    const matchesSearch = r.name.toLowerCase().includes(query) || r.phone.includes(query);
    return matchesFilter && matchesSearch;
  });

  // Update counts
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
    const balance = r.amount - r.paid;
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
        ${r.paid > 0 ? `<div style="font-size: 11px; color: var(--text-muted)">Paid: ₱${r.paid}</div>` : ''}
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

// Preset Handlers
document.querySelectorAll(".btn-preset").forEach(btn => {
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

// Add Utang Flow
document.getElementById("btn-open-add").addEventListener("click", () => modalAdd.classList.remove("hidden"));
document.getElementById("btn-close-add").addEventListener("click", () => modalAdd.classList.add("hidden"));
document.getElementById("btn-cancel-add").addEventListener("click", () => modalAdd.classList.add("hidden"));

document.getElementById("form-add").addEventListener("submit", (e) => {
  e.preventDefault();
  const newRec = {
    id: "rec-" + Date.now(),
    name: document.getElementById("add-name").value.trim(),
    phone: document.getElementById("add-phone").value.trim(),
    amount: parseFloat(document.getElementById("add-amount").value),
    paid: 0,
    items: document.getElementById("add-items").value.trim(),
    dueDate: document.getElementById("add-due-date").value
  };

  records.unshift(newRec);
  saveRecords();
  modalAdd.classList.add("hidden");
  e.target.reset();
  showToast("Record successfully added!");
});

// Partial Payment Flow
window.openPayment = function(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  const balance = record.amount - record.paid;

  document.getElementById("pay-id").value = record.id;
  document.getElementById("pay-name").innerText = record.name;
  document.getElementById("pay-balance").innerText = `₱${balance.toFixed(2)}`;
  document.getElementById("pay-amount").max = balance;
  document.getElementById("pay-amount").value = "";
  modalPayment.classList.remove("hidden");
};

document.getElementById("btn-close-payment").addEventListener("click", () => modalPayment.classList.add("hidden"));
document.getElementById("btn-cancel-pay").addEventListener("click", () => modalPayment.classList.add("hidden"));

document.getElementById("form-payment").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("pay-id").value;
  const payAmt = parseFloat(document.getElementById("pay-amount").value);

  records = records.map(r => {
    if (r.id === id) {
      return { ...r, paid: r.paid + payAmt };
    }
    return r;
  });

  saveRecords();
  modalPayment.classList.add("hidden");
  showToast("Payment recorded successfully!");
});

// Reminder Flow
window.openReminder = function(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  const balance = record.amount - record.paid;

  const msg = `Good day ${record.name}! This is a friendly reminder regarding your outstanding balance of ₱${balance.toFixed(2)} due on ${record.dueDate}. Thank you!`;

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
window.deleteRecord = function(id) {
  if (confirm("Are you sure you want to delete this record?")) {
    records = records.filter(r => r.id !== id);
    saveRecords();
    showToast("Record deleted.");
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
    const bal = r.amount - r.paid;
    csv += `"${r.name}","${r.phone}","${r.items || ''}",${r.amount},${bal},${r.dueDate},${getRecordStatus(r)}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PalistaMuna_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
});

// Initialize
renderLedger();