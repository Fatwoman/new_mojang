// ======================================================================
// game_flow.js（完整版 + 追加 hand 支援）
// 麻將流程控制器（風圈、局數、莊家、連莊、優先權、流局）
// ======================================================================
//
// table.js 會在：
//   1. 開局：initGameFlow()
//   2. 回合結束：processEndOfRound(...)
//   3. 更新 UI 時需要：
//        flowState.windRound   // 東南西北
//        flowState.hand        // 第幾局（1~4）
//        flowState.dealerSeat  // 誰是莊
//
// ui_render.js 的中央台盤 renderWindPanel() 會用到 hand + windRound
//
// ======================================================================

// ======================================================================
// A. 初始化流程（起始局）
// ======================================================================

/**
 * 初始化整個麻將流程。
 *
 * 回傳的 flowState 會由 table.js 保存，格式如下：
 *
 * {
 *   windRound: 0,    // 0=東風, 1=南風, 2=西風, 3=北風
 *   hand: 0,          // 第幾局（顯示時 hand+1，因此 0 → "1 局"）
 *   dealerSeat: 0,    // 莊家 seat（起始先預設 0，稍後由 table.js 骰子覆蓋）
 *   dealerCount: 0    // 已連莊次數
 * }
 *
 * hand 這個欄位是「你新增的」，中央台盤（East 1 / East 2 ...）需要它。
 */
export function initGameFlow() {
  return {
    windRound: 0, // 東風圈
    hand: 0, // 第 1 局（0-based，顯示 hand+1）
    dealerSeat: 0,
    dealerCount: 0,
  };
}

// ======================================================================
// B. 下一家（順時針）
// ======================================================================

/**
 * 計算下一家 seat
 * @param {number} seat
 * @returns {number} (seat+1)%4
 */
export function nextTurn(seat) {
  return (seat + 1) % 4;
}

// ======================================================================
// C. 流局判定（最基本版本）
// ======================================================================

/**
 * 流局條件：牌牆沒牌（wallLength == 0）
 */
export function isLiuJu(wallLength) {
  return wallLength <= 0;
}

// ======================================================================
// D. 優先權（胡 > 槓 > 碰 > 吃）
// ======================================================================

/**
 * 根據 4 種動作判斷最高優先權。
 */
export function checkPriority(options) {
  if (options.canHu) return "HU";
  if (options.canKong) return "KONG";
  if (options.canPong) return "PONG";
  if (options.canChi) return "CHI";
  return null;
}

// ======================================================================
// E. 更新局數 / 換莊 / 連莊 / 風圈（核心流程邏輯）
// ======================================================================

/**
 * 在每一局結束後（胡牌 or 流局）呼叫本函式。
 *
 * winnerSeat：
 *   null → 流局
 *   0~3 → 誰胡
 *
 * 規則（台灣麻將標準）：
 *   ● 莊家胡：連莊（手數 hand 不變）
 *   ● 閒家胡：換莊（dealerSeat+1，hand++）
 *   ● 流局：換莊（dealerSeat+1，hand++）
 *
 *   hand 到 4 → 換風（windRound+1），hand 歸零
 */
export function processEndOfRound(
  winnerSeat,
  windRound,
  dealerSeat,
  dealerCount,
  hand // ⭐ 新增手數（你新增的欄位）
) {
  // ------------------------------------------------------
  // 1. 流局 → 換莊 + hand++
  // ------------------------------------------------------
  if (winnerSeat === null) {
    hand++;

    // 四局後換風
    if (hand >= 4) {
      hand = 0;
      windRound = Math.min(windRound + 1, 3);
    }

    // 流局 → 一律換莊
    dealerSeat = (dealerSeat + 1) % 4;
    dealerCount = 0;

    return { windRound, dealerSeat, dealerCount, hand };
  }

  // ------------------------------------------------------
  // 2. 莊家胡 → 連莊（手不變）
  // ------------------------------------------------------
  if (winnerSeat === dealerSeat) {
    dealerCount += 1;
    return { windRound, dealerSeat, dealerCount, hand };
  }

  // ------------------------------------------------------
  // 3. 閒家胡 → 換莊 + hand++
  // ------------------------------------------------------
  hand++;

  if (hand >= 4) {
    hand = 0;
    windRound = Math.min(windRound + 1, 3);
  }

  dealerSeat = (dealerSeat + 1) % 4;
  dealerCount = 0;

  return { windRound, dealerSeat, dealerCount, hand };
}

// ======================================================================
// F. 判斷整場是否結束（北風北）
// ======================================================================

export function isGameOver(windRound, dealerSeat) {
  return windRound === 3 && dealerSeat === 3;
}

// ======================================================================
// G. 顯示用名稱（東風東、東風南…）
// ======================================================================

/**
 * 回傳像「東風東」「東風南」這種名稱。
 */
export function getRoundName(windRound, dealerSeat) {
  const windText = ["東", "南", "西", "北"];
  const seatText = ["東", "南", "西", "北"];

  const wind = windText[windRound];
  const dealerWind = seatText[dealerSeat];

  return `${wind}風${dealerWind}`;
}
