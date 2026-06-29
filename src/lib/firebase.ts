import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "coastal-buffer-9b1tv",
  appId: "1:779202389898:web:751988ae280970a47aca73",
  apiKey: "AIzaSyADqCEuIfFodbXDvVoyhU9dAIqQMccHgbc",
  authDomain: "coastal-buffer-9b1tv.firebaseapp.com",
  storageBucket: "coastal-buffer-9b1tv.firebasestorage.app",
  messagingSenderId: "779202389898",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
}, "ai-studio-nexusai-7a7c2151-fb1c-42bb-abc2-19ef80ee6ee9");
