(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const video = $("airplay-preview");
  const image = $("scan-preview");
  const file = $("scan-file");
  const clear = $("scan-clear");
  const calibrate = $("scan-calibrate");
  const output = $("scan-results");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const frame = document.createElement("canvas");
  const frameContext = frame.getContext("2d", { willReadFrequently: true });
  const samples = window.DRAFT_SCAN_SAMPLES;
  const heroes = window.DRAFT_HEROES;
  const names = new Map(heroes.map(hero => [hero.id, hero.name]));
  const colors = ["blue", "red"];
  const scanEvent = snapshot => document.dispatchEvent(new CustomEvent("draft-scan", { detail: snapshot }));
  function rgb() {
    const rgba = ctx.getImageData(0, 0, 8, 8).data;
    const result = new Uint8Array(192);
    for (let i = 0, j = 0; i < rgba.length; i += 4) {
      result[j++] = rgba[i];
      result[j++] = rgba[i + 1];
      result[j++] = rgba[i + 2];
    }
    return result;
  }
  let crop;
  let corner;
  let choosing = false;
  let previous = new Map();
  let signature = "";
  const references = { bans: [...samples.bans], picks: [...samples.picks] };
  let portraitCount = 0;
  let scannedPortraitCount = -1;
  let lastVideoTime = -1;
  let elapsed = 0;
  let loadingPortraits = false;
  let imageUrl;
  const source = () => imageUrl ? image : video;
  const dimensions = element => element === image
    ? [image.naturalWidth, image.naturalHeight] : [video.videoWidth, video.videoHeight];

  function squaredDistance(a, b, limit = Infinity) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const delta = a[i] - b[i];
      sum += delta * delta;
      if (sum >= limit) return limit;
    }
    return sum;
  }

  function identify(patches, refs) {
    let bestId, secondId;
    let best = 36 ** 2 * 192;
    let second = best;
    for (const [id, ref] of refs) {
      const score = Math.min(squaredDistance(patches[0], ref, second), squaredDistance(patches[1], ref, second));
      if (id === bestId) {
        best = Math.min(best, score);
      } else if (score < best) {
        second = best;
        secondId = bestId;
        best = score;
        bestId = id;
      } else if (score < second) {
        second = score;
        secondId = id;
      }
    }
    return best < 31 ** 2 * 192 && (!secondId || Math.sqrt(second / 192) - Math.sqrt(best / 192) >= 5)
      ? bestId : null;
  }

  function sample(x, y, width, height = width) {
    // Coordinates refer to the game viewport in the supplied rank screenshots.
    const scaleX = frame.width / 2346;
    const scaleY = frame.height / 1086;
    ctx.drawImage(frame, (x - 261 - width / 2) * scaleX,
      (y - 88 - height / 2) * scaleY, width * scaleX, height * scaleY, 0, 0, 8, 8);
    return rgb();
  }

  function shining(side, y) {
    const patch = sample(side === "blue" ? 365 : 2500, y, 170, 46);
    let hits = 0;
    for (let i = 0; i < patch.length; i += 3) {
      const r = patch[i], g = patch[i + 1], b = patch[i + 2];
      if (side === "blue" ? b > 145 && b - r > 78 && g - r > 28 : r > 155 && r - g > 70 && r - b > 38) hits++;
    }
    return hits >= 4;
  }

  function scan() {
    if (!crop || (imageUrl ? !image.naturalWidth : video.readyState < 2)) return;
    if (imageUrl ? scannedPortraitCount === portraitCount : lastVideoTime === video.currentTime) return;
    scannedPortraitCount = portraitCount;
    lastVideoTime = video.currentTime;
    const started = performance.now();
    const width = Math.round(crop.width), height = Math.round(crop.height);
    if (frame.width !== width || frame.height !== height) {
      frame.width = width;
      frame.height = height;
    }
    frameContext.drawImage(source(), crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    const rows = [];
    let locks = 0;
    for (const side of colors) {
      const left = side === "blue";
      for (let index = 0; index < 5; index++) {
        const banX = (left ? 370 : 2161) + 84 * index;
        let locked = false;
        for (const dx of [0, -4, 4]) {
          for (const dy of [0, -4, 4]) {
            const lock = sample(banX + dx, 167 + dy, 28);
            const limit = 30 ** 2 * 192;
            if (samples.locks.some(ref => squaredDistance(lock, ref, limit) < limit)) {
              locked = true;
              break;
            }
          }
          if (locked) break;
        }
        locks += Number(locked);
        const ban = identify([sample(banX, 137, 34), sample(banX + 3, 140, 34)], references.bans);
        if (ban) rows.push({ side, kind: "ban", index, id: ban, confirmed: locked });

        const y = 320 + index * 144.5;
        const glow = shining(side, y);
        const pickX = left ? (glow ? 530 : 500) : (glow ? 2338 : 2368);
        const pick = identify([sample(pickX, y, 65), sample(pickX + 3, y + 2, 65)], references.picks);
        if (pick) rows.push({ side, kind: "pick", index, id: pick, pending: glow });
      }
    }
    // Require the five locked ban slots on each side before treating clean pick rows as confirmed.
    const visible = rows.filter(row => row.kind === "ban" || row.pending || locks === 10).map(row =>
      row.kind === "pick" ? { ...row, confirmed: !row.pending } : row);
    const next = new Map();
    const stable = [];
    for (const row of visible) {
      const key = [row.side, row.kind, row.index, row.id, row.confirmed].join("|");
      next.set(key, Math.min(2, (previous.get(key) ?? 0) + 1));
      if (imageUrl || next.get(key) === 2) stable.push(row);
    }
    previous = next;
    elapsed = Math.round(performance.now() - started);
    const key = JSON.stringify([locks, stable]);
    if (key === signature) return;
    signature = key;
    output.replaceChildren();
    const summary = document.createElement("p");
    summary.textContent = "Quét " + elapsed + " ms · Biểu tượng khóa: " + locks + "/10." +
      (locks < 10 ? " Chưa đủ dấu hiệu để xác nhận các lượt chọn." : "");
    output.append(summary);
    for (const side of colors) {
      const items = stable.filter(row => row.side === side);
      if (!items.length) continue;
      const line = document.createElement("p");
      line.textContent = (side === "blue" ? "Trái" : "Phải") + ": " + items.map(row =>
        names.get(row.id) + " (" + (row.kind === "ban"
          ? row.confirmed ? "Đã cấm" : "Đang nhá cấm"
          : row.confirmed ? "Đã chốt" : "Đang nhá chọn") + ")").join(" · ");
      output.append(line);
    }
    if (!stable.length) output.append(crop.width < 800
      ? "Chưa đọc rõ ô tướng. Vùng game chỉ rộng " + Math.round(crop.width) +
        " px. Hãy phóng lớn game trước khi chụp hoặc chia sẻ."
      : "Chưa đọc rõ ô tướng. Hãy kiểm tra vùng game đã chọn.");
    scanEvent(stable);
  }

  function resetScan() {
    crop = corner = null;
    choosing = false;
    previous.clear();
    signature = "";
    scannedPortraitCount = lastVideoTime = -1;
    scanEvent(null);
    output.textContent = "";
  }

  function loadPortraits() {
    if (loadingPortraits) return;
    loadingPortraits = true;
    let index = 0;
    function loadNext() {
      const hero = heroes[index++];
      if (!hero) return;
      const img = new Image();
      img.src = hero.image;
      img.decode().then(() => {
        const size = Math.min(img.width, img.height) * .65;
        ctx.clearRect(0, 0, 8, 8);
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 8, 8);
        const portrait = [hero.id, rgb()];
        references.bans.push(portrait);
        references.picks.push(portrait);
        portraitCount++;
      }).catch(() => {}).finally(loadNext);
    }
    for (let i = 0; i < 6; i++) loadNext();
  }

  function beginCalibration() {
    if (!dimensions(source())[0]) return;
    resetScan();
    choosing = true;
    output.textContent = "Bấm góc trên bên trái của vùng game.";
    loadPortraits();
  }

  calibrate.addEventListener("click", beginCalibration);
  video.addEventListener("draft-share-ready", () => {
    if (imageUrl) clearImage();
    file.value = "";
    beginCalibration();
  });

  function clearImage() {
    if (!imageUrl) return;
    URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    image.removeAttribute("src");
    image.hidden = clear.hidden = true;
    calibrate.disabled = !video.srcObject || !video.videoWidth;
    video.style.removeProperty("display");
    resetScan();
  }

  clear.addEventListener("click", () => {
    clearImage();
    file.value = "";
  });
  file.addEventListener("change", async () => {
    const [selected] = file.files;
    if (!selected) return;
    clearImage();
    resetScan();
    const url = URL.createObjectURL(selected);
    imageUrl = url;
    image.src = url;
    clear.hidden = false;
    try {
      await image.decode();
      if (imageUrl !== url) return;
      video.style.display = "none";
      image.hidden = false;
      beginCalibration();
    } catch {
      if (imageUrl !== url) return;
      clearImage();
      file.value = "";
      output.textContent = "Không đọc được ảnh. Hãy thử ảnh PNG, JPEG hoặc WebP.";
    }
  });

  function selectCorner(event) {
    if (!choosing || source() !== event.currentTarget) return;
    const box = source().getBoundingClientRect();
    const [sourceWidth, sourceHeight] = dimensions(source());
    const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
    const x = (event.clientX - box.left - (box.width - sourceWidth * scale) / 2) / scale;
    const y = (event.clientY - box.top - (box.height - sourceHeight * scale) / 2) / scale;
    if (x < 0 || y < 0 || x > sourceWidth || y > sourceHeight) return;
    if (!corner) {
      corner = { x, y };
      output.textContent = "Bấm góc dưới bên phải của vùng game.";
      return;
    }
    const width = x - corner.x, height = y - corner.y;
    if (width < 320 || height < 140 || width / height < 1.65 || width / height > 2.5) {
      corner = null;
      output.textContent = "Vùng game quá nhỏ hoặc lệch. Hãy phóng lớn game và chọn lại hai góc.";
      return;
    }
    crop = { ...corner, width, height };
    choosing = false;
    output.textContent = "Đang quét các ô cấm/chọn…";
    scanSafely();
  }

  video.addEventListener("click", selectCorner);
  image.addEventListener("click", selectCorner);

  function scanSafely() {
    try {
      scan();
    } catch {
      resetScan();
      output.textContent = "Không đọc được khung hình. Hãy chọn lại vùng game.";
    }
  }

  setInterval(() => {
    if (imageUrl || video.srcObject) {
      calibrate.disabled = !dimensions(source())[0];
      scanSafely();
    } else if (!calibrate.disabled) {
      calibrate.disabled = true;
      resetScan();
    }
  }, 160);
})();
