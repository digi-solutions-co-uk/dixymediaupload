import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAp_Bge6jm0AVX6Un2vIXQZpjLoc_mTmgQ",
  authDomain: "digislidesapp.firebaseapp.com",
  databaseURL: "https://digislidesapp-default-rtdb.firebaseio.com",
  projectId: "digislidesapp",
  storageBucket: "digislidesapp.appspot.com",
  messagingSenderId: "251415751533",
  appId: "1:251415751533:android:1b183864f4e666e0a54864"
};

// Use a named app to ensure this config does not accidentally reuse the default app
const existingApp = getApps().find((a) => a.name === 'digislides');
const digiApp = existingApp ? existingApp : initializeApp(firebaseConfig, 'digislides');
const digiDatabase = getDatabase(digiApp);
const dbStore = getFirestore(digiApp);
const digiAuth = getAuth(digiApp);

export { digiApp as app, digiDatabase, dbStore, digiAuth };
