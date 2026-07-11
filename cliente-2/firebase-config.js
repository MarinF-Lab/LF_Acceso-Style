// Configuración de Firebase para LF Acceso Style.
// Proyecto real: lf-acceso-style (Firebase Console → Configuración del proyecto).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAyL1dg6ejN3y7eQ37InRbFLhxwfzGOqDs",
  authDomain: "lf-acceso-style.firebaseapp.com",
  projectId: "lf-acceso-style",
  storageBucket: "lf-acceso-style.firebasestorage.app",
  messagingSenderId: "553411594601",
  appId: "1:553411594601:web:56cdbf011f24a47c9a15f8",
  measurementId: "G-RY25GWSRLF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
