(() => {
  "use strict";

  window.DRAFT_SCAN_CONSENSUS = () => {
    let history = [];
    return {
      clear() { history = []; },
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
