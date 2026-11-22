(() => {
  "use strict";

  // Qzadd, RoV Thailand high-rank tier list, 2026-11-07.
  const source = {
    date: "07/11/2026",
    post: "https://www.facebook.com/Qzaddroaming/posts/1186579177209121/",
    image: "https://drive.google.com/file/d/18DPpFTLIPmVZbOJ2yrsvbvWdafxnYsX9/view",
  };
  const order = ["SSS", "SS", "S", "A+", "A", "B+", "B", "B-", "Draft"];
  const weight = { SSS: 1.5, SS: 1, S: 0.5, "A+": 0.25, A: 0, "B+": -0.5, B: -1, "B-": -1.5 };
  const changes = [
    ["Tà Thần", "trieu-van", "Draft", "S"],
    ["Tà Thần", "airi", "A+", "S"],
    ["Tà Thần", "yena", "S", "A+"],
    ["Đi rừng", "11596", "S", "SS"],
    ["Đi rừng", "butterfly", "S", "A+"],
    ["Đường giữa", "evita", "Mới", "SS"],
    ["Đường giữa", "erin", "B+", "S"],
    ["Đường giữa", "preyta", "B+", "A+"],
    ["Xạ thủ", "flowborn", "SS", "S"],
  ];
  const transcription = {
    "Tà Thần": {
      SS: "marja taara",
      S: "biron omen airi trieu-van",
      "A+": "florentino qi ryoma maloch skud murad richter veres yena",
      A: "tamyn 11596 bolt-baron amily bijan volkath roxie charlotte mina toro",
      "B+": "max arthur yan allain kilgroth tachi lu-bo errol wiro ata",
      B: "zuka ngo-khong kaine bright superman",
      "B-": "dextra",
      Draft: "heino lauriel xeniel hayate",
    },
    "Đi rừng": {
      SS: "tamyn 11596",
      S: "sinestrea astrid billow zephys nakroth",
      "A+": "tachi butterfly elandorr keera trieu-van zuka aoi ryoma murad",
      A: "marja bolt-baron kilgroth amily airi volkath darcy taara ngo-khong veres zill yan enzo florentino",
      "B+": "wonder-woman errol fennik kriknak paine lu-bo bright",
      B: "quillen rourke kaine",
      "B-": "the-flash",
      Draft: "sephera ata arduin skud arthur",
    },
    "Đường giữa": {
      SS: "rouie evita annette",
      S: "alice yue gildur iggy zata lorion liliana erin",
      "A+": "preyta darcy azzenka ignis dieu-thuyen dirak krixi flowborn-2 kahlii natalya goverra raz ilumia",
      A: "sephera heino tulen lauriel bonnie jinna mganga ishar veera aleister",
      "B-": "the-flash",
      Draft: "aya marja dolia dyadia maloch zip",
    },
    "Trợ thủ": {
      SSS: "dolia",
      SS: "ybneth",
      S: "teemee krizzix dyadia cresht maloch thane enzo toro",
      "A+": "wiro alice rouie annette chaugnar omega zip tachi xeniel arthur",
      A: "mina grakk roxie arduin baldum helen taara gildur ming arum ata lumburr veres ormarr",
      "B+": "max kaine",
      B: "wonder-woman bonnie ishar",
      "B-": "superman",
      Draft: "aya aleister raz omen richter",
    },
    "Xạ thủ": {
      S: "flowborn violet elandorr hayate",
      "A+": "capheny wisp erin elsu stuart valhein yorn",
      A: "telannas moren slimz thorne laville teeri fennik",
      "B+": "lindis celica",
      Draft: "11596 bright marja murad taara heino",
    },
  };
  const board = Object.fromEntries(Object.entries(transcription).map(([lane, groups]) => [
    lane, Object.fromEntries(Object.entries(groups).map(([tier, ids]) => [tier, ids.split(" ")])),
  ]));
  const placements = new Map();
  for (const [lane, groups] of Object.entries(board)) {
    for (const [tier, ids] of Object.entries(groups)) {
      for (const id of ids) {
        if (!placements.has(id)) placements.set(id, []);
        placements.get(id).push({ lane, tier, weight: weight[tier] });
      }
    }
  }

  function tierFor(id, lanes = []) {
    const entries = placements.get(id) ?? [];
    const relevant = lanes.length ? entries.filter(entry => lanes.includes(entry.lane)) : entries;
    return relevant.reduce((best, entry) =>
      !best || (entry.weight ?? -Infinity) > (best.weight ?? -Infinity) ? entry : best, null);
  }

  window.QZADD_TIERS = { source, board, order, changes, tierFor };
})();
