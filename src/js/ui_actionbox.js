// ======================================================================
// ui_actionbox.js（完整版 2025 修正版 + ★加入自摸 ZIMO）
// 用途：
//   ✔ 顯示 吃 / 碰 / 三種槓（暗槓 / 加槓 / 明槓）/ 胡 / 自摸 / PASS
//   ✔ 玩家點手牌 → 丟牌
//   ✔ table.js 可註冊 callback
//   ✔ 本檔案只處理 UI，不做任何麻將邏輯
// ======================================================================

// -----------------------------------------------------
// 取得 DOM（按鈕）
// -----------------------------------------------------
const box = document.getElementById("actionBox");

const chiBtn = document.getElementById("chiBtn");
const pongBtn = document.getElementById("pongBtn");

// 👉 三種槓按鈕
const anKongBtn = document.getElementById("anKongBtn"); // 暗槓
const addKongBtn = document.getElementById("addKongBtn"); // 加槓
const mingKongBtn = document.getElementById("mingKongBtn"); // 明槓

const huBtn = document.getElementById("huBtn");
const passBtn = document.getElementById("passBtn");

// 🟦 ★ 新增：自摸按鈕（牌桌 HTML 要加一個 id="zimoBtn" 的按鈕）
const zimoBtn = document.getElementById("zimoBtn");

// -----------------------------------------------------
// callback（由 table.js 注入）
// -----------------------------------------------------
let callbacks = {
  onChi: null,
  onPong: null,
  onMingKong: null,
  onAddKong: null,
  onAnKong: null,
  onHu: null, // 放槍胡
  onZimo: null, // 🟦 ★ 自摸胡（新增）
  onPass: null,
  onPlayTile: null, // 玩家點擊手牌 → 丟牌
};

// 可選吃法
let currentChiList = [];

// ======================================================================
// ✔ table.js 呼叫 → 註冊 callback
// ======================================================================
export function onPlayerChoose(cbObj) {
  callbacks = { ...callbacks, ...cbObj };
}

// ======================================================================
// ✔ 允許玩家點擊手牌（丟牌）
// ======================================================================
export function enableHandClick(cbObj) {
  callbacks = { ...callbacks, ...cbObj };

  const handArea = document.getElementById("handArea");
  if (!handArea) return;

  // 移除舊 listener：用 cloneNode 關掉舊事件
  const newArea = handArea.cloneNode(true);
  handArea.parentNode.replaceChild(newArea, handArea);

  newArea.addEventListener("click", (e) => {
    const img = e.target.closest("img[data-tile]");
    if (!img) return;

    const tile = img.dataset.tile;

    if (callbacks.onPlayTile) {
      callbacks.onPlayTile(tile);
    }
  });
}

// ======================================================================
// ✔ 顯示所有可用動作按鈕
// ======================================================================
export function showActions({
  canChi = false,
  chiList = [],
  canPong = false,
  canMingKong = false,
  canAddKong = false,
  canAnKong = false,
  canHu = false, // 放槍胡
  canZimo = false, // 🟦 ★ 自摸（新增）
  // ---------------------
  // 自摸與胡是兩個不同事件：
  // canHu   → 放槍胡（別人打的）
  // canZimo → 自摸胡（自己摸的）
  // ---------------------
  canPass = true,
}) {
  currentChiList = chiList;

  box.classList.remove("hidden");

  // 吃 / 碰
  chiBtn.style.display = canChi ? "inline-block" : "none";
  pongBtn.style.display = canPong ? "inline-block" : "none";

  // 三種槓
  mingKongBtn.style.display = canMingKong ? "inline-block" : "none";
  addKongBtn.style.display = canAddKong ? "inline-block" : "none";
  anKongBtn.style.display = canAnKong ? "inline-block" : "none";

  // 放槍胡（吃碰後）
  huBtn.style.display = canHu ? "inline-block" : "none";

  // 🟦 ★ 自摸（自己摸牌後）
  zimoBtn.style.display = canZimo ? "inline-block" : "none";

  // PASS 永遠可用
  passBtn.style.display = canPass ? "inline-block" : "none";
}

// ======================================================================
// ✔ 隱藏所有動作按鈕
// ======================================================================
export function hideActions() {
  box.classList.add("hidden");
  currentChiList = [];
}

// ======================================================================
// ✔ 各按鈕事件
// ======================================================================

// ---- 吃 ----
chiBtn.addEventListener("click", () => {
  if (!callbacks.onChi) return;

  if (currentChiList.length === 1) {
    callbacks.onChi(currentChiList[0]);
  } else {
    const choice = prompt(
      "請選擇吃法：\n" +
        currentChiList.map((c, i) => `${i + 1}. ${c.join(", ")}`).join("\n")
    );
    const idx = Number(choice) - 1;
    if (currentChiList[idx]) callbacks.onChi(currentChiList[idx]);
  }

  hideActions();
});

// ---- 碰 ----
pongBtn.addEventListener("click", () => {
  if (callbacks.onPong) callbacks.onPong();
  hideActions();
});

// ---- 明槓（別人打出的） ----
mingKongBtn.addEventListener("click", () => {
  if (callbacks.onMingKong) callbacks.onMingKong();
  hideActions();
});

// ---- 加槓（已有碰 + 自摸第四張）----
addKongBtn.addEventListener("click", () => {
  if (callbacks.onAddKong) callbacks.onAddKong();
  hideActions();
});

// ---- 暗槓（手上四張）----
anKongBtn.addEventListener("click", () => {
  if (callbacks.onAnKong) callbacks.onAnKong();
  hideActions();
});

// ---- 放槍胡 ----
huBtn.addEventListener("click", () => {
  if (callbacks.onHu) callbacks.onHu();
  hideActions();
});

// 🟦 ★ 新增：自摸（自己摸牌胡）
zimoBtn.addEventListener("click", () => {
  if (callbacks.onZimo) callbacks.onZimo(); // 呼叫 table.js 的自摸 callback
  hideActions();
});

// ---- PASS ----
passBtn.addEventListener("click", () => {
  if (callbacks.onPass) callbacks.onPass();
  hideActions();
});
