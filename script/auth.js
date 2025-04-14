import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// Utilizza la configurazione Firebase definita in config.js (assicurati di caricare config.js prima di auth.js)
const firebaseConfig = window.firebaseConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Abilita la persistenza offline
enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.log('Errore: La sessione di Firestore non può essere avviata');
    } else if (err.code === 'unimplemented') {
      console.log('Errore: Firestore non supporta questa funzionalità');
    }
  });

// Gestisci il login con Google
const provider = new GoogleAuthProvider();
const loginBtn = document.getElementById("login-btn");

if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    signInWithPopup(auth, provider)
      .then((result) => {
        const user = result.user;
        console.log("✅ Login riuscito:", user.displayName);
        // Reindirizza alla dashboard o salva dati nel database
        window.location.href = "dashboard.html";
      })
      .catch((error) => {
        console.error("❌ Errore login:", error);
      });
  });
}