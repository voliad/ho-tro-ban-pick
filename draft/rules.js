((root) => {
  "use strict";

  const roles = new Map([[28, "Đấu sĩ"], [32, "Sát thủ"], [29, "Pháp sư"], [33, "Xạ thủ"], [30, "Trợ thủ"], [31, "Đỡ đòn"]]);
  const standard = [
    ["ban", "blue", 1], ["ban", "red", 1], ["ban", "blue", 1], ["ban", "red", 1],
    ["pick", "blue", 1], ["pick", "red", 2], ["pick", "blue", 2], ["pick", "red", 1],
    ["ban", "red", 1], ["ban", "blue", 1], ["ban", "red", 1], ["ban", "blue", 1],
    ["pick", "red", 1], ["pick", "blue", 2], ["pick", "red", 1],
  ];
  const blind = [["pick", "blue", 5], ["pick", "red", 5]];
  const rankPicks = [
    ["pick", "blue", 1], ["pick", "red", 2], ["pick", "blue", 2],
    ["pick", "red", 2], ["pick", "blue", 2], ["pick", "red", 1],
  ];
  const legacyRanked = [
    ...Array.from({ length: 5 }, () => [["ban", "blue", 1], ["ban", "red", 1]]).flat(),
    ...rankPicks,
  ];
  const ranked = [["ban", "blue", 5], ["ban", "red", 5], ...rankPicks];
  const defaults = {
    teamA: "Đội A", teamB: "Đội B", format: 5, mode: "global", firstBlue: "A",
    alternate: true, seconds: 30, final: "blind", mirrors: true, groupFlowborn: true, restricted: [],
  };

  const opposite = (team) => team === "A" ? "B" : "A";
  const onSide = (game, side) => side === "blue" ? game.blue : opposite(game.blue);
  const isBlind = (settings, number) => settings.format === 7 && number === 7 && settings.final === "blind";
  const sequence = (settings, number) => settings.mode === "rank"
    ? (settings.legacyRankBans ? legacyRanked : ranked) : isBlind(settings, number) ? blind : standard;
  const heroKey = (settings, id) => settings.groupFlowborn && id === "flowborn-2" ? "flowborn" : id;
  const nameOf = (settings, team) => team === "A" ? settings.teamA : settings.teamB;

  function makeGame(settings, number) {
    const swapped = settings.alternate && number % 2 === 0;
    return { blue: swapped ? opposite(settings.firstBlue) : settings.firstBlue, turns: [], winner: null };
  }

  function start(settings = structuredClone(defaults)) {
    return { settings, games: [makeGame(settings, 1)] };
  }

  function score(state) {
    const total = { A: 0, B: 0 };
    for (const game of state.games) {
      if (game.winner) total[game.winner]++;
    }
    return total;
  }

  function seriesWinner(state) {
    const total = score(state);
    const target = Math.floor(state.settings.format / 2) + 1;
    return ["A", "B"].find(team => total[team] >= target) ?? null;
  }

  function legacyRankPairIndex(game) {
    const first = game.turns.findIndex(row => row.kind === "pick");
    if (first === -1) return -1;
    const index = first + 3;
    const turn = game.turns[index];
    return turn?.kind === "pick" && turn.side === "red" && turn.ids.length === 1 ? index : -1;
  }

  function mergeLegacyRankPair(game) {
    const index = legacyRankPairIndex(game);
    if (index < 0) return;
    const follow = game.turns[index + 1];
    if (follow?.kind !== "pick" || follow.side !== "red" || follow.ids.length !== 1) return;
    const first = game.turns[index];
    game.turns.splice(index, 2, { ...first, ids: [...first.ids, ...follow.ids] });
  }

  function partialRankPair(state, game) {
    if (state.settings.mode !== "rank") return false;
    const index = legacyRankPairIndex(game);
    return index >= 0 && index === game.turns.length - 1;
  }

  function activeTurn(state) {
    const game = state.games.at(-1);
    if (game.winner || game.draftSkipped) return null;
    const turns = sequence(state.settings, state.games.length);
    const remaining = turns.filter(([kind], index) =>
      game.skipBansFrom === undefined || index < game.skipBansFrom || kind !== "ban");
    const alreadyPicked = Number(partialRankPair(state, game));
    const row = remaining[game.turns.length - alreadyPicked];
    if (!row) return null;
    const [kind, side, count] = row;
    return { kind, side, count: count - alreadyPicked, team: onSide(game, side) };
  }

  function usedBy(state, team) {
    const picks = new Set();
    for (const game of state.games.slice(0, -1)) {
      for (const turn of game.turns) {
        if (turn.kind === "pick" && onSide(game, turn.side) === team) {
          for (const id of turn.ids) picks.add(heroKey(state.settings, id));
        }
      }
    }
    return picks;
  }

  function eligibility(state, turn, concealOpponent = false) {
    const { settings, games } = state;
    const game = games.at(-1);
    const number = games.length;
    const hidden = isBlind(settings, number);
    const enforceGlobal = settings.mode === "global" && !(number === 7 && settings.final !== "keep");
    const restricted = new Set(settings.restricted.map(id => heroKey(settings, id)));
    const used = turn?.kind === "pick" && enforceGlobal ? usedBy(state, turn.team) : new Set();
    const recorded = new Map();
    for (const entry of game.turns) {
      if (hidden && (settings.mirrors || concealOpponent) && entry.side !== turn?.side) continue;
      for (const id of entry.ids) recorded.set(heroKey(settings, id), entry.kind);
    }
    return (id) => {
      if (!turn) return "Draft đã hoàn tất";
      const key = heroKey(settings, id);
      if (restricted.has(key)) return "BTC cấm";
      if (recorded.has(key)) return recorded.get(key) === "ban" ? "Đã bị cấm trong ván" : "Đã được chọn trong ván";
      if (used.has(key)) return "Đội đã dùng trong series";
      return "";
    };
  }

  function validSelection(state, ids) {
    const turn = activeTurn(state);
    if (!turn || ids.length !== turn.count) return false;
    const reason = eligibility(state, turn);
    const keys = new Set(ids.map(id => heroKey(state.settings, id)));
    return keys.size === ids.length && ids.every(id => !reason(id));
  }

  function recordTurn(state, ids) {
    if (!validSelection(state, ids)) return false;
    const { kind, side } = activeTurn(state);
    const game = state.games.at(-1);
    if (partialRankPair(state, game)) game.turns.at(-1).ids.push(...ids);
    else game.turns.push({ kind, side, ids: [...ids] });
    return true;
  }

  function recordWinner(state, team) {
    const game = state.games.at(-1);
    if (game.winner || activeTurn(state) || (team !== "A" && team !== "B")) return false;
    game.winner = team;
    if (!seriesWinner(state)) state.games.push(makeGame(state.settings, state.games.length + 1));
    return true;
  }

  function undo(state) {
    const game = state.games.at(-1);
    if (game.winner) {
      game.winner = null;
      return "result";
    }
    if (game.turns.length === game.skipBansFrom) {
      delete game.skipBansFrom;
      return "skip";
    }
    if (game.draftSkipped) {
      delete game.draftSkipped;
      return "skip";
    }
    if (game.turns.length) {
      game.turns.pop();
      return "turn";
    }
    if (state.games.length > 1) {
      state.games.pop();
      state.games.at(-1).winner = null;
      return "result";
    }
    return "";
  }

  root.DRAFT_RULES = { roles, defaults, opposite, onSide, isBlind, sequence, heroKey, nameOf, makeGame, start, mergeLegacyRankPair,
    score, seriesWinner, activeTurn, usedBy, eligibility, validSelection, recordTurn, recordWinner, undo };
})(globalThis);
