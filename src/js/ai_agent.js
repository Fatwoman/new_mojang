// ======================================================================
// ai_agent.js（升級版 AI）
// 現在 AI 有：出牌 + 吃 + 碰 + 明槓 + 加槓 + 暗槓 + 放槍胡
//
// 重要：
// AI 只「回報動作」，真正執行吃碰槓胡仍由 table.js 完成！
// ======================================================================

import * as rulesMeld from "./rules_meld.js";
import * as rulesHu from "./rules_hu.js";
import * as rulesFlower from "./rules_flower.js";

// ----------------------------------------------------------------------
// 小工具：延遲（讓 AI 像真人）
// ----------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const AI = {
  // ===============================================================
  // 🟥【反應模式】（別人丟牌後，AI 要不要吃 / 碰 / 槓 / 胡）
  // ===============================================================
  //
  // ⭐ table.js 應該這樣呼叫（你後面會加）：
  //
  // const aiResponse = AI.onReaction({
  //      seat: turn,
  //      playedTile: lastPlayedTile,
  //      hand: hands[turn],
  //      melds: melds[turn],
  //      discards,
  // });
  //
  // aiResponse = {
  //     action: "PONG" / "CHI" / "KONG" / "HU" / "PASS",
  //     tiles: [...],
  //     pongIndex: ...
  // }
  // ===============================================================
  onReaction(state) {
    const { seat, hand, melds, playedTile } = state;

    // ⭐ 1. 放槍胡（優先度最高）
    const huInfo = rulesHu.checkHu(
      [...hand, playedTile],
      melds,
      playedTile,
      false
    );
    if (huInfo && huInfo.canHu) {
      return {
        action: "HU",
        huInfo,
        tile: playedTile,
      };
    }

    // ⭐ 2. 碰判斷
    const pongInfo = rulesMeld.checkPong(hand, playedTile);
    if (pongInfo && pongInfo.canPong) {
      return {
        action: "PONG",
        tiles: pongInfo.tiles, // 三張相同
      };
    }

    // ⭐ 3. 明槓（別人打出的第四張）
    const kongInfo = rulesMeld.checkKong(
      hand,
      playedTile,
      melds,
      null,
      seat,
      null
    );

    if (kongInfo && kongInfo.canKong && kongInfo.type === "明槓") {
      return {
        action: "KONG",
        kongInfo,
      };
    }

    // ⭐ 4. 吃（只有上家才可能）
    const chiInfo = rulesMeld.checkChi(hand, playedTile, seat);
    if (chiInfo && chiInfo.canChi) {
      return {
        action: "CHI",
        tiles: chiInfo.tiles[0], // AI 隨便選第一組吃法
      };
    }

    // ⭐ 5. 其他情況 PASS
    return { action: "PASS" };
  },

  // ======================================================================
  // 🟥【自己的回合】出牌（原本的 onTurn）
  // ======================================================================
  async onTurn(state) {
    const { hand, melds, discards, playedTile, wall, seat, flowerState } =
      state;

    // 0. 自動補花
    rulesFlower.autoCatchFlowers(hand, wall, seat, flowerState);

    // 1. 是否已經可以自摸？
    const huResult = rulesHu.checkHu([...hand], melds, null, true);
    const canSelfHu = huResult && huResult.canHu;

    if (canSelfHu) {
      // 想胡 → 此時要盡量維持手牌
      await this.thinkDelay();

      const keepTile = this.chooseTileToKeepForHu(hand);
      return { action: "PLAY", tile: keepTile };
    }

    // 2. 正常思考時間
    await this.thinkDelay();

    // 3. 選一張牌丟
    const tile = this.chooseTileToDiscard(hand, discards);

    return {
      action: "PLAY",
      tile,
    };
  },

  // ----------------------------------------------------------------------
  // 思考延遲
  // ----------------------------------------------------------------------
  async thinkDelay() {
    const min = 400;
    const max = 1200;
    await sleep(Math.floor(Math.random() * (max - min + 1)) + min);
  },

  // ----------------------------------------------------------------------
  // 快胡時的丟牌邏輯
  // ----------------------------------------------------------------------
  chooseTileToKeepForHu(hand) {
    return this._evaluateBestDiscard(hand).tile;
  },

  // ======================================================================
  // AI 出牌評估（核心）
  // ======================================================================
  chooseTileToDiscard(hand, discards = []) {
    return this._evaluateBestDiscard(hand).tile;
  },

  _evaluateBestDiscard(hand) {
    const honors = ["E", "S", "W", "N", "C", "F", "P"];
    const parsed = hand.map((t) => {
      const suit = t.slice(-1);
      const num = parseInt(t);
      const isHonor = honors.includes(t);
      return { tile: t, suit, num, isHonor };
    });

    const hasTile = (t) => hand.includes(t);

    const scored = parsed.map((p) => {
      let score = 0;

      // 字牌
      if (p.isHonor) {
        score += 3;
        const c = hand.filter((x) => x === p.tile).length;
        if (c === 1) score += 2;
        if (c >= 3) score -= 2;
      }

      // 數字
      if (!p.isHonor && !Number.isNaN(p.num)) {
        const n = p.num,
          s = p.suit;

        const left = `${n - 1}${s}`;
        const right = `${n + 1}${s}`;

        const hasLeft = hasTile(left);
        const hasRight = hasTile(right);

        if (!hasLeft && !hasRight) score += 3;
        if (hasLeft || hasRight) score -= 2;

        // 對子
        const sameCount = hand.filter((x) => x === p.tile).length;
        if (sameCount >= 2) score -= 1;
      }

      score += Math.random() * 0.5;

      return { tile: p.tile, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored[0];
  },
};
