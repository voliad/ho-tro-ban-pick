(() => {
  "use strict";

  window.DRAFT_SCAN_CONSENSUS = (heroKey = id => id) => {
    let history = [];
    const locked = new Map();
    const used = new Set();
    const slotKey = row => [row.side, row.kind, row.index].join("|");
    const available = row => !locked.has(slotKey(row)) && !used.has(heroKey(row.id));
    return {
      clear() { history = []; },
      reset() {
        history = [];
        locked.clear();
        used.clear();
      },
      isLocked(row) { return locked.has(slotKey(row)); },
      unlocked(rows) { return rows.filter(available); },
      keep(rows) {
        for (const row of rows) {
          if (!row.confirmed || !available(row)) continue;
          locked.set(slotKey(row), row);
          used.add(heroKey(row.id));
        }
        return [...locked.values(), ...rows.filter(row => !row.confirmed && available(row))];
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
