(() => {
  "use strict";

  const posts = {
    article: "https://www.facebook.com/aovtacticsguides/posts/1083295804615977/",
    study: "https://forum.gamer.com.tw/Co.php?bsn=30518&sn=279260",
    notes: "https://forum.gamer.com.tw/Co.php?bsn=30518&sn=333724",
  };
  const models = {
    C: { firstFrame: 17, thresholds: [0, 1, 8.2, 16.6, 26.2, 37.6, 51.4, 68.2, 89.2, 116, 152] },
    E: { firstFrame: 15, thresholds: [0, 1, 10.2, 21.2, 34.6, 51.4, 72.8, 101.6, 141.8] },
    F: { firstFrame: 25, thresholds: [0, 3.4, 8.2, 13.6, 19.6, 26.2, 33.6, 42, 51.4, 62.2, 74.8, 89.2, 106.4, 127, 152.2, 183.6] },
    G: { firstFrame: 16, thresholds: [0, 1.6, 9.2, 16.8, 27.4, 38, 53.2, 69.8, 91, 116.8, 153.2] },
    H: { firstFrame: 14, thresholds: [0, 1, 10.2, 21.2, 34.6, 51.4, 72.8, 101.6, 141.8] },
    "H-1f": { firstFrame: 13, thresholds: [0, 1, 10.2, 21.2, 34.6, 51.4, 72.8, 101.6, 141.8] },
  };
  const standard = {
    C: "Airi, Aleister, Alice, Amily, Annette, Aoi, Arduin, Arthur, Arum, Astrid, Ata, Aya, Azzen'Ka, Baldum, Bijan, Bonnie, Butterfly, Chaugnar, Cresht, Dextra, Dirak, D'Arcy, Enzo, Erin, Errol, Florentino, Gildur, Grakk, Hayate, Helen, Iggy, Ignis, Ilumia, Ishar, Jinna, Kahlii, Kaine, Keera, Kil'Groth, Kriknak, Krixi, Krizzix, Lauriel, Laville, Lindis, Lorion, Lumburr, Lữ Bố, Maloch, Marja, Max, Mganga, Mina, Ming, Natalya, Ngộ Không, Omega, Omen, Ormarr, Paine, Qi, Quillen, Richter, Rouie, Rourke, Roxie, Ryoma, Sephera, Skud, Slimz, Stuart, Superman, Taara, Tachi, TeeMee, Thane, The Flash, Toro, Triệu Vân, Tulen, Veera, Veres, Wiro, Wonder Woman, Xeniel, Yan, Yue, Y'bneth, Zata, Zephys, Zill, Zip, Zuka, Điêu Thuyền",
    E: "Eland'orr, Preyta",
    F: "Elsu",
    G: "Bright",
    H: "Bolt Baron, Teeri, Sinestrea, Thorne, Wisp, Moren, Tel'Annas, Murad, Nakroth, Yorn, Violet, Valhein",
  };
  const unknown = "Tamyn, Flowborn, Dyadia, Edras, Goverra, Billow, Biron, Dolia, Charlotte".split(", ");
  const special = {
    Yena: [{ form: "Song đao", model: "C" }, { form: "Trọng kiếm", model: "F" }],
    Celica: [{ form: "Bình thường", model: "C" }, { form: "Dựng pháo", model: "F" }],
    Liliana: [{ form: "Dạng người", model: "C" }, { form: "Dạng cáo", model: "H-1f" }],
    Wisp: [{ form: "Đánh thường", model: "H" }, { form: "Đòn cường hóa", model: "G" }],
    Fennik: [{ note: "Biến thể mở rộng của model F. Bài ATG ghi nhận mốc riêng cho Fennik." }],
    Heino: [{ note: "Có kết quả đo riêng. Bài ATG để Heino ngoài các model chuẩn." }],
    Marja: [{ model: "C", limit: 152, note: "Theo model C ở các mốc đầu. Cộng đồng ghi nhận nhịp đánh tại 152% khác model C chuẩn." }],
    Butterfly: [{ model: "C", limit: 152, note: "Theo model C ở các mốc đầu. Cộng đồng ghi nhận nhịp đánh tại 152% khác model C chuẩn." }],
    Volkath: [{ form: "Bình thường", model: "C" }, { form: "Cưỡi ngựa", note: "Đòn đánh khi cưỡi ngựa dùng cơ chế riêng." }],
    Raz: [{ note: "Đòn đánh của Raz nằm ngoài bảng breakpoint thông thường theo dữ liệu của bài ATG." }],
    Capheny: [{ note: "Đòn đánh của Capheny dùng cơ chế riêng. Tra các hiệu ứng tốc đánh trong mô tả kỹ năng của tướng." }],
    Allain: [{ note: "Đòn đánh của Allain nằm ngoài bảng breakpoint thông thường theo dữ liệu của bài ATG." }],
  };

  const normalize = value => value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replaceAll("đ", "d");
  const keyOf = value => normalize(value).replace(/[^a-z0-9]/g, "");
  const compareName = new Intl.Collator("vi").compare;
  const format = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
  const pct = value => format.format(value) + "%";
  const speed = frames => format.format(15 / frames) + " đòn/giây";
  const safe = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const modelByName = new Map(Object.entries(standard).flatMap(([model, names]) => (
    names.split(", ").map(name => [keyOf(name), model])
  )));
  const specialByName = new Map(Object.entries(special).map(([name, entries]) => [keyOf(name), entries]));
  const unknownNames = new Set(unknown.map(keyOf));

  function buildChoices() {
    const listed = new Map();
    const sourceNames = [
      ...Object.values(standard).flatMap(names => names.split(", ")), ...Object.keys(special), ...unknown,
    ];
    for (const name of sourceNames) listed.set(keyOf(name), { name });
    for (const entry of window.ATG_BOOT?.roster ?? []) {
      if (entry.variant) listed.delete(keyOf(entry.name));
      listed.set(keyOf(entry.name + (entry.variant ?? "")), entry);
    }
    const roster = [...listed.values()].sort((a, b) => compareName(a.name, b.name));
    return roster.flatMap(hero => {
      const heroKey = keyOf(hero.name);
      const variants = specialByName.get(heroKey) ?? [{
        model: modelByName.get(heroKey),
        note: unknownNames.has(heroKey) ? "Tướng này nằm trong nhóm chưa xác minh của bài ATG." : "",
      }];
      return variants.map(entry => {
        const label = [hero.name, hero.variant, entry.form].filter(Boolean).join(" / ");
        return { ...entry, label, id: keyOf(label) };
      });
    });
  }

  function lookup(model, value) {
    const { firstFrame, thresholds } = models[model];
    const index = thresholds.findLastIndex(threshold => threshold <= value);
    return {
      frames: firstFrame - index,
      current: thresholds[index],
      next: thresholds[index + 1],
    };
  }

  function resultItem(value, label) {
    return '<div><dt>' + safe(label) + '</dt><dd>' + safe(value) + '</dd></div>';
  }

  function render(container) {
    document.title = "Mốc tốc đánh | Hỗ trợ chơi Liên Quân";
    container.innerHTML = '<div class="wrap subpage attack-page">' +
      '<a class="subtle-link" href="/wiki">Wiki</a>' +
      '<div class="page-head attack-head"><div><h1>Mốc tốc đánh</h1><p>Tra model theo tướng và trạng thái, rồi xem cần thêm bao nhiêu tốc đánh để sang mốc tiếp theo.</p></div></div>' +
      '<div class="attack-layout"><section class="panel data-panel" aria-labelledby="attack-lookup-title">' +
      '<div class="section-head"><div><h2 id="attack-lookup-title">Tra cứu breakpoint</h2><p>Dữ liệu đo từ cộng đồng AOVTW, tổng hợp ngày 10/10/2026.</p></div></div>' +
      '<div class="attack-fields"><label><span>Tìm tướng hoặc trạng thái</span><input type="search" id="as-search" placeholder="Ví dụ: Yena, Liliana…" autocomplete="off"></label>' +
      '<label><span>Tướng và trạng thái</span><select id="as-hero"></select></label>' +
      '<label><span>Model tham chiếu</span><select id="as-model">' +
      Object.keys(models).map(id => '<option value="' + id + '">Model ' + id + '</option>').join("") +
      '</select></label><label><span>Tốc đánh cộng thêm (%)</span><input id="as-value" inputmode="decimal" type="text" value="68" autocomplete="off" aria-describedby="as-message"></label></div>' +
      '<p id="as-message" class="attack-message"></p><div id="as-result" aria-live="polite"></div></section>' +
      '<aside class="panel data-panel attack-summary"><h2>Vì sao 68% khác 68,2%?</h2>' +
      '<p>Ở model C, 68% vẫn mất 11 frame cho một đòn đánh thường. Từ 68,2%, đòn đánh mất 10 frame. Thêm tốc đánh trong khoảng giữa hai mốc chưa làm ngắn chu kỳ đánh.</p>' +
      '<p>Cùng một chỉ số có thể cho nhịp đánh khác nhau giữa các model. Ví dụ, ở 68,2%, model H mất 9 frame.</p>' +
      '<a class="subtle-link" href="#attack-analysis">Xem cách áp dụng khi lên đồ</a></aside></div>' +
      '<section class="panel data-panel attack-table" aria-labelledby="attack-table-title"><div class="section-head"><div>' +
      '<h2 id="attack-table-title">Các mốc theo model</h2><p>Tốc độ dưới đây là số đòn/giây làm tròn theo cách quy đổi của bảng nguồn.</p></div></div>' +
      '<div class="table-scroll"><table><thead><tr><th scope="col">Tốc đánh từ</th><th scope="col">Frame mỗi đòn</th><th scope="col">Nhịp đánh</th></tr></thead>' +
      '<tbody id="as-table"></tbody></table></div></section>' +
      '<section id="attack-analysis" class="panel data-panel attack-summary" aria-labelledby="attack-analysis-title"><h2 id="attack-analysis-title">Áp dụng khi lên đồ</h2>' +
      '<ol><li>Xác định dạng tướng đang chơi. Chẳng hạn, Yena chuyển từ model C sang F khi dùng trọng kiếm, còn Liliana chuyển sang H-1f ở dạng cáo.</li>' +
      '<li>Kiểm tra tốc đánh tại cấp độ và bộ trang bị dự kiến. Nếu thiếu ít để qua mốc, so sánh lợi ích của việc bù tốc đánh với sát thương, xuyên giáp hoặc chống chịu.</li>' +
      '<li>Thử lại trong phòng tập khi có hiệu ứng tăng hoặc giảm tốc đánh, đòn cường hóa hay bản cập nhật. Bảng dùng cho nhịp đánh thường, nên bài thử với kỹ năng hoặc đổi dạng cần điều kiện riêng.</li></ol>' +
      '<p>Bài ATG tổng hợp phép đo của cộng đồng AOVTW. Một số tướng như Heino và Fennik có kết quả riêng. Những mốc đầu của model F được đối chiếu với bảng Đài Loan công bố trước đó.</p>' +
      '<div class="attack-sources"><a class="subtle-link" href="' + posts.article + '">Bài gốc AoV Tactics &amp; Guides</a>' +
      '<a class="subtle-link" href="' + posts.study + '">Bảng đo tại Đài Loan</a><a class="subtle-link" href="' + posts.notes + '">Ghi chú các trường hợp đặc biệt</a></div></section></div>';

    const choices = buildChoices();
    const byId = new Map(choices.map(entry => [entry.id, entry]));
    const form = id => container.querySelector("#as-" + id);
    const hero = form("hero");
    const search = form("search");
    const model = form("model");
    const input = form("value");
    const message = form("message");
    const result = form("result");
    const table = form("table");
    const tableTitle = container.querySelector("#attack-table-title");

    function fillChoices() {
      const query = normalize(search.value.trim());
      const match = choices.filter(entry => normalize(entry.label).includes(query));
      const selected = hero.value;
      hero.innerHTML = '<option value="">' + (query && !match.length ? "Không tìm thấy tướng" : "Tra trực tiếp theo model") + '</option>' +
        match.map(entry => '<option value="' + safe(entry.id) + '">' + safe(entry.label) + '</option>').join("");
      if (match.some(entry => entry.id === selected)) hero.value = selected;
    }

    function show() {
      const selected = byId.get(hero.value);
      const assignedModel = selected?.model;
      if (assignedModel) model.value = assignedModel;
      const ref = model.value;
      tableTitle.textContent = "Các mốc model " + ref;
      const { thresholds, firstFrame } = models[ref];
      const rawValue = input.value.trim();
      const value = Number(rawValue.replace(",", "."));
      const valid = /^\d+(?:[.,]\d+)?$/.test(rawValue) && Number.isFinite(value);
      const knownModel = !selected || Boolean(assignedModel);
      const withinLimit = selected?.limit === undefined || value < selected.limit;
      const computed = knownModel && valid && withinLimit ? lookup(ref, value) : null;
      let note = selected?.note ?? "";
      if (selected && !knownModel && !note) note = "Tướng này chưa có model trong danh sách của bài ATG.";
      input.setAttribute("aria-invalid", String(Boolean(rawValue) && !valid));
      message.textContent = !valid ? "Nhập tốc đánh cộng thêm từ 0%. Có thể dùng dấu phẩy hoặc dấu chấm thập phân." : note;
      if (!computed) {
        result.innerHTML = valid ? '<p class="empty">Chưa có kết quả phù hợp cho tướng và trạng thái này. Bảng bên dưới đang hiển thị model tham chiếu.</p>' : "";
      } else {
        const { frames, current, next } = computed;
        const nextText = next === undefined ? "Mốc cuối trong bảng" : pct(next);
        result.innerHTML = '<dl class="attack-results">' + resultItem(pct(current), "Mốc đã đạt") +
          resultItem(frames + " frame", "Mỗi đòn thường") + resultItem(speed(frames), "Nhịp đánh") +
          resultItem(nextText, "Mốc tiếp theo") + '</dl>' + (next === undefined ? "" :
          '<p class="attack-gap">Cần thêm <strong>' + safe(format.format(next - value)) + ' điểm %</strong> tốc đánh để tới ' + safe(pct(next)) + '.</p>');
      }
      table.innerHTML = thresholds.map((threshold, index) => {
        const frames = firstFrame - index;
        const active = computed?.current === threshold;
        return '<tr' + (active ? ' class="as-current"' : '') + '><th scope="row">' + safe(pct(threshold)) +
          (active ? '<span class="as-mark">Đang đạt</span>' : '') + '</th><td>' + frames + '</td><td>' + safe(speed(frames)) + '</td></tr>';
      }).join("");
    }

    fillChoices();
    search.addEventListener("input", () => { fillChoices(); show(); });
    hero.addEventListener("change", show);
    model.addEventListener("change", () => { hero.value = ""; show(); });
    input.addEventListener("input", show);
    show();
  }
  window.ATG_ATTACK_SPEED = { render };
})();
