
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyADSqmhWAOC1KQnfmMLrYylQY6EjokXUuw",
  authDomain: "beercounter-fb28f.firebaseapp.com",
  projectId: "beercounter-fb28f",
  storageBucket: "beercounter-fb28f.firebasestorage.app",
  messagingSenderId: "335079316540",
  appId: "1:335079316540:web:fbef8c1307e1dcdcc6f739"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
