import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA_zO_8smAuCzZxLZhvSsALP6EwcCt5Ne4",
  authDomain: "cafe-pos-v1.firebaseapp.com",
  projectId: "cafe-pos-v1",
  storageBucket: "cafe-pos-v1.firebasestorage.app",
  messagingSenderId: "320180876487",
  appId: "1:320180876487:web:17f4745f015e9a658d7ae2",
  measurementId: "G-R4MPZEEMQ1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// Initialize Firestore with offline persistence enabled for Electron/Web
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const auth = getAuth(app);