// ======================================================================
// ui_melds.js
// 用途：負責顯示玩家的副露區（吃／碰／槓）
//
// 規則：
//   • 不做判斷（吃碰槓邏輯由 rules_meld + table.js 負責）
//   • 不操作手牌（table.js 負責）
//   • 本檔案只負責 UI：渲染圖片
//
// 使用方式：
//   ui_melds.renderMelds(seat, meldsArray);
//
// meldsArray 結構：每一組為 ["3W","4W","5W"] 或 ["5W","5W","5W","5W"]
//
// ======================================================================

// ======================================================================
// A. 取得四個玩家的副露顯示位置
// ======================================================================

const meldContainers = {
  0: document.getElementById("melds-0"), // 你的副露（下）
  1: document.getElementById("melds-1"), // 右
  2: document.getElementById("melds-2"), // 上
  3: document.getElementById("melds-3"), // 左
};

// ======================================================================
// B. tile → image html
// ======================================================================

/**
 * 將單張牌變成 <img>
 * @param {string} tile 例如 "5W"
 */
function tileImg(tile) {
  return `<img class="tile meld-tile" src="./img/${tile}.png" />`;
}

// ======================================================================
// C. 渲染單一副露組（吃 / 碰 / 槓）
// ======================================================================

/**
 * @param {Array<string>} group - 一組副露，例如 ["3W","4W","5W"]
 * @param {number} seat - 座位（0~3），用於決定方向
 */
function renderMeldGroup(group, seat) {
  // 暗槓：四張背面
  if (group.isAnGang) {
    return `
        <div class="meld-group seat-${seat}">
          <img class="tile back" src="./img/back.png" />
          <img class="tile back" src="./img/back.png" />
          <img class="tile back" src="./img/back.png" />
          <img class="tile back" src="./img/back.png" />
        </div>
      `;
  }

  // 明槓（四張同牌）
  if (group.length === 4) {
    return `
        <div class="meld-group seat-${seat}">
          ${tileImg(group[0])}
          ${tileImg(group[1])}
          ${tileImg(group[2])}
          ${tileImg(group[3])}
        </div>
      `;
  }

  // 吃 / 碰（3 張）
  if (group.length === 3) {
    return `
        <div class="meld-group seat-${seat}">
          ${tileImg(group[0])}
          ${tileImg(group[1])}
          ${tileImg(group[2])}
        </div>
      `;
  }

  // 若格式不正確
  return "";
}

// ======================================================================
// D. 對外函式：渲染某家的所有副露
// ======================================================================

/**
 * 顯示某位玩家的所有副露
 *
 * @param {number} seat - 玩家座位（0~3）
 * @param {Array<Array<string>|object>} meldsArray
 */
export function renderMelds(seat, meldsArray) {
  const container = meldContainers[seat];
  if (!container) return;

  // 清空原本的副露 UI
  container.innerHTML = "";

  if (!meldsArray || meldsArray.length === 0) return;

  // 每一組副露都渲染
  meldsArray.forEach((group) => {
    container.innerHTML += renderMeldGroup(group, seat);
  });
}
