// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyChp6aTUDmvxkoub228Lw2Mb7Rz3-TVOAk",
  authDomain: "booxclash-learn.firebaseapp.com",
  projectId: "booxclash-learn",
  storageBucket: "booxclash-learn.firebasestorage.app",
  messagingSenderId: "162267981396",
  appId: "1:162267981396:web:0abba15fcb618bb8906fc1",
  measurementId: "G-417CHC2GLH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "elderkeep-db");