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
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// Utilizza la configurazione da config.js
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Recupera il groupId dalla query string (ad es. group.html?g=IDGRUPPO)
const params = new URLSearchParams(window.location.search);
const groupId = params.get("g");
if (!groupId) {
  alert("Gruppo non valido.");
  window.location.href = "dashboard.html";
}

// Riferimenti ai nodi del DOM
const backBtn = document.getElementById("back-btn");
const actingUserSelect = document.getElementById("acting-user");
const transactionTypeRadios = document.getElementsByName("transType");
const recipientsListDiv = document.getElementById("recipients-list");
const confirmBtn = document.getElementById("confirm-transaction");
const historyListDiv = document.getElementById("history-list");
const refreshBtn = document.getElementById("refresh-btn");

// Imposta il pulsante "Indietro" per tornare alla dashboard
backBtn.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

// Carica i dati del gruppo e popola l'interfaccia
let groupData;
async function loadGroupData() {
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) {
    alert("Gruppo non trovato.");
    window.location.href = "dashboard.html";
    return;
  }
  groupData = groupSnap.data();
  // Assumi che groupData.members sia un array di oggetti { uid, name, role, saldoBirre }
  // Se saldoBirre non esiste, imposta 0
  groupData.members = groupData.members.map(member => {
    if (member.saldoBirre === undefined) {
      member.saldoBirre = 0;
    }
    return member;
  });
  populateActingUserSelect();
  populateRecipients();
  loadHistory();
}

// Popola il menu a tendina con i membri del gruppo
function populateActingUserSelect() {
  actingUserSelect.innerHTML = "";
  groupData.members.forEach(member => {
    const option = document.createElement("option");
    option.value = member.uid;
    option.textContent = member.name + (member.role === "admin" ? " (admin)" : "");
    option.setAttribute("data-role", member.role);
    actingUserSelect.appendChild(option);
  });
}

// Popola l'elenco dei destinatari con checkbox (mostra tutti i membri)
function populateRecipients() {
  recipientsListDiv.innerHTML = "";
  groupData.members.forEach(member => {
    const div = document.createElement("div");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = member.uid;
    checkbox.id = "recipient-" + member.uid;
    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = member.name;
    div.appendChild(checkbox);
    div.appendChild(label);
    recipientsListDiv.appendChild(div);
  });
}

// Carica la cronologia delle transazioni dal subcollection "history"
async function loadHistory() {
  historyListDiv.innerHTML = "";
  const historyRef = collection(db, "groups", groupId, "history");
  const q = query(historyRef, orderBy("timestamp", "desc"));
  const historySnap = await getDocs(q);
  historySnap.forEach(docSnap => {
    const data = docSnap.data();
    const p = document.createElement("p");
    p.textContent = data.message;
    historyListDiv.appendChild(p);
  });
}

// Pulsante "Aggiorna" ricarica la pagina
refreshBtn.addEventListener("click", () => {
  window.location.reload();
});

// Gestione della conferma transazione
confirmBtn.addEventListener("click", async () => {
  // Seleziona l'utente che esegue l'azione dal menu a tendina
  const actingUserUid = actingUserSelect.value;
  let transType = "deve"; // Default: "deve pagare"
  transactionTypeRadios.forEach(radio => {
    if (radio.checked) {
      transType = radio.value; // "deve" oppure "ha"
    }
  });
  // Ottieni i destinatari selezionati (checkbox)
  const checkboxes = recipientsListDiv.querySelectorAll("input[type='checkbox']");
  let selectedRecipients = [];
  checkboxes.forEach(cb => {
    if (cb.checked) {
      selectedRecipients.push(cb.value);
    }
  });
  // Rimuovi l'utente selezionato se appare tra i destinatari (non ha senso pagare a se stessi)
  selectedRecipients = selectedRecipients.filter(uid => uid !== actingUserUid);
  if (selectedRecipients.length === 0) {
    alert("Seleziona almeno un destinatario diverso da te.");
    return;
  }
  
  const count = selectedRecipients.length;
  const timestamp = new Date();
  const formattedDate = timestamp.toLocaleString();
  
  // Ottieni il nome dell'utente che esegue l'azione
  const actingMember = groupData.members.find(m => m.uid === actingUserUid);
  const actingName = actingMember ? actingMember.name : "Sconosciuto";
  // Ottieni i nomi dei destinatari
  const recipientsNames = groupData.members
    .filter(m => selectedRecipients.includes(m.uid))
    .map(m => m.name)
    .join(", ");
    
  let message = "";
  if (transType === "ha") {
    message = `${formattedDate}: ${actingName} ha pagato ${count} birre a ${recipientsNames}.`;
  } else {
    message = `Nuovo debito! ${formattedDate}: ${actingName} ha registrato un debito di ${count} birre a ${recipientsNames}.`;
  }
  
  // Se l'utente che esegue l'azione è admin, la transazione viene processata immediatamente
  if (actingMember && actingMember.role === "admin") {
    await processTransactionImmediate(actingUserUid, transType, count, message);
  } else {
    // Altrimenti, crea una richiesta pending
    await processTransactionPending(actingUserUid, transType, selectedRecipients, count, message);
  }
});

// Funzione per processare immediatamente la transazione (se admin)
async function processTransactionImmediate(actingUserUid, transType, count, message) {
  // Aggiorna il saldo dell'utente che esegue l'azione
  const newMembers = groupData.members.map(member => {
    if (member.uid === actingUserUid) {
      const currentSaldo = member.saldoBirre || 0;
      member.saldoBirre = transType === "deve" ? currentSaldo + count : currentSaldo - count;
    }
    return member;
  });
  const groupRef = doc(db, "groups", groupId);
  await updateDoc(groupRef, { members: newMembers });
  
  // Aggiungi una registrazione alla cronologia nel subcollection "history"
  const historyRef = collection(db, "groups", groupId, "history");
  await addDoc(historyRef, {
    message: message,
    timestamp: new Date()
  });
  
  alert("Transazione registrata con successo!");
  window.location.reload();
}

// Funzione per creare una richiesta pending (se non admin)
async function processTransactionPending(actingUserUid, transType, recipients, count, message) {
  const pendingRef = collection(db, "groups", groupId, "pendingTransactions");
  await addDoc(pendingRef, {
    actingUser: actingUserUid,
    transType: transType,
    recipients: recipients,
    count: count,
    message: message,
    timestamp: new Date(),
    status: "pending"
  });
  alert("La richiesta è stata inviata e attende l'approvazione dell'amministratore.");
  window.location.reload();
}

onAuthStateChanged(auth, user => {
  if (user) {
    loadGroupData();
  } else {
    alert("Devi essere autenticato.");
    window.location.href = "index.html";
  }
});