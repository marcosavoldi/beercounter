import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getFirestore,
  getDoc,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Utilizza la configurazione Firebase definita in config.js
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Recupera l'ID del gruppo dall'URL
const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get("g");

if (!groupId) {
  alert("❌ Link di invito non valido.");
  window.location.href = "index.html";
}

// Quando l'utente è loggato
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Login forzato con popup se l'utente non è loggato
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      alert("❌ Login necessario per entrare in un gruppo.");
      window.location.href = "index.html";
    }
    return;
  }

  try {
    // 1. Controlla se il gruppo esiste
    const groupRef = doc(db, "groups", groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
      alert("❌ Il gruppo non esiste o è stato eliminato.");
      window.location.href = "index.html";
      return;
    }

    const groupData = groupSnap.data();
    const userId = user.uid;

    // 2. Se l'utente è già membro o admin → non fare nulla
    const isGiaMembro = (groupData.members || []).some(m => m.uid === userId);
    if (isGiaMembro) {
      alert("⚠️ Sei già in questo gruppo.");
      window.location.href = "dashboard.html";
      return;
    }

    // 3. Verifica se hai già inviato una richiesta pending
    const pendingRef = doc(db, "users", userId, "groups", groupId);
    const pendingSnap = await getDoc(pendingRef);

    if (pendingSnap.exists()) {
      alert("⚠️ Hai già richiesto di entrare in questo gruppo. Attendi approvazione.");
      window.location.href = "dashboard.html";
      return;
    }

    // 4. Tutto ok → salva la richiesta pending nella subcollezione dell'utente...
    await setDoc(pendingRef, {
      name: groupData.name,
      groupId: groupId,
      status: "pending",
      requesterName: user.displayName || "utente"
    });

    // ...e salva anche la richiesta nella subcollezione "pendingTransactions" del gruppo
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
});