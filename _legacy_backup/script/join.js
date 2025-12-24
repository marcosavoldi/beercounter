import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Config e inizializzazione Firebase
const firebaseConfig = window.firebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Recupera ID del gruppo dall'URL e path di redirect
const params = new URLSearchParams(window.location.search);
const groupId = params.get("g");
if (!groupId) {
  alert("❌ Link di invito non valido.");
  window.location.href = "index.html";
}
const redirectPath = window.location.pathname + window.location.search;

// Logica per l'invio della richiesta pending
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

    // Verifica se già membro o admin
    const isMember = (groupData.members || []).some(m => m.uid === userId);
    if (isMember) {
      alert("⚠️ Sei già in questo gruppo.");
      return window.location.href = "dashboard.html";
    }

    // Verifica richieste pending precedenti
    const pendingRef = doc(db, "users", userId, "groups", groupId);
    const pendingSnap = await getDoc(pendingRef);
    if (pendingSnap.exists()) {
      alert("⚠️ Hai già richiesto di entrare in questo gruppo. Attendi approvazione.");
      return window.location.href = "dashboard.html";
    }

    // Registra richiesta pending utente
    await setDoc(pendingRef, {
      name: groupData.name,
      groupId,
      status: "pending",
      requesterName: user.displayName || "utente"
    });

    // Registra richiesta nella subcollezione pendingTransactions del gruppo
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

// Controllo stato autenticazione e redirect se necessario
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Non loggato: vai alla pagina di login, passando il path di invito
    window.location.href = `index.html?redirect=${encodeURIComponent(redirectPath)}`;
    return;
  }

  // Utente loggato: esegui la logica di join
  await joinGroupLogic();
});
