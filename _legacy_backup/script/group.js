import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  deleteDoc,
  limit
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// ────────────────────────────────────────────────────────────────────────────────
//   CONFIG & GLOBALS
// ────────────────────────────────────────────────────────────────────────────────
const firebaseConfig = window.firebaseConfig; // definita in config.js
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const params  = new URLSearchParams(window.location.search);
const groupId = params.get("g");
if (!groupId) {
  alert("Gruppo non valido.");
  window.location.href = "dashboard.html";
}

let loggedInUserId   = null;   // uid dell'utente loggato
let currentUserIsAdmin = false; // flag admin
let groupData;                  // cache locale

// ────────────────────────────────────────────────────────────────────────────────
//   DOM REFERENCES
// ────────────────────────────────────────────────────────────────────────────────
const backBtn             = document.getElementById("back-btn");
const groupNameHeader     = document.getElementById("group-name-header");
const actingUserSelect    = document.getElementById("acting-user");
const transactionTypeRadios = document.getElementsByName("transType");
const recipientsListDiv   = document.getElementById("recipients-list");
const confirmBtn          = document.getElementById("confirm-transaction");
const historyListDiv      = document.getElementById("history-list");
const refreshBtn          = document.getElementById("refresh-btn");

// ────────────────────────────────────────────────────────────────────────────────
//   DEBTS SUMMARY CARD
// ────────────────────────────────────────────────────────────────────────────────
const debtCard = document.createElement("div");
debtCard.className = "card-gruppo";
debtCard.style.margin = "20px auto";
debtCard.style.maxWidth = "600px";
debtCard.id = "debts-summary";
debtCard.innerHTML = "<h2>Riepilogo dei debiti</h2><p>Caricamento...</p>";

function randomBeerEmoji() {
  const e = ["🍺", "🍻", "🥂", "🍷", "🍶"];
  return e[Math.floor(Math.random() * e.length)];
}

function renderDebtSummary() {
  const debtsArr = groupData.debts || [];
  if (!debtsArr.length) {
    debtCard.innerHTML = "<h2>Riepilogo dei debiti</h2><p>Nessun debito registrato.</p>";
    return;
  }

  // aggrega per debitore
  const byDebtor = {};
  debtsArr.forEach(d => {
    if (!byDebtor[d.debtorUid]) byDebtor[d.debtorUid] = { name: d.debtorName, list: [], total: 0 };
    byDebtor[d.debtorUid].list.push(d);
    byDebtor[d.debtorUid].total += d.count;
  });

  const ordered = Object.values(byDebtor).sort((a, b) => b.total - a.total);
  let html = "<h2>Riepilogo dei debiti</h2>";
  ordered.forEach(row => {
    const detail = row.list
      .sort((a, b) => b.count - a.count)
      .map(d => `${d.count === 1 ? "una birra" : `${d.count} birre`} a ${d.creditorName}`)
      .join(", ");
    const totTxt = row.total === 1 ? "birra" : "birre";
    html += `<p>${randomBeerEmoji()} <strong>${row.name}</strong> deve ${detail}. Debito totale: <strong>${row.total} ${totTxt}</strong>!</p>`;
  });
  debtCard.innerHTML = html;
}

// ────────────────────────────────────────────────────────────────────────────────
//   NAVIGATION BUTTONS
// ────────────────────────────────────────────────────────────────────────────────
backBtn.addEventListener("click", () => window.location.href = "dashboard.html");
refreshBtn.addEventListener("click", () => location.reload());

// ────────────────────────────────────────────────────────────────────────────────
//   INITIAL LOAD
// ────────────────────────────────────────────────────────────────────────────────
async function loadGroupData() {
  const snap = await getDoc(doc(db, "groups", groupId));
  if (!snap.exists()) {
    alert("Gruppo non trovato.");
    return window.location.href = "dashboard.html";
  }
  groupData = snap.data();

  if (groupNameHeader) groupNameHeader.textContent = groupData.name;

  groupData.members = (groupData.members || []).map(m => {
    if (m.saldoBirre === undefined) m.saldoBirre = 0;
    return m;
  });

  const me = groupData.members.find(m => m.uid === loggedInUserId);
  currentUserIsAdmin = me && me.role === "admin";

  populateActingUserSelect();
  populateRecipients();
  loadHistory();

  if (!document.getElementById("debts-summary")) {
    const firstCard = document.querySelector(".card-gruppo");
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(debtCard, firstCard.nextSibling);
  }
  renderDebtSummary();
}

// ────────────────────────────────────────────────────────────────────────────────
//   UI HELPERS
// ────────────────────────────────────────────────────────────────────────────────
function populateActingUserSelect() {
  actingUserSelect.innerHTML = "";
  groupData.members.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.uid;
    opt.textContent = m.name + (m.role === "admin" ? " (admin)" : "");
    actingUserSelect.appendChild(opt);
  });
}

function populateRecipients() {
  recipientsListDiv.innerHTML = "";
  groupData.members.forEach(m => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginBottom = "8px";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = m.uid;
    cb.id = `recipient-${m.uid}`;

    const label = document.createElement("label");
    label.htmlFor = cb.id;
    label.textContent = m.name;

    row.appendChild(cb);
    row.appendChild(label);
    recipientsListDiv.appendChild(row);
  });
}

async function loadHistory() {
  historyListDiv.innerHTML = "";
  const q = query(collection(db, "groups", groupId, "history"), orderBy("timestamp", "desc"), limit(10));
  const snap = await getDocs(q);
  snap.forEach(docSnap => {
    const p = document.createElement("p");
    p.textContent = docSnap.data().message;
    historyListDiv.appendChild(p);
  });
}

// ────────────────────────────────────────────────────────────────────────────────
//   TRANSACTION HANDLERS
// ────────────────────────────────────────────────────────────────────────────────
confirmBtn.addEventListener("click", async () => {
  const actingUid = actingUserSelect.value;
  let transType = "deve";
  transactionTypeRadios.forEach(r => { if (r.checked) transType = r.value; });

  let recipients = Array.from(recipientsListDiv.querySelectorAll("input[type='checkbox']:checked"))
                         .map(cb => cb.value)
                         .filter(uid => uid !== actingUid);
  if (recipients.length === 0) return alert("Seleziona almeno un destinatario diverso da te.");

  const count = recipients.length;
  const actingName = groupData.members.find(m => m.uid === actingUid)?.name || "Sconosciuto";
  const recipientsNames = groupData.members.filter(m => recipients.includes(m.uid)).map(m => m.name).join(" e ");

  let message;
  if (transType === "deve") {
    const q = count === 1 ? "una birra" : `${count} birre`;
    message = `NUOVO DEBITO! ${actingName} deve ${q} a ${recipientsNames}.`;
  } else {
    const q = count === 1 ? "una birra" : `${count} birre`;
    message = `BIRRE PAGATE: ${actingName} ha pagato ${q} a ${recipientsNames}.`;
  }

  if (currentUserIsAdmin) {
    await processTransactionImmediate(actingUid, transType, recipients, message);
  } else {
    await processTransactionPending(actingUid, transType, recipients, count, message, loggedInUserId, actingName);
  }
});

async function processTransactionImmediate(actingUid, transType, recipients, message) {
  const newMembers = groupData.members.map(m => {
    if (m.uid === actingUid) {
      const delta = transType === "deve" ? recipients.length : -recipients.length;
      m.saldoBirre = (m.saldoBirre || 0) + delta;
    }
    return m;
  });

  let debts = groupData.debts || [];
  recipients.forEach(credUid => {
    const credName = groupData.members.find(m => m.uid === credUid).name;
    const idx = debts.findIndex(d => d.debtorUid === actingUid && d.creditorUid === credUid);
    const delta = transType === "deve" ? 1 : -1;
    if (idx >= 0) {
      debts[idx].count += delta;
      if (debts[idx].count <= 0) debts.splice(idx, 1);
    } else if (delta > 0) {
      debts.push({ debtorUid: actingUid, debtorName: actingName(actingUid), creditorUid: credUid, creditorName: credName, count: 1 });
    }
  });

  await updateDoc(doc(db, "groups", groupId), { members: newMembers, debts });
  await addDoc(collection(db, "groups", groupId, "history"), { message, timestamp: new Date() });

  groupData.members = newMembers;
  groupData.debts = debts;
  renderDebtSummary();
  alert("Operazione registrata con successo!");
}

function actingName(uid) {
  return groupData.members.find(m => m.uid === uid)?.name || "Utente";
}

async function processTransactionPending(actingUid, transType, recipients, count, message, requesterUid, actingName) {
  await addDoc(collection(db, "groups", groupId, "pendingTransactions"), {
    actingUser: actingUid,
    actingUserName: actingName,
    requesterName: actingName(requesterUid),
    transType,
    recipients,
    recipientsNames: groupData.members.filter(m => recipients.includes(m.uid)).map(m => m.name).join(" e "),
    count,
    message,
    timestamp: new Date(),
    status: "pending"
  });
  alert("La richiesta è stata inviata e attende l'approvazione dell'amministratore.");
  location.reload();
}

// ────────────────────────────────────────────────────────────────────────────────
//   AUTH LISTENER
// ────────────────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    loggedInUserId = user.uid;
    loadGroupData();
  } else {
    alert("Devi essere autenticato.");
    window.location.href = "index.html";
  }
});
