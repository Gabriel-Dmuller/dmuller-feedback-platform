
import "/js/runtime-config.js";
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDHViX7PaW7fviXV-kYnLmYKoTR1ml8AmY",
  authDomain: "feedback---d-muller.firebaseapp.com",
  projectId: "feedback---d-muller",
  storageBucket: "feedback---d-muller.firebasestorage.app",
  messagingSenderId: "850307006021",
  appId: "1:850307006021:web:1ebfa1c0faba2b43b9ed2c"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
export const backendBaseUrl = normalizeBaseUrl(window.__DMULLER_API_BASE__);
export const backendBaseUrlSource = backendBaseUrl ? "window.__DMULLER_API_BASE__" : "not-configured";
export const useFirebaseEmulators = window.__DMULLER_USE_FIREBASE_EMULATORS__ === true;

console.info(`[DMULLER API] base=${backendBaseUrl || "(not configured)"} source=${backendBaseUrlSource}`);

if (useFirebaseEmulators) {
  console.warn("[DMULLER Firebase] Emuladores ativados por configuração local. Tokens do Auth Emulator exigem backend compatível.");
  try { connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true }); } catch (e) {}
  try { connectFirestoreEmulator(db, "localhost", 8083); } catch (e) {}
}
