import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Config e inizializzazione Firebase
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Recupera l'ID del gruppo dall'URL
const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get("g");

if (!groupId) {
  alert("❌ Link di invito non valido.");
  window.location.href = "index.html";
}

// Logica di join (pending) estratta in funzione
async function joinGroupLogic() {
  try {
    const groupRef = doc(db, "groups", groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
      alert("❌ Il gruppo non esiste o è stato eliminato.");
      return window.location.href = "index.html";
    }

    const groupData = groupSnap.data();
    const user = auth.currentUser;
    const userId = user.uid;

    // Controlla se già membro/admin
    const isGiaMembro = (groupData.members || []).some(m => m.uid === userId);
    if (isGiaMembro) {
      alert("⚠️ Sei già in questo gruppo.");
      return window.location.href = "dashboard.html";
    }

    // Controlla richieste pending precedenti
    const pendingRef = doc(db, "users", userId, "groups", groupId);
    const pendingSnap = await getDoc(pendingRef);
    if (pendingSnap.exists()) {
      alert("⚠️ Hai già richiesto di entrare in questo gruppo. Attendi approvazione.");
      return window.location.href = "dashboard.html";
    }

    // Registra richiesta pending utente
    await setDoc(pendingRef, {
      name: groupData.name,
      groupId: groupId,
      status: "pending",
      requesterName: user.displayName || "utente"
    });

    // Registra nella subcollezione pendingTransactions del gruppo
    const groupPendingRef = doc(db, "groups", groupId, "pendingTransactions", userId);
    await setDoc(groupPendingRef, {
      status: "pending",
      requesterName: user.displayName || "utente",
      timestamp: new Date()
    });

    alert("✅ Richiesta inviata! Attendi che l’amministratore ti approvi.");
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error("Errore durante la gestione invito:", err);
    alert("❌ Errore durante l'accesso al gruppo.");
    window.location.href = "index.html";
  }
}

// Dopo il redirect dal login
getRedirectResult(auth)
  .then(result => {
    if (result && result.user) {
      joinGroupLogic();
    }
  })
  .catch(error => {
    console.error("getRedirectResult error:", error);
  });

// Controllo stato autenticazione per utenti già loggati
onAuthStateChanged(auth, user => {
  if (!user) {
    // Non loggato: avvia il redirect al login Google
    signInWithRedirect(auth, provider);
  } else {
    // Loggato: esegui join se non già processato
    if (!window.__joinProcessed) {
      window.__joinProcessed = true;
      joinGroupLogic();
    }
  }
});
