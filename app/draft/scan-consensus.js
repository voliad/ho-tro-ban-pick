(() => {
  "use strict";

  window.DRAFT_SCAN_CONSENSUS = (heroKey = id => id) => {
    let history = [];
    const locked = new Map();
    const used = new Set();
    const slotKey = row => [row.side, row.kind, row.index].join("|");
    const available = row => !locked.has(slotKey(row)) && !used.has(heroKey(row.id));
    function nextPick(rows, side) {
      const indices = new Set(rows.filter(row => row.side === side && row.kind === "pick" && row.confirmed)
        .map(row => row.index));
      let index = 0;
      while (indices.has(index)) index++;
      return index;
    }
    function inOrder(rows) {
      const limits = new Map([...new Set(rows.map(row => row.side))].map(side => [side, nextPick(rows, side)]));
      return rows.filter(row => row.kind !== "pick" ||
        row.index < limits.get(row.side) || (!row.confirmed && row.index === limits.get(row.side)));
    }
    return {
      clear() { history = []; },
      reset() {
        history = [];
        locked.clear();
        used.clear();
      },
      isLocked(row) { return locked.has(slotKey(row)); },
      unlocked(rows) { return rows.filter(available); },
      nextPick,
      inOrder,
      keep(rows) {
        const confirmed = rows.filter(row => row.confirmed).sort((a, b) => a.index - b.index);
        for (const row of confirmed) {
          if (!available(row)) continue;
          if (row.kind === "pick" && row.index > 0 && !locked.has(slotKey({ ...row, index: row.index - 1 }))) continue;
          locked.set(slotKey(row), row);
          used.add(heroKey(row.id));
        }
        return inOrder([...locked.values(), ...rows.filter(row => !row.confirmed && available(row))]);
      },
      observe(rows, token, now) {
        history = history.filter(entry => now - entry.time < 1800);
        if (!history.some(entry => entry.token === token)) {
          history.push({ rows, token, time: now });
          history = history.slice(-5);
        }
        return rows.filter(row => {
          const matches = history.filter(entry => entry.rows.some(other =>
            other.side === row.side && other.kind === row.kind && other.index === row.index &&
            other.id === row.id && other.confirmed === row.confirmed));
          return matches.length >= (row.confirmed ? 3 : 2);
        });
      },
    };
  };
})();
