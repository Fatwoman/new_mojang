// ======================================================================
// online_resolve.js
// 用途：多人遊戲同步層（Online Layer）
//
// 單人模式：完全不會載入本檔案的功能。
// 多人模式：透過 Firebase 把「某些事件」同步給所有玩家。
//
// 目前已實作：
//   ✔ initOnline(...)              → 初始化所有監聽
//   ✔ sendPlayTile / listenPlayTile→ 出牌同步
//   ✔ sendDrawTile / listenDrawTile→ 摸牌同步
//   ✔ sendTurn / listenTurn        → 輪到誰出牌
//   ✔ sendReaction / listenReaction→ 吃 / 碰 / 槓 / 胡 / PASS 通知（新）
//
// 之後可以再擴充：
//   - sendMeld / listenMeld        → 若你想把「副露內容」也寫到雲端
//   - sendHu / listenHu            → 完整胡牌結算
//   - updateFlow / listenFlow      → 風圈 / 局數 / 連莊 等
// ======================================================================

// -----------------------------
// Firebase 路徑產生器
// -----------------------------
// 讓所有路徑都走 rooms/{roomID}/{sub}
function roomPath(roomID, sub) {
  return window.firebaseRef(`rooms/${roomID}/${sub}`);
}

// ======================================================================
// ★（一）初始化多人同步 initOnline()
// ======================================================================

/**
 * 初始化多人同步，並綁定所有監聽事件
 *
 * @param {string} roomID   - 房號
 * @param {number} mySeat   - 自己的位置（0~3）目前沒用到，預留
 * @param {object} callbacks- table.js 提供的 callback 物件
 *                            必須至少有：
 *                              onPlayTile(seat, tile)
 *                              onDrawTile(seat, tile)
 *                              onTurn(newTurn)
 *                            若要吃碰槓胡同步，再加：
 *                              onRemoteReaction(reactionData)
//  reactionData 格式在 listenReaction() 註解中說明
 */
export function initOnline(roomID, mySeat, callbacks) {
  console.log("🌐 online_resolve.js → 多人同步初始化", roomID);

  // 監聽：有人出牌
  listenPlayTile(roomID, callbacks);

  // 監聽：有人摸牌
  listenDrawTile(roomID, callbacks);

  // 監聽：輪轉通知
  listenTurn(roomID, callbacks);

  // 監聽：吃 / 碰 / 槓 / 胡 / PASS（新）
  listenReaction(roomID, callbacks);

  // 其它（meld / hu / flow）先保留骨架不動
}

// ======================================================================
// ★（二）同步：出牌 broadcast
// ======================================================================

/**
 * 廣播：「seat 丟出 tile」
 * table.js 在 playTile() 裡會呼叫此函式
 */
export function sendPlayTile(seat, tile) {
  const roomID = localStorage.getItem("room");
  const playRef = roomPath(roomID, "actions/play");

  window.firebaseSet(playRef, {
    seat,
    tile,
    timestamp: Date.now(),
  });
}

// ======================================================================
// ★（三）同步：摸牌 broadcast
// ======================================================================

/**
 * 廣播：「seat 抽到 tile」
 * 在多人模式下，只有莊家/控制端會呼叫
 */
export function sendDrawTile(seat, tile) {
  const roomID = localStorage.getItem("room");
  const drawRef = roomPath(roomID, "actions/draw");

  window.firebaseSet(drawRef, {
    seat,
    tile, // 若不想公開手牌，可改成 null 或只記 seat
    timestamp: Date.now(),
  });
}

// ======================================================================
// ★（四）同步：輪轉 broadcast
// ======================================================================

/**
 * 廣播：「下一家 turn = seat」
 */
export function sendTurn(seat) {
  const roomID = localStorage.getItem("room");
  const turnRef = roomPath(roomID, "turn");

  window.firebaseSet(turnRef, seat);
}

// ======================================================================
// ★（五）監聽：有人出牌（所有玩家都要收到）
// ======================================================================

function listenPlayTile(roomID, callbacks) {
  const playRef = roomPath(roomID, "actions/play");

  window.firebaseOn(playRef, (data) => {
    if (!data) return;

    const { seat, tile } = data;

    // 呼叫 table.js 的 callback → 自己更新桌面
    if (callbacks && typeof callbacks.onPlayTile === "function") {
      callbacks.onPlayTile(seat, tile);
    }
  });
}

// ======================================================================
// ★（六）監聽：有人摸牌
// ======================================================================

function listenDrawTile(roomID, callbacks) {
  const drawRef = roomPath(roomID, "actions/draw");

  window.firebaseOn(drawRef, (data) => {
    if (!data) return;

    const { seat, tile } = data;

    if (callbacks && typeof callbacks.onDrawTile === "function") {
      callbacks.onDrawTile(seat, tile);
    }
  });
}

// ======================================================================
// ★（七）監聽：輪到誰出牌
// ======================================================================

function listenTurn(roomID, callbacks) {
  const turnRef = roomPath(roomID, "turn");

  window.firebaseOn(turnRef, (newTurn) => {
    if (newTurn === null || newTurn === undefined) return;

    if (callbacks && typeof callbacks.onTurn === "function") {
      callbacks.onTurn(newTurn);
    }
  });
}

// ======================================================================
// ★（八）同步：吃 / 碰 / 槓 / 胡 / PASS（新通道）
// ======================================================================

/**
 * 廣播一個「反應事件」：
 *  例如：
 *    sendReaction({
 *      type: "PONG",
 *      reactorSeat: 0,
 *      discardSeat: 1,
 *      tile: "5B"
 *    });
 *
 *  建議欄位：
 *    type: "CHI" | "PONG" | "KONG" | "HU" | "PASS"
 *    reactorSeat: 誰做出反應（0~3）
 *    discardSeat: 那張牌原本是誰打出的（0~3）
 *    tile:       被吃/碰/槓/胡 的那張牌
 *    chiTiles?:  若 type="CHI" 可帶上完整吃牌陣列 ["3W","4W","5W"]
 *    kongType?:  若 type="KONG" 可記錄 "明槓" / "暗槓" / "加槓"
 *    huInfo?:    若 type="HU" 可塞 rules_hu 回傳的資訊（自由擴充）
 */
export function sendReaction(payload) {
  const roomID = localStorage.getItem("room");
  const reactRef = roomPath(roomID, "actions/reaction");

  window.firebaseSet(reactRef, {
    ...payload,
    ts: Date.now(),
  });
}

/**
 * 監聽所有來自 Firebase 的「反應事件」
 *
 * 若 table.js 有提供 callbacks.onRemoteReaction(data)，
 * 就會在這裡被呼叫。
 *
 * data 可能長這樣：
 * {
 *   type: "PONG",
 *   reactorSeat: 0,
 *   discardSeat: 1,
 *   tile: "5B",
 *   ts: 1710000000000
 * }
 */
function listenReaction(roomID, callbacks) {
  const reactRef = roomPath(roomID, "actions/reaction");

  window.firebaseOn(reactRef, (data) => {
    if (!data) return;

    if (callbacks && typeof callbacks.onRemoteReaction === "function") {
      callbacks.onRemoteReaction(data);
    }
  });
}

// ======================================================================
// ★（九）預留：吃碰槓胡細節同步（可選）
//     你之後若想把「完整副露陣列」也寫進 Firebase，可以用這組。
// ======================================================================

export function sendMeld(seat, meldData) {
  // 例：meldData = ["3W","4W","5W"] 或 { type:"pong", tiles:[...] }
  // 目前先保留 TODO，因為單純畫面同步其實靠 sendReaction 就夠了。
  // 若要實作，可以考慮：
  //
  // const roomID = localStorage.getItem("room");
  // const meldRef = roomPath(roomID, `melds/${seat}`);
  // window.firebaseSet(meldRef, meldData);
}

export function listenMeld(roomID, callbacks) {
  // 例：監聽 rooms/{roomID}/melds/* 然後回呼 callbacks.onMeldUpdate(...)
  // 目前留空。
}

// ======================================================================
// ★（十）預留：胡牌同步（完整戰績用）
// ======================================================================
export function sendHu(seat, huData) {
  // 例：huData = { type:"自摸", fanInfo:{...}, scoreDelta:[...4人...] }
  // const roomID = localStorage.getItem("room");
  // const huRef = roomPath(roomID, "result/hu");
  // window.firebaseSet(huRef, { seat, huData, ts: Date.now() });
}

export function listenHu(roomID, callbacks) {
  // 同理，可以監聽 result/hu → callbacks.onHuResult(...)
}

// ======================================================================
// ★（十一）預留：局數 / 風圈 / 流局 / 連莊
// ======================================================================

export function updateFlow(flowData) {
  // const roomID = localStorage.getItem("room");
  // const flowRef = roomPath(roomID, "flow");
  // window.firebaseSet(flowRef, flowData);
}

export function listenFlow(roomID, callbacks) {
  // const flowRef = roomPath(roomID, "flow");
  // window.firebaseOn(flowRef, (data) => {
  //   if (callbacks && typeof callbacks.onFlowUpdate === "function") {
  //     callbacks.onFlowUpdate(data);
  //   }
  // });
}
