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

// ────────────────────────────────────────────────────────────────────────────────
//  CONFIG & GLOBALS
// ────────────────────────────────────────────────────────────────────────────────
const firebaseConfig = window.firebaseConfig;
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let loggedInUserId = null; // uid utente loggato

// ────────────────────────────────────────────────────────────────────────────────
//  UTILITIES
// ────────────────────────────────────────────────────────────────────────────────
function displayUserInfo(user) {
  const el = document.getElementById("user-name");
  if (el) el.textContent = user ? `Benvenuto, ${user.displayName}` : "Utente non loggato";
}

async function ensureUserDocument(user) {
  const ref = doc(db, "users", user.uid);
  if (!(await getDoc(ref)).exists()) {
    await setDoc(ref, { displayName: user.displayName || "", email: user.email || "" });
  }
}

// ────────────────────────────────────────────────────────────────────────────────
//  DASHBOARD MAIN LIST
// ────────────────────────────────────────────────────────────────────────────────
async function loadGroups() {
  const user = auth.currentUser;
  if (!user) return;

  const list = document.getElementById("groups-list");
  list.innerHTML = "";

  const userGroupsSnap = await getDocs(collection(db, "users", user.uid, "groups"));

  for (const docSnap of userGroupsSnap.docs) {
    const data = docSnap.data();

    const card = document.createElement("div");
    card.className = "card-gruppo";
    card.style.marginBottom = "20px";

    const title = document.createElement("h3");
    title.textContent = data.name;
    card.appendChild(title);

    const roleP = document.createElement("p");
    roleP.textContent = data.status === "admin" ? "Sei l’amministratore" : data.status === "pending" ? "Richiesta in attesa" : "Sei un membro";
    card.appendChild(roleP);

    if (data.groupId) {
      // copia link invito
      const inviteBtn = document.createElement("button");
      inviteBtn.className = "btn-secondary";
      inviteBtn.style.marginTop = "10px";
      inviteBtn.textContent = "Copia link invito";
      inviteBtn.addEventListener("click", () => {
        const base = window.location.href.replace(/\/[^\/]*$/, "/");
        const link = `${base}join.html?g=${data.groupId}`;
        navigator.clipboard.writeText(link).then(() => {
          inviteBtn.textContent = "✅ Link copiato!";
          setTimeout(() => inviteBtn.textContent = "Copia link invito", 2000);
        });
      });
      card.appendChild(inviteBtn);

      // gestione admin
      if (data.status === "admin") {
        const manageBtn = document.createElement("button");
        manageBtn.className = "btn-secondary";
        manageBtn.textContent = "Gestisci gruppo";
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

        card.appendChild(manageBtn);
        card.appendChild(detailsContainer);

        await loadPendingForGroup(data, card);
      }

      // accesso / pending
      if (data.status === "pending") {
        const p = document.createElement("p");
        p.textContent = "Richiesta in attesa di approvazione dall'amministratore.";
        p.style.fontStyle = "italic";
        p.style.marginTop = "10px";
        card.appendChild(p);
      } else {
        const accBtn = document.createElement("button");
        accBtn.className = "btn-primary";
        accBtn.textContent = "Accedi al gruppo";
        accBtn.style.marginTop = "10px";
        accBtn.addEventListener("click", () => window.location.href = `group.html?g=${data.groupId}`);
        card.appendChild(accBtn);
      }
    }

    list.appendChild(card);
  }
}

// ────────────────────────────────────────────────────────────────────────────────
//  PENDING REQUESTS (ADMIN)
// ────────────────────────────────────────────────────────────────────────────────
async function loadPendingForGroup(data, card) {
  const snap = await getDocs(collection(db, "groups", data.groupId, "pendingTransactions"));
  if (snap.empty) return;

  const title = document.createElement("h4");
  title.textContent = "Richieste in attesa";
  title.style.marginTop = "10px";
  card.appendChild(title);

  snap.forEach(docPending => {
    if (docPending.data().status !== "pending") return;

    const row = document.createElement("div");
    row.style.marginTop = "6px";
    row.textContent = docPending.data().requesterName || "Richiedente";

    const btn = document.createElement("button");
    btn.className = "btn-small";
    btn.textContent = "🔍 Dettagli";
    btn.style.marginLeft = "8px";
    btn.addEventListener("click", () => showPendingRequestPopup(docPending, data.groupId));
    row.appendChild(btn);

    card.appendChild(row);
  });
}

// popup dettagli pending (join + transazioni)
function showPendingRequestPopup(docPending, groupId) {
  const data = docPending.data();
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
    backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 9999
  });
  const pop = document.createElement("div");
  Object.assign(pop.style, { background: "#fff", padding: "20px", borderRadius: "8px", maxWidth: "400px", textAlign: "center" });

  const p = document.createElement("p");
  pop.appendChild(p);

  // JOIN REQUEST --------------------------------------------------------------
  if (!data.transType) {
    p.textContent = `${data.requesterName} ha chiesto di essere aggiunto al gruppo!`;

    const ok = document.createElement("button");
    ok.className = "btn-small";
    ok.style.marginRight = "10px";
    ok.textContent = "Approva";
    ok.addEventListener("click", async () => {
      await updateDoc(docPending.ref, { status: "user" });
      const requesterUid = data.requesterUid || docPending.id;
      await updateDoc(doc(db, "users", requesterUid, "groups", groupId), { status: "member" });

      const groupRef = doc(db, "groups", groupId);
      const snap = await getDoc(groupRef);
      if (snap.exists()) {
        const members = [...(snap.data().members || [])];
        members.push({ uid: requesterUid, role: "user", name: data.requesterName || "Utente" });
        await updateDoc(groupRef, { members });
      }
      document.body.removeChild(overlay);
      loadGroups();
    });

    const no = document.createElement("button");
    no.className = "btn-small";
    no.textContent = "Rifiuta";
    no.addEventListener("click", async () => {
      await deleteDoc(docPending.ref);
      document.body.removeChild(overlay);
      loadGroups();
    });

    pop.appendChild(ok);
    pop.appendChild(no);
    overlay.appendChild(pop);
    document.body.appendChild(overlay);
    return;
  }

  // TRANSACTION REQUEST -------------------------------------------------------
  const beerTxt = data.count === 1 ? "una birra" : `${data.count} birre`;
  p.textContent = data.transType === "ha"
    ? `${data.requesterName} ha richiesto di registrare il pagamento di ${beerTxt} da parte di ${data.actingUserName} verso ${data.recipientsNames}.`
    : `${data.requesterName} ha chiesto di aggiungere un debito di ${beerTxt} a ${data.recipientsNames}.`;

  const ok = document.createElement("button");
  ok.className = "btn-small";
  ok.style.marginRight = "10px";
  ok.textContent = "Approva";
  ok.addEventListener("click", async () => {
    // 1. marca completata la pending
    await updateDoc(docPending.ref, { status: "user" });

    // 2. recupera dati gruppo
    const groupRef  = doc(db, "groups", groupId);
    const snap = await getDoc(groupRef);
    if (!snap.exists()) return;

    let members = [...(snap.data().members || [])];
    let debts   = [...(snap.data().debts   || [])];

    // 3. assicura actingUser nei membri
    if (!members.some(m => m.uid === data.actingUser)) {
      members.push({ uid: data.actingUser, role: "user", name: data.actingUserName });
    }

    // 4. aggiorna saldoBirre del debitore
    members = members.map(m => {
      if (m.uid === data.actingUser) {
        const delta = data.transType === "deve" ? data.count : -data.count;
        m.saldoBirre = (m.saldoBirre || 0) + delta;
      }
      return m;
    });

    // 5. aggiorna debiti puntuali per ogni destinatario
    data.recipients.forEach(uidCred => {
      const credName = members.find(m => m.uid === uidCred)?.name || "Utente";
      const idx = debts.findIndex(d => d.debtorUid === data.actingUser && d.creditorUid === uidCred);
      const delta = data.transType === "deve" ? 1 : -1;

      if (idx >= 0) {
        debts[idx].count += delta;
        if (debts[idx].count <= 0) debts.splice(idx, 1);
      } else if (delta > 0) {
        debts.push({ debtorUid: data.actingUser, debtorName: data.actingUserName, creditorUid: uidCred, creditorName: credName, count: 1 });
      }
    });

    // 6. scrivi in Firestore
    await updateDoc(groupRef, { members, debts });

    // 7. storico
    await addDoc(collection(db, "groups", groupId, "history"), { message: data.message, timestamp: new Date() });

    document.body.removeChild(overlay);
    loadGroups();
  });

  const no = document.createElement("button");
  no.className = "btn-small";
  no.textContent = "Rifiuta";
  no.addEventListener("click", async () => {
    await deleteDoc(docPending.ref);
    document.body.removeChild(overlay);
    loadGroups();
  });

  pop.appendChild(ok);
  pop.appendChild(no);
  overlay.appendChild(pop);
  document.body.appendChild(overlay);
}

// ────────────────────────────────────────────────────────────────────────────────
//  GROUP ADMIN HELPERS
// ────────────────────────────────────────────────────────────────────────────────
async function loadGroupDetails(groupId, container) {
  container.innerHTML = "";
  const snap = await getDoc(doc(db, "groups", groupId));
  if (!snap.exists()) return container.appendChild(document.createTextNode("Gruppo non trovato."));

  const members = snap.data().members || [];
  const ul = document.createElement("ul");
  members.forEach(m => {
    const li = document.createElement("li");
    li.textContent = `${m.name} (${m.uid})`;
    if (m.uid !== loggedInUserId) {
      const b = document.createElement("button");
      b.className = "btn-small";
      b.style.marginLeft = "10px";
      b.textContent = "Rimuovi";
      b.addEventListener("click", async () => {
        await removeMemberFromGroup(groupId, m.uid);
        await loadGroupDetails(groupId, container);
      });
      li.appendChild(b);
    }
    ul.appendChild(li);
  });
  container.appendChild(ul);

  const del = document.createElement("button");
  del.className = "btn-secondary";
  del.style.marginTop = "10px";
  del.textContent = "Elimina gruppo";
  del.addEventListener("click", async () => {
    if (confirm("Sei sicuro di voler eliminare il gruppo?")) await deleteGroup(groupId);
  });
  container.appendChild(del);
}

async function removeMemberFromGroup(groupId, uid) {
  const grpRef = doc(db, "groups", groupId);
  const snap = await getDoc(grpRef);
  if (!snap.exists()) return;
  const members = snap.data().members.filter(m => m.uid !== uid);
  await updateDoc(grpRef, { members });
  await deleteDoc(doc(db, "users", uid, "groups", groupId));
  alert("Membro rimosso.");
  loadGroups();
}

async function deleteGroup(groupId) {
  await deleteDoc(doc(db, "groups", groupId));
  const usersSnap = await getDocs(collection(db, "users"));
  for (const u of usersSnap.docs) {
    const ref = doc(db, "users", u.id, "groups", groupId);
    if ((await getDoc(ref)).exists()) await deleteDoc(ref);
  }
  alert("Gruppo eliminato.");
  loadGroups();
}

// ────────────────────────────────────────────────────────────────────────────────
//  CREATE GROUP
// ────────────────────────────────────────────────────────────────────────────────
const createGroupBtn = document.getElementById("create-group-btn");
const newGroupForm   = document.getElementById("new-group-form");
if (createGroupBtn && newGroupForm) {
  createGroupBtn.addEventListener("click", () => {
    newGroupForm.style.display = newGroupForm.style.display === "block" ? "none" : "block";
  });
}

const submitGroupBtn = document.getElementById("submit-group-btn");
if (submitGroupBtn) {
  submitGroupBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    const inp  = document.getElementById("group-name-input");
    const name = inp.value.trim();
    if (!name) return alert("Inserisci un nome per il gruppo.");
    if (!user) return;

    try {
      const grpRef = await addDoc(collection(db, "groups"), {
        name,
        createdBy: user.uid,
        createdAt: new Date(),
        members: [{ uid: user.uid, role: "admin", name: user.displayName }],
        debts: [] // inizializza il nuovo campo
      });
      await setDoc(doc(db, "users", user.uid, "groups", grpRef.id), { name, status: "admin", groupId: grpRef.id });
      inp.value = "";
      newGroupForm.style.display = "none";
      loadGroups();
      alert("✅ Gruppo creato con successo!");
    } catch (e) {
      console.error(e);
      alert("Errore durante la creazione del gruppo.");
    }
  });
}

// ────────────────────────────────────────────────────────────────────────────────
//  MISC BTN
// ────────────────────────────────────────────────────────────────────────────────
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) logoutBtn.addEventListener("click", () => signOut(auth).then(() => window.location.href = "index.html"));

const devPanel = document.getElementById("dev-panel");
const clearBtn = document.getElementById("clear-pending-btn");
const fullResetBtn = document.getElementById("reset-everything-btn");

if (clearBtn) clearBtn.addEventListener("click", async () => {
  if (!confirm("Sicuro di voler eliminare solo le richieste pending?")) return;
  let count = 0;
  const groupsSnap = await getDocs(collection(db, "users", auth.currentUser.uid, "groups"));
  for (const g of groupsSnap.docs) {
    if (g.data().status !== "admin") continue;
    const pendingSnap = await getDocs(collection(db, "groups", g.data().groupId, "pendingTransactions"));
    for (const p of pendingSnap.docs) if (p.data().status === "pending") { await deleteDoc(p.ref); count++; }
  }
  alert(`✅ Eliminati ${count} pending request.`);
  loadGroups();
});

if (fullResetBtn) fullResetBtn.addEventListener("click", async () => {
  if (!confirm("⚠️ Sicuro di voler ELIMINARE TUTTO dal database?")) return;
  let gDel = 0, refDel = 0;
  const groupsSnap = await getDocs(collection(db, "groups"));
  for (const g of groupsSnap.docs) { await deleteDoc(doc(db, "groups", g.id)); gDel++; }
  const usersSnap = await getDocs(collection(db, "users"));
  for (const u of usersSnap.docs) {
    const userGroupsSnap = await getDocs(collection(db, "users", u.id, "groups"));
    for (const ug of userGroupsSnap.docs) { await deleteDoc(doc(db, "users", u.id, "groups", ug.id)); refDel++; }
  }
  alert(`✅ Reset completato: eliminati ${gDel} gruppi e ${refDel} riferimenti utente.`);
  signOut(auth).then(() => location.reload());
});

// ────────────────────────────────────────────────────────────────────────────────
//  AUTH LISTENER
// ────────────────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  displayUserInfo(user);
  if (user) {
    loggedInUserId = user.uid;
    await ensureUserDocument(user);
    loadGroups();
    if (devPanel) devPanel.style.display = "block";
  }
});
