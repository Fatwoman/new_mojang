// ======================================================================
// table.js（核心流程控制層 Game Core Layer）
// ======================================================================
// 本檔案負責「整個麻將的流程」：
//   ✔ 選莊
//   ✔ 開門
//   ✔ 發牌（16 張）
//   ✔ 自動補花
//   ✔ 排序手牌（萬 → 條 → 筒）
//   ✔ 回合流程：摸牌 →（吃碰槓胡判斷）→ 出牌
//   ✔ 玩家出牌（點擊手牌）
//   ✔ AI 出牌
//   ✔ 單人模式下：吃 / 碰 / 槓 / 胡 / PASS 判斷與 UI 串接
//
// 目前「只在單人模式」啟用吃碰槓胡邏輯：
//   - 真人 seat = 0 可以選擇 吃 / 碰 / 槓 / 胡 / PASS
//   - AI 不會搶吃碰槓胡，全部視為 PASS
//   - 多人模式暫時只保留「打出 → 下一家」骨架（TODO）
//
// 不負責：
//   ✖ UI 圖片細節（交給 ui_render.js, ui_melds.js）
//   ✖ 吃碰槓胡規則（rules_meld.js, rules_hu.js）
//   ✖ 分數計算（rules_score.js）
//   ✖ Firebase 實際同步（online_resolve.js）
// ======================================================================

// -----------------------------
// 1. 讀取 localStorage 設定
// -----------------------------
const mode = localStorage.getItem("mode"); // "solo" / "multi"
const roomID = localStorage.getItem("room");
const mySeat = Number(localStorage.getItem("seat"));
const myName = localStorage.getItem("playerName");

// -----------------------------
// 2. 遊戲資料 Game State
// -----------------------------
let players = []; // 四家資訊
let hands = [[], [], [], []]; // 四家手牌
let wall = []; // 牌牆（摸牌來源）
let discards = [[], [], [], []]; // 四家捨牌
let melds = [[], [], [], []]; // 吃碰槓紀錄

// 花牌（由 rules_flower 管理）
let flowerState = {
  flowers: [[], [], [], []],
  flowerCount: [0, 0, 0, 0],
};

let turn = 0; // 現在輪到哪一家 (0~3)
let lastPlayedTile = null; // 最後一張被丟出的牌
let lastDiscardSeat = null; // 最後出牌的是哪一家

// 風圈 / 莊家 / 局數（由 game_flow.js 管理）
let flowState = null;

// ================================
// 反應階段（吃 / 碰 / 槓 / 胡）用的暫存
// ================================
let reactionContext = null; // { discardSeat, reactorSeat, tile, huInfo, kongInfo, pongInfo, chiInfo }

// ⭐ 新增：遊戲結束旗標（流局 / 胡牌後就不再動）
let gameEnded = false;

// ⭐ 新增：回合鎖（吃 / 碰 / 槓 / 胡 / PASS 按鈕彈出時 → 鎖住，不讓出牌 / 開新回合）
let turnLocked = false;

// -----------------------------
// 3. Import 各層模組
// -----------------------------
import * as rulesMeld from "./rules_meld.js";
import * as rulesHu from "./rules_hu.js";
import * as rulesFlower from "./rules_flower.js";
import * as rulesScore from "./rules_score.js";
import * as rulesDice from "./rules_dice.js";
import * as gameFlow from "./game_flow.js";
import * as online from "./online_resolve.js";
import { tileToChinese } from "./ui_render.js";

import * as ui from "./ui_render.js"; // 手牌 / 捨牌 / 花牌 UI
import * as uiMelds from "./ui_melds.js"; // 副露 UI
import * as actionUI from "./ui_actionbox.js"; // 吃碰槓胡按鈕 + 點擊手牌

import { AI } from "./ai_agent.js";

// ======================================================================
// ★ 初始化遊戲（入口點）
// ======================================================================
async function initGame() {
  console.log("🎮 遊戲初始化開始（table.js）");

  gameEnded = false; // ⭐ 保險：重新進入時重置
  turnLocked = false;

  setupPlayers(); // 建立 players[]
  flowState = gameFlow.initGameFlow(); // 初始化風圈 / 局數

  buildWall(); // 建立牌牆
  shuffleWall(); // 洗牌

  // ---- 選莊（非同步，可接 Firebase）----
  const dealer = await rulesDice.decideDealer();
  flowState.dealerSeat = dealer;
  turn = dealer;
  console.log("🎲 莊家 =", dealer);

  // ---- 開門 ----
  const { sum } = rulesDice.rollDice3();
  const openIndex = rulesDice.getOpenWallIndex(dealer, sum, wall);

  // ---- 發牌（每人 16 張）----
  // ⭐⭐ 絕對重要：避免 4 家共享參考，造成手牌互相覆蓋
  const deal = rulesDice.distributeTiles(wall, openIndex);

  // deep clone 四家的手牌
  hands = deal.hands.map((handArr) => [...handArr]);

  // wall 複製也做一下（雖然通常不需要，但保險）
  wall = [...deal.wall];

  // ---- 初始補花 & 手牌排序 ----
  for (let s = 0; s < 4; s++) {
    rulesFlower.autoCatchFlowers(hands[s], wall, s, flowerState);
    sortHand(hands[s]);
  }

  // ---- 初始渲染 ----
  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    turn,
    flowState, // 風圈 / 局數
    getDrawableTileCount()
  );

  // 四家副露初始化
  for (let s = 0; s < 4; s++) {
    uiMelds.renderMelds(s, melds[s]);
  }

  // ---- 註冊「吃 / 碰 / 槓 / 胡 / PASS」的 callback ----
  // 之後 showActions() 會讓玩家按按鈕，按下時就會呼叫這裡註冊的函式
  actionUI.onPlayerChoose({
    onChi: handleChiFromUI,
    onPong: handlePongFromUI,

    // ★ 新增三種槓
    onMingKong: () => handleKongFromUI("明槓"),
    onAddKong: () => handleKongFromUI("加槓"),
    onAnKong: () => handleKongFromUI("暗槓"),

    onHu: handleHuFromUI,
    onPass: handlePassFromUI,
    onZimo: handleZimoFromUI,
  });

  // ---- 啟動多人同步（若有）----
  if (mode === "multi") {
    online.initOnline(roomID, mySeat, tableCallbacks);
  }

  // ---- 開始遊戲 ----
  // 單人：整局流程都在本機跑 → 一開始就讓莊家摸第一張牌
  if (mode === "solo") {
    startTurn();
  }
}

// ======================================================================
// 玩家設定
// ======================================================================
function setupPlayers() {
  if (mode === "solo") {
    players = [
      { name: myName || "你", seat: 0, isAI: false },
      { name: "AI-1", seat: 1, isAI: true },
      { name: "AI-2", seat: 2, isAI: true },
      { name: "AI-3", seat: 3, isAI: true },
    ];
  } else {
    players = [
      { name: "P0", seat: 0, isAI: false },
      { name: "P1", seat: 1, isAI: false },
      { name: "P2", seat: 2, isAI: false },
      { name: "P3", seat: 3, isAI: false },
    ];
  }
}

function sortHand(hand) {
  // 花色優先順序：萬 → 條 → 筒 → 字牌
  const suitOrder = { W: 1, T: 2, B: 3, Z: 4 };

  // 字牌（東南西北中發白）
  const honors = ["E", "S", "W", "N", "C", "F", "P"];

  hand.sort((a, b) => {
    const sa = a.slice(-1); // 最後字元＝花色
    const sb = b.slice(-1);

    // 判斷字牌
    const isHonorA = honors.includes(a);
    const isHonorB = honors.includes(b);

    // 字牌歸類為 Z
    const suitA = isHonorA ? "Z" : sa;
    const suitB = isHonorB ? "Z" : sb;

    // 1️⃣ 先依花色（W < T < B < Z）
    if (suitOrder[suitA] !== suitOrder[suitB]) {
      return suitOrder[suitA] - suitOrder[suitB];
    }

    // 2️⃣ 數字比大小（字牌跳過）
    if (!isHonorA && !isHonorB) {
      return parseInt(a) - parseInt(b);
    }

    // 3️⃣ 兩張都是字牌 → 維持原順序即可
    return 0;
  });

  return hand;
}

// ===============================
// 台灣麻將：可摸牌數計算（唯一權威版本）
// ===============================
//
// 想像流程：
//   1. 一開始有 144 張
//   2. 死牆固定保留 16 張（台麻規則）
//   3. 真正「可以被摸出來」的，就是牌牆裡面除了死牆以外的牌
//
// distributeTiles() 發完 4 家各 16 張之後：
//   - 144 - 64 = 80 張還在牌牆裡
//   - 其中最後 16 張是死牆 → 80 - 16 = 64（這才是你要顯示的「剩餘」）
//
// 槓牌 / 補花：都會從 wall 抽牌或放回花牌區，但只要
//   「 wall.length 」 有正確維護，這個函式永遠會給正確值。
//
function getDrawableTileCount() {
  const DEAD_WALL = 16; // 死牆固定為 16 張
  const drawable = wall.length - DEAD_WALL; // 目前牌牆長度扣掉死牆

  // 不允許變成負數（保險）
  return drawable > 0 ? drawable : 0;
}

// ======================================================================
// 建立牌牆 & 洗牌
// ======================================================================
function buildWall() {
  const tiles = [];

  // 1. 萬條筒（108 張）
  const suits = ["W", "T", "B"]; // 萬/條/筒
  suits.forEach((suit) => {
    for (let n = 1; n <= 9; n++) {
      for (let i = 0; i < 4; i++) {
        tiles.push(`${n}${suit}`);
      }
    }
  });

  // 2. 字牌（中發白 + 東南西北，共 28 張）
  const honors = ["C", "F", "P", "E", "S", "W", "N"]; // 中發白東南西北
  honors.forEach((h) => {
    for (let i = 0; i < 4; i++) {
      tiles.push(h);
    }
  });

  // 3. 花牌（8 張）→ 符合你的圖檔
  // 春夏秋冬 = 1F~4F
  for (let n = 1; n <= 4; n++) {
    tiles.push(`${n}F`);
  }

  // 梅蘭竹菊 = 1P~4P
  for (let n = 1; n <= 4; n++) {
    tiles.push(`${n}P`);
  }

  wall = tiles; // ⭐ 寫回全域變數
}

function shuffleWall() {
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
}

// ======================================================================
// ⭐ 流局處理：無牌可摸 → 結束遊戲（之後可接分數 / 下一局）
// ======================================================================
function handleNoTileDraw() {
  if (gameEnded) return;

  console.log("🀄 流局（無可摸牌數）");
  gameEnded = true; // 標記遊戲結束

  actionUI.hideActions(); // 把吃碰槓胡按鈕收起來
  ui.showMessage("🀄 流局！無可摸牌");
  alert("流局！遊戲結束。（之後可以加：結算台數 / 繼續下一局）");
}

// ======================================================================
// ★ 回合流程（最終版）
//   1. 一定先摸牌
//   2. 自動補花（可能連補多張）
//   3. 判斷「自摸」&「加槓 / 暗槓」
//   4. 有反應 → 顯示按鈕（自摸 / 槓 / PASS）
//   5. 無反應 → 進入出牌階段（玩家 or AI）
// ======================================================================
async function startTurn() {
  console.log(`🔄 開始回合 seat=${turn}`);

  // ------------------------------------------------------
  // 0️⃣ 安全檢查區：任何一個條件成立都直接 return
  // ------------------------------------------------------

  // 0-1. 遊戲已結束 → 完全不再動
  if (gameEnded) {
    console.log("⛔ 遊戲已結束，startTurn 中止");
    return;
  }

  // 0-2. 正在等待「吃 / 碰 / 槓 / 胡 / PASS」的 UI 選擇
  //      若 turnLocked = true，代表有人按按鈕的決策尚未完成
  if (turnLocked) {
    console.log("⏳ 等待玩家操作中（turnLocked = true），暫停 startTurn");
    return;
  }

  // 0-3. 多人模式：若現在輪到的不是自己，就交給線上邏輯處理
  if (mode === "multi" && turn !== mySeat) {
    console.log("🌐 multi 模式 & 不是本家回合 → 不在本機啟動回合");
    return;
  }

  // 0-4. 若「剩餘可摸牌數」（不含死牆） <= 0 → 流局
  //      （getDrawableTileCount() = wall.length - DEAD_WALL）
  if (getDrawableTileCount() <= 0) {
    handleNoTileDraw();
    return;
  }

  // ------------------------------------------------------
  // 1️⃣ 一定先摸牌
  //
  //    - 從牌牆「頂端」 wall.shift() 取牌
  //    - 放入目前回合玩家的手牌 hand[turn]
  //
  //    ✅ 這一步執行後：
  //       - 若原本 16 張 → 變 17 張
  //       - 若原本 13 張（吃碰後） → 變 14 張
  // ------------------------------------------------------
  const drawnTile = wall.shift(); // 從牆頂摸一張

  // 防呆：如果牆已經沒牌（極端狀況），視為流局處理
  if (!drawnTile) {
    console.log("⚠ wall.shift() 沒有拿到牌 → 視為無牌可摸");
    handleNoTileDraw();
    return;
  }

  hands[turn].push(drawnTile); // 實際加入手牌
  console.log(
    `🀄 seat=${turn} 自牌牆摸到 ${tileToChinese(drawnTile)}（${drawnTile}）`
  );

  // ------------------------------------------------------
  // 2️⃣ 補花流程（台麻規則：摸到花牌要從牌尾補）
  //
  //    rulesFlower.autoCatchFlowers 會自動：
  //      - 找出手牌中的花牌（1F~4F / 1P~4P）
  //      - 從 hand 中移除該花牌
  //      - 放入 flowerState.flowers[seat]
  //      - 再從「牌尾」 wall.pop() 補一張牌
  //      - 若補到的還是花 → 再重複上述流程，直到沒有花為止
  //
  //    ➜ 這裡只負責「呼叫邏輯」＋「顯示補花訊息」，
  //      真正的補花細節在 rules_flower.js 裡。
  // ------------------------------------------------------
  const flowerResult = rulesFlower.autoCatchFlowers(
    hands[turn],
    wall,
    turn,
    flowerState
  );

  // 將本回合補到的花牌逐一顯示訊息（可能一次補多張）
  flowerResult.newFlowers.forEach((f) =>
    ui.showMessage(`${players[turn].name} 補花：${tileToChinese(f)}`)
  );

  // 補花期間有可能把可摸牌數耗盡 → 再次檢查流局
  if (getDrawableTileCount() <= 0) {
    handleNoTileDraw();
    return;
  }

  // ------------------------------------------------------
  // 3️⃣ 手牌排序 + 畫面更新（完成摸牌 + 補花後的「穩定狀態」）
  //
  //    - sortHand()：依照「萬 → 條 → 筒 → 字牌」排序
  //    - renderAll()：重新畫整個畫面（手牌 / 對手牌背 / 捨牌 / 花牌 / 副露 / 回合高亮 / 風圈 / 剩餘牌數）
  // ------------------------------------------------------
  sortHand(hands[turn]);

  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    turn,
    flowState,
    getDrawableTileCount()
  );
  uiMelds.renderMelds(turn, melds[turn]);

  // ------------------------------------------------------
  // 4️⃣ 自摸判斷（checkHu）
  //
  //    規則：
  //      - 以「摸進來的那張牌 drawnTile」當作胡牌（winning tile）
  //      - isSelfDraw = true → 自摸
  //
  //    注意：
  //      - 我們把 hands[turn] 複製一份 [...hands[turn]] 傳進去，
  //        避免 rulesHu 在內部誤改到原陣列。
  // ------------------------------------------------------
  const huInfoSelf = rulesHu.checkHu(
    [...hands[turn]], // 拷貝一份手牌
    melds[turn], // 副露（吃 / 碰 / 槓）
    drawnTile, // 視為最後進來的那張牌
    true // 自摸（self draw）
  );

  // ------------------------------------------------------
  // 5️⃣ 檢查「加槓 / 暗槓」的可能性
  //
  //    規則：
  //      - playedTile = null   → 不是別人打出來的牌
  //      - drawnTile = 剛摸進來的牌（給規則層參考）
  //      - checkKong 會依照：
  //          1) 手牌中的四張相同 → 暗槓
  //          2) 副露裡有碰 + 手牌多一張相同 → 加槓
  //
  //    結果物 kongInfoSelf：
  //      - canKong: true / false
  //      - type: "暗槓" / "加槓" / "明槓"
  //      - tiles: [tile, tile, tile, tile]
  //      - pongIndex:（若是加槓）對應到 melds[turn] 中原有的那組碰
  // ------------------------------------------------------
  const kongInfoSelf = rulesMeld.checkKong(
    hands[turn],
    null, // playedTile = null（不是吃碰槓他家）
    melds[turn],
    drawnTile, // drawnTile 提供規則層使用
    turn,
    null // discardSeat = null
  );

  const canZimo = !players[turn].isAI && huInfoSelf && huInfoSelf.canHu; // 只有玩家才彈「自摸」按鈕
  const canAddKong =
    kongInfoSelf && kongInfoSelf.canKong && kongInfoSelf.type === "加槓";
  const canAnKong =
    kongInfoSelf && kongInfoSelf.canKong && kongInfoSelf.type === "暗槓";

  // ======================================================
  // 6️⃣ 若是 AI，先處理「自摸胡」的情況
  // ======================================================
  if (players[turn].isAI && huInfoSelf && huInfoSelf.canHu) {
    ui.showMessage(`${players[turn].name} 自摸：${tileToChinese(drawnTile)}`);
    gameEnded = true;
    actionUI.hideActions();
    alert("自摸胡（Demo：尚未實作台數結算）");
    return;
  }

  // ======================================================
  // 7️⃣ 若是玩家，而且「有自摸 或 有加槓/暗槓」→ 一次彈出所有可選按鈕
  //
  //    可能出現的組合：
  //      - 只有自摸（聽牌後摸胡）
  //      - 自摸 + 暗槓可做（某些特殊牌型）
  //      - 只有暗槓 / 加槓
  //      - 自摸 + 加槓
  //
  //    策略：全部一起給你選，自摸 / 槓 / PASS 你自己決定。
  // ======================================================
  if (!players[turn].isAI && (canZimo || canAddKong || canAnKong)) {
    console.log("🔔 玩家可反應：", {
      canZimo,
      canAddKong,
      canAnKong,
      huInfoSelf,
      kongInfoSelf,
    });

    // 設定「反應上下文」：之後 handleZimoFromUI / handleKongFromUI / handlePassFromUI 都會用
    reactionContext = {
      reactorSeat: turn, // 這次做反應的人（一定是目前這家）
      tile: drawnTile, // 本回合摸進來的牌（若自摸胡，用這張當 winning tile）
      huInfo: huInfoSelf, // 自摸資訊（若有）
      kongInfo: kongInfoSelf, // 槓牌資訊（若有）
      // ❗ 注意：這裡沒有 discardSeat → 在 handlePassFromUI 會被判定為「自摸 / 槓階段的 PASS」
    };

    // 鎖住回合：等你做完決定（自摸 / 槓 / PASS）
    turnLocked = true;

    // 顯示 actionBox 按鈕
    actionUI.showActions({
      canChi: false,
      chiList: [],
      canPong: false,
      canMingKong: false, // 摸牌後不會出現明槓（明槓是別人打第四張）
      canAddKong: canAddKong, // 若是「加槓」就亮起
      canAnKong: canAnKong, // 若是「暗槓」就亮起
      canHu: false, // 這裡的胡專門留給「放槍胡」用
      canZimo: canZimo, // ⭐ 自摸按鈕（你在 ui_actionbox.js 新增的那顆）
      canPass: true, // 可以選擇「什麼都不做，繼續打牌」
    });

    // 等玩家按完其中一顆按鈕，再由對應 handler 決定下一步
    return;
  }

  // ======================================================
  // 8️⃣ 完全沒有自摸＆沒有加槓 / 暗槓 → 進入「正常出牌階段」
  // ======================================================

  // 8-1. 玩家回合 → 啟用「點擊手牌出牌」功能
  if (!players[turn].isAI) {
    // 保險：確保回合已解鎖（此時沒有任何反應 UI）
    turnLocked = false;

    actionUI.enableHandClick({
      onPlayTile: (t) => playTile(turn, t),
    });

    // 等你自行出牌
    return;
  }

  // 8-2. AI 回合 → 交給 AI.onTurn 決定要打哪張
  turnLocked = true; // AI 正在思考 / 決策期間鎖住回合

  const aiDecision = await AI.onTurn({
    hand: hands[turn],
    melds: melds[turn],
    discards,
    playedTile: lastPlayedTile,
    wall,
    seat: turn,
    turn,
    flowerState,
  });

  // AI 決策完成 → 實際出牌
  handleAIDecision(aiDecision);
}

// ======================================================================
// AI 決策處理（目前只處理出牌）
// ======================================================================
function handleAIDecision(d) {
  if (!d) return;

  turnLocked = false; // ⭐ 出牌後解除鎖定

  switch (d.action) {
    case "PLAY":
      playTile(turn, d.tile);
      break;
    default: {
      // 沒給決策就打最後一張
      const last = hands[turn][hands[turn].length - 1];
      playTile(turn, last);
    }
  }
}

// ======================================================================
// 出牌（玩家 or AI 都進來這裡）
// ======================================================================
function playTile(seat, tile) {
  console.log(`🀄 seat=${seat} 打出 ${tile}`);

  // ⭐ 遊戲結束 or 等待吃碰槓胡 → 禁止出牌
  if (gameEnded) {
    console.log("⛔ 遊戲已結束，禁止出牌");
    return;
  }
  if (turnLocked) {
    console.log("⛔ 正在等待吃 / 碰 / 槓 / 胡 / PASS 選擇，禁止出牌");
    return;
  }

  // 從手牌刪除
  const idx = hands[seat].indexOf(tile);
  if (idx >= 0) hands[seat].splice(idx, 1);

  // 加入捨牌區
  discards[seat].push(tile);
  lastPlayedTile = tile;
  lastDiscardSeat = seat;

  sortHand(hands[seat]);

  // ⭐ 新增：提示誰打了什麼牌
  ui.showMessage(`${players[seat].name} 打出了 ${tileToChinese(tile)}`);

  // 更新 UI（牌桌 + 副露）
  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    turn,
    flowState,
    getDrawableTileCount()
  );

  for (let s = 0; s < 4; s++) uiMelds.renderMelds(s, melds[s]);

  // 多人同步（暫不處理吃碰槓胡詳細邏輯）
  if (mode === "multi") {
    online.sendPlayTile(seat, tile);
    nextTurn();
    return;
  }

  // 單人模式：出牌後 → 檢查其他玩家能不能 吃 / 碰 / 槓 / 胡
  checkReactionsAfterPlay(seat, tile);
}

// ======================================================================
// 🟥 AI 反應：吃 / 碰 / 槓 / 放槍胡
// ======================================================================
function handleAIReaction(r) {
  const s = r.seat;

  switch (r.action) {
    case "HU":
      ui.showMessage(`${players[s].name} 胡了！（放槍）`);
      gameEnded = true;
      turnLocked = false;
      actionUI.hideActions();
      alert("AI 放槍胡！");
      return;

    case "KONG":
      console.log(`AI-${s} 明槓`);
      doKongOperation(s, r.kongInfo, lastDiscardSeat);
      return;

    case "PONG":
      console.log(`AI-${s} 碰`);
      doPongOperation(s, lastPlayedTile, lastDiscardSeat, r.pongInfo);
      return;

    case "CHI":
      console.log(`AI-${s} 吃`);
      doChiOperation(s, lastPlayedTile, lastDiscardSeat, r.tiles);
      return;
  }
}

// ======================================================================
// 🟥 AI「吃」
// ======================================================================
function doChiOperation(seat, tile, discardSeat, chiTiles) {
  // 從捨牌區移除
  const disc = discards[discardSeat];
  const idx = disc.lastIndexOf(tile);
  if (idx >= 0) disc.splice(idx, 1);

  // 手牌移除另外兩張
  chiTiles.forEach((t) => {
    if (t !== tile) {
      const i = hands[seat].indexOf(t);
      if (i >= 0) hands[seat].splice(i, 1);
    }
  });

  melds[seat].push(chiTiles);

  sortHand(hands[seat]);

  turn = seat;
  reactionContext = null;
  turnLocked = false;

  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    turn,
    flowState,
    getDrawableTileCount()
  );
  uiMelds.renderMelds(seat, melds[seat]);

  // AI 出牌
  setTimeout(() => startTurn(), 300);
}

// ======================================================================
// 🟥 AI「碰」
// ======================================================================
function doPongOperation(seat, tile, discardSeat, pongInfo) {
  const disc = discards[discardSeat];
  const idx = disc.lastIndexOf(tile);
  if (idx >= 0) disc.splice(idx, 1);

  let remove = 2;
  for (let i = hands[seat].length - 1; i >= 0 && remove > 0; i--) {
    if (hands[seat][i] === tile) {
      hands[seat].splice(i, 1);
      remove--;
    }
  }

  melds[seat].push([tile, tile, tile]);
  sortHand(hands[seat]);

  turn = seat;
  reactionContext = null;
  turnLocked = false;

  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    turn,
    flowState,
    getDrawableTileCount()
  );
  uiMelds.renderMelds(seat, melds[seat]);

  setTimeout(() => startTurn(), 300);
}

// ======================================================================
// 🟥 AI「明槓」
// ======================================================================
function doKongOperation(seat, kongInfo, discardSeat) {
  const tile = kongInfo.tiles[0];

  // 移除捨牌
  const disc = discards[discardSeat];
  const idx = disc.lastIndexOf(tile);
  if (idx >= 0) disc.splice(idx, 1);

  // 移除手牌 3 張
  let remove = 3;
  for (let i = hands[seat].length - 1; i >= 0 && remove > 0; i--) {
    if (hands[seat][i] === tile) {
      hands[seat].splice(i, 1);
      remove--;
    }
  }

  melds[seat].push(kongInfo.tiles);

  // 槓後補牌
  const added = wall.pop();
  hands[seat].push(added);

  ui.showMessage(`${players[seat].name} 槓補：${tileToChinese(added)}`);

  // 補花（若補到花）
  rulesFlower.autoCatchFlowers(hands[seat], wall, seat, flowerState);

  sortHand(hands[seat]);
  reactionContext = null;
  turnLocked = false;
  turn = seat;

  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    turn,
    flowState,
    getDrawableTileCount()
  );
  uiMelds.renderMelds(seat, melds[seat]);

  setTimeout(() => startTurn(), 300);
}

// ======================================================================
// ★ 出牌後：檢查能不能吃 / 碰 / 槓 / 胡（玩家 + AI）
// ======================================================================
function checkReactionsAfterPlay(discardSeat, tile) {
  // --------------------------------------------------------------
  // ① 先收集所有 AI（seat 1,2,3）的反應
  // --------------------------------------------------------------
  let reactions = [];

  for (let s = 0; s < 4; s++) {
    if (s === discardSeat) continue; // 丟牌的人不會反應
    if (s === 0) continue; // 玩家 0 留給 UI 決策
    if (!players[s].isAI) continue;

    const aiReaction = AI.onReaction({
      seat: s,
      playedTile: tile,
      hand: hands[s],
      melds: melds[s],
      discards,
    });

    if (aiReaction && aiReaction.action !== "PASS") {
      reactions.push({
        seat: s,
        ...aiReaction,
        priority: getReactionPriority(aiReaction.action, discardSeat, s),
      });
    }
  }

  // --------------------------------------------------------------
  // ② 玩家（seat 0）也要一起計算優先權
  // --------------------------------------------------------------
  const reactorSeat = 0;
  if (reactorSeat !== discardSeat) {
    const hand = hands[reactorSeat];
    const myMelds = melds[reactorSeat];

    const huInfo = rulesHu.checkHu([...hand, tile], myMelds, tile, false);

    const kongInfo = rulesMeld.checkKong(
      hand,
      tile,
      myMelds,
      null,
      reactorSeat,
      discardSeat
    );
    const pongInfo = rulesMeld.checkPong(hand, tile);
    const chiInfo = rulesMeld.checkChi(hand, tile, reactorSeat, discardSeat);

    const canHu = huInfo && huInfo.canHu;
    const canMingKong =
      kongInfo && kongInfo.canKong && kongInfo.type === "明槓";
    const canPong = pongInfo && pongInfo.canPong;
    const canChi = chiInfo && chiInfo.canChi;

    if (canHu) reactions.push({ seat: 0, action: "HU", huInfo, priority: 4 });
    if (canMingKong)
      reactions.push({ seat: 0, action: "KONG", kongInfo, priority: 3 });
    if (canPong)
      reactions.push({ seat: 0, action: "PONG", pongInfo, priority: 2 });
    if (canChi)
      reactions.push({ seat: 0, action: "CHI", chiInfo, priority: 1 });
  }

  // --------------------------------------------------------------
  // ③ 若完全沒有人反應 → 下一家摸牌
  // --------------------------------------------------------------
  if (reactions.length === 0) {
    nextTurn();
    return;
  }

  // --------------------------------------------------------------
  // ④ 依照優先權排序（胡 > 槓 > 碰 > 吃）
  // --------------------------------------------------------------
  reactions.sort((a, b) => b.priority - a.priority);
  const winner = reactions[0];

  // --------------------------------------------------------------
  // ⑤ 若是 AI 得到反應權 → 直接執行
  // --------------------------------------------------------------
  if (players[winner.seat].isAI) {
    console.log(`🤖 AI-${winner.seat} 反應：${winner.action}`);
    handleAIReaction(winner);
    return;
  }

  // --------------------------------------------------------------
  // ⑥ 若是玩家得到優先權 → 呼叫 UI
  // --------------------------------------------------------------
  reactionContext = {
    discardSeat,
    reactorSeat: 0,
    tile,
    huInfo: winner.huInfo,
    kongInfo: winner.kongInfo,
    pongInfo: winner.pongInfo,
    chiInfo: winner.chiInfo,
  };

  turnLocked = true;

  actionUI.showActions({
    canChi: !!winner.chiInfo,
    chiList: winner.chiInfo ? winner.chiInfo.chiList : [],
    canPong: !!winner.pongInfo,
    canMingKong: !!winner.kongInfo,
    canAddKong: false,
    canAnKong: false,
    canHu: !!winner.huInfo,
    canPass: true,
  });
}

// ======================================================================
// 🟥 AI / 玩家 反應優先級：HU > KONG > PONG > CHI
// ======================================================================
function getReactionPriority(action, discardSeat, seat) {
  switch (action) {
    case "HU":
      return 4;
    case "KONG":
      return 3;
    case "PONG":
      return 2;
    case "CHI":
      // 吃只能上家
      return seat === (discardSeat + 1) % 4 ? 1 : 0;
    default:
      return 0;
  }
}

// ======================================================================
// ★ UI callback：玩家在 actionBox 按下「吃」
// ======================================================================
function handleChiFromUI(chosenChi) {
  if (!reactionContext || gameEnded) return;
  const { discardSeat, reactorSeat, tile } = reactionContext;

  console.log("👉 玩家選擇 吃：", chosenChi);

  // 多人模式 → 廣播吃
  if (mode === "multi") {
    online.sendReaction({
      type: "CHI",
      reactorSeat,
      discardSeat,
      tile,
      chiTiles: chosenChi,
    });
  }

  // 1) 從捨牌區拿回那張牌
  const disc = discards[discardSeat];
  const idx = disc.lastIndexOf(tile);
  if (idx >= 0) disc.splice(idx, 1);

  // 2) 從玩家手牌移除「另外兩張」
  chosenChi.forEach((t) => {
    if (t === tile) return; // 這張是別人打出的，已經從 discards 拿回
    const i = hands[reactorSeat].indexOf(t);
    if (i >= 0) hands[reactorSeat].splice(i, 1);
  });

  // 3) 記錄副露
  melds[reactorSeat].push(chosenChi);
  sortHand(hands[reactorSeat]);

  // 4) 更新 UI
  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    reactorSeat,
    flowState,
    getDrawableTileCount()
  );

  uiMelds.renderMelds(reactorSeat, melds[reactorSeat]);

  // 5) 吃完之後輪到「吃的人」出牌（不再摸牌）
  turn = reactorSeat;
  reactionContext = null;

  // ⭐ 解鎖回合，讓玩家可以出牌
  turnLocked = false;

  if (!players[turn].isAI) {
    actionUI.enableHandClick({
      onPlayTile: (t) => playTile(turn, t),
    });
  } else {
    // 理論上不會發生（AI 不會吃），放保險
    const last = hands[turn][hands[turn].length - 1];
    playTile(turn, last);
  }
}

// ======================================================================
// ★ UI callback：玩家在 actionBox 按下「碰」
// ======================================================================
function handlePongFromUI() {
  if (!reactionContext || gameEnded) return;
  const { discardSeat, reactorSeat, tile, pongInfo } = reactionContext;
  if (!pongInfo || !pongInfo.canPong) return;

  console.log("👉 玩家選擇 碰");

  if (mode === "multi") {
    online.sendReaction({
      type: "PONG",
      reactorSeat,
      discardSeat,
      tile,
    });
  }

  // 1) 從捨牌區拿回那張牌
  const disc = discards[discardSeat];
  const idx = disc.lastIndexOf(tile);
  if (idx >= 0) disc.splice(idx, 1);

  // 2) 從手牌移除另外兩張
  let toRemove = 2;
  for (let i = hands[reactorSeat].length - 1; i >= 0 && toRemove > 0; i--) {
    if (hands[reactorSeat][i] === tile) {
      hands[reactorSeat].splice(i, 1);
      toRemove--;
    }
  }

  // 3) 記錄副露
  melds[reactorSeat].push(pongInfo.pongTiles);
  sortHand(hands[reactorSeat]);

  // 4) 更新 UI
  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    reactorSeat,
    flowState,
    getDrawableTileCount()
  );

  uiMelds.renderMelds(reactorSeat, melds[reactorSeat]);

  // 5) 碰完之後由「碰的人」出牌（不再摸牌）
  turn = reactorSeat;
  reactionContext = null;

  // ⭐ 解鎖回合
  turnLocked = false;

  if (!players[turn].isAI) {
    actionUI.enableHandClick({
      onPlayTile: (t) => playTile(turn, t),
    });
  } else {
    const last = hands[turn][hands[turn].length - 1];
    playTile(turn, last);
  }
}

// ======================================================================
// ★ UI callback：玩家按下「槓」
//   流程符合台麻規則：
//   ✔ 前提：一定已經摸牌 → 手牌 = 14 張
//   ✔ 暗槓：手牌 -4 → 變 10（14 - 4）
//   ✔ 加槓：手牌 -1 → 變 13（已有碰）
//   ✔ 明槓：手牌 -3 → 變 11（吃別人打一張）
//   ✔ 槓後 → 從「尾牌」補 1 張 → 手牌補回 14 張
//   ✔ 若補到花 → 連續補花（直到落地為止）
//   ✔ 槓後補牌最後一張 → 判斷「槓上開花」
//   ✔ 槓後回合不變，繼續由自己出牌
// ======================================================================
// ======================================================================
// ★ UI callback：玩家在 actionBox 按下「槓」
//   （加槓 / 暗槓 / 明槓 → 再補牌 → 槓上開花判斷 → 讓自己出牌）
// ======================================================================
function handleKongFromUI(kongTypeFromUI = null) {
  // 沒有反應上下文（誰要槓、槓什麼牌）、或遊戲結束 → 直接無視
  if (!reactionContext || gameEnded) return;

  const kongInfo = reactionContext.kongInfo; // 規則層給的「槓資訊」
  const reactorSeat = reactionContext.reactorSeat; // 槓的人（通常是你 seat=0）

  // 防呆：理論上 showActions 會保證能槓，這裡再檢查一次
  if (!kongInfo || !kongInfo.canKong) {
    ui.showMessage("⚠ 無法槓：不符合條件");
    return;
  }

  // 若 UI 有指定類型（明槓 / 加槓 / 暗槓），優先用 UI 的；否則用規則層預設 type
  const type = kongTypeFromUI || kongInfo.type;
  const tile = kongInfo.tiles[0]; // 槓的是哪一張牌（四張一樣，所以取第一張即可）

  ui.showMessage(
    `${players[reactorSeat].name} 宣告：${type}（${tileToChinese(tile)}）`
  );

  // ====================================================================
  // 1️⃣ 明槓（別人打出的第 4 張 → 你手上剛好有 3 張）
  //     → 牌型變化：手牌 -3（從 14 → 11），那張捨牌收回，不再留在捨牌區
  // ====================================================================
  if (type === "明槓") {
    const discardSeat = reactionContext.discardSeat; // 誰打出的那張牌

    // 從捨牌區拿回那張 tile
    const disc = discards[discardSeat];
    const idx = disc.lastIndexOf(tile);
    if (idx >= 0) disc.splice(idx, 1);

    // 從自己手牌移除 3 張相同的牌（因為自己原本就有三張）
    let remove = 3;
    for (let i = hands[reactorSeat].length - 1; i >= 0 && remove > 0; i--) {
      if (hands[reactorSeat][i] === tile) {
        hands[reactorSeat].splice(i, 1);
        remove--;
      }
    }

    // 副露區加入一組 [tile, tile, tile, tile]
    melds[reactorSeat].push(kongInfo.tiles);
  }

  // ====================================================================
  // 2️⃣ 加槓（已有一組「碰」＋ 自摸摸到第 4 張）：
  //     例如：原本有 [3W,3W,3W] 副露，手牌又摸到一張 3W
  //     → 副露中的 [3W,3W,3W] 變成 [3W,3W,3W,3W]
  //     → 手牌再把那張 3W 移除（手牌 -1）
  // ====================================================================
  else if (type === "加槓") {
    const idx = kongInfo.pongIndex; // 這組「碰」在 melds 裡的索引

    // 把該組「碰」改寫成「槓」
    melds[reactorSeat][idx] = kongInfo.tiles;

    // 手牌移除那張第 4 張 tile（例如新摸到的那張 3W）
    const loc = hands[reactorSeat].indexOf(tile);
    if (loc >= 0) hands[reactorSeat].splice(loc, 1);
  }

  // ====================================================================
  // 3️⃣ 暗槓（自家牌裡直接有 4 張一樣）：
  //     例如：手牌中本來就有 [5B,5B,5B,5B]
  //     → 手牌 -4，副露新增一組「暗槓」
  // ====================================================================
  else if (type === "暗槓") {
    let remove = 4;
    for (let i = hands[reactorSeat].length - 1; i >= 0 && remove > 0; i--) {
      if (hands[reactorSeat][i] === tile) {
        hands[reactorSeat].splice(i, 1);
        remove--;
      }
    }

    // 做一份拷貝出來，標記 isAnGang 給 UI 用（可決定要不要背面顯示）
    const gang = [...kongInfo.tiles];
    gang.isAnGang = true;
    melds[reactorSeat].push(gang);
  }

  // ====================================================================
  // 4️⃣ 槓完先排一次序 & 更新 UI（此時還沒補尾牌，純粹顯示槓後的狀態）
  // ====================================================================
  sortHand(hands[reactorSeat]);
  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    reactorSeat,
    flowState,
    getDrawableTileCount()
  );
  uiMelds.renderMelds(reactorSeat, melds[reactorSeat]);

  // ====================================================================
  // 5️⃣ 台灣麻將規則：槓完一定要「從牌牆尾端」補 1 張牌
  //     → 這一張就是「槓補牌」，有機會變成「槓上開花」的那張
  // ====================================================================
  if (wall.length > 0) {
    const added = wall.pop(); // 從牌牆尾端補牌
    hands[reactorSeat].push(added); // 加進手牌

    ui.showMessage(
      `${players[reactorSeat].name} 槓補：${tileToChinese(added)}`
    );

    // ---------------------------------------------------------------
    // 若補到花牌 → 交給 rules_flower 自動連續補（花牌會被移出手牌）
    //   ⌁ 手牌中所有花會被移除
    //   ⌁ 每移除一張花，就從「尾牌」再補一張回來
    //   ⌁ 直到手牌中不再有花為止
    // ---------------------------------------------------------------
    const flowerRes = rulesFlower.autoCatchFlowers(
      hands[reactorSeat],
      wall,
      reactorSeat,
      flowerState
    );

    // 將這一次補花過程中的每一張花都提示出來
    flowerRes.newFlowers.forEach((f) => {
      ui.showMessage(`${players[reactorSeat].name} 補花：${tileToChinese(f)}`);
    });
  }

  // ====================================================================
  // 6️⃣ 槓補後 → 檢查「槓上開花」（補完的最後一張牌視為贏牌）
  //     注意：autoCatchFlowers 會把所有花丟掉再補回非花，
  //           因此這裡取最後一張，會是最終實際留在手上的那張牌
  // ====================================================================
  const lastTile = hands[reactorSeat][hands[reactorSeat].length - 1]; // 最後那張補完存在手上的牌

  const huInfo = rulesHu.checkHu(
    [...hands[reactorSeat]], // 拷貝手牌（不直接動原陣列）
    melds[reactorSeat], // 副露（包括剛完成的槓）
    lastTile, // 視為最後胡進的那張
    true // 自摸 = true
  );

  if (huInfo && huInfo.canHu) {
    // 若要更精緻，可以在這裡再用 handleZimoFromUI 風格統一處理
    ui.showMessage(`🎉 ${players[reactorSeat].name} 槓上開花！`);
    gameEnded = true;
    turnLocked = false;
    actionUI.hideActions();
    alert("槓上開花！");
    return;
  }

  // ====================================================================
  // 7️⃣ 若沒有槓上開花 → 正常繼續遊戲流程
  //     → 此時手牌應該是 14 張（暗槓: 16+1-4+1 / 加槓: 13+1-1+1 / 明槓: 14-3+1）
  //     → 由「槓的人」繼續出牌（槓不消turn）
  // ====================================================================
  sortHand(hands[reactorSeat]);
  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    reactorSeat,
    flowState,
    getDrawableTileCount()
  );
  uiMelds.renderMelds(reactorSeat, melds[reactorSeat]);

  // 清空這次反應上下文
  reactionContext = null;

  // 槓完一定還是輪到自己（台灣麻將：槓不換人）
  turn = reactorSeat;

  // 解鎖回合，讓玩家可以選牌打出
  turnLocked = false;

  actionUI.enableHandClick({
    onPlayTile: (t) => playTile(turn, t),
  });
}

// ======================================================================
// ★ UI callback：玩家在 actionBox 按下「胡」
// ======================================================================
function handleHuFromUI() {
  if (!reactionContext || gameEnded) return;
  const { discardSeat, reactorSeat, tile, huInfo } = reactionContext;
  if (!huInfo || !huInfo.canHu) return;

  console.log("🎉 玩家胡牌！（放槍）", huInfo);

  if (mode === "multi") {
    online.sendReaction({
      type: "HU",
      reactorSeat,
      discardSeat,
      tile,
      huInfo,
    });
  }

  const disc = discards[discardSeat];
  const idx = disc.lastIndexOf(tile);
  if (idx >= 0) disc.splice(idx, 1);

  hands[reactorSeat].push(tile);
  sortHand(hands[reactorSeat]);

  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    reactorSeat,
    flowState,
    getDrawableTileCount()
  );

  uiMelds.renderMelds(reactorSeat, melds[reactorSeat]);

  reactionContext = null;

  // ⭐ 胡牌 → 結束遊戲 + 關掉所有動作按鈕
  gameEnded = true;
  turnLocked = false;
  actionUI.hideActions();

  alert("胡了！(目前只是 Demo，尚未結算台數 / 結束遊戲)");
}

// ======================================================================
// ★ UI callback：玩家在 actionBox 按下「PASS」
//    根據「reactionContext 裡的資訊」決定：
//      1) PASS 自摸 / 加槓 / 暗槓 → 不換家，自己繼續出牌
//      2) PASS 吃 / 碰 / 明槓 / 放槍胡 → 換下一家
// ======================================================================
function handlePassFromUI() {
  console.log("👉 玩家選擇 PASS");

  // 若目前根本沒有任何反應上下文 → 不應該出現 PASS（保險）
  if (!reactionContext) {
    console.log("⚠ PASS 時沒有 reactionContext，直接忽略");
    return;
  }

  // 從 reactionContext 中取出目前情境
  const { kongInfo, discardSeat } = reactionContext;

  // 清空反應上下文 & 解鎖回合
  reactionContext = null;
  turnLocked = false;

  // --------------------------------------------------
  // ① PASS 自摸 / 加槓 / 暗槓【特徵：reactionContext 沒有 discardSeat】
  //
  //   - 這種情況代表是「自己摸牌後」的反應階段
  //   - PASS 只表示「我這輪不自摸也不槓」
  //   - 回合依然是自己 → 直接進入「出牌階段」
  // --------------------------------------------------
  if (typeof discardSeat === "undefined") {
    console.log("🔸 PASS 自摸 / 加槓 / 暗槓 → 不換家，自己繼續回合");

    actionUI.enableHandClick({
      onPlayTile: (t) => playTile(turn, t),
    });

    return;
  }

  // --------------------------------------------------
  // ② PASS 吃 / 碰 / 明槓 / 放槍 胡
  //
  //    - 這種情況一定有 discardSeat（有人剛打出一張牌）
  //    - PASS ＝ 放棄這次對那張牌的反應機會 → 輪到下一家摸牌
  // --------------------------------------------------
  console.log("🔸 PASS 吃 / 碰 / 明槓 / 放槍 → 換下一家");
  nextTurn();
}

// ======================================================================
// ★ UI callback：玩家在 actionBox 按下「自摸」
// ======================================================================

function handleZimoFromUI() {
  if (!reactionContext || gameEnded) return;

  const { reactorSeat, tile, huInfo } = reactionContext;

  console.log("🎉 玩家選擇『自摸胡』！", huInfo);

  // ✅ 重要修正：
  //   自摸那張牌（tile）早在 startTurn 裡就已經加入 hand 了，
  //   這裡「不要再 push 一次」，只要排序＋更新畫面即可。
  sortHand(hands[reactorSeat]);

  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    reactorSeat,
    flowState,
    getDrawableTileCount()
  );

  uiMelds.renderMelds(reactorSeat, melds[reactorSeat]);

  // ✅ 清理狀態
  reactionContext = null;
  gameEnded = true;
  turnLocked = false;
  actionUI.hideActions();

  alert("恭喜自摸！（之後可在這裡加入台數結算畫面）");
}

// ======================================================================
// 換下一家
// ======================================================================
function nextTurn() {
  // 遊戲結束就不要再輪下去
  if (gameEnded) {
    console.log("⛔ 遊戲已結束，nextTurn 不再前進");
    return;
  }

  turn = (turn + 1) % 4;
  console.log(`➡️ 換下一家 seat=${turn}`);

  if (mode === "multi" && turn !== mySeat) return;

  startTurn();
}

// ======================================================================
// ⭐⭐⭐ 多人模式：收到別人吃 / 碰 / 槓 / 胡 / PASS
// ======================================================================
function handleRemoteReaction(data) {
  const { type, reactorSeat, discardSeat, tile, chiTiles } = data;

  console.log("🌐 收到線上反應事件：", data);

  if (type === "CHI") {
    const disc = discards[discardSeat];
    const idx = disc.lastIndexOf(tile);
    if (idx >= 0) disc.splice(idx, 1);

    chiTiles.forEach((t) => {
      if (t !== tile) {
        const i = hands[reactorSeat].indexOf(t);
        if (i >= 0) hands[reactorSeat].splice(i, 1);
      }
    });

    melds[reactorSeat].push(chiTiles);
    sortHand(hands[reactorSeat]);

    turn = reactorSeat;
  } else if (type === "PONG") {
    const disc = discards[discardSeat];
    const idx = disc.lastIndexOf(tile);
    if (idx >= 0) disc.splice(idx, 1);

    let remove = 2;
    for (let i = hands[reactorSeat].length - 1; i >= 0 && remove > 0; i--) {
      if (hands[reactorSeat][i] === tile) {
        hands[reactorSeat].splice(i, 1);
        remove--;
      }
    }

    melds[reactorSeat].push([tile, tile, tile]);
    sortHand(hands[reactorSeat]);

    turn = reactorSeat;
  } else if (type === "KONG") {
    const disc = discards[discardSeat];
    const idx = disc.lastIndexOf(tile);
    if (idx >= 0) disc.splice(idx, 1);

    let remove = 3;
    for (let i = hands[reactorSeat].length - 1; i >= 0 && remove > 0; i--) {
      if (hands[reactorSeat][i] === tile) {
        hands[reactorSeat].splice(i, 1);
        remove--;
      }
    }

    melds[reactorSeat].push([tile, tile, tile, tile]);
    sortHand(hands[reactorSeat]);

    turn = reactorSeat;
  } else if (type === "HU") {
    alert(`玩家 ${reactorSeat} 胡牌！`);
  } else if (type === "PASS") {
    nextTurn();
    return;
  }

  ui.renderAll(
    players,
    hands,
    discards,
    melds,
    flowerState.flowers,
    turn,
    flowState,
    getDrawableTileCount()
  );

  uiMelds.renderMelds(reactorSeat, melds[reactorSeat]);
}

// ======================================================================
// 多人模式 callback（目前未連動吃碰槓胡實際邏輯）
// ======================================================================
const tableCallbacks = {
  onPlayTile: (seat, tile) => playTile(seat, tile),

  onDrawTile: (seat, tile) => {
    hands[seat].push(tile);
    sortHand(hands[seat]); // ⭐ 讓遠端也保持手牌排序
    ui.renderAll(
      players,
      hands,
      discards,
      melds,
      flowerState.flowers,
      turn,
      flowState,
      getDrawableTileCount()
    );

    uiMelds.renderMelds(seat, melds[seat]);
  },

  onTurn: (newTurn) => {
    turn = newTurn;
    ui.renderAll(
      players,
      hands,
      discards,
      melds,
      flowerState.flowers,
      turn,
      flowState,
      getDrawableTileCount()
    );

    uiMelds.renderMelds(newTurn, melds[newTurn]);
  },

  onRemoteReaction: handleRemoteReaction,
};

// ======================================================================
// ★ 遊戲啟動
// ======================================================================
initGame();
