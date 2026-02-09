// Firebase configuration
// Get your config from: Firebase Console > Project Settings > General > Your apps > Web app
// Or: Firebase Console > Project Settings > General > Your apps > Add app > Web
import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
    apiKey: "AIzaSyDxWSO3ywv5yvAAWuHBLcC1FZvChwnXnBc",
    authDomain: "dixychickenapp-c5199.firebaseapp.com",
    databaseURL: "https://dixychickenapp-c5199-default-rtdb.firebaseio.com",
    projectId: "dixychickenapp-c5199",
    storageBucket: "dixychickenapp-c5199.firebasestorage.app",
    messagingSenderId: "180647845726",
    appId: "1:180647845726:web:e04a43abf62eebbdccb9cf",
    measurementId: "G-7BMM6DD0W4",
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Realtime Database
export const database = getDatabase(app)
