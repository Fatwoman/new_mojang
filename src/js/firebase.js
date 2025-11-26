// firebase.js
// 用途：初始化 Firebase（v8）並提供 window.firebaseRef 等工具
// 修正：避免 Firebase 被重複初始化造成 duplicate-app 錯誤

const firebaseConfig = {
  apiKey: "AIzaSyA4OyRXIzRl5OlqjQr_gImHeKX28EIRgRQ",
  authDomain: "mojang-d9f1b.firebaseapp.com",
  databaseURL:
    "https://mojang-d9f1b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mojang-d9f1b",
  storageBucket: "mojang-d9f1b.firebasestorage.app",
  messagingSenderId: "746699925941",
  appId: "1:746699925941:web:db42c2c6f24cfbad0e51fc",
};

// ----------------------------------------------------------
// 修復：避免重複初始化 Firebase (app/duplicate-app)
// ----------------------------------------------------------
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // 使用已存在的 app
}

// ----------------------------------------------------------
// 拿到 Database 物件並存到 window
// ----------------------------------------------------------
const db = firebase.database();
window.db = db;

// ----------------------------------------------------------
// 包裝 Firebase 基本函式
// ----------------------------------------------------------
window.firebaseRef = (path) => db.ref(path);

window.firebaseSet = (ref, data) => ref.set(data);

window.firebaseOn = (ref, callback) =>
  ref.on("value", (snapshot) => callback(snapshot.val()));

window.firebaseGet = (ref, callback) =>
  ref.once("value").then((snapshot) => callback(snapshot.val()));

window.firebaseUpdate = (ref, data) => ref.update(data);

window.firebasePush = (ref, data) => ref.push(data);
