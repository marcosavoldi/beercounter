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
  deleteDoc
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

// Variabili globali per l'utente loggato nella pagina group
let loggedInUserId = null;
let currentUserIsAdmin = false;
let groupData; // dati completi del gruppo

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

/* 
  Funzione loadGroupData: Carica i dati del gruppo dalla collection "groups" 
  e imposta la variabile currentUserIsAdmin in base alla membership dell'utente
*/
async function loadGroupData() {
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) {
    alert("Gruppo non trovato.");
    window.location.href = "dashboard.html";
    return;
  }
  groupData = groupSnap.data();
  
  // Aggiorna il nome del gruppo nell'header
  if (groupNameHeader) {
    groupNameHeader.textContent = groupData.name;
  }
  
  // Imposta un default per saldoBirre se mancante per ogni membro
  groupData.members = (groupData.members || []).map(member => {
    if (member.saldoBirre === undefined) {
      member.saldoBirre = 0;
    }
    return member;
  });
  
  // Determina se l'utente loggato è admin nel gruppo, basandosi sul campo "role"
  const loggedInMember = groupData.members.find(m => m.uid === loggedInUserId);
  currentUserIsAdmin = loggedInMember && loggedInMember.role === "admin";
  
  // Popola i controlli della pagina
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
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "8px";
    div.style.marginBottom = "8px";
    
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

// Pulsante "Aggiorna" per ricaricare la pagina
refreshBtn.addEventListener("click", () => {
  window.location.reload();
});

// Gestione della conferma dell'operazione
confirmBtn.addEventListener("click", async () => {
  // Seleziona l'utente che esegue l'operazione dal menu a tendina
  const actingUserUid = actingUserSelect.value;
  
  // Seleziona il tipo di operazione: "deve" o "ha"
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
  // Filtra eventuale selezione dell'utente stesso (operazione su se stessi non ha senso)
  selectedRecipients = selectedRecipients.filter(uid => uid !== actingUserUid);
  if (selectedRecipients.length === 0) {
    alert("Seleziona almeno un destinatario diverso da te.");
    return;
  }
  
  const count = selectedRecipients.length;
  const timestamp = new Date();
  const formattedDate = timestamp.toLocaleString();
  
  // Ottieni il nome dell'utente che esegue l'operazione
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
  
  // Se l'utente loggato è admin, processa l'operazione immediatamente; altrimenti crea una richiesta pending
  if (currentUserIsAdmin) {
    await processTransactionImmediate(actingUserUid, transType, count, message);
  } else {
    await processTransactionPending(actingUserUid, transType, selectedRecipients, count, message);
  }
});

// Funzione per processare immediatamente l'operazione (solo admin)
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
  
  // Aggiungi il record della transazione nello storico ("history" subcollection)
  const historyRef = collection(db, "groups", groupId, "history");
  await addDoc(historyRef, {
    message: message,
    timestamp: new Date()
  });
  
  alert("Operazione registrata con successo!");
  window.location.reload();
}

// Funzione per creare una richiesta pending (per utenti non admin)
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

/* 
  In group.js, per le operazioni "gestisci gruppo", 
  qualora l'utente voglia visualizzare i dettagli (ad es. rimuovere membri, eliminare il gruppo),
  tali opzioni devono comparire solo se l'utente è admin.
  La funzione loadGroupDetails viene quindi modificata per non visualizzare i btn "Rimuovi" e "Elimina gruppo"
  se currentUserIsAdmin è false.
*/
async function loadGroupDetails(groupId, container) {
  container.innerHTML = "";
  
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) {
    container.innerHTML = "<p>Gruppo non trovato.</p>";
    return;
  }
  
  const groupDataDetails = groupSnap.data();
  const members = groupDataDetails.members || [];
  
  // Crea una lista dei membri
  const membersList = document.createElement("ul");
  members.forEach(member => {
    const li = document.createElement("li");
    li.style.marginBottom = "6px";
    li.textContent = `${member.name} (${member.uid})`;
    
    // Solo se l'utente loggato è admin, mostra il pulsante "Rimuovi" per i membri (escluso se stesso)
    if (currentUserIsAdmin && member.uid !== loggedInUserId) {
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Rimuovi";
      removeBtn.className = "btn-small";
      removeBtn.style.marginLeft = "10px";
      removeBtn.addEventListener("click", async () => {
        await removeMemberFromGroup(groupId, member.uid);
        await loadGroupDetails(groupId, container);
      });
      li.appendChild(removeBtn);
    }
    membersList.appendChild(li);
  });
  
  container.appendChild(membersList);
  
  // Se l'utente loggato è admin, mostra il pulsante per eliminare il gruppo
  if (currentUserIsAdmin) {
    const deleteGroupBtn = document.createElement("button");
    deleteGroupBtn.textContent = "Elimina gruppo";
    deleteGroupBtn.className = "btn-secondary";
    deleteGroupBtn.style.display = "block";
    deleteGroupBtn.style.marginTop = "10px";
    deleteGroupBtn.addEventListener("click", async () => {
      if (confirm("Sei sicuro di voler eliminare il gruppo?")) {
        await deleteGroup(groupId);
      }
    });
    container.appendChild(deleteGroupBtn);
  }
}

// Funzione per rimuovere un membro dal gruppo (disponibile solo per admin)
async function removeMemberFromGroup(groupId, memberUid) {
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (groupSnap.exists()) {
    const groupDataLocal = groupSnap.data();
    const updatedMembers = groupDataLocal.members.filter(m => m.uid !== memberUid);
    await updateDoc(groupRef, { members: updatedMembers });
    // Rimuove anche la referenza nella subcollezione dell'utente
    await deleteDoc(doc(db, "users", memberUid, "groups", groupId));
    alert("Membro rimosso con successo.");
    loadGroups();
  }
}

// Funzione per eliminare un gruppo (disponibile solo per admin)
async function deleteGroup(groupId) {
  // Elimina il documento del gruppo dalla collection "groups"
  await deleteDoc(doc(db, "groups", groupId));
  
  // Rimuove la membership di questo gruppo da tutti gli utenti
  const usersSnap = await getDocs(collection(db, "users"));
  for (const userDoc of usersSnap.docs) {
    const membershipRef = doc(db, "users", userDoc.id, "groups", groupId);
    const membershipSnap = await getDoc(membershipRef);
    if (membershipSnap.exists()) {
      await deleteDoc(membershipRef);
    }
  }
  alert("Gruppo eliminato.");
  loadGroups();
}

/* 
  Funzioni per la creazione di un nuovo gruppo sono gestite in dashboard.js 
  e non sono presenti qui. Questo file gestisce esclusivamente l'area gruppo.
*/

// Gestione dell'autenticazione
onAuthStateChanged(auth, user => {
  if (user) {
    loggedInUserId = user.uid;
    loadGroupData();
  } else {
    alert("Devi essere autenticato.");
    window.location.href = "index.html";
  }
});