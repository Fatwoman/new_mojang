// ======================================================================
// rules_meld.js（吃 / 碰 / 槓 判斷）
// ======================================================================
// 本檔案只負責「能不能吃碰槓」，不修改手牌、不跑 UI。
// ----------------------------------------------------------------------
// 現在加入：
//   ✔ 上家不能明槓（只能碰 → 下回合再加槓）
//   ✔ 三種槓重新整理（明槓 / 加槓 / 暗槓）
//   ✔ checkKong() 增加 mySeat / discardSeat 判斷
// ======================================================================

// ======================================================================
// 工具函式：解析 + 計數
// ======================================================================
function parseTile(tile) {
  if (!tile) return { num: NaN, suit: "" };
  const num = Number(tile.slice(0, -1));
  const suit = tile.slice(-1);
  return { num, suit };
}

function countTileInHand(hand, targetTile) {
  return hand.filter((t) => t === targetTile).length;
}

// 支援：["3W","3W","3W"] or {tiles:["3W","3W","3W"]}
function getMeldTiles(meld) {
  if (!meld) return [];
  if (Array.isArray(meld)) return meld;
  if (Array.isArray(meld.tiles)) return meld.tiles;
  return [];
}

// ======================================================================
// 一、吃牌判斷
// ======================================================================
export function checkChi(hand, playedTile, mySeat, turnSeat) {
  // 只能吃下家打出的牌
  const nextSeat = (turnSeat + 1) % 4;
  if (nextSeat !== mySeat) return { canChi: false, chiList: [] };

  const info = parseTile(playedTile);

  // 字牌 or 非 1~9 → 不能吃
  if (
    Number.isNaN(info.num) ||
    info.num < 1 ||
    info.num > 9 ||
    !["W", "T", "B"].includes(info.suit)
  ) {
    return { canChi: false, chiList: [] };
  }

  const base = info.num;
  const s = info.suit;
  const chiList = [];

  // 三種吃法
  const seqs = [
    [base - 2, base - 1, base],
    [base - 1, base, base + 1],
    [base, base + 1, base + 2],
  ];

  for (let arr of seqs) {
    if (arr.some((n) => n < 1 || n > 9)) continue;

    const tiles = arr.map((n) => `${n}${s}`);
    const idx = tiles.indexOf(playedTile);
    if (idx === -1) continue;

    const need = tiles.filter((t, i) => i !== idx);
    if (need.every((t) => hand.includes(t))) chiList.push(tiles);
  }

  return { canChi: chiList.length > 0, chiList };
}

// ======================================================================
// 二、碰牌判斷
// ======================================================================
export function checkPong(hand, playedTile) {
  const cnt = countTileInHand(hand, playedTile);
  if (cnt >= 2) {
    return {
      canPong: true,
      pongTiles: [playedTile, playedTile, playedTile],
    };
  }
  return { canPong: false };
}

// ======================================================================
// 三、槓牌判斷（★重寫版）
// ======================================================================
export function checkKong(
  hand,
  playedTile,
  melds = [],
  drawnTile = null,
  mySeat = null, // ⭐新增：自己位置
  discardSeat = null // ⭐新增：打牌的人
) {
  // ==================================================================
  // A. 明槓（別人打出的 → 你手上剛好有三張）
  // ==================================================================
  if (playedTile) {
    // ⭐ 上家不能明槓，只能碰
    // 上家 = (mySeat + 3) % 4
    if (discardSeat === (mySeat + 3) % 4) {
      return { canKong: false }; // 禁止明槓
    }

    const cnt = countTileInHand(hand, playedTile);
    if (cnt >= 3) {
      return {
        canKong: true,
        type: "明槓",
        tiles: [playedTile, playedTile, playedTile, playedTile],
        pongIndex: null,
      };
    }
  }

  // ==================================================================
  // B. 加槓（已有碰 + 手上有該牌的第 4 張）⭐ 不必依賴 drawnTile！
  // ==================================================================
  for (let i = 0; i < melds.length; i++) {
    const m = getMeldTiles(melds[i]);

    // 找到一組碰（三張完全相同）
    if (m.length === 3 && m.every((t) => t === m[0])) {
      const tile = m[0]; // 這組碰的牌

      // 手上有該 tile 的第 4 張 → 這就是加槓
      if (countTileInHand(hand, tile) >= 1) {
        return {
          canKong: true,
          type: "加槓",
          tiles: [tile, tile, tile, tile],
          pongIndex: i,
        };
      }
    }
  }

  // ==================================================================
  // C. 暗槓（手上四張）
  // ==================================================================
  const checked = new Set();
  for (const t of hand) {
    if (checked.has(t)) continue;
    checked.add(t);

    if (countTileInHand(hand, t) >= 4) {
      return {
        canKong: true,
        type: "暗槓",
        tiles: [t, t, t, t],
        pongIndex: null,
      };
    }
  }

  return { canKong: false };
}
