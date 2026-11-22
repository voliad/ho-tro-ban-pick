// Tactical notes from the @laihungtv images supplied by the user.
window.DRAFT_TEAM_COMBOS = [
  {
    heroes: { valhein: "Xạ thủ", baldum: "Trợ thủ", alice: "Đường giữa" },
    plan: "Baldum mở giao tranh, Alice che chắn cho Valhein. Gần phút 4, Alice có thể nhường lính giữa cho rừng rồi xuống Đường Rồng phối hợp gây sức ép.",
  },
  {
    heroes: { dolia: "Trợ thủ", maloch: "Tà Thần" },
    plan: "Dolia hồi chiêu cuối cho Maloch để mở giao tranh lần hai hoặc giữ Luyện Ngục bảo vệ đội.",
  },
  {
    heroes: { dolia: "Trợ thủ", zata: "Đường giữa" },
    plan: "Dolia hồi chiêu cuối cho Zata. Cần phối hợp nhịp đi đường và giao tranh đầu trận trước khi đánh quanh hai lượt chiêu cuối.",
  },
  {
    heroes: { dolia: "Trợ thủ", annette: "Đường giữa" },
    plan: "Dolia phối hợp với chiêu cuối của Annette để giữ khoảng cách và bảo vệ chủ lực.",
  },
  {
    heroes: { "11596": "Đi rừng", zip: "Trợ thủ" },
    plan: "Zip hỗ trợ Edras chủ động tiếp cận hoặc rút khỏi giao tranh.",
  },
  {
    heroes: { "11596": "Đi rừng", ming: "Trợ thủ" },
    plan: "Ming giữ liên kết khi Edras vào tầm đánh. Cần phối hợp di chuyển để duy trì liên kết.",
  },
  {
    heroes: { violet: "Xạ thủ", teemee: "Trợ thủ" },
    plan: "TeeMee hỗ trợ tích vàng để Violet sớm đạt ngưỡng trang bị.",
  },
  {
    heroes: { violet: "Xạ thủ", zip: "Trợ thủ" },
    plan: "Zip hỗ trợ chọn góc bắn và rút lui để Violet khai thác tầm đánh trước đội hình tay ngắn, khó tiếp cận.",
  },
  ...["enzo", "baldum"].map(support => ({
    heroes: { mganga: "Đường giữa", [support]: "Trợ thủ" },
    plan: support === "enzo"
      ? "Mganga và Enzo kiểm soát tầm nhìn, đánh cùng nhịp để tạo lợi thế đầu trận. Enzo cần canh góc kéo và phối hợp đảo đường."
      : "Baldum đi trước kiểm soát khu vực, tạo khoảng trống để Mganga cấu máu và ép mục tiêu đầu trận.",
    threats: ["iggy", "yue"],
  })),
  ...["teemee", "thane"].map(support => ({
    heroes: { violet: "Xạ thủ", annette: "Đường giữa", [support]: "Trợ thủ" },
    plan: "Đánh quanh Violet và ưu tiên tài nguyên cho xạ thủ. Annette hỗ trợ giữ khoảng cách, trợ thủ che chắn hoặc mở giao tranh tùy thế trận.",
  })),
  ...["zata", "ishar"].map(mid => ({
    heroes: { [mid]: "Đường giữa", krizzix: "Trợ thủ" },
    plan: "Phối hợp đảo đường nhanh với Krizzix. Canh nhịp gom đối thủ và theo sát đồng đội khi chủ động mở giao tranh.",
  })),
  ...["elandorr", "valhein"].flatMap(carry => ["lorion", "mganga", "annette", "zata"].map(mid => ({
    heroes: { [carry]: "Xạ thủ", cresht: "Trợ thủ", [mid]: "Đường giữa" },
    plan: "Cresht giữ tuyến trước để đường giữa và xạ thủ đánh cùng nhịp. Khi đã có lợi thế, kiểm soát đường và ép mục tiêu tiếp theo.",
  }))),
  ...["thane", "ybneth", "maloch"].map(frontline => ({
    heroes: { lorion: "Đường giữa", [frontline]: frontline === "maloch" ? "Tà Thần" : "Trợ thủ" },
    plan: "Tuyến trước lao vào hoặc giữ chân đối thủ để Lorion nối khống chế và đánh vào cụm mục tiêu.",
  })),
  ...["ybneth", "mina", "thane"].map(support => ({
    heroes: { elandorr: "Xạ thủ", rouie: "Đường giữa", [support]: "Trợ thủ" },
    plan: "Eland’orr và Rouie đánh đổi rồi tái giao tranh qua cổng. Chọn trợ thủ có thể giữ tuyến trước và tranh luôn lựa chọn gây khó cho bộ đôi.",
  })),
  ...["stuart", "omen", "11596"].map(partner => ({
    heroes: { dyadia: "Trợ thủ", [partner]: { stuart: "Xạ thủ", omen: "Tà Thần", "11596": "Đi rừng" }[partner] },
    plan: "Dyadia hỗ trợ duy trì giao tranh cho đồng đội. Canh nhịp hồi phục trước khi tiếp tục ép mục tiêu.",
  })),
];
