import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Utilizza la configurazione Firebase definita in config.js
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Variabile globale per tenere traccia dell'utente loggato
let loggedInUserId = null;

// Funzione per mostrare il nome utente (in dashboard)
function displayUserInfo(user) {
  const userNameElem = document.getElementById("user-name");
  if (userNameElem) {
    userNameElem.textContent = user ? `Benvenuto, ${user.displayName}` : "Utente non loggato";
  }
}

// Funzione per assicurarsi che il documento dell'utente esista in "users"
async function ensureUserDocument(user) {
  const userDocRef = doc(db, "users", user.uid);
  const userDocSnap = await getDoc(userDocRef);
  if (!userDocSnap.exists()) {
    await setDoc(userDocRef, {
      displayName: user.displayName || "",
      email: user.email || ""
    });
  }
}

// Funzione per caricare i gruppi dell'utente loggato
async function loadGroups() {
  const user = auth.currentUser;
  if (!user) return;

  const groupsList = document.getElementById("groups-list");
  groupsList.innerHTML = "";

  // Carica i gruppi dalla subcollezione dell'utente
  const groupsRef = collection(db, "users", user.uid, "groups");
  const querySnapshot = await getDocs(groupsRef);

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data();
    console.log("Carico gruppo:", data.name, "Status:", data.status, "GroupId:", data.groupId);
    
    // Crea la card del gruppo
    const groupCard = document.createElement("div");
    groupCard.className = "card-gruppo";
    groupCard.style.display = "block";
    groupCard.style.marginBottom = "20px";

    // Titolo del gruppo
    const title = document.createElement("h3");
    title.textContent = data.name;
    groupCard.appendChild(title);

    // Visualizza il ruolo dell'utente per questo gruppo
    const role = document.createElement("p");
    role.textContent =
      data.status === "admin"
        ? "Sei l’amministratore"
        : data.status === "pending"
        ? "Richiesta in attesa"
        : "Sei un membro";
    groupCard.appendChild(role);

    if (data.groupId) {
      // Bottone "Copia link invito" - visibile a tutti
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

      // Se l'utente ha status "admin" per questo gruppo, aggiungi le opzioni di gestione
      if (data.status === "admin") {
        // Pulsante "Gestisci gruppo"
        const manageBtn = document.createElement("button");
        manageBtn.textContent = "Gestisci gruppo";
        manageBtn.className = "btn-secondary";
        manageBtn.style.display = "block";
        manageBtn.style.marginTop = "10px";

        // Container per i dettagli del gruppo (invisibile inizialmente)
        const detailsContainer = document.createElement("div");
        detailsContainer.className = "group-details";
        detailsContainer.style.display = "none";
        detailsContainer.style.borderTop = "1px dashed #ccc";
        detailsContainer.style.marginTop = "10px";
        detailsContainer.style.paddingTop = "10px";

        manageBtn.addEventListener("click", async () => {
          console.log("Gestisci gruppo cliccato per groupId:", data.groupId);
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

        // Carica le pending request per questo gruppo dalla subcollezione "pendingTransactions"
        await loadPendingForGroup(data, groupCard);
      }

      // Se lo status è "pending", mostra il messaggio informativo, altrimenti il bottone "Accedi al gruppo"
      if (data.status === "pending") {
        const pendingMsg = document.createElement("p");
        pendingMsg.textContent = "Richiesta in attesa di approvazione dall'amministratore.";
        pendingMsg.style.fontStyle = "italic";
        pendingMsg.style.marginTop = "10px";
        groupCard.appendChild(pendingMsg);
      } else {
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
    }

    groupsList.appendChild(groupCard);
  }
}

// Funzione per caricare le pending request (solo per admin) dalla subcollezione "pendingTransactions"
async function loadPendingForGroup(data, groupCard) {
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
          showPendingRequestPopup(docPending, data.groupId);
        });
        requestRow.appendChild(detailsBtn);

        groupCard.appendChild(requestRow);
      }
    });
  }
}

// Funzione per caricare i dettagli del gruppo (lista membri e opzioni admin) – visibile solo se l'utente è admin
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
    // Aggiungi il bottone "Rimuovi" per ogni membro tranne l'utente loggato
    if (member.uid !== loggedInUserId) {
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

  // Aggiungi il pulsante per eliminare il gruppo
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

// Funzione per mostrare il popup dei dettagli di una richiesta pending
function showPendingRequestPopup(docPending, groupId) {
  const pendingData = docPending.data();
  
  // Se non è presente 'transType', supponiamo si tratti di una join request
  if (!pendingData.transType) {
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
    descElem.textContent = `${pendingData.requesterName} ha chiesto di essere aggiunto al gruppo!`;
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
        // Assicurati che join.js abbia salvato anche il campo requesterUid
        updatedMembers.push({
          uid: pendingData.requesterUid,
          role: "user",
          name: pendingData.requesterName || "Utente"
        });
        await updateDoc(groupRef, { members: updatedMembers });
      }
      document.body.removeChild(overlay);
      loadGroups();
    });
    popup.appendChild(approveBtn);
  
    const rejectBtn = document.createElement("button");
    rejectBtn.textContent = "Rifiuta";
    rejectBtn.className = "btn-small";
    rejectBtn.addEventListener("click", async () => {
      await deleteDoc(docPending.ref);
      document.body.removeChild(overlay);
      loadGroups();
    });
    popup.appendChild(rejectBtn);
  
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    return;
  }
  
  // Se invece si tratta di una richiesta relativa alle transazioni sulle birre
  const count = pendingData.count;
  const beerText = count === 1 ? "una birra" : `${count} birre`;
  
  let message = "";
  if (pendingData.transType === "deve") {
    message = `Nuovo debito! ${pendingData.actingUserName} deve ${beerText} a ${pendingData.recipientsNames}!`;
  } else {
    message = `Birre pagate! ${pendingData.actingUserName} ha pagato ${beerText} a ${pendingData.recipientsNames}!`;
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
  descElem.textContent = pendingData.transType === "ha"
    ? `${pendingData.requesterName} ha richiesto di registrare il pagamento di ${beerText} da parte di ${pendingData.actingUserName} verso ${pendingData.recipientsNames}.`
    : `${pendingData.requesterName} ha chiesto di aggiungere un debito di ${beerText} a ${pendingData.recipientsNames}.`;
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
      const historyRef = collection(db, "groups", groupId, "history");
      await addDoc(historyRef, {
        message: message,
        timestamp: new Date()
      });
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

// Funzione per rimuovere un membro dal gruppo (solo per admin)
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

// Funzione per eliminare un gruppo (solo per admin)
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
  displayUserInfo(user);
  if (user) {
    loggedInUserId = user.uid;
    await ensureUserDocument(user);
    loadGroups();
    if (devPanel) devPanel.style.display = "block";
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
}