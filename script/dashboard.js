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

// Firebase config e inizializzazione
const firebaseConfig = {
  apiKey: "AIzaSyADSqmhWAOC1KQnfmMLrYylQY6EjokXUuw",
  authDomain: "beercounter-fb28f.firebaseapp.com",
  projectId: "beercounter-fb28f",
  storageBucket: "beercounter-fb28f.firebasestorage.app",
  messagingSenderId: "335079316540",
  appId: "1:335079316540:web:fbef8c1307e1dcdcc6f739"
};

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

// Funzione per caricare i gruppi dell'utente loggato
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
    groupCard.setAttribute("data-ruolo", data.status);

    const title = document.createElement("h3");
    title.textContent = data.name;

    const role = document.createElement("p");
    role.textContent =
      data.status === "admin"
        ? "Sei l’amministratore"
        : data.status === "pending"
        ? "Richiesta in attesa"
        : "Sei un membro";

    groupCard.appendChild(title);
    groupCard.appendChild(role);

    // Se l'utente è admin e il gruppo esiste, gestisci l'invito e le richieste
    if (data.status === "admin" && data.groupId) {
      // Bottone per copiare il link d'invito
      const inviteBtn = document.createElement("button");
      inviteBtn.textContent = "Copia link invito";
      inviteBtn.className = "btn-secondary";
      inviteBtn.style.marginTop = "10px";

      inviteBtn.addEventListener("click", () => {
        const link = `${window.location.origin}/join.html?g=${data.groupId}`;
        navigator.clipboard.writeText(link).then(() => {
          inviteBtn.textContent = "✅ Link copiato!";
          setTimeout(() => {
            inviteBtn.textContent = "Copia link invito";
          }, 2000);
        });
      });
      groupCard.appendChild(inviteBtn);

      // Gestione delle richieste pending
      const requestsTitle = document.createElement("h4");
      requestsTitle.textContent = "Richieste in attesa";
      requestsTitle.style.marginTop = "16px";
      groupCard.appendChild(requestsTitle);

      const allUsersSnap = await getDocs(collection(db, "users"));
      for (const userDoc of allUsersSnap.docs) {
        if (userDoc.id === user.uid) continue; // Salta se è l'utente corrente

        const pendingRef = doc(db, "users", userDoc.id, "groups", data.groupId);
        const pendingSnap = await getDoc(pendingRef);

        if (pendingSnap.exists() && pendingSnap.data().status === "pending") {
          const richiesta = pendingSnap.data();

          const requestRow = document.createElement("div");
          requestRow.style.marginTop = "6px";

          const requester = document.createElement("span");
          requester.textContent = richiesta.requesterName || "Utente";

          const approveBtn = document.createElement("button");
          approveBtn.textContent = "✅";
          approveBtn.className = "btn-small";
          approveBtn.style.marginLeft = "8px";

          const rejectBtn = document.createElement("button");
          rejectBtn.textContent = "❌";
          rejectBtn.className = "btn-small";
          rejectBtn.style.marginLeft = "4px";

          approveBtn.addEventListener("click", async () => {
            await updateDoc(pendingRef, { status: "user" });

            const groupRef = doc(db, "groups", data.groupId);
            const groupSnap = await getDoc(groupRef);
            if (groupSnap.exists()) {
              const groupData = groupSnap.data();
              const updatedMembers = [...(groupData.members || [])];
              const alreadyPresent = updatedMembers.some((m) => m.uid === userDoc.id);
              if (!alreadyPresent) {
                updatedMembers.push({
                  uid: userDoc.id,
                  role: "user",
                  name: richiesta.requesterName || "utente"
                });
                await updateDoc(groupRef, { members: updatedMembers });
              }
            }
            loadGroups();
          });

          rejectBtn.addEventListener("click", async () => {
            await deleteDoc(pendingRef);
            loadGroups();
          });

          requestRow.appendChild(requester);
          requestRow.appendChild(approveBtn);
          requestRow.appendChild(rejectBtn);
          groupCard.appendChild(requestRow);
        }
      }
    }
    groupsList.appendChild(groupCard);
  }
}

// Listener per il pulsante "Crea un nuovo gruppo" per mostrare/nascondere il form
const createGroupBtn = document.getElementById("create-group-btn");
const newGroupForm = document.getElementById("new-group-form");

if (createGroupBtn && newGroupForm) {
  createGroupBtn.addEventListener("click", () => {
    if (newGroupForm.style.display === "none" || newGroupForm.style.display === "") {
      newGroupForm.style.display = "block";
    } else {
      newGroupForm.style.display = "none";
    }
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
      // Crea il gruppo
      const newGroupRef = await addDoc(collection(db, "groups"), {
        name: groupName,
        createdBy: user.uid,
        createdAt: new Date(),
        members: [{ uid: user.uid, role: "admin", name: user.displayName }]
      });

      // Aggiungi il gruppo nella subcollezione dell'utente
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

// Listener unificato per il controllo dello stato di autenticazione
onAuthStateChanged(auth, (user) => {
  displayUserInfo(user);
  if (user) {
    if (!window.skipGroupLoad) loadGroups();
    if (devPanel) devPanel.style.display = "block";
  }
});

// Pulisci richieste pending
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Sicuro di voler eliminare solo le richieste pending?")) return;

    let count = 0;
    const usersSnap = await getDocs(collection(db, "users"));
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const userGroupsRef = collection(db, "users", userId, "groups");
      const groupDocs = await getDocs(userGroupsRef);

      for (const group of groupDocs.docs) {
        if (group.data().status === "pending") {
          await deleteDoc(doc(db, "users", userId, "groups", group.id));
          count++;
        }
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
}