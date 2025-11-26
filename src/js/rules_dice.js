// ======================================================================
// rules_dice.js
// 負責：
//   1. 擲骰子（3 顆）
//   2. 選莊家（最大值，平手重骰）
//   3. 開門位置（決定切牌處）
//   4. 發牌邏輯（16 張）
//
// 本檔案：不做 UI、不做同步、不畫畫。
// table.js 在遊戲開始 → 呼叫這裡的函式。
// ======================================================================

// ======================================================================
// 1. 擲 3 顆骰子
// ======================================================================

/**
 * 擲三顆骰子，回傳陣列與總和
 * @returns {object} { dice: [d1, d2, d3], sum }
 */
export function rollDice3() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const d3 = Math.floor(Math.random() * 6) + 1;
  const sum = d1 + d2 + d3;

  return { dice: [d1, d2, d3], sum };
}

// ======================================================================
// 2. 決定莊家（四人輪流骰 → 最大者當莊）
// ======================================================================

/**
 * 選莊家流程：四人輪流骰 3 顆 → 最大者當莊 → 平手重骰
 *
 * 回傳：dealerSeat (0~3)
 */
export async function decideDealer() {
  let diceResults = [0, 0, 0, 0];
  let maxValue = 0;
  let winners = [];

  while (true) {
    // 每人骰一次
    for (let seat = 0; seat < 4; seat++) {
      const { sum } = rollDice3();
      diceResults[seat] = sum;
    }

    // 找最大值
    maxValue = Math.max(...diceResults);

    // 找誰等於最大
    winners = diceResults
      .map((value, seat) => ({ seat, value }))
      .filter((obj) => obj.value === maxValue);

    // 若只有一人最大 → 結束
    if (winners.length === 1) {
      return winners[0].seat;
    }

    // 有平手 → 重骰（繼續 while）
  }
}

// ======================================================================
// 3. 決定從哪裡開門（切牌）
// ======================================================================

/**
 * 開門規則：
 *   莊家再擲三顆骰子 → sum = X
 *   從莊家 seat 開始逆時針數 X 家 → 得到開門家 seatOpen
 *   牌牆共有 17 墩（每墩 2 張） → 使用該家前的牌墩作為切點
 *
 * @param {number} dealerSeat - 莊家 seat (0~3)
 * @param {number} diceSum - 三顆骰子的總和
 * @param {Array<string>} wall - 牌牆（136 張）
 */
export function getOpenWallIndex(dealerSeat, diceSum, wall) {
  // 逆時針座位（例如：0→3→2→1）
  const seatOrder = [0, 3, 2, 1];

  // 找出 dealerSeat 在逆時針順序中的 index
  const idx = seatOrder.indexOf(dealerSeat);

  // 找到開門家 seat
  const openSeat = seatOrder[(idx + diceSum) % 4];

  // 牌牆共有 17 墩（每墩 2 張 → 34 張一邊）
  // 計算基礎切點：
  const stackIndex = (diceSum - 1) % 17;

  // 每墩有 2 張
  const tileIndex = stackIndex * 2;

  // 為了避免越界，取模 136
  return tileIndex % wall.length;
}

// ======================================================================
// 4. 發牌（每人 16 張）
// ======================================================================

/**
 * 發牌流程：0→1→2→3 四家，各發 4 張，重複 4 次
 *
 * @param {Array<string>} wall - 牌牆（會被移除前 64 張）
 * @param {number} startIndex - 開門 index
 *
 * @returns {object} { hands: [[],[],[],[]], wall: newWall }
 */
// ======================================================================
// 正版台灣麻將發牌邏輯（完全正確版本）
// 會正確扣掉 64 張，而且不會破壞牌牆順序
// ======================================================================
export function distributeTiles(wall, startIndex) {
  // --- 1) 先旋轉牆，使 startIndex 成為新的起始位置（index=0）
  // 這樣才能 shift() 正確抽牌
  const rotated = wall.slice(startIndex).concat(wall.slice(0, startIndex));

  // --- 2) 使用 shift() 才會真正扣除牌
  const hands = [[], [], [], []];

  // 發牌流程：發 4 次，每次每家 4 張
  for (let r = 0; r < 4; r++) {
    for (let seat = 0; seat < 4; seat++) {
      hands[seat].push(rotated.shift());
      hands[seat].push(rotated.shift());
      hands[seat].push(rotated.shift());
      hands[seat].push(rotated.shift());
    }
  }

  // 現在 rotated 已經扣掉 64 張
  // rotated.length = 144 - 64 = 80
  // 其中最後 16 張為死牆（仍保留，不可摸）

  return {
    hands,
    wall: rotated, // 剩餘 80 張（含死牆 16）
  };
}
