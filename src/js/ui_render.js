// ======================================================================
// ui_render.js（專業麻將桌布局）
//
// ● 本檔案負責「畫面渲染」，不處理規則也不處理遊戲邏輯。
// ● table.js 每次狀態變動時，都會呼叫 renderAll() 重新渲染。
// ● 此檔功能：
//     ✔ 玩家自己手牌（seat 0）
//     ✔ 對手的牌背（seat 1,2,3）
//     ✔ 捨牌區（4 家）
//     ✔ 花牌（4 家）
//     ✔ 副露（吃／碰／槓）
//     ✔ 高亮回合
//     ✔ 顯示風圈 + 局數
//     ✔ 顯示剩餘可摸牌（由 table.js 算好傳進來）
//
// ✅ 重點：本檔只「畫畫」，不改動任何遊戲 state。
// ======================================================================

// --------------------------------------------------
// 工具：把 tile 轉成 <img>
// --------------------------------------------------
// 用於手牌、碰槓、花牌、捨牌區。
// className 用來切換樣式：
//   tile-img     → 手牌
//   discard-img  → 捨牌
//   flower-img   → 花牌
//   meld-img     → 吃碰槓副露
// --------------------------------------------------
export function tileToImg(tile, className = "tile-img") {
  return (
    '<img src="./img/' +
    tile +
    '.png" class="' +
    className +
    '" draggable="false">'
  );
}

// ======================================================================
// ★ renderAll() — 整個畫面的真正刷新點
// ======================================================================
// table.js 只要「狀態有變」，就呼叫一次 renderAll()。
// UI 的所有部分都從這裡集中觸發。
//
// 傳入參數：
//   players   → 玩家資訊（名字 / seat / 是否 AI）
//   hands     → 四家手牌（純資料，這裡不會去 push/pop）
//   discards  → 四家捨牌
//   melds     → 四家副露（吃 / 碰 / 槓）
//   flowers   → 四家花牌
//   turn      → 現在輪到哪一家 (0~3)
//   flowState → 風圈 / 局數狀態（East1, South2 ...）
//   wallCount → 「可摸牌」的剩餘數量（table.js 算好傳進來）
//
// ⚠ 注意：renderAll() 完全不修改這些參數，只負責畫畫。
// ======================================================================
export function renderAll(
  players,
  hands,
  discards,
  melds,
  flowers,
  turn,
  flowState,
  wallCount
) {
  // seat 0 手牌（可點擊）
  renderHands(hands);

  // seat 1 / 2 / 3 — 對手顯示牌背（不顯示內容）
  // ✅ 這裡改成「固定顯示 13 張牌背」，避免因為手牌長度變動造成畫面跳動
  renderOpponentHands();

  // 捨牌區 / 副露 / 花牌
  renderDiscards(discards);
  renderMelds(melds);
  renderFlowers(flowers);

  // 高亮目前輪到哪一家（玩家框框發光）
  highlightTurn(turn);

  // 顯示風圈（East 1 / South 2 ...）
  if (flowState) {
    renderWindPanel(flowState);
  }

  // 顯示剩餘可摸牌數（台麻：wall.length - 16 已在 table.js 算好）
  if (typeof wallCount === "number") {
    renderRemainTileCount(wallCount);
  }
}

// ======================================================================
// ★ showMessage() — 中央浮動訊息
//    如：某人打了什麼牌 / 補花 / 槓牌提示
// ======================================================================
export function showMessage(msg) {
  const box = document.getElementById("messageBox");
  if (!box) return;

  box.textContent = msg;

  // 1.8 秒後自動清空訊息
  setTimeout(() => {
    box.textContent = "";
  }, 1800);
}

// ======================================================================
// ★ tileToChinese() — 將 tile 變成中文（UI 提示用）
// ======================================================================
export function tileToChinese(tile) {
  // 字牌（E,S,W,N,C,F,P）
  const honors = {
    E: "東",
    S: "南",
    W: "西",
    N: "北",
    C: "中",
    F: "發",
    P: "白",
  };

  // 單一字母 → 直接對應字牌
  if (tile.length === 1 && honors[tile]) {
    return honors[tile];
  }

  // 花牌（1F~4F / 1P~4P）
  const flowerNames = {
    "1F": "春",
    "2F": "夏",
    "3F": "秋",
    "4F": "冬",
    "1P": "梅",
    "2P": "蘭",
    "3P": "竹",
    "4P": "菊",
  };
  if (flowerNames[tile]) return flowerNames[tile];

  // 萬條筒（數字 + 花色）
  const numChinese = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const suit = tile.slice(-1); // 最後一個字元 → W / T / B
  const number = parseInt(tile); // 前面的數字 → 1~9

  if (!isNaN(number)) {
    if (suit === "W") return numChinese[number] + "萬";
    if (suit === "T") return numChinese[number] + "條";
    if (suit === "B") return numChinese[number] + "筒";
  }

  // 萬一遇到不認得的編碼，就原樣顯示
  return tile;
}

// ======================================================================
// ★ renderHands() — seat 0（玩家）手牌顯示（正面）
// ======================================================================
// 功能：畫出「自己」的手牌，並加上 data-tile，讓點擊事件能知道是哪張牌。
// ======================================================================
function renderHands(hands) {
  const div = document.getElementById("handArea");
  if (!div) return;

  // 每張牌輸出一個 <img>，加上 data-tile 屬性
  div.innerHTML = hands[0]
    .map(function (t) {
      return (
        '<img src="./img/' +
        t +
        '.png" ' +
        'class="tile-img" data-tile="' +
        t +
        '" draggable="false">'
      );
    })
    .join("");
}

// ======================================================================
// ★ renderOpponentHands() — seat 1,2,3 顯示牌背
// ======================================================================
//
// 🧠 設計理念：
//   ● 對手的「具體手牌內容」你看不到 → 只顯示背面即可。
//   ● 若用 hands[1]/[2]/[3].length 當數量，
//       → 像「補花」這種會改變手牌長度的動作會造成整個桌面布局跳動，
//         你會誤以為「手牌整副被換掉」。
//   ● 所以這裡改成：對手永遠顯示「固定 13 張牌背」，畫面穩定、不亂跳。
//      （之後如果你想改成「根據實際牌數顯示」，再重構 CSS 避免 layout 被擠壓。）
// ======================================================================
function renderOpponentHands() {
  const topDiv = document.getElementById("opp-top");
  const rightDiv = document.getElementById("opp-right");
  const leftDiv = document.getElementById("opp-left");

  // 一般胡牌前：14 張起手、16 張發完後自摸 → 實際張數會變動，
  // 但 UI 不強調「精準張數」，所以這裡選擇穩定畫面 → 固定 13 張背面
  const VISIBLE_COUNT = 13;

  const tilesHTML = Array(VISIBLE_COUNT)
    .fill('<div class="opp-tile"></div>')
    .join("");

  if (topDiv) {
    topDiv.innerHTML = tilesHTML;
  }

  if (rightDiv) {
    rightDiv.innerHTML = tilesHTML;
  }

  if (leftDiv) {
    leftDiv.innerHTML = tilesHTML;
  }
}

// ======================================================================
// ★ renderDiscards() — 捨牌區（4 家）
// ======================================================================
function renderDiscards(discards) {
  // 對應 seat → 不同方向的捨牌區 DOM id
  const ids = {
    0: "discard-bottom",
    1: "discard-right",
    2: "discard-top",
    3: "discard-left",
  };

  for (let seat = 0; seat < 4; seat++) {
    const div = document.getElementById(ids[seat]);
    if (!div) continue;

    div.innerHTML = discards[seat]
      .map((t) => tileToImg(t, "discard-img"))
      .join("");
  }
}

// ======================================================================
// ★ renderMelds() — 副露顯示（吃／碰／槓）
// ======================================================================
// 例如：melds[0] = [ ["3W","4W","5W"], ["7B","7B","7B"] ]
// 每一組 group 會變成一個 wrap div，裡面排 3 or 4 張牌。
// ======================================================================
function renderMelds(melds) {
  const ids = {
    0: "meld-bottom",
    1: "meld-right",
    2: "meld-top",
    3: "meld-left",
  };

  for (let seat = 0; seat < 4; seat++) {
    const zone = document.getElementById(ids[seat]);
    if (!zone) continue;

    // 每次重繪前先清空
    zone.innerHTML = "";

    melds[seat].forEach((group) => {
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.gap = "3px";

      group.forEach((tile) => {
        wrap.innerHTML += tileToImg(tile, "meld-img");
      });

      zone.appendChild(wrap);
    });
  }
}

// ======================================================================
// ★ renderFlowers() — 花牌顯示
// ======================================================================
function renderFlowers(flowers) {
  const ids = {
    0: "flower-bottom",
    1: "flower-right",
    2: "flower-top",
    3: "flower-left",
  };

  for (let seat = 0; seat < 4; seat++) {
    const zone = document.getElementById(ids[seat]);
    if (!zone) continue;

    zone.innerHTML = flowers[seat]
      .map((t) => tileToImg(t, "flower-img"))
      .join("");
  }
}

// ======================================================================
// ★ highlightTurn() — 高亮當前回合（seat=0~3）
// ======================================================================
// 透過改變 box-shadow 來讓某一家的名字外框發光。
// ======================================================================
function highlightTurn(turnSeat) {
  const ids = ["player-bottom", "player-right", "player-top", "player-left"];

  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(ids[i]);
    if (!el) continue;

    el.style.boxShadow = i === turnSeat ? "0 0 12px 3px yellow" : "none";
  }
}

// ======================================================================
// ★ renderWindPanel() — 顯示風圈 + 局數（East 1 / South 2 ...）
// ======================================================================
export function renderWindPanel(flowState) {
  const windTextEl = document.getElementById("windText");
  if (!windTextEl || !flowState) return;

  const windEnglish = ["East", "South", "West", "North"];

  const wIndex =
    typeof flowState.windRound === "number" ? flowState.windRound : 0;
  const dealerCount =
    typeof flowState.dealerCount === "number" ? flowState.dealerCount : 0;

  const windName = windEnglish[wIndex] || "East";
  const handNum = dealerCount + 1;

  // 文字顯示例：East 1, South 2 ...
  windTextEl.textContent = `${windName} ${handNum}`;

  // 下方風向亮起（東南西北）
  document
    .querySelectorAll(".wind")
    .forEach((w) => w.classList.remove("active"));
  const target = document.querySelector(`.wind.${windName[0]}`); // .E / .S / .W / .N
  if (target) target.classList.add("active");
}

// ======================================================================
// ★ renderRemainTileCount() — 顯示剩餘可摸牌數
// ======================================================================
//
// ✔ 台灣麻將規則：最後 16 張是「死牆」＝不能摸。
// ✔ table.js 已經用 getDrawableTileCount() 算好「可摸牌數」傳進來。
// ======================================================================
export function renderRemainTileCount(drawableCount) {
  const remainEl = document.getElementById("remainText");
  if (!remainEl) return;

  // 直接顯示正確傳入的可摸牌數
  remainEl.textContent = "剩餘：" + drawableCount;
}
