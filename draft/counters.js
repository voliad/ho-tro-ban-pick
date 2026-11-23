window.DRAFT_COUNTERS = {
  contributed: { "Đi rừng": { astrid: ["rourke"] } },
  sources: {
    "Tà Thần": "1079347884598918",
    "Đi rừng": "1087508920449481",
    "Đường giữa": "1120083460525360",
    "Xạ thủ": "1127902569743449",
    "Trợ thủ": "1161261193074253"
  },
  mechanics: {
    ata: {
      maloch: "Dùng Luyện Ngục để vượt địa hình do thuyền của Ata tạo ra hoặc hỗ trợ đồng đội thoát kèo.",
    },
    aya: {
      aleister: "Dùng chiêu cuối khóa tướng đang chở Aya để ngắt pha lao vào.",
      arum: "Giữ Thú Khốn để bắt tướng đang chở Aya khi đối thủ áp sát.",
    },
  },
  // Each row reads from the perspective of the player facing the center hero.
  lanes: {
    "Tà Thần": {
      florentino: [["marja", "murad", "ryoma", "airi"], ["qi", "yena"]],
      marja: [["murad", "qi", "ryoma", "biron"], ["florentino", "volkath", "airi"]],
      qi: [["florentino", "airi"], ["murad", "marja", "yena"]],
      yena: [["florentino", "qi"], ["ryoma", "airi"]],
      murad: [["qi", "ryoma"], ["marja", "florentino", "airi", "allain"]],
      airi: [["marja", "murad"], ["florentino", "qi"]]
    },
    "Đi rừng": {
      sinestrea: [["astrid", "zephys", "elandorr"], ["marja", "keera"]],
      nakroth: [["astrid", "zephys", "zuka"], ["murad", "keera", "elandorr"]],
      billow: [["elandorr", "butterfly", "zuka"], ["keera", "sinestrea", "aoi"]],
      elandorr: [["butterfly", "nakroth", "ryoma"], ["marja", "billow"]],
      astrid: [["volkath", "billow", "butterfly"], ["sinestrea", "nakroth", "elandorr"]],
      butterfly: [["volkath", "nakroth"], ["elandorr", "billow"]]
    },
    "Đường giữa": {
      alice: [["liliana", "lorion"], ["zata", "iggy"]],
      rouie: [["lorion", "liliana", "annette"], ["iggy", "yue"]],
      zata: [["annette", "liliana"], ["lorion", "iggy"]],
      annette: [["yue", "liliana"], ["zata"]],
      yue: [["iggy"], ["ilumia"]],
      iggy: [["zata", "liliana"], ["dieu-thuyen"]],
      lorion: [["zata", "liliana"], ["rouie"]],
      liliana: [["yue"], ["dieu-thuyen", "rouie", "annette"]],
      "flowborn-2": [["lorion"], ["rouie", "annette"]]
    },
    "Xạ thủ": {
      flowborn: [["violet", "stuart", "elsu"], ["capheny", "hayate", "wisp"]],
      violet: [["stuart", "elsu"], ["slimz", "flowborn", "elandorr"]],
      elandorr: [["stuart", "violet"], ["hayate", "slimz", "flowborn"]],
      hayate: [["elandorr", "capheny", "flowborn"], ["slimz", "yorn"]],
      capheny: [["stuart", "wisp", "flowborn", "elsu"], ["slimz", "hayate"]],
      stuart: [["elsu", "hayate"], ["slimz", "elandorr"]]
    },
    "Trợ thủ": {
      dolia: [["krizzix", "zip", "grakk"], ["teemee", "thane"]],
      ybneth: [["baldum"], ["teemee", "dyadia", "krizzix", "arum"]],
      maloch: [["krizzix"], ["cresht", "toro", "arduin"]],
      dyadia: [["krizzix", "zip", "grakk"], ["annette", "arthur"]],
      cresht: [["maloch", "ybneth", "baldum"], ["teemee", "alice", "annette"]],
      grakk: [["toro", "zip"], ["dyadia", "helen"]],
      arthur: [["maloch", "ybneth", "toro"], ["alice", "annette"]],
      helen: [["krizzix", "maloch", "ybneth", "toro"], ["annette", "alice"]]
    }
  }
};
