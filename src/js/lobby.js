// ==================================================================
// lobby.js
// 用途：多人模式等待室邏輯（房主補 AI / 玩家加入顯示 / 等待開始遊戲）
//
// 功能流程：
// 1. 從 URL 拿到 room ID
// 2. 從 localStorage 取得玩家的 seat 與名字
// 3. 監聽 Firebase 的 players → 更新四個座位的 UI
// 4. 若為房主（seat = 0）：
//      a. 補齊 AI（AI 只能補空位，不可蓋真人）
//      b. 顯示「開始遊戲」按鈕
// 5. 房主按「開始遊戲」→ 寫入 gameStart = true
// 6. 所有玩家監聽 gameStart → true 時跳到 table.html
// ==================================================================

// -----------------------------
// 1. 從 URL 取得 roomID (?room=xxxx)
// -----------------------------
const params = new URLSearchParams(window.location.search);
const roomID = params.get("room");

// 顯示在畫面上
const roomIdSpan = document.getElementById("roomId");
roomIdSpan.textContent = roomID || "(未指定)";

// -----------------------------
// 2. 從 localStorage 取得玩家自身資訊
// -----------------------------
const mySeat = Number(localStorage.getItem("seat")); // 自己的座位（0~3）
const myName = localStorage.getItem("playerName"); // 自己的名字

// -----------------------------
// 3. 取得「開始遊戲」按鈕
//    只有房主 seat=0 可以看到
// -----------------------------
const startBtn = document.getElementById("startBtn");
if (mySeat === 0) {
  startBtn.style.display = "inline-block";
}

// -----------------------------
// 4. Firebase 路徑設定
// -----------------------------
const playersRef = window.firebaseRef(`rooms/${roomID}/players`);
const gameStartRef = window.firebaseRef(`rooms/${roomID}/state/gameStart`);

// -----------------------------
// 5. 更新 UI：四個座位的顯示
// -----------------------------
/**
 * 更新等待室 UI 中的四個玩家位置
 * @param {object} players - players[seat] = { name, seat, isAI }
 */
function updateLobbyUI(players) {
  for (let seat = 0; seat < 4; seat++) {
    const seatDiv = document.getElementById(`seat-${seat}`);

    if (players && players[seat]) {
      // 顯示玩家名稱（AI 顯示 AI 標記）
      seatDiv.textContent =
        players[seat].name + (players[seat].isAI ? "（AI）" : "");
    } else {
      seatDiv.textContent = "等待玩家...";
    }
  }
}

// -----------------------------
// 6. 房主按下「開始遊戲」 → 設 gameStart = true
// -----------------------------
startBtn.addEventListener("click", function () {
  window.firebaseSet(gameStartRef, true);
  window.location.href = `/src/table.html?room=${roomID}`;
});

// -----------------------------
// 7. 所有玩家監聽 gameStart → true 時進入牌桌
// -----------------------------
window.firebaseOn(gameStartRef, function (gameStart) {
  if (gameStart === true) {
    window.location.href = `/src/table.html?room=${roomID}`;
  }
});

// -----------------------------
// 8. 監聽 players → 更新 UI 並由房主補 AI
// -----------------------------
window.firebaseOn(playersRef, function (players) {
  if (!players) return;

  // 更新畫面顯示
  updateLobbyUI(players);

  // 只有房主才負責補 AI
  if (mySeat !== 0) return;

  // ---------------------------------------------------------
  // ★ 正確補 AI 邏輯 ★
  // 目標：AI 只能補空位，不可以蓋掉真人，也不能影響真人加入
  // ---------------------------------------------------------

  // 計算真人數量（isAI = false）
  let humanCount = 0;
  for (let i = 0; i < 4; i++) {
    if (players[i] && players[i].isAI === false) {
      humanCount++;
    }
  }

  // 需要補多少 AI（最多 4 人）
  let aiNeeded = 4 - humanCount;

  // 計算目前 AI 數量
  let currentAI = 0;
  for (let i = 0; i < 4; i++) {
    if (players[i] && players[i].isAI === true) {
      currentAI++;
    }
  }

  // 若 AI 不足 → 補 AI
  if (currentAI < aiNeeded) {
    for (let i = 0; i < 4; i++) {
      // 該位置無玩家（真正的空位）
      if (!players[i]) {
        const aiRef = window.firebaseRef(`rooms/${roomID}/players/${i}`);
        window.firebaseSet(aiRef, {
          name: `AI-${i}`,
          seat: i,
          isAI: true,
        });

        aiNeeded--;
        if (aiNeeded === 0) break;
      }
    }
  }
});
