(() => {
  "use strict";

  const trainingSources = new Set(["32c8850a7f6f989f637d4ed4b37ac03089cc2ca2ba1caae1da3a9531a7c58a2a","044707140aeb5f406c92c901f4b6b969b89dcd700b48858b9b85ebda528bcd72","02b12c7846cae6563748bc5f50c9b1c20f7be3bef2e1f8c010ae0108032dad88","bdc3c71427533b6a546bd44fe62c874f39d98d8d7e80f1881bd71907a88d493d","9ebc3cfa7f0b606770ddaeb4d29896014cbbbaf9a6b904be92687bddf2aa8227"]);
  const key = "aov-reviewed-portraits-v1";
  const heroes = new Set(window.DRAFT_HEROES.map(hero => hero.id));
  const valid = row => row && heroes.has(row.id) && ["ban", "pick"].includes(row.kind) &&
    ["reference", "evaluation"].includes(row.use) && row.confirmedByUser === true && typeof row.sourceHash === "string" && /^[a-f0-9]{64}$/.test(row.sourceHash) &&
    typeof row.matchId === "string" && row.matchId.length > 0 && row.matchId.length <= 80 &&
    typeof row.image === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(row.image) &&
    row.image.length <= 30000 && Array.isArray(row.pixels) && row.pixels.length === 192 &&
    row.pixels.every(value => Number.isInteger(value) && value >= 0 && value <= 255);
  let entries = [];
  try { entries = JSON.parse(localStorage.getItem(key) ?? "[]").filter(valid); } catch { /* Start with an empty library. */ }

  window.DRAFT_SCAN_LIBRARY = {
    trainingSources() { return [...trainingSources]; },
    list() { return entries.map(row => ({ ...row, pixels: [...row.pixels] })); },
    save(rows) {
      if (!rows.length || rows.some(row => !valid(row))) throw new Error("invalid_samples");
      const next = [...entries];
      for (const row of rows) {
        // A test image must never enter the reference set through an import or a repeated save.
        if (row.use === "evaluation" && trainingSources.has(row.sourceHash)) throw new Error("known_training_image");
        if (next.some(other => (other.sourceHash === row.sourceHash || other.matchId === row.matchId) && other.use !== row.use)) throw new Error("test_overlap");
        const prior = next.findIndex(other => other.image === row.image && other.kind === row.kind);
        if (prior >= 0) next[prior] = row;
        else next.push(row);
      }
      if (next.length > 250) throw new Error("library_full");
      localStorage.setItem(key, JSON.stringify(next));
      entries = next;
      document.dispatchEvent(new Event("scan-library-change"));
    },
    remove(image) {
      const next = entries.filter(row => row.image !== image);
      localStorage.setItem(key, JSON.stringify(next));
      entries = next;
      document.dispatchEvent(new Event("scan-library-change"));
    },
  };

  const $ = id => document.getElementById(id);
  const status = $("scan-library-status");
  function tellError(error) {
    const messages = {
      test_overlap: "Ảnh cùng ván đã nằm trong nhóm còn lại. Hãy giữ cả ván ở cùng một nhóm.",
      known_training_image: "Ảnh này đã được dùng bổ sung mẫu trước đây. Hãy dùng ảnh của ván mới để kiểm thử độc lập.",
      library_full: "Kho đã có 250 mẫu. Hãy xuất dữ liệu và xóa các mẫu không cần thiết.",
      invalid_samples: "Dữ liệu không hợp lệ. Hãy nhập tệp đã xuất từ kho mẫu.",
    };
    status.textContent = messages[error.message] ?? "Không lưu được dữ liệu. Bộ nhớ trình duyệt có thể đã đầy.";
  }
  const download = (name, data) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("scan-capture").addEventListener("click", () => {
    status.textContent = "Đang lấy ảnh các ô…";
    document.dispatchEvent(new Event("scan-capture-request"));
  });
  document.addEventListener("scan-review-snapshot", event => {
    const { rows, sourceHash } = event.detail;
    const grid = $("scan-review-grid");
    grid.replaceChildren();
    if (!rows.length) { status.textContent = "Hãy tải ảnh hoặc chia sẻ màn hình cấm/chọn trước."; return; }
    status.textContent = "Chọn đúng tên cho các ô cần bổ sung. Chỉ bấm lưu sau khi kiểm tra ảnh.";
    for (const row of rows) {
      const card = document.createElement("div");
      card.className = "scan-review-card";
      const image = new Image();
      image.src = row.image;
      image.alt = (row.side === "blue" ? "Trái" : "Phải") + " · " + (row.kind === "ban" ? "Cấm " : "Chọn ") + (row.index + 1);
      const label = document.createElement("span");
      label.textContent = image.alt;
      const select = document.createElement("select");
      select.setAttribute("aria-label", image.alt);
      select.add(new Option("Chọn tên tướng đã kiểm tra", ""));
      for (const hero of window.DRAFT_HEROES) select.add(new Option(hero.name + (hero.variant ? " · " + hero.variant : ""), hero.id));
      select.value = row.id ?? "";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "quiet";
      save.textContent = "Xác nhận và lưu";
      save.addEventListener("click", () => {
        if (!select.value) { status.textContent = "Hãy chọn tên tướng đúng trước khi lưu."; return; }
        const entry = { ...row, id: select.value, sourceHash,
          matchId: $("scan-match-id").value.trim() || sourceHash,
          use: $("scan-sample-use").value, confirmedByUser: true, savedAt: new Date().toISOString() };
        try {
          window.DRAFT_SCAN_LIBRARY.save([entry]);
          save.textContent = "Đã lưu";
          status.textContent = entry.use === "reference"
            ? "Đã lưu mẫu bạn xác nhận và quét lại." : "Đã lưu ảnh kiểm thử. Ảnh này được tách khỏi kho mẫu.";
        } catch (error) { tellError(error); }
      });
      card.append(image, label, select, save);
      grid.append(card);
    }
  });
  function renderSaved() {
    const grid = $("scan-saved-grid");
    grid.replaceChildren();
    for (const row of entries) {
      const card = document.createElement("div");
      card.className = "scan-review-card";
      const img = new Image();
      img.src = row.image;
      img.alt = window.DRAFT_HEROES.find(hero => hero.id === row.id).name;
      const label = document.createElement("span");
      label.textContent = img.alt + " · " + (row.kind === "ban" ? "Ô cấm" : "Ô chọn") +
        " · " + (row.use === "reference" ? "Mẫu đã xác nhận" : "Ảnh kiểm thử");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "quiet";
      remove.textContent = "Xóa mẫu";
      remove.addEventListener("click", () => {
        try { window.DRAFT_SCAN_LIBRARY.remove(row.image); } catch (error) { tellError(error); }
      });
      card.append(img, label, remove);
      grid.append(card);
    }
  }
  document.addEventListener("scan-library-change", renderSaved);
  $("scan-library-export").addEventListener("click", () => download("lien-quan-mau-da-xac-nhan.json", { version: 1, samples: entries }));
  $("scan-library-import").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 6000000) throw new Error("invalid_samples");
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !Array.isArray(data.samples) || data.samples.length > 250) throw new Error("invalid_samples");
      window.DRAFT_SCAN_LIBRARY.save(data.samples);
      status.textContent = "Đã nhập dữ liệu.";
    } catch (error) { tellError(error); }
    event.target.value = "";
  });
  $("scan-evaluate").addEventListener("click", () => {
    status.textContent = "Đang đánh giá ảnh kiểm thử…";
    document.dispatchEvent(new Event("scan-evaluate-request"));
  });
  document.addEventListener("scan-evaluation-result", event => {
    const { correct, total, wrong, unknown } = event.detail;
    status.textContent = total ? "Kiểm thử độc lập · Đúng " + correct + "/" + total +
      " · Sai " + wrong + " · Chưa rõ " + unknown + ". Chi tiết trong tệp kết quả."
      : "Chưa có ảnh kiểm thử độc lập. Hãy lưu ảnh từ ván mới vào nhóm kiểm thử.";
    if (total) download("ket-qua-kiem-thu-nhan-dien.json", event.detail);
  });
  renderSaved();
})();
