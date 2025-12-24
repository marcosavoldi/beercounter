import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc as docRef,
  updateDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Config e inizializzazione Firebase
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// UID del proprietario
const SITE_OWNER_UID = window.SITE_OWNER_UID;
// Provider per login automatico
const provider = new GoogleAuthProvider();

// Listen per autenticazione
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    await signInWithPopup(auth, provider);
    return;
  }
  if (user.uid !== SITE_OWNER_UID) {
    alert("Accesso negato: pannello riservato all'amministratore.");
    window.location.href = "index.html";
    return;
  }
  // Carica pannello admin
  await loadAllGroups();
});

// Carica e mostra tutti i gruppi
async function loadAllGroups() {
  const list = document.getElementById("groups-admin-list");
  if (!list) return;
  list.innerHTML = "";

  const snapshot = await getDocs(collection(db, "groups"));
  snapshot.forEach((groupDoc) => {
    const data = groupDoc.data();
    const card = document.createElement("div");
    card.className = "card-gruppo";
    card.innerHTML = `
      <h3>${data.name}</h3>
      <p>Creato da: ${data.createdBy || "sconosciuto"}</p>
      <div style="margin:10px 0; display:flex; gap:8px;">
        <button class="btn-secondary btn-small" data-id="${groupDoc.id}" data-action="delete">Elimina gruppo</button>
        <button class="btn-secondary btn-small" data-id="${groupDoc.id}" data-action="edit">Modifica nome</button>
        <button class="btn-secondary btn-small" data-id="${groupDoc.id}" data-action="toggle-members">Gestisci membri</button>
      </div>
      <div class="members-list" data-group-id="${groupDoc.id}" style="display:none; border-top:1px dashed #ccc; padding-top:10px;"></div>
    `;
    list.appendChild(card);
  });

  // Delegazione eventi per pulsanti
  list.addEventListener("click", async (e) => {
    if (e.target.tagName !== "BUTTON") return;
    const groupId = e.target.dataset.id;
    const action = e.target.dataset.action;

    if (action === "toggle-members") {
      const membersDiv = document.querySelector(`.members-list[data-group-id="${groupId}"]`);
      if (membersDiv.style.display === "none") {
        // Mostra e carica membri
        membersDiv.style.display = "block";
        membersDiv.innerHTML = "Caricamento membri...";
        const groupSnap = await getDoc(docRef(db, "groups", groupId));
        const members = groupSnap.data().members || [];
        membersDiv.innerHTML = members.map(m => `
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
            <span>${m.name}</span>
            <button class="btn-small btn-secondary" data-id="${groupId}" data-member="${m.uid}" data-action="remove-member">Rimuovi</button>
          </div>
        `).join("");
      } else {
        membersDiv.style.display = "none";
      }
    }
    else if (action === "remove-member") {
      const memberUid = e.target.dataset.member;
      if (!confirm("Sei sicuro di voler rimuovere questo partecipante?")) return;
      // Rimuovi da gruppo
      const groupRef = docRef(db, "groups", groupId);
      const groupSnap = await getDoc(groupRef);
      const newMembers = (groupSnap.data().members || []).filter(m => m.uid !== memberUid);
      await updateDoc(groupRef, { members: newMembers });
      // Rimuovi riferimento utente
      await deleteDoc(docRef(db, "users", memberUid, "groups", groupId));
      alert("Partecipante rimosso con successo.");
      // Ricarica pannello
      await loadAllGroups();
    }
    else if (action === "delete") {
      if (!confirm("Sei sicuro di voler eliminare questo gruppo?")) return;
      try {
        await deleteDoc(docRef(db, "groups", groupId));
        // Rimuovi riferimenti utenti
        const usersSnap = await getDocs(collection(db, "users"));
        for (const u of usersSnap.docs) {
          await deleteDoc(docRef(db, "users", u.id, "groups", groupId));
        }
        alert("Gruppo eliminato e riferimenti rimossi.");
        await loadAllGroups();
      } catch (err) {
        console.error("Errore eliminazione gruppo:", err);
        alert("Errore eliminazione: " + err.message);
      }
    }
    else if (action === "edit") {
      const newName = prompt("Inserisci il nuovo nome per il gruppo:");
      if (!newName) return;
      try {
        const groupRef = docRef(db, "groups", groupId);
        await updateDoc(groupRef, { name: newName });
        // Aggiorna sottocollezioni utenti
        const usersSnap = await getDocs(collection(db, "users"));
        for (const u of usersSnap.docs) {
          const ugRef = docRef(db, "users", u.id, "groups", groupId);
          const ugSnap = await getDoc(ugRef);
          if (ugSnap.exists()) await updateDoc(ugRef, { name: newName });
        }
        alert("Nome gruppo aggiornato.");
        await loadAllGroups();
      } catch (err) {
        console.error("Errore modifica gruppo:", err);
        alert("Errore modifica: " + err.message);
      }
    }
  });
}
