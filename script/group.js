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
  loadGroupData: Carica i dati del gruppo e imposta currentUserIsAdmin in base alla membership 
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
  
  // Imposta saldoBirre a 0 per ogni membro se mancante
  groupData.members = (groupData.members || []).map(member => {
    if (member.saldoBirre === undefined) {
      member.saldoBirre = 0;
    }
    return member;
  });
  
  // Verifica se l'utente loggato è admin in questo gruppo
  const loggedInMember = groupData.members.find(m => m.uid === loggedInUserId);
  currentUserIsAdmin = loggedInMember && loggedInMember.role === "admin";
  
  populateActingUserSelect();
  populateRecipients();
  loadHistory();
  // Per le pending request nella dashboard (se admin)
  if (currentUserIsAdmin) {
    loadPendingRequests();
  }
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

// Carica lo storico delle transazioni dalla subcollezione "history"
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

// Funzione per caricare le pending request (se admin) dalla subcollezione "pendingTransactions"
async function loadPendingRequests() {
  // Crea un header per pending request e un container
  const pendingHeader = document.createElement("h4");
  pendingHeader.textContent = "Richieste in attesa";
  pendingHeader.style.marginTop = "10px";
  
  // Trova il container della card corrente (supponiamo che le pending siano visualizzate in dashboard)
  // Qui, ad esempio, potresti avere un container apposito; altrimenti, modificherai l'interfaccia della dashboard.
  // Per questo esempio, ipotizziamo che le pending siano parte di ogni card.
  // Se stai iterando sulle card, questo codice va integrato nel ciclo che genera la card se l'utente è admin.
  
  // Esempio: per ogni gruppo, aggiungi pending requests se admin
  // (Questo codice è già integrato nel ciclo in loadGroups() in una versione precedente.
  // Qui mostro una funzione separata che puoi richiamare all'interno della card se l'utente è admin)
  
  // Dato che in loadGroups() abbiamo già gestito il rendering delle pending requests,
  // in questa versione non lo ripropongo qui separatamente.
  // In alternativa, potresti avere una funzione che, per ogni gruppo admin, ricava i pending.
}

// Pulsante "Aggiorna" per ricaricare la pagina
refreshBtn.addEventListener("click", () => {
  window.location.reload();
});

// Gestione della conferma dell'operazione
confirmBtn.addEventListener("click", async () => {
  // Seleziona l'utente dalla tendina che esegue l'operazione
  const actingUserUid = actingUserSelect.value;
  
  // Determina il tipo di operazione: "deve" o "ha"
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
  // Filtra l'eventuale selezione dell'utente stesso (non ha senso operare su se stessi)
  selectedRecipients = selectedRecipients.filter(uid => uid !== actingUserUid);
  if (selectedRecipients.length === 0) {
    alert("Seleziona almeno un destinatario diverso da te.");
    return;
  }
  
  const count = selectedRecipients.length;
  const timestamp = new Date();
  const formattedDate = timestamp.toLocaleString();
  
  // Ottieni il nome dell'utente selezionato nella tendina (il soggetto dell'operazione)
  const actingMember = groupData.members.find(m => m.uid === actingUserUid);
  const actingUserName = actingMember ? actingMember.name : "Sconosciuto";
  
  // Ottieni la lista dei nomi dei destinatari
  const recipientsNames = groupData.members
    .filter(m => selectedRecipients.includes(m.uid))
    .map(m => m.name)
    .join(", ");
  
  // Costruisci la descrizione secondo la seconda variante:
  // Se transType === "ha": "X ha richiesto di registrare il pagamento di Y birre da parte di [actingUserName] verso [recipientNames]."
  // Se transType === "deve": "X ha chiesto di aggiungere un debito di Y birre a [recipientNames]."
  // Nel caso pending, il richiedente è il loggato (requester) mentre l'utente selezionato dalla tendina (actingUserName)
  // rappresenta l'utente per cui si vuole registrare l'operazione.
  const requesterName = groupData.members.find(m => m.uid === loggedInUserId)?.name || "Richiedente sconosciuto";
  
  let message = "";
  if (transType === "ha") {
    message = `${formattedDate}: ${requesterName} ha richiesto di registrare il pagamento di ${count} birre da parte di ${actingUserName} verso ${recipientsNames}.`;
  } else {
    message = `${formattedDate}: ${requesterName} ha chiesto di aggiungere un debito di ${count} birre a ${recipientsNames}.`;
  }
  
  // Se l'utente loggato è admin, processa immediatamente, altrimenti crea una richiesta pending
  if (currentUserIsAdmin) {
    await processTransactionImmediate(actingUserUid, transType, count, message);
  } else {
    await processTransactionPending(actingUserUid, transType, selectedRecipients, count, message, requesterName, actingUserName);
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
  
  // Registra la transazione nello storico
  const historyRef = collection(db, "groups", groupId, "history");
  await addDoc(historyRef, {
    message: message,
    timestamp: new Date()
  });
  
  alert("Operazione registrata con successo!");
  window.location.reload();
}

// Funzione per creare una richiesta pending (per utenti non admin)
async function processTransactionPending(actingUserUid, transType, recipients, count, message, requesterName, actingUserName) {
  // Salva informazioni aggiuntive per generare la frase nel popup.
  const pendingRef = collection(db, "groups", groupId, "pendingTransactions");
  await addDoc(pendingRef, {
    actingUser: actingUserUid,
    actingUserName: actingUserName,
    requesterName: requesterName,
    transType: transType,
    recipients: recipients,          // array di UID destinatari
    // Salviamo anche la stringa di nomi dei destinatari per comodità:
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

/* 
  La funzione loadGroupDetails mostra i dettagli del gruppo (lista dei membri, ecc.)
  e visualizza pulsanti di gestione solo se l'utente loggato è admin.
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
    // Se admin, mostra il pulsante "Rimuovi" per gli altri membri
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
  
  // Se admin, mostra il pulsante "Elimina gruppo"
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

// Funzione per mostrare il popup dei dettagli della pending request
function showPendingRequestPopup(docPending) {
  const pendingData = docPending.data();
  
  // Costruisci la descrizione usando i dati salvati
  let description = "";
  if (pendingData.transType === "ha") {
    description = `${pendingData.requesterName} ha richiesto di registrare il pagamento di ${pendingData.count} birre da parte di ${pendingData.actingUserName} verso ${pendingData.recipientsNames}.`;
  } else {
    description = `${pendingData.requesterName} ha chiesto di aggiungere un debito di ${pendingData.count} birre a ${pendingData.recipientsNames}.`;
  }
  
  // Crea l'overlay e il popup
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
  
  // Bottone Approva
  const approveBtn = document.createElement("button");
  approveBtn.textContent = "Approva";
  approveBtn.className = "btn-small";
  approveBtn.style.marginRight = "10px";
  approveBtn.addEventListener("click", async () => {
    await updateDoc(docPending.ref, { status: "user" });
    // Aggiorna il gruppo: aggiungi il membro se non già presente
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
    window.location.reload();
  });
  
  // Bottone Rifiuta
  const rejectBtn = document.createElement("button");
  rejectBtn.textContent = "Rifiuta";
  rejectBtn.className = "btn-small";
  rejectBtn.addEventListener("click", async () => {
    await deleteDoc(docPending.ref);
    document.body.removeChild(overlay);
    window.location.reload();
  });
  
  popup.appendChild(approveBtn);
  popup.appendChild(rejectBtn);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

// In loadGroups, per le richieste pending, sostituisci i bottoni diretti con un bottone di dettagli:
async function loadPendingForGroup(data, groupCard, user) {
  // Query pending dalla subcollezione "pendingTransactions" di questo gruppo
  const pendingRef = collection(db, "groups", data.groupId, "pendingTransactions");
  const pendingSnap = await getDocs(pendingRef);
  if (!pendingSnap.empty) {
    const requestsTitle = document.createElement("h4");
    requestsTitle.textContent = "Richieste in attesa";
    requestsTitle.style.display = "block";
    requestsTitle.style.marginTop = "10px";
    groupCard.appendChild(requestsTitle);
    
    pendingSnap.forEach(docPending => {
      const pendingData = docPending.data();
      if (pendingData.status === "pending") {
        const requestRow = document.createElement("div");
        requestRow.style.display = "block";
        requestRow.style.marginTop = "6px";
        
        // Mostra il nome del richiedente
        const requesterSpan = document.createElement("span");
        requesterSpan.textContent = pendingData.requesterName || "Richiedente sconosciuto";
        requestRow.appendChild(requesterSpan);
        
        // Bottone "Dettagli" per visualizzare il popup
        const detailsBtn = document.createElement("button");
        detailsBtn.textContent = "🔍 Dettagli";
        detailsBtn.className = "btn-small";
        detailsBtn.style.marginLeft = "8px";
        detailsBtn.addEventListener("click", () => {
          showPendingRequestPopup(docPending);
        });
        requestRow.appendChild(detailsBtn);
        
        groupCard.appendChild(requestRow);
      }
    });
  }
}

/* 
  Modifichiamo loadGroups in modo tale da chiamare loadPendingForGroup() solo se l'utente ha status admin
  nella membership (data.status === "admin").
*/
async function loadGroups() {
  const user = auth.currentUser;
  if (!user) return;
  
  const groupsList = document.getElementById("groups-list");
  groupsList.innerHTML = "";
  
  const groupsRef = collection(db, "users", user.uid, "groups");
  const querySnapshot = await getDocs(groupsRef);
  
  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data();
    
    const groupCard = document.createElement("div");
    groupCard.className = "card-gruppo";
    groupCard.style.display = "block";
    groupCard.style.marginBottom = "20px";
    
    const title = document.createElement("h3");
    title.textContent = data.name;
    groupCard.appendChild(title);
    
    const role = document.createElement("p");
    role.textContent =
      data.status === "admin"
        ? "Sei l’amministratore"
        : data.status === "pending"
        ? "Richiesta in attesa"
        : "Sei un membro";
    groupCard.appendChild(role);
    
    if (data.groupId) {
      // Bottone "Copia link invito" (visibile a tutti)
      const inviteBtn = document.createElement("button");
      inviteBtn.textContent = "Copia link invito";
      inviteBtn.className = "btn-secondary";
      inviteBtn.style.display = "block";
      inviteBtn.style.marginTop = "10px";
      inviteBtn.addEventListener("click", () => {
        const baseUrl = window.location.href.replace(/\/[^\/]*$/, "/");
        const link = `${baseUrl}join.html?g=${data.groupId}`;
        navigator.clipboard.writeText(link).then(() => {
          inviteBtn.textContent = "✅ Link copiato!";
          setTimeout(() => {
            inviteBtn.textContent = "Copia link invito";
          }, 2000);
        });
      });
      groupCard.appendChild(inviteBtn);
      
      // Se l'utente è admin (in questo gruppo) mostra opzioni amministrative
      if (data.status === "admin") {
        // Pulsante "Gestisci gruppo"
        const manageBtn = document.createElement("button");
        manageBtn.textContent = "Gestisci gruppo";
        manageBtn.className = "btn-secondary";
        manageBtn.style.display = "block";
        manageBtn.style.marginTop = "10px";
        
        const detailsContainer = document.createElement("div");
        detailsContainer.className = "group-details";
        detailsContainer.style.display = "none";
        detailsContainer.style.borderTop = "1px dashed #ccc";
        detailsContainer.style.marginTop = "10px";
        detailsContainer.style.paddingTop = "10px";
        
        manageBtn.addEventListener("click", async () => {
          if (detailsContainer.style.display === "block") {
            detailsContainer.style.display = "none";
            manageBtn.textContent = "Gestisci gruppo";
          } else {
            await loadGroupDetails(data.groupId, detailsContainer);
            detailsContainer.style.display = "block";
            manageBtn.textContent = "Nascondi dettagli";
          }
        });
        groupCard.appendChild(manageBtn);
        groupCard.appendChild(detailsContainer);
        
        // Carica e visualizza le pending request per questo gruppo
        await loadPendingForGroup(data, groupCard, user);
      }
      
      // Bottone "Accedi al gruppo" (visibile a tutti)
      const accessBtn = document.createElement("button");
      accessBtn.textContent = "Accedi al gruppo";
      accessBtn.className = "btn-primary";
      accessBtn.style.display = "block";
      accessBtn.style.marginTop = "10px";
      accessBtn.addEventListener("click", () => {
        window.location.href = `group.html?g=${data.groupId}`;
      });
      groupCard.appendChild(accessBtn);
    }
    groupsList.appendChild(groupCard);
  }
}

// Resto delle funzioni invariato: loadGroupData, removeMemberFromGroup, deleteGroup, etc.

// Funzione per rimuovere un membro dal gruppo (solo admin)
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

// Funzione per eliminare un gruppo (solo admin)
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

// Listener per la creazione di un nuovo gruppo (gestito in dashboard)
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

// Logout
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = "index.html";
    });
  });
}

// Elementi del pannello di sviluppo
const devPanel = document.getElementById("dev-panel");
const clearBtn = document.getElementById("clear-pending-btn");
const fullResetBtn = document.getElementById("reset-everything-btn");

onAuthStateChanged(auth, async (user) => {
  displayUserInfo(user);
  if (user) {
    await ensureUserDocument(user);
    if (!window.skipGroupLoad) loadGroups();
    if (devPanel) devPanel.style.display = "block";
  }
});

// Pulisci richieste pending (per admin) usando la subcollezione "pendingTransactions"
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

// Reset totale del DB
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