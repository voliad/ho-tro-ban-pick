(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const video = $("airplay-preview");
  const rotatedVideo = $("scan-video-preview");
  const rotationProbe = document.createElement("canvas");
  const rotateButton = $("scan-rotate");
  const autoRotateButton = $("scan-auto-rotate");
  const image = $("scan-preview");
  const file = $("scan-file");
  const clear = $("scan-clear");
  const calibrate = $("scan-calibrate");
  const output = $("scan-results");
  const ocr = $("scan-ocr");
  const ocrStatus = $("scan-ocr-status");
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
  let trackGame = false;
  let lastRegionSearch = 0;
  let lastGameEvidence = 0;
  let elapsed = 0;
  let slots = [];
  let textMatches = new Map();
  let readingText = false;
  let loadingPortraits = false;
  let imageUrl;
  let rotation = 0;
  let manualRotation = false;
  const source = () => imageUrl ? image : rotation ? rotatedVideo : video;
  const dimensions = element => element === image ? [image.naturalWidth, image.naturalHeight] :
    element === video ? [video.videoWidth, video.videoHeight] : [element.width, element.height];

  function rotateFrame(canvas, angle) {
    const [width, height] = dimensions(video);
    const quarter = angle === 90 || angle === 270;
    const w = quarter ? height : width, h = quarter ? width : height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.translate(w / 2, h / 2);
    context.rotate(angle * Math.PI / 180);
    context.drawImage(video, -width / 2, -height / 2);
  }

  function updateVideoPreview() {
    const playing = !imageUrl && Boolean(video.srcObject);
    rotateButton.hidden = !playing;
    autoRotateButton.hidden = !playing || !manualRotation;
    video.toggleAttribute("data-rotated", playing && rotation !== 0);
    rotatedVideo.hidden = !playing || rotation === 0;
    if (!rotatedVideo.hidden && video.readyState >= 2) rotateFrame(rotatedVideo, rotation);
  }

  function squaredDistance(a, b, limit = Infinity) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const delta = a[i] - b[i];
      sum += delta * delta;
      if (sum >= limit) return limit;
    }
    return sum;
  }

  function identify(patches, refs, threshold = 31, margin = 5) {
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
    return best < threshold ** 2 * 192 && (!secondId || Math.sqrt(second / 192) - Math.sqrt(best / 192) >= margin)
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

  function uniqueHeroes(rows) {
    const groups = Map.groupBy(rows, row =>
      window.DRAFT_RULES.heroKey(window.DRAFT_RULES.defaults, row.id));
    const accepted = new Set();
    for (const matches of groups.values()) {
      const locked = matches.filter(row => row.kind === "ban" && row.confirmed);
      const confirmed = matches.filter(row => row.confirmed);
      const preferred = locked.length ? locked : confirmed.length ? confirmed : matches;
      if (preferred.length === 1) accepted.add(preferred[0]);
    }
    return rows.filter(row => accepted.has(row));
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
    slots = [];
    let locks = 0;
    for (const side of colors) {
      const left = side === "blue";
      for (let index = 0; index < 5; index++) {
        const banX = (left ? 370 : 2161) + 84 * index;
        let offset;
        const limit = 30 ** 2 * 192;
        for (const dx of [0, -4, 4, -8, 8, -12, 12, -16, 16]) {
          for (const dy of [0, -4, 4, -8, 8]) {
            const lock = sample(banX + dx, 167 + dy, 28);
            if (samples.locks.some(ref => squaredDistance(lock, ref, limit) < limit)) {
              offset = { dx, dy };
              break;
            }
          }
          if (offset) break;
        }
        locks += Number(Boolean(offset));
        const original = sample(banX, 137, 34);
        const adjusted = offset
          ? sample(banX + offset.dx, 137 + offset.dy, 34) : sample(banX + 3, 140, 34);
        const aligned = [original, sample(banX + 3, 140, 34)];
        const ban = identify(aligned, references.bans) ??
          (offset && identify([original, adjusted], samples.bans, 30, 4)) ??
          identify([original, adjusted], references.bans);
        if (ban) rows.push({ side, kind: "ban", index, id: ban, confirmed: Boolean(offset) });

        const y = 320 + index * 144.5;
        const glow = shining(side, y);
        const pickX = left ? (glow ? 530 : 500) : (glow ? 2338 : 2368);
        const portrait = sample(pickX, y, 65);
        const emptyLimit = 18 ** 2 * 192;
        if (samples.emptyPicks.some(ref => squaredDistance(portrait, ref, emptyLimit) < emptyLimit)) continue;
        const slot = side + "|" + index;
        const fallback = textMatches.get(slot);
        const textId = fallback && squaredDistance(fallback.portrait, portrait) < 13 ** 2 * 192 ? fallback.id : null;
        const pick = identify([portrait, sample(pickX + 3, y + 2, 65)], references.picks) ??
          (rotation ? identify([sample(pickX - 4, y - 3, 65), sample(pickX + 4, y - 3, 65)], samples.picks) : null) ??
          textId;
        slots.push({ side, index, portrait });
        if (pick) rows.push({ side, kind: "pick", index, id: pick, pending: glow });
      }
    }
    // Require the five locked ban slots on each side before treating clean pick rows as confirmed.
    const visible = uniqueHeroes(rows.filter(row => row.kind === "ban" || row.pending || locks === 10).map(row =>
      row.kind === "pick" ? { ...row, confirmed: !row.pending } : row));
    const next = new Map();
    const stable = [];
    for (const row of visible) {
      const key = [row.side, row.kind, row.index, row.id, row.confirmed].join("|");
      next.set(key, Math.min(2, (previous.get(key) ?? 0) + 1));
      if (imageUrl || next.get(key) === 2) stable.push(row);
    }
    previous = next;
    if (locks >= 2 || stable.some(row => row.kind === "pick")) lastGameEvidence = performance.now();
    elapsed = Math.round(performance.now() - started);
    ocr.disabled = readingText;
    const key = JSON.stringify([locks, stable]);
    if (key === signature) return;
    signature = key;
    output.replaceChildren();
    const summary = document.createElement("p");
    const namedBans = stable.filter(row => row.kind === "ban" && row.confirmed).length;
    summary.textContent = "Quét " + elapsed + " ms · Biểu tượng khóa: " + locks + "/10." +
      " Nhận diện tên tướng đã cấm: " + namedBans + "/10." +
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
    trackGame = false;
    lastRegionSearch = lastGameEvidence = 0;
    previous.clear();
    slots = [];
    textMatches.clear();
    ocr.disabled = true;
    ocrStatus.textContent = "";
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
        for (const [scale, vertical] of [[.65, .5], [.82, .5], [.53, .4]]) {
          const size = Math.min(img.width, img.height) * scale;
          ctx.clearRect(0, 0, 8, 8);
          ctx.drawImage(img, (img.width - size) / 2, (img.height - size) * vertical, size, size, 0, 0, 8, 8);
          const pixels = rgb();
          references.picks.push([hero.id, pixels]);
          references.bans.push([hero.id, pixels], [hero.id, pixels.map((value, index) => {
            const i = index - index % 3;
            const gray = .299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2];
            return .7 * value + .3 * gray;
          })]);
        }
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

  function findGameRegion(drawable = source()) {
    const [width, height] = dimensions(drawable);
    if (width < 320 || height < 140) return null;
    const finder = document.createElement("canvas");
    finder.width = 360;
    finder.height = Math.round(height * 360 / width);
    const context = finder.getContext("2d", { willReadFrequently: true });
    context.drawImage(drawable, 0, 0, finder.width, finder.height);
    const pixels = context.getImageData(0, 0, finder.width, finder.height).data;
    const gameColor = (x, y, brightness, saturation) => {
      const i = (y * finder.width + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      return Math.max(r, g, b) > brightness && Math.max(r, g, b) - Math.min(r, g, b) > saturation;
    };
    for (const [brightness, saturation, topOffset] of [[36, 24, 0], [18, 9, -1]]) {
      let best = null;
      for (let y = 2; y < finder.height - 2; y++) {
        let start = 0;
        for (let x = 0; x <= finder.width; x++) {
          if (x < finder.width && gameColor(x, y + 1, brightness, saturation) &&
            !gameColor(x, y - 2, brightness, saturation)) continue;
          const span = x - start;
          const gameHeight = span * 1086 / 2346;
          if (span >= 95 && y + gameHeight <= finder.height + 2 && (!best || span > best.span)) {
            best = { x: start, y: y + topOffset, span, gameHeight };
          }
          start = x + 1;
        }
      }
      if (best) {
        const scale = width / finder.width;
        return { x: best.x * scale, y: best.y * scale, width: best.span * scale,
          height: Math.min(best.gameHeight * scale, height - best.y * scale) };
      }
    }
    return Math.abs(width / height - 2346 / 1086) < .08 ? { x: 0, y: 0, width, height } : null;
  }

  function startAutomaticScan() {
    beginCalibration();
    const region = findGameRegion();
    if (!region) return;
    crop = region;
    choosing = false;
    scanSafely();
  }

  calibrate.addEventListener("click", beginCalibration);
  function lockEvidence(drawable, region) {
    const sx = region.width / 2346, sy = region.height / 1086;
    const limit = 30 ** 2 * 192;
    let count = 0;
    for (const first of [370, 2161]) {
      for (let index = 0; index < 5; index++) {
        const x = first + 84 * index - 261;
        for (const dx of [0, -4, 4]) {
          ctx.drawImage(drawable, region.x + (x + dx - 14) * sx, region.y + (167 - 88 - 14) * sy,
            28 * sx, 28 * sy, 0, 0, 8, 8);
          const pixels = rgb();
          if (samples.locks.some(ref => squaredDistance(pixels, ref, limit) < limit)) {
            count++;
            break;
          }
        }
      }
    }
    return count;
  }

  function followSharedGame() {
    if (!trackGame || !video.srcObject || video.readyState < 2) return;
    const now = performance.now();
    if (now - lastRegionSearch < 750 || now - lastGameEvidence < 1600 && crop) return;
    lastRegionSearch = now;
    let region = findGameRegion();
    let bestAngle = rotation;
    if (!manualRotation) {
      let best = region ? lockEvidence(source(), region) : 0;
      for (const angle of [0, 90, 270, 180]) {
        if (angle === rotation || best === 10) continue;
        if (angle) rotateFrame(rotationProbe, angle);
        const drawable = angle ? rotationProbe : video;
        const candidate = findGameRegion(drawable);
        if (!candidate) continue;
        for (const nudge of [0, .01, -.01]) {
          const adjusted = { ...candidate, y: Math.max(0, candidate.y + nudge * candidate.height) };
          const score = lockEvidence(drawable, adjusted);
          if (score < 3 || score <= best) continue;
          best = score;
          bestAngle = angle;
          region = adjusted;
          if (best === 10) break;
        }
      }
    }
    if (!region) {
      if (!crop) output.textContent = "Đang tìm khung game. Hãy mở Liên Quân trên nguồn đang chia sẻ.";
      return;
    }
    if (bestAngle === rotation && crop && ["x", "y", "width", "height"].every(key => Math.abs(crop[key] - region[key]) < 3)) return;
    rotation = bestAngle;
    updateVideoPreview();
    crop = region;
    previous.clear();
    textMatches.clear();
    lastVideoTime = -1;
  }

  video.addEventListener("draft-share-ready", () => {
    if (imageUrl) clearImage();
    file.value = "";
    resetScan();
    rotation = 0;
    manualRotation = false;
    updateVideoPreview();
    trackGame = true;
    lastRegionSearch = -Infinity;
    loadPortraits();
    followSharedGame();
    scanSafely();
  });
  video.addEventListener("resize", () => {
    if (!trackGame || imageUrl) return;
    resetScan();
    trackGame = true;
    lastRegionSearch = -Infinity;
  });

  function changeRotation(angle, manual) {
    if (!video.srcObject || imageUrl || video.readyState < 2) return;
    resetScan();
    rotation = angle;
    manualRotation = manual;
    updateVideoPreview();
    trackGame = true;
    lastRegionSearch = -Infinity;
    followSharedGame();
    scanSafely();
  }

  rotateButton.addEventListener("click", () => changeRotation((rotation + 90) % 360, true));
  autoRotateButton.addEventListener("click", () => changeRotation(0, false));

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
      updateVideoPreview();
      startAutomaticScan();
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
  rotatedVideo.addEventListener("click", selectCorner);
  image.addEventListener("click", selectCorner);
  ocr.addEventListener("click", async () => {
    if (!crop || readingText || !slots.length) return;
    const region = crop;
    readingText = true;
    ocr.disabled = true;
    ocrStatus.textContent = "Đang đọc chữ. Lần đầu có thể cần tải mô hình.";
    try {
      const matches = await window.DRAFT_OCR.read(frame, slots);
      if (crop !== region) return;
      textMatches = new Map(matches.map(row => [row.side + "|" + row.index, row]));
      scannedPortraitCount = lastVideoTime = -1;
      scanSafely();
      ocrStatus.textContent = matches.length
        ? "AI đọc được " + matches.length + " tên. Trạng thái cấm/chọn vẫn được kiểm tra riêng."
        : "AI chưa đọc rõ tên tướng trong các ô đội hình.";
    } catch (error) {
      console.warn("Draft OCR:", error);
      if (crop === region) ocrStatus.textContent = "Không tải hoặc chạy được mô hình đọc chữ. Hãy thử lại.";
    } finally {
      readingText = false;
      ocr.disabled = !crop || !slots.length;
    }
  });

  function scanSafely() {
    try {
      scan();
    } catch (error) {
      console.warn("Draft frame scan:", error);
      resetScan();
      output.textContent = "Không đọc được khung hình. Hãy chọn lại vùng game.";
    }
  }

  setInterval(() => {
    updateVideoPreview();
    if (imageUrl || video.srcObject) {
      calibrate.disabled = !dimensions(source())[0];
      if (!imageUrl) followSharedGame();
      scanSafely();
    } else if (!calibrate.disabled) {
      calibrate.disabled = true;
      resetScan();
    }
  }, 160);
})();
