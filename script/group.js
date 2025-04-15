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

// Utilizza la configurazione definita in config.js
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Recupera il groupId dalla query string (es.: group.html?g=IDGRUPPO)
const params = new URLSearchParams(window.location.search);
const groupId = params.get("g");
if (!groupId) {
  alert("Gruppo non valido.");
  window.location.href = "dashboard.html";
}

// Variabili globali per gestire l'utente loggato
let loggedInUserId = null;
let currentUserIsAdmin = false;

// Riferimenti agli elementi del DOM
const backBtn = document.getElementById("back-btn");
const groupNameHeader = document.getElementById("group-name-header");
const actingUserSelect = document.getElementById("acting-user");
const transactionTypeRadios = document.getElementsByName("transType");
const recipientsListDiv = document.getElementById("recipients-list");
const confirmBtn = document.getElementById("confirm-transaction");
const historyListDiv = document.getElementById("history-list");
const refreshBtn = document.getElementById("refresh-btn");

// Pulsante "Indietro" per tornare alla dashboard
backBtn.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

let groupData;

// Carica i dati del gruppo e aggiorna l'intestazione
async function loadGroupData() {
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) {
    alert("Gruppo non trovato.");
    window.location.href = "dashboard.html";
    return;
  }
  groupData = groupSnap.data();
  
  // Aggiorna il nome del gruppo nell'header della pagina
  if (groupNameHeader) {
    groupNameHeader.textContent = groupData.name;
  }
  
  // Assicura che ogni membro abbia il campo saldoBirre (inizialmente 0 se mancante)
  groupData.members = (groupData.members || []).map(member => {
    if (member.saldoBirre === undefined) {
      member.saldoBirre = 0;
    }
    return member;
  });
  
  // Imposta le variabili globali in base al membro corrispondente all'utente loggato
  const loggedInMember = groupData.members.find(m => m.uid === loggedInUserId);
  currentUserIsAdmin = loggedInMember && loggedInMember.role === "admin";
  
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

// Popola l'elenco dei destinatari con checkbox
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

// Carica lo storico delle transazioni dal subcollection "history"
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

// Il pulsante "Aggiorna" ricarica la pagina
refreshBtn.addEventListener("click", () => {
  window.location.reload();
});

// Gestione della conferma operazione
confirmBtn.addEventListener("click", async () => {
  // Ottieni l'utente che esegue l'operazione dal menu a tendina
  const actingUserUid = actingUserSelect.value;
  
  // Determina il tipo di operazione: "deve" (deve pagare) oppure "ha" (ha pagato)
  let transType = "deve";
  transactionTypeRadios.forEach(radio => {
    if (radio.checked) {
      transType = radio.value;
    }
  });
  
  // Ottieni i destinatari selezionati tramite checkbox
  let selectedRecipients = [];
  const checkboxes = recipientsListDiv.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => {
    if (cb.checked) {
      selectedRecipients.push(cb.value);
    }
  });
  // Filtra eventuale selezione dell'utente stesso
  selectedRecipients = selectedRecipients.filter(uid => uid !== actingUserUid);
  if (selectedRecipients.length === 0) {
    alert("Seleziona almeno un destinatario diverso da te.");
    return;
  }
  
  const count = selectedRecipients.length;
  const timestamp = new Date();
  const formattedDate = timestamp.toLocaleString();
  
  // Ottieni il nome dell'utente che esegue l'operazione (dalla tendina, anche se potrebbe non essere admin)
  const actingMember = groupData.members.find(m => m.uid === actingUserUid);
  const actingName = actingMember ? actingMember.name : "Sconosciuto";
  
  // Ottieni i nomi dei destinatari selezionati
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
  
  // Se l'utente loggato è admin, processa immediatamente l'operazione, altrimenti crea una richiesta pending
  if (currentUserIsAdmin) {
    await processTransactionImmediate(actingUserUid, transType, count, message);
  } else {
    await processTransactionPending(actingUserUid, transType, selectedRecipients, count, message);
  }
});

// Funzione per processare immediatamente l'operazione (per admin)
async function processTransactionImmediate(actingUserUid, transType, count, message) {
  const newMembers = groupData.members.map(member => {
    if (member.uid === actingUserUid) {
      const currentSaldo = member.saldoBirre || 0;
      member.saldoBirre = (transType === "deve") ? currentSaldo + count : currentSaldo - count;
    }
    return member;
  });
  const groupRef = doc(db, "groups", groupId);
  await updateDoc(groupRef, { members: newMembers });
  
  // Aggiungi il record della transazione nello storico (subcollection "history")
  const historyRef = collection(db, "groups", groupId, "history");
  await addDoc(historyRef, {
    message: message,
    timestamp: new Date()
  });
  
  alert("Operazione registrata con successo!");
  window.location.reload();
}

// Funzione per creare una richiesta pending (per non admin)
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

// Gestione dell'autenticazione e caricamento dei dati
onAuthStateChanged(auth, user => {
  if (user) {
    // Imposta l'ID dell'utente loggato
    loggedInUserId = user.uid;
    loadGroupData();
  } else {
    alert("Devi essere autenticato.");
    window.location.href = "index.html";
  }
});