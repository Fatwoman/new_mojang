// index.js
// 用途：入口頁面邏輯，只負責「開始遊戲」→ 跳到 cover.html
// 不使用 Firebase、不讀取任何遊戲狀態、不做遊戲邏輯

// 取得「開始遊戲」按鈕
const startBtn = document.getElementById("startBtn");

// 綁定點擊事件：按下後跳轉到 cover.html
startBtn.addEventListener("click", function () {
  // 直接導向遊戲設定頁
  window.location.href = "/src/cover.html";
});
