// ======================================================================
// rules_hu.js（台灣麻將・正式版）
// 功能：判斷台灣 16 張麻將是否胡牌（5 面 + 1 對）
//
// table.js：會在摸牌 or 放槍後呼叫 checkHu()
// rules_score.js：會接 fanInfo 計算台數
//
// ★ 此檔案：
//   - 不更新 UI
//   - 不動手牌
//   - 不寫 Firebase
//   - 不判斷吃碰槓（那是 rules_meld.js）
//
// ======================================================================

// ======================================================================
// 工具函式：統計牌數
// ======================================================================
function countTiles(tiles) {
  const map = {};
  tiles.forEach((t) => {
    map[t] = (map[t] || 0) + 1;
  });
  return map;
}

// ======================================================================
// 工具：判斷順子
// "3W", "4W", "5W"
// ======================================================================
function isSequence(a, b, c) {
  const na = Number(a[0]);
  const nb = Number(b[0]);
  const nc = Number(c[0]);

  const sa = a[1],
    sb = b[1],
    sc = c[1];

  return sa === sb && sb === sc && na + 1 === nb && nb + 1 === nc;
}

// ======================================================================
// 工具：檢查是否為七對（台灣麻將可選）
// ======================================================================
function isSevenPairs(allTiles) {
  if (allTiles.length !== 14) return false;

  const map = countTiles(allTiles);
  const keys = Object.keys(map);

  if (keys.length !== 7) return false; // 必須剛好 7 種
  return keys.every((k) => map[k] === 2); // 每種 2 張
}

// ======================================================================
// 重要：遞迴拆解「面子」（面）
// 這會用於台灣麻將：手牌需要拆成 5 - 副露數 的面數
// ======================================================================
function splitToMelds(tiles, need) {
  // 若需要拆的面數為 0 → 拆完了
  if (need === 0) return tiles.length === 0;

  // 若牌不夠拆某面 → 失敗
  if (tiles.length < need * 3) return false;

  const t = tiles[0];

  // ----------------------
  // 1. 嘗試拆 AAA
  // ----------------------
  const same = tiles.filter((x) => x === t);
  if (same.length >= 3) {
    let remain = [...tiles];
    for (let i = 0; i < 3; i++) {
      remain.splice(remain.indexOf(t), 1);
    }
    if (splitToMelds(remain, need - 1)) return true;
  }

  // ----------------------
  // 2. 嘗試拆 ABC（數字牌）
  // ----------------------
  const n = Number(t[0]);
  const s = t[1];

  if (["W", "T", "B"].includes(s)) {
    const t2 = `${n + 1}${s}`;
    const t3 = `${n + 2}${s}`;

    if (tiles.includes(t2) && tiles.includes(t3)) {
      let remain = [...tiles];
      [t, t2, t3].forEach((v) => {
        remain.splice(remain.indexOf(v), 1);
      });
      if (splitToMelds(remain, need - 1)) return true;
    }
  }

  return false;
}

// ======================================================================
// 檢查門前清（沒吃、沒碰、沒明槓）
// ======================================================================
function checkMenQing(melds) {
  if (!melds || melds.length === 0) return true;

  for (const m of melds) {
    if (Array.isArray(m)) return false; // [AAA] 格式 = 碰
    if (m.type === "碰") return false;
    if (m.type === "明槓") return false;
    if (m.type === "加槓") return false;
  }
  return true;
}

// ======================================================================
// 顏色判定（清一色 / 混一色）
// ======================================================================
function checkColor(allTiles) {
  const suits = allTiles.map((t) => t.slice(-1));

  const hasW = suits.includes("W");
  const hasT = suits.includes("T");
  const hasB = suits.includes("B");
  const honor = ["E", "S", "W", "N", "C", "F", "P"];
  const hasHonor = suits.some((s) => honor.includes(s));

  // 清一色：只有一個花色 & 無字牌
  if (
    !hasHonor &&
    ((hasW && !hasT && !hasB) ||
      (!hasW && hasT && !hasB) ||
      (!hasW && !hasT && hasB))
  ) {
    return "清一色";
  }

  // 混一色：一花色 + 字牌
  if (
    hasHonor &&
    ((hasW && !hasT && !hasB) ||
      (!hasW && hasT && !hasB) ||
      (!hasW && !hasT && hasB))
  ) {
    return "混一色";
  }

  return null;
}

// ======================================================================
// 主函式：checkHu（台灣麻將版）
// ======================================================================

/**
 * 檢查是否胡牌（台灣 16 張麻將：5 面 + 1 對）
 *
 * @param {Array<string>} hand      - 手牌（14 張）
 * @param {Array}         melds     - 吃/碰/槓（每個算 1 面）
 * @param {string}        lastTile  - 最後那張（自摸 or 放槍）
 * @param {boolean}       isSelfDraw
 */
export function checkHu(hand, melds, lastTile, isSelfDraw) {
  // 副露面數
  const exposed = melds.length;

  // 玩家總面數需達成 5
  const needMeldsFromHand = 5 - exposed;
  if (needMeldsFromHand < 0) {
    // 異常：副露過多？但為安全仍阻擋
    return { canHu: false };
  }

  // 完整牌 = 手牌 + 最後一張牌
  const allTiles = [...hand];

  // ------------------------------
  // 七對（台灣可選）
  // ------------------------------
  const sevenPairs = isSevenPairs(allTiles);

  // ------------------------------
  // 正常（5 面 + 1 對）拆法
  // ------------------------------
  const map = countTiles(allTiles);
  const tileKeys = Object.keys(map);

  let basicWin = false;

  // 嘗試所有可能的「將」（pair 兩張）
  for (const t of tileKeys) {
    if (map[t] >= 2) {
      // 拿掉兩張當將
      const remain = [...allTiles];
      remain.splice(remain.indexOf(t), 1);
      remain.splice(remain.indexOf(t), 1);

      // 把剩下的牌排序（遞迴拆 ABC 時較穩定）
      remain.sort();

      // 嘗試拆出需要的面數
      if (splitToMelds(remain, needMeldsFromHand)) {
        basicWin = true;
        break;
      }
    }
  }

  // 兩種胡牌方式都沒有 → 不能胡
  if (!basicWin && !sevenPairs) {
    return { canHu: false };
  }

  // ------------------------------
  // 準備 fanInfo（給 rules_score.js）
  // ------------------------------
  const colorInfo = checkColor(allTiles);
  const menQing = checkMenQing(melds);

  const fanInfo = {
    isSelfDraw,
    winningTile: lastTile,
    isSevenPairs: sevenPairs,
    isMenQing: menQing,
    color: colorInfo, // "清一色" / "混一色" / null
  };

  return {
    canHu: true,
    type: isSelfDraw ? "自摸" : "放槍",
    winningTile: lastTile,
    fanInfo,
  };
}
