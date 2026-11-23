(() => {
  "use strict";

  // Legible ratings and matchup portraits in AOV Update VN, Beta 55.2 (13/11/2026).
  const ratings = {
    "Tà Thần": { murad: 6, marja: 6.1 },
    "Đi rừng": { billow: 6.5, tamyn: 6.3, zephys: 6.1, "11596": 6.1 },
    "Đường giữa": { lorion: 6, liliana: 6, darcy: 6, evita: 6 },
    "Xạ thủ": { elandorr: 6, flowborn: 6.2, "11596": 6.4 },
    "Trợ thủ": { dyadia: 6.5, enzo: 6, arthur: 6, ybneth: 6.1, krizzix: 6.4 },
  };

  const nemeses = {
    dyadia: ["grakk", "enzo"],
    enzo: ["ybneth", "toro"],
    krizzix: ["annette"],
  };
  const targets = new Set([...Object.keys(nemeses), ...Object.values(nemeses).flat()]);
  const counters = [...targets].map(target => ({
    lane: "Trợ thủ", target, key: "vn|" + target, source: "AOV Update VN", tips: {},
    pairs: [nemeses[target] ?? [], Object.keys(nemeses).filter(id => nemeses[id].includes(target))],
  }));

  function tierFor(id, lanes = []) {
    const qzadd = window.QZADD_TIERS;
    const relevant = lanes.length ? lanes : Object.keys(ratings);
    const entries = relevant.map(lane => {
      const rating = ratings[lane]?.[id];
      if (rating === undefined) return qzadd.tierFor(id, [lane]);
      const tier = rating >= 6.5 ? "S" : "A";
      return { lane, tier, rating, source: "AOV Update VN", weight: tier === "S" ? 0.5 : (rating - 6) };
    });
    return entries.filter(Boolean).reduce((best, entry) =>
      !best || (entry.weight ?? -Infinity) > (best.weight ?? -Infinity) ? entry : best, null);
  }

  const risks = {
    marja: { lane: "Tà Thần", opponents: ["murad"] },
    lorion: { lane: "Đường giữa", opponents: ["liliana"] },
    stuart: { lane: "Xạ thủ", opponents: ["bolt-baron"] },
  };
  const partners = [
    { hero: "lorion", lane: "Đường giữa", ally: "dyadia" },
    { hero: "elandorr", lane: "Xạ thủ", ally: "dyadia" },
    { hero: "bright", lane: "Xạ thủ", ally: "zip" },
  ];

  window.DRAFT_VIETNAM_META = { tierFor, counters, risks, partners };
})();
