// ==================================================================
// cover.js
// 用途：遊戲設定頁面邏輯
// 1. 讀取玩家輸入的名字
// 2. 決定單人 / 多人 模式
// 3. 建立房間（多人）
// 4. 加入房間（多人，可取代 AI）
// ==================================================================

// -----------------------------
// 1. 取得 UI 元件
// -----------------------------
const nameInput = document.getElementById("playerName");
const soloBtn = document.getElementById("soloBtn");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");

// -----------------------------
// 2. 單人遊戲模式（無 Firebase）
// -----------------------------
soloBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return alert("請輸入玩家名稱");

  localStorage.setItem("playerName", name);
  localStorage.setItem("mode", "solo");

  window.location.href = "/src/table.html";
});

// -----------------------------
// 3. 產生隨機房號
// -----------------------------
function createRoomID() {
  return "room-" + Math.random().toString(36).substring(2, 8);
}

// -----------------------------
// 4. 建立房間（多人）
// -----------------------------
createBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return alert("請輸入玩家名稱");

  const roomID = createRoomID();

  // 寫入房主 seat = 0
  const seatRef = window.firebaseRef(`rooms/${roomID}/players/0`);

  window.firebaseSet(seatRef, {
    name: name,
    seat: 0,
    isAI: false,
  });

  // 記錄到 localStorage
  localStorage.setItem("playerName", name);
  localStorage.setItem("mode", "multi");
  localStorage.setItem("room", roomID);
  localStorage.setItem("seat", 0);

  // 進入等待室
  window.location.href = `/src/lobby.html?room=${roomID}`;
});

// -----------------------------
// 5. 加入房間（可取代 AI）
// -----------------------------
joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return alert("請輸入玩家名稱");

  const roomID = roomInput.value.trim();
  if (!roomID) return alert("請輸入房號");

  const playersRef = window.firebaseRef(`rooms/${roomID}/players`);

  window.firebaseGet(playersRef, (players) => {
    if (!players) return alert("房間不存在");

    let seat = null;

    // 優先取代 AI
    for (let i = 1; i < 4; i++) {
      if (players[i] && players[i].isAI) {
        seat = i;
        break;
      }
    }

    // 若沒有 AI → 找空位
    if (seat === null) {
      for (let i = 1; i < 4; i++) {
        if (!players[i]) {
          seat = i;
          break;
        }
      }
    }

    if (seat === null) return alert("房間已滿");

    const seatRef = window.firebaseRef(`rooms/${roomID}/players/${seat}`);

    // 寫入玩家
    window.firebaseSet(seatRef, {
      name: name,
      seat: seat,
      isAI: false,
    });

    // 寫 localStorage
    localStorage.setItem("playerName", name);
    localStorage.setItem("mode", "multi");
    localStorage.setItem("room", roomID);
    localStorage.setItem("seat", seat);

    window.location.href = `/src/lobby.html?room=${roomID}`;
  });
});
