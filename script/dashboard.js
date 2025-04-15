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
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Utilizza la configurazione Firebase definita in config.js
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Funzione per mostrare il nome utente
function displayUserInfo(user) {
  const userNameElem = document.getElementById("user-name");
  userNameElem.innerText = user
    ? `Benvenuto, ${user.displayName}`
    : "Utente non loggato";
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

  // Carica i gruppi memorizzati nella subcollezione dell'utente
  const groupsRef = collection(db, "users", user.uid, "groups");
  const querySnapshot = await getDocs(groupsRef);

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data();
    
    // Crea la card del gruppo
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

      // Verifica se l'utente è admin per questo gruppo
      if (data.status === "admin") {
        // Pulsante "Gestisci gruppo"
        const manageBtn = document.createElement("button");
        manageBtn.textContent = "Gestisci gruppo";
        manageBtn.className = "btn-secondary";
        manageBtn.style.display = "block";
        manageBtn.style.marginTop = "10px";
        
        // Contenitore per i dettagli del gruppo
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

        // Sezione pending: Query pending transactions dalla subcollezione "pendingTransactions"
        const requestsTitle = document.createElement("h4");
        requestsTitle.textContent = "Richieste in attesa";
        requestsTitle.style.display = "block";
        requestsTitle.style.marginTop = "10px";
        groupCard.appendChild(requestsTitle);
        
        const pendingRef = collection(db, "groups", data.groupId, "pendingTransactions");
        const pendingSnap = await getDocs(pendingRef);
        pendingSnap.forEach(docPending => {
          const pendingData = docPending.data();
          if (pendingData.status === "pending") {
            const requestRow = document.createElement("div");
            requestRow.style.display = "block";
            requestRow.style.marginTop = "6px";
            
            const requester = document.createElement("span");
            requester.textContent = pendingData.requesterName || "Utente";
            
            const approveBtn = document.createElement("button");
            approveBtn.textContent = "✅";
            approveBtn.className = "btn-small";
            approveBtn.style.marginLeft = "8px";
            
            const rejectBtn = document.createElement("button");
            rejectBtn.textContent = "❌";
            rejectBtn.className = "btn-small";
            rejectBtn.style.marginLeft = "4px";
            
            approveBtn.addEventListener("click", async () => {
              await updateDoc(docPending.ref, { status: "user" });
              // Aggiorna il documento del gruppo aggiungendo il membro richiesto (se non già presente)
              const groupRef = doc(db, "groups", data.groupId);
              const groupSnap = await getDoc(groupRef);
              if (groupSnap.exists()) {
                const groupDataLocal = groupSnap.data();
                const updatedMembers = [...(groupDataLocal.members || [])];
                const alreadyPresent = updatedMembers.some((m) => m.uid === pendingData.actingUser);
                if (!alreadyPresent) {
                  updatedMembers.push({
                    uid: pendingData.actingUser,
                    role: "user",
                    name: pendingData.requesterName || "Utente"
                  });
                  await updateDoc(groupRef, { members: updatedMembers });
                }
              }
              loadGroups();
            });
            
            rejectBtn.addEventListener("click", async () => {
              await deleteDoc(docPending.ref);
              loadGroups();
            });
            
            requestRow.appendChild(requester);
            requestRow.appendChild(approveBtn);
            requestRow.appendChild(rejectBtn);
            groupCard.appendChild(requestRow);
          }
        });
      }
      
      // Pulsante "Accedi al gruppo" (visibile a tutti)
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

// Funzione per caricare i dettagli di un gruppo e visualizzare la lista dei membri
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
    // Se l'utente loggato è admin, mostra il pulsante "Rimuovi" per i membri (tranne se stesso)
    if (currentUserIsAdmin && member.uid !== auth.currentUser.uid) {
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
  
  // Se l'utente è admin, mostra il pulsante per eliminare il gruppo
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

// Listener per il pulsante "Crea un nuovo gruppo"
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

// Creazione di un nuovo gruppo
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

// Listener per il controllo dello stato di autenticazione
onAuthStateChanged(auth, async (user) => {
  displayUserInfo(user);
  if (user) {
    await ensureUserDocument(user);
    if (!window.skipGroupLoad) loadGroups();
    if (devPanel) devPanel.style.display = "block";
  }
});

// Pulisci richieste pending
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Sicuro di voler eliminare solo le richieste pending?")) return;

    let count = 0;
    // Ora query la subcollezione "pendingTransactions" in ogni gruppo dell'utente admin
    const groupsRef = collection(db, "users", auth.currentUser.uid, "groups");
    const groupsSnap = await getDocs(groupsRef);
    for (const groupDoc of groupsSnap.docs) {
      const data = groupDoc.data();
      if (data.status === "admin" && data.groupId) {
        const pendingRef = collection(db, "groups", data.groupId, "pendingTransactions");
        const pendingSnap = await getDocs(pendingRef);
        pendingSnap.forEach(async docPending => {
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