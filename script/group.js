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

// Variabili globali per la pagina group
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

// Pulsante "Indietro"
backBtn.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

/* 
   loadGroupData: Carica il documento del gruppo, aggiorna il nome dell'header,
   imposta currentUserIsAdmin (in base a loggedInUserId) e popola i controlli.
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

  if (groupNameHeader) {
    groupNameHeader.textContent = groupData.name;
  }
  
  // Assicura che ogni membro abbia un saldo iniziale (se non esiste, lo imposta a 0)
  groupData.members = (groupData.members || []).map(member => {
    if (member.saldoBirre === undefined) {
      member.saldoBirre = 0;
    }
    return member;
  });
  
  // Determina se l'utente loggato è amministratore nel gruppo
  const loggedInMember = groupData.members.find(m => m.uid === loggedInUserId);
  currentUserIsAdmin = loggedInMember && loggedInMember.role === "admin";
  
  populateActingUserSelect();
  populateRecipients();
  loadHistory();
}

/* Popola il menu a tendina con l'elenco dei membri */
function populateActingUserSelect() {
  actingUserSelect.innerHTML = "";
  groupData.members.forEach(member => {
    const option = document.createElement("option");
    option.value = member.uid;
    option.textContent = member.name + (member.role === "admin" ? " (admin)" : "");
    actingUserSelect.appendChild(option);
  });
}

/* Popola la lista dei destinatari con checkbox */
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

/* Carica lo storico delle transazioni dal subdocumento "history" del gruppo */
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

/* Pulsante "Aggiorna": ricarica la pagina */
refreshBtn.addEventListener("click", () => {
  window.location.reload();
});

/* Gestione della conferma dell'operazione */
confirmBtn.addEventListener("click", async () => {
  // Ottieni l'utente dalla tendina che esegue l'operazione
  const actingUserUid = actingUserSelect.value;
  let transType = "deve";
  transactionTypeRadios.forEach(radio => {
    if (radio.checked) {
      transType = radio.value;
    }
  });
  
  // Ottieni i destinatari dalla lista di checkbox
  let selectedRecipients = [];
  const checkboxes = recipientsListDiv.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => {
    if (cb.checked) {
      selectedRecipients.push(cb.value);
    }
  });
  // Rimuovi l'eventuale operazione su se stessi
  selectedRecipients = selectedRecipients.filter(uid => uid !== actingUserUid);
  if (selectedRecipients.length === 0) {
    alert("Seleziona almeno un destinatario diverso da te.");
    return;
  }
  
  const count = selectedRecipients.length;
  const timestamp = new Date();
  const formattedDate = timestamp.toLocaleString();
  
  // Nome dell'utente selezionato nella tendina
  const actingMember = groupData.members.find(m => m.uid === actingUserUid);
  const actingUserName = actingMember ? actingMember.name : "Sconosciuto";
  
  // Nome dei destinatari
  const recipientsNames = groupData.members
    .filter(m => selectedRecipients.includes(m.uid))
    .map(m => m.name)
    .join(", ");
  
  // Il richiedente è l'utente loggato
  const requesterName = groupData.members.find(m => m.uid === loggedInUserId)?.name || "Richiedente sconosciuto";
  
  // Costruisce la descrizione secondo la seconda variante
  let message = "";
  if (transType === "ha") {
    message = `${formattedDate}: ${requesterName} ha richiesto di registrare il pagamento di ${count} birre da parte di ${actingUserName} verso ${recipientsNames}.`;
  } else {
    message = `${formattedDate}: ${requesterName} ha chiesto di aggiungere un debito di ${count} birre a ${recipientsNames}.`;
  }
  
  if (currentUserIsAdmin) {
    await processTransactionImmediate(actingUserUid, transType, count, message);
  } else {
    await processTransactionPending(actingUserUid, transType, selectedRecipients, count, message, requesterName, actingUserName);
  }
});

/* Processa immediatamente l'operazione (solo admin) */
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
  
  const historyRef = collection(db, "groups", groupId, "history");
  await addDoc(historyRef, {
    message: message,
    timestamp: new Date()
  });
  
  alert("Operazione registrata con successo!");
  window.location.reload();
}

/* Crea una richiesta pending (per utenti non admin) */
async function processTransactionPending(actingUserUid, transType, recipients, count, message, requesterName, actingUserName) {
  const pendingRef = collection(db, "groups", groupId, "pendingTransactions");
  await addDoc(pendingRef, {
    actingUser: actingUserUid,
    actingUserName: actingUserName,
    requesterName: requesterName,
    transType: transType,
    recipients: recipients, // array di UID
    recipientsNames: groupData.members
                      .filter(m => recipients.includes(m.uid))
                      .map(m => m.name)
                      .join(", "),
    count: count,
    message: message,
    timestamp: new Date(),
    status: "pending"
  });
  alert("La richiesta è stata inviata e attende l'approvazione dell'amministratore.");
  window.location.reload();
}

/* Carica i dettagli del gruppo (lista dei membri e opzioni amministrative) – visibile solo se admin */
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
  
  const membersList = document.createElement("ul");
  members.forEach(member => {
    const li = document.createElement("li");
    li.style.marginBottom = "6px";
    li.textContent = `${member.name} (${member.uid})`;
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

/* Mostra il popup dei dettagli della richiesta pending */
function showPendingRequestPopup(docPending) {
  const pendingData = docPending.data();
  let description = "";
  if (pendingData.transType === "ha") {
    description = `${pendingData.requesterName} ha richiesto di registrare il pagamento di ${pendingData.count} birre da parte di ${pendingData.actingUserName} verso ${pendingData.recipientsNames}.`;
  } else {
    description = `${pendingData.requesterName} ha chiesto di aggiungere un debito di ${pendingData.count} birre a ${pendingData.recipientsNames}.`;
  }
  
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  
  const popup = document.createElement("div");
  popup.style.backgroundColor = "#fff";
  popup.style.padding = "20px";
  popup.style.borderRadius = "8px";
  popup.style.maxWidth = "400px";
  popup.style.textAlign = "center";
  
  const descElem = document.createElement("p");
  descElem.textContent = description;
  popup.appendChild(descElem);
  
  const approveBtn = document.createElement("button");
  approveBtn.textContent = "Approva";
  approveBtn.className = "btn-small";
  approveBtn.style.marginRight = "10px";
  approveBtn.addEventListener("click", async () => {
    await updateDoc(docPending.ref, { status: "user" });
    const groupRef = doc(db, "groups", groupId);
    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      const groupDataLocal = groupSnap.data();
      const updatedMembers = [...(groupDataLocal.members || [])];
      const alreadyPresent = updatedMembers.some((m) => m.uid === pendingData.actingUser);
      if (!alreadyPresent) {
        updatedMembers.push({
          uid: pendingData.actingUser,
          role: "user",
          name: pendingData.actingUserName || "Utente"
        });
        await updateDoc(groupRef, { members: updatedMembers });
      }
    }
    document.body.removeChild(overlay);
    loadGroups();
  });
  
  const rejectBtn = document.createElement("button");
  rejectBtn.textContent = "Rifiuta";
  rejectBtn.className = "btn-small";
  rejectBtn.addEventListener("click", async () => {
    await deleteDoc(docPending.ref);
    document.body.removeChild(overlay);
    loadGroups();
  });
  
  popup.appendChild(approveBtn);
  popup.appendChild(rejectBtn);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

/* Funzione per rimuovere un membro dal gruppo (solo per admin) */
async function removeMemberFromGroup(groupId, memberUid) {
  const groupRef = doc(db, "groups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (groupSnap.exists()) {
    const groupDataLocal = groupSnap.data();
    const updatedMembers = groupDataLocal.members.filter(m => m.uid !== memberUid);
    await updateDoc(groupRef, { members: updatedMembers });
    await deleteDoc(doc(db, "users", memberUid, "groups", groupId));
    alert("Membro rimosso con successo.");
    loadGroups();
  }
}

/* Funzione per eliminare un gruppo (solo per admin) */
async function deleteGroup(groupId) {
  await deleteDoc(doc(db, "groups", groupId));
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

/* Listener per la creazione di un nuovo gruppo (gestito in dashboard) */
const createGroupBtn = document.getElementById("create-group-btn");
const newGroupForm = document.getElementById("new-group-form");
if (createGroupBtn && newGroupForm) {
  createGroupBtn.addEventListener("click", () => {
    newGroupForm.style.display =
      (!newGroupForm.style.display || newGroupForm.style.display === "none")
        ? "block"
        : "none";
  });
}

const submitGroupBtn = document.getElementById("submit-group-btn");
if (submitGroupBtn) {
  submitGroupBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    const groupNameInput = document.getElementById("group-name-input");
    const groupName = groupNameInput.value.trim();
    if (!groupName) {
      alert("Inserisci un nome per il gruppo.");
      return;
    }
    if (!user) return;
    try {
      const newGroupRef = await addDoc(collection(db, "groups"), {
        name: groupName,
        createdBy: user.uid,
        createdAt: new Date(),
        members: [{ uid: user.uid, role: "admin", name: user.displayName }]
      });
      await setDoc(doc(db, "users", user.uid, "groups", newGroupRef.id), {
        name: groupName,
        status: "admin",
        groupId: newGroupRef.id
      });
      groupNameInput.value = "";
      newGroupForm.style.display = "none";
      loadGroups();
      alert("✅ Gruppo creato con successo!");
    } catch (err) {
      console.error("Errore creazione gruppo:", err);
      alert("Errore durante la creazione del gruppo.");
    }
  });
}

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "index.html";
    });
  });
}

const devPanel = document.getElementById("dev-panel");
const clearBtn = document.getElementById("clear-pending-btn");
const fullResetBtn = document.getElementById("reset-everything-btn");

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loggedInUserId = user.uid;
    // In group.js non richiamiamo ensureUserDocument né displayUserInfo
    loadGroupData();
  } else {
    alert("Devi essere autenticato.");
    window.location.href = "index.html";
  }
});

if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Sicuro di voler eliminare solo le richieste pending?")) return;
    let count = 0;
    const groupsRef = collection(db, "users", auth.currentUser.uid, "groups");
    const groupsSnap = await getDocs(groupsRef);
    for (const groupDoc of groupsSnap.docs) {
      const data = groupDoc.data();
      if (data.status === "admin" && data.groupId) {
        const pendingRef = collection(db, "groups", data.groupId, "pendingTransactions");
        const pendingSnap = await getDocs(pendingRef);
        pendingSnap.forEach(async (docPending) => {
          if (docPending.data().status === "pending") {
            await deleteDoc(docPending.ref);
            count++;
          }
        });
      }
    }
    alert(`✅ Eliminati ${count} pending request.`);
    loadGroups();
  });
}

if (fullResetBtn) {
  fullResetBtn.addEventListener("click", async () => {
    if (!confirm("⚠️ Sicuro di voler ELIMINARE TUTTO dal database?")) return;
    let gruppiEliminati = 0;
    let riferimentiUtente = 0;
    const groupsSnap = await getDocs(collection(db, "groups"));
    for (const group of groupsSnap.docs) {
      await deleteDoc(doc(db, "groups", group.id));
      gruppiEliminati++;
    }
    const usersSnap = await getDocs(collection(db, "users"));
    for (const user of usersSnap.docs) {
      const userId = user.id;
      const userGroupsRef = collection(db, "users", userId, "groups");
      const userGroupsSnap = await getDocs(userGroupsRef);
      for (const docSnap of userGroupsSnap.docs) {
        await deleteDoc(doc(db, "users", userId, "groups", docSnap.id));
        riferimentiUtente++;
      }
    }
    alert(`✅ Reset completato: eliminati ${gruppiEliminati} gruppi e ${riferimentiUtente} riferimenti utente.`);
    signOut(auth).then(() => location.reload());
  });
};