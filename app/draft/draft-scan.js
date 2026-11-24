(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const video = $("airplay-preview");
  const rotatedVideo = $("scan-video-preview");
  const rotationProbe = document.createElement("canvas");
  const borderProbe = document.createElement("canvas");
  borderProbe.width = 80;
  borderProbe.height = 44;
  const borderContext = borderProbe.getContext("2d", { willReadFrequently: true });
  let videoBounds;
  const rotateButton = $("scan-rotate");
  const autoRotateButton = $("scan-auto-rotate");
  const image = $("scan-preview");
  const file = $("scan-file");
  const clear = $("scan-clear");
  const calibrate = $("scan-calibrate");
  const output = $("scan-results");
  const feedStatus = $("scan-feed-status");
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
  const scanEvent = snapshot => document.dispatchEvent(new CustomEvent("draft-scan", {
    detail: snapshot ? consensus.inOrder(snapshot) : null,
  }));
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
  const heroKey = id => window.DRAFT_RULES.heroKey(window.DRAFT_RULES.defaults, id);
  const slotKey = row => [row.side, row.kind, row.index].join("|");
  const consensus = window.DRAFT_SCAN_CONSENSUS(heroKey);
  const userReferences = { bans: [], picks: [] };
  let sourceHash = "";
  let slotObservations = [];
  let ocrGeneration = 0;
  function refreshUserReferences() {
    userReferences.bans = [];
    userReferences.picks = [];
    for (const row of window.DRAFT_SCAN_LIBRARY.list()) {
      if (row.use === "reference") userReferences[row.kind === "ban" ? "bans" : "picks"].push([row.id, row.pixels]);
    }
  }
  refreshUserReferences();
  const geminiAccess = $("iphone-turn-access");
  const geminiResult = $("scan-gemini-result");
  let geminiSlots = [];
  let geminiAttempt;
  let geminiTimer;
  let lastGeminiRequest = -Infinity;
  const geminiSuggestions = new Map();
  const referenceImages = new Map();
  function candidateHeroes(target) {
    const type = target.kind === "ban" ? "bans" : "picks";
    const scores = new Map();
    for (const [id, pixels] of [...references[type], ...userReferences[type]]) {
      const score = squaredDistance(target.pixels, pixels);
      if (score < (scores.get(id) ?? Infinity)) scores.set(id, score);
    }
    const seen = new Set(latestLocalRows.map(row =>
      window.DRAFT_RULES.heroKey(window.DRAFT_RULES.defaults, row.id)));
    return [...scores].sort((a, b) => a[1] - b[1]).filter(([id]) => {
      const key = window.DRAFT_RULES.heroKey(window.DRAFT_RULES.defaults, id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4).map(([id]) => heroes.find(hero => hero.id === id));
  }
  function supportedCandidate(target, id) {
    const type = target.kind === "ban" ? "bans" : "picks";
    const refs = [...references[type], ...userReferences[type]].filter(row => row[0] === id);
    const evidence = target.patches;
    return evidence.every(patch => refs.some(([, ref]) => squaredDistance(patch, ref) < 34 ** 2 * 192));
  }
  async function referencePortrait(hero, kind, target) {
    const reviewed = window.DRAFT_SCAN_LIBRARY.list().filter(row =>
      row.use === "reference" && row.id === hero.id && row.kind === kind).sort((a, b) =>
        squaredDistance(a.pixels, target.pixels) - squaredDistance(b.pixels, target.pixels))[0];
    if (reviewed) return reviewed.image.split(",")[1];
    if (!referenceImages.has(hero.id)) {
      const pending = (async () => {
        const image = new Image();
        image.src = hero.image;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const size = Math.min(image.width, image.height) * .65;
        canvas.getContext("2d").drawImage(image, (image.width - size) / 2, (image.height - size) / 2,
          size, size, 0, 0, 128, 128);
        return canvas.toDataURL("image/jpeg", .8).split(",")[1];
      })().catch(error => { referenceImages.delete(hero.id); throw error; });
      referenceImages.set(hero.id, pending);
    }
    return referenceImages.get(hero.id);
  }
  function sameTarget(a, b) {
    return a.side === b.side && a.kind === b.kind && a.index === b.index &&
      a.confirmed === b.confirmed && squaredDistance(a.pixels, b.pixels) < 192 * 12 ** 2;
  }
  async function completeWithGemini() {
    if (!crop || !geminiSlots.length) return;
    const access = geminiAccess.value.trim();
    if (!access) {
      if (imageUrl) geminiResult.textContent = "Nhập mã truy cập TURN để dùng Gemini.";
      return;
    }
    const currentCrop = crop;
    const targets = geminiSlots.slice(0, 4).map(target => ({
      ...target, patches: [target.pixels, Array.from(sample(target.x + 3, target.y + 2, target.width))], portrait: patchImage(target).toDataURL("image/jpeg", .85).split(",")[1],
      nameplate: target.kind === "pick" ? window.DRAFT_OCR.nameplate(frame, target) : undefined,
      candidates: candidateHeroes(target),
    })).filter(target => target.candidates.length >= 2);
    if (!targets.length) return;
    const key = JSON.stringify(targets.map(row => [row.side, row.kind, row.index, row.pixels]));
    if (geminiAttempt?.crop === currentCrop && geminiAttempt.key === key && geminiAttempt.access === access) return;
    if (!imageUrl && performance.now() - lastGeminiRequest < 15000) return;
    const attempt = { crop: currentCrop, key, access };
    geminiAttempt = attempt;
    lastGeminiRequest = performance.now();
    geminiResult.textContent = "Đang đối chiếu chân dung với ảnh tham chiếu qua Gemini…";
    const results = await Promise.all(targets.map(async target => {
      const label = (target.side === "blue" ? "Trái " : "Phải ") +
        (target.kind === "ban" ? "cấm " : "chọn ") + (target.index + 1);
      try {
        const candidates = await Promise.all(target.candidates.map(async hero => ({
          id: hero.id, name: hero.name, portrait: await referencePortrait(hero, target.kind, target),
        })));
        const response = await fetch("https://aov-ban-pick-turn.checkin-license-server.workers.dev/gemini", {
          method: "POST",
          headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
          body: JSON.stringify({ portrait: target.portrait, nameplate: target.nameplate, candidates }),
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 401) return label + " · Mã truy cập sai";
        if (response.status === 429) return label + " · Gemini hết hạn mức";
        if (!response.ok) return label + " · Gemini chưa phản hồi";
        const { candidateId } = await response.json();
        const selected = candidates.find(candidate => candidate.id === candidateId);
        if (!selected) return label + " · Chưa có ứng viên phù hợp";
        if (!supportedCandidate(target, selected.id)) {
          if (crop === currentCrop && geminiAttempt === attempt && geminiSlots.some(slot => sameTarget(slot, target))) {
            geminiSuggestions.set([target.side, target.kind, target.index].join("|"), { ...target, id: selected.id });
          }
          return label + " · Gemini gợi ý " + selected.name + ", cần bạn xác nhận trong kho mẫu";
        }
        return { ...target, id: selected.id };
      } catch {
        return label + " · Không kết nối được Gemini";
      }
    }));
    if (geminiAttempt !== attempt || crop !== currentCrop) return;
    const used = new Set(latestLocalRows.map(row =>
      window.DRAFT_RULES.heroKey(window.DRAFT_RULES.defaults, row.id)));
    const suggestions = results.filter(row => typeof row !== "string" &&
      geminiSlots.some(slot => sameTarget(slot, row)) &&
      !used.has(window.DRAFT_RULES.heroKey(window.DRAFT_RULES.defaults, row.id)))
      .map(row => ({ side: row.side, kind: row.kind, index: row.index, id: row.id,
        confirmed: row.confirmed, pending: !row.confirmed, pixels: row.pixels, inferred: true }));
    const occupied = new Set(latestLocalRows.map(slotKey));
    const accepted = uniqueHeroes(suggestions.filter(row => !occupied.has(slotKey(row))));
    if (imageUrl) {
      const updatedSlots = new Set(accepted.map(slotKey));
      geminiRows = uniqueHeroes([...accepted, ...geminiRows.filter(row =>
        !updatedSlots.has(slotKey(row)) && geminiSlots.some(slot => sameTarget(slot, row)))]);
      scanEvent(uniqueHeroes([...latestLocalRows, ...geminiRows]));
    } else {
      const merged = consensus.keep([...latestLocalRows, ...accepted]);
      latestLocalRows = merged;
      scanEvent(merged);
      signature = "";
    }
    const errors = results.filter(row => typeof row === "string");
    geminiResult.textContent = "Gemini đã đối chiếu được " + accepted.length + "/" + targets.length + " ô." +
      (errors.length ? " " + errors.join(" | ") : "");
  }
  let latestLocalRows = [];
  let geminiRows = [];
  geminiAccess.addEventListener("change", () => completeWithGemini());
  let signature = "";
  const extraPortraits = { bans: [], picks: [] };
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
  const attemptedSlots = new Map();
  let loadingPortraits = false;
  let finishedPortraits = 0;
  let resolvePortraits;
  const portraitsReady = new Promise(resolve => { resolvePortraits = resolve; });
  let imageUrl;
  let rotation = 0;
  let manualRotation = false;
  let lastFrame;
  let lastFrameChange = 0;
  let shareSession;
  const source = () => imageUrl ? image : rotation ? rotatedVideo : video;
  const dimensions = element => element === image ? [image.naturalWidth, image.naturalHeight] :
    element === video ? [video.videoWidth, video.videoHeight] : [element.width, element.height];

  function rotateFrame(canvas, angle) {
    const [fullWidth, fullHeight] = dimensions(video);
    const { x, y, width, height } = videoBounds ?? { x: 0, y: 0, width: fullWidth, height: fullHeight };
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
    context.drawImage(video, x, y, width, height, -width / 2, -height / 2, width, height);
  }

  function sidewaysContent() {
    const [width, height] = dimensions(video);
    if (width <= height) return null;
    borderContext.drawImage(video, 0, 0, 80, 44);
    const pixels = borderContext.getImageData(0, 0, 80, 44).data;
    const columns = [];
    for (let x = 0; x < 80; x++) {
      let lit = 0;
      for (let y = 0; y < 44; y++) {
        const i = (y * 80 + x) * 4;
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 24) lit++;
      }
      if (lit >= 9) columns.push(x);
    }
    const left = columns[0], right = columns.at(-1);
    if (left === undefined || left < 12 || right > 67 || Math.abs(left + right - 79) > 9) return null;
    const innerWidth = Math.round((right - left + 1) * width / 80);
    if (height / innerWidth < 1.65 || height / innerWidth > 2.65) return null;
    return { x: Math.floor(left * width / 80), y: 0, width: innerWidth, height };
  }

  function updateVideoPreview() {
    const playing = !imageUrl && Boolean(video.srcObject);
    rotateButton.hidden = !playing;
    autoRotateButton.hidden = !playing || !manualRotation;
    const showRotated = playing && manualRotation && rotation !== 0;
    video.toggleAttribute("data-rotated", showRotated);
    rotatedVideo.hidden = !showRotated;
    if (playing && rotation && video.readyState >= 2) rotateFrame(rotatedVideo, rotation);
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
    const scores = new Map();
    const limit = (threshold + margin) ** 2 * 192;
    for (const [id, ref] of refs) {
      let score = scores.get(id) ?? limit;
      for (const patch of patches) score = squaredDistance(patch, ref, score);
      scores.set(id, score);
    }
    const ranked = [...scores].sort((a, b) => a[1] - b[1]);
    const [bestId, best] = ranked[0] ?? [null, limit];
    const second = ranked[1]?.[1] ?? limit;
    return best < threshold ** 2 * 192 && Math.sqrt(second / 192) - Math.sqrt(best / 192) >= margin
      ? bestId : null;
  }

  function banLock(x) {
    let match = null;
    let best = 30 ** 2 * 192;
    for (const dx of [0, -4, 4, -8, 8, -12, 12, -16, 16, -20, 20, -24, 24]) {
      for (const dy of [0, -4, 4, -8, 8, -12, 12]) {
        const pixels = sample(x + dx, 167 + dy, 28);
        for (const ref of samples.locks) {
          const score = squaredDistance(pixels, ref, best);
          if (score >= best) continue;
          best = score;
          match = { dx, dy };
        }
        if (best < 13 ** 2 * 192) return match;
      }
    }
    return match;
  }

  function readBan(x, offset) {
    const aligned = [sample(x, 137, 34), sample(x + 3, 140, 34)];
    if (!offset) return { id: identify(aligned, references.bans) };
    const { dx, dy } = offset;
    const anchored = [
      sample(x + dx, 137 + dy, 34),
      sample(x + dx - 4, 137 + dy - 4, 34),
      sample(x + dx + 4, 137 + dy - 4, 34),
      sample(x + dx, 137 + dy + 4, 34),
    ];
    const known = identify([...aligned, ...anchored], userReferences.bans, 18, 6) ??
      identify([...aligned, ...anchored], [...samples.bans, ...userReferences.bans], 30, 4);
    const id = known ?? identify([aligned[0], anchored[0]], references.bans);
    return id ? { id, known: Boolean(known) } : { id: identify(anchored, extraPortraits.bans, 23, 7), simulated: true };
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
      const column = (i / 3) % 8;
      if (side === "red" && column < 4) continue;
      const r = patch[i], g = patch[i + 1], b = patch[i + 2];
      if (side === "blue" ? b > 145 && b - r > 78 && g - r > 28 : r > 155 && r - g > 70 && r - b > 38) hits++;
    }
    return hits >= 4;
  }

  function uniqueHeroes(rows) {
    const groups = Map.groupBy(rows, row => heroKey(row.id));
    const accepted = new Set();
    for (const matches of groups.values()) {
      const reliable = matches.filter(row => row.known || row.nameRead);
      const pool = reliable.length ? reliable : matches;
      const locked = pool.filter(row => row.kind === "ban" && row.confirmed);
      const confirmed = pool.filter(row => row.confirmed);
      const preferred = locked.length ? locked : confirmed.length ? confirmed : pool;
      const primary = preferred.filter(row => !row.simulated);
      const candidates = primary.length ? primary : preferred;
      if (candidates.length === 1) accepted.add(candidates[0]);
    }
    return rows.filter(row => accepted.has(row));
  }

  function updateFeedStatus() {
    let message = "";
    if (video.srcObject && !imageUrl) {
      const now = performance.now();
      if (!lastFrameChange) lastFrameChange = now;
      if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, 8, 8);
        const pixels = rgb();
        if (!lastFrame || squaredDistance(lastFrame, pixels) > 192 * 4) {
          lastFrame = pixels;
          lastFrameChange = now;
        }
      }
      message = now - lastFrameChange > 3500
        ? "Khung hình chưa đổi. Hãy chờ màn hình cấm/chọn nếu bạn đang ở sảnh."
        : video.readyState < 2 ? "Đã kết nối · Đang chờ hình."
        : lastGameEvidence && now - lastGameEvidence < 2000 ? "Đang quét màn hình cấm/chọn."
        : "Đang nhận hình · Chờ giao diện cấm/chọn Liên Quân.";
    } else {
      lastFrame = null;
      lastFrameChange = 0;
    }
    if (feedStatus.textContent !== message) feedStatus.textContent = message;
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
    slotObservations = [];
    let locks = 0;
    const lockedBans = [];
    const locksBySide = { blue: 0, red: 0 };
    for (const side of colors) {
      const left = side === "blue";
      const lockOffsets = [];
      for (let index = 0; index < 5; index++) {
        const banX = (left ? 370 : 2161) + 84 * index;
        const original = sample(banX, 137, 34);
        const shifted = sample(banX + 3, 140, 34);
        const emptyBanLimit = 13 ** 2 * 192;
        if (samples.emptyBans.some(ref =>
          squaredDistance(original, ref, emptyBanLimit) < emptyBanLimit ||
          squaredDistance(shifted, ref, emptyBanLimit) < emptyBanLimit)) continue;
        const offset = banLock(banX);
        if (offset) {
          lockedBans.push({ side, index });
          lockOffsets.push(offset);
        }
        const ban = readBan(banX, offset);
        slotObservations.push({ side, kind: "ban", index, id: ban.id,
          x: banX + (offset?.dx ?? 0), y: 137 + (offset?.dy ?? 0), width: 34,
          confirmed: Boolean(offset), pixels: Array.from(original) });
        if (ban.id) rows.push({ side, kind: "ban", index, ...ban, confirmed: Boolean(offset) });
      }

      locks += lockOffsets.length;
      locksBySide[side] = lockOffsets.length;
      const offsetX = lockOffsets.map(offset => offset.dx).sort((a, b) => a - b)
        [Math.floor(lockOffsets.length / 2)] ?? 0;
      for (let index = 0; index < 5; index++) {
        const y = 320 + index * 144.5;
        const glow = shining(side, y);
        const pickX = left ? (glow ? 530 : 500) : (glow ? 2338 : 2368);
        const portrait = sample(pickX, y, 65);
        const emptyLimit = 18 ** 2 * 192;
        if (samples.emptyPicks.some(ref => squaredDistance(portrait, ref, emptyLimit) < emptyLimit)) continue;
        const slot = side + "|" + index;
        const fallback = textMatches.get(slot);
        const textId = fallback && squaredDistance(fallback.portrait, portrait) < 13 ** 2 * 192 ? fallback.id : null;
        const patches = [portrait, sample(pickX + 3, y + 2, 65)];
        const nearby = [sample(pickX - 6, y - 5, 65), sample(pickX + 6, y - 5, 65),
          sample(pickX - 6, y + 5, 65), sample(pickX + 6, y + 5, 65)];
        const reviewed = identify([...patches, ...nearby], userReferences.picks, 18, 6);
        let known = reviewed ??
          identify([...patches, ...nearby], [...samples.picks, ...userReferences.picks], 30, 5);
        if (!known && lockOffsets.length >= 3) {
          // Video cropping can shift the outer columns more than the ban row.
          const anchored = [offsetX, offsetX - 8, offsetX + 8].flatMap(dx =>
            [-6, 0, 6].map(dy => sample(pickX + dx, y + dy, 65)));
          known = identify([...patches, ...nearby, ...anchored], [...samples.picks, ...userReferences.picks], 34, 7);
        }
        const a = identify([patches[0], patches[0]], references.picks, 27, 6);
        const b = identify([patches[1], patches[1]], references.picks, 27, 6);
        const extraA = !known && !a && !b ? identify([patches[0]], extraPortraits.picks, 23, 7) : null;
        const extraB = extraA && identify([patches[1]], extraPortraits.picks, 23, 7);
        const visual = known ?? (a === b ? a : null) ?? (extraA === extraB ? extraA : null);
        const pick = reviewed ?? (textId && fallback.confidence >= 75 ? textId :
          visual && textId && visual !== textId ? null : visual ?? textId);
        slotObservations.push({ side, kind: "pick", index, id: pick, x: pickX, y, width: 65,
          pixels: Array.from(portrait), pending: glow });
        slots.push({ side, index, portrait, unresolved: !pick && !glow, pending: glow });
        if (pick) rows.push({ side, kind: "pick", index, id: pick, pending: glow, known: Boolean(known),
          nameRead: Boolean(textId), simulated: Boolean(extraA && extraA === extraB && !textId) });
      }
    }
    const knownPicks = new Set(rows.filter(row => row.kind === "pick" && row.known && !row.pending).map(row => row.id));
    const namedPick = rows.some(row => row.kind === "pick" && row.nameRead && !row.pending);
    const pickPhase = locks === 10 || knownPicks.size >= 2 || namedPick ||
      (knownPicks.size > 0 && locksBySide.blue >= 3 && locksBySide.red >= 3);
    const eligible = rows.filter(row => row.kind === "ban" || row.pending || pickPhase).map(row =>
      row.kind === "pick" ? { ...row, confirmed: pickPhase && !row.pending } : row);
    const visible = uniqueHeroes(imageUrl ? eligible : consensus.unlocked(eligible));
    const observed = imageUrl ? visible : consensus.observe(visible, video.currentTime, performance.now());
    const stable = imageUrl ? consensus.inOrder(observed) : consensus.keep(observed);
    const nextPick = Object.fromEntries(colors.map(side => [side, consensus.nextPick(stable, side)]));
    const gaps = colors.filter(side => observed.some(row =>
      row.side === side && row.kind === "pick" && row.confirmed && row.index > nextPick[side]));
    const isGap = slot => gaps.includes(slot.side) && slot.index === nextPick[slot.side];
    const hasLabel = slot => slot.hasLabel ??= window.DRAFT_OCR.hasLabel(frame, slot);
    const pendingOcr = readingText ? [] : slots.filter(slot => {
      if (!imageUrl && consensus.isLocked({ ...slot, kind: "pick" })) return false;
      const prior = attemptedSlots.get(slot.side + "|" + slot.index);
      return (!prior || squaredDistance(prior, slot.portrait) > 192 * 16 ** 2) &&
        hasLabel(slot);
    }).sort((a, b) => Number(isGap(b)) - Number(isGap(a)) || Number(b.unresolved) - Number(a.unresolved)).slice(0, 2);
    if (pendingOcr.length && !readingText) {
      for (const slot of pendingOcr) attemptedSlots.set(slot.side + "|" + slot.index, slot.portrait);
      readNames(pendingOcr);
    }
    if (locks >= 2 || eligible.some(row => row.kind === "pick" && row.confirmed && (row.known || row.nameRead))) {
      lastGameEvidence = performance.now();
    }
    elapsed = Math.round(performance.now() - started);
    ocr.disabled = readingText;
    const confirmedSlots = new Set(stable.filter(row => row.confirmed).map(slotKey));
    const unreadPicks = slots.filter(slot => slot.unresolved &&
      !confirmedSlots.has(slotKey({ ...slot, kind: "pick" })));
    const unreadBans = lockedBans.filter(slot => !confirmedSlots.has(slotKey({ ...slot, kind: "ban" })));
    const pickTargets = unreadPicks.filter(hasLabel).map(slot => ({
      ...slotObservations.find(row => row.side === slot.side && row.kind === "pick" && row.index === slot.index),
      confirmed: pickPhase && !slot.pending,
    }));
    geminiSlots = [
      ...pickTargets.filter(isGap),
      ...unreadBans.map(slot => ({ ...slotObservations.find(row =>
        row.side === slot.side && row.kind === "ban" && row.index === slot.index), confirmed: true })),
      ...pickTargets.filter(slot => !isGap(slot)),
    ];
    latestLocalRows = imageUrl ? observed : stable;
    const key = JSON.stringify([lockedBans, latestLocalRows, gaps.map(side => [side, nextPick[side]])]);
    if (key === signature) return;
    signature = key;
    output.replaceChildren();
    const summary = document.createElement("p");
    const namedBans = stable.filter(row => row.kind === "ban" && row.confirmed).length;
    const unreadSlots = pickPhase ? unreadPicks.length : 0;
    summary.textContent = "Quét " + elapsed + " ms · Biểu tượng khóa: " + locks + "/10." +
      " Nhận diện tên tướng đã cấm: " + namedBans + "/" + Math.max(locks, namedBans) + " ô có khóa." +
      (!pickPhase ? " Chưa đủ dấu hiệu để xác nhận các lượt chọn." : "") +
      (unreadSlots ? " Có " + unreadSlots + " ô chọn cần đối chiếu thêm." : "");
    output.append(summary);
    if (unreadBans.length) {
      const line = document.createElement("p");
      line.textContent = "Ô đã khóa chưa rõ tướng: " + unreadBans.map(({ side, index }) =>
        (side === "blue" ? "trái " : "phải ") + (index + 1)).join(", ") + ".";
      output.append(line);
    }
    if (gaps.length) {
      const line = document.createElement("p");
      line.textContent = "Đang đối chiếu ô chọn " + gaps.map(side =>
        (side === "blue" ? "trái " : "phải ") + (nextPick[side] + 1)).join(", ") + ".";
      output.append(line);
    }
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
    const observedHeroes = new Set(latestLocalRows.map(row => heroKey(row.id)));
    geminiRows = geminiRows.filter(row => !observedHeroes.has(heroKey(row.id)) &&
      geminiSlots.some(slot => sameTarget(slot, row)));
    scanEvent(uniqueHeroes([...latestLocalRows, ...geminiRows]));
    clearTimeout(geminiTimer);
    if (geminiSlots.length) geminiTimer = setTimeout(completeWithGemini, 600);
  }

  function resetScan(keepConfirmed = false) {
    clearTimeout(geminiTimer);
    geminiAttempt = null;
    geminiSuggestions.clear();
    if (keepConfirmed) consensus.clear();
    else consensus.reset();
    latestLocalRows = consensus.keep([]);
    geminiRows = [];
    geminiSlots = [];
    geminiResult.textContent = "";
    crop = corner = null;
    choosing = false;
    trackGame = false;
    lastRegionSearch = lastGameEvidence = 0;
    ocrGeneration++;
    slotObservations = [];
    slots = [];
    textMatches.clear();
    attemptedSlots.clear();
    ocr.disabled = true;
    ocrStatus.textContent = "";
    signature = "";
    scannedPortraitCount = lastVideoTime = -1;
    scanEvent(latestLocalRows.length ? latestLocalRows : null);
    output.textContent = "";
  }

  function addExtraPortrait(id, pixels) {
    extraPortraits.picks.push([id, pixels]);
    extraPortraits.bans.push([id, pixels.map((value, index) => {
      const i = index - index % 3;
      const gray = .299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2];
      return .8 * value + .2 * gray;
    })]);
  }

  function loadPortraits() {
    if (loadingPortraits) return;
    loadingPortraits = true;
    const smallPortrait = document.createElement("canvas");
    const smallContext = smallPortrait.getContext("2d");
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
        // Small portrait slots can show a tighter or higher crop than the roster card.
        for (const [scale, vertical] of [[.44, .35], [.60, .32], [.72, .42]]) {
          const size = Math.min(img.width, img.height) * scale;
          ctx.clearRect(0, 0, 8, 8);
          ctx.drawImage(img, (img.width - size) / 2, (img.height - size) * vertical, size, size, 0, 0, 8, 8);
          addExtraPortrait(hero.id, rgb());
          for (const resolution of [14, 22]) {
            smallPortrait.width = smallPortrait.height = resolution;
            smallContext.drawImage(img, (img.width - size) / 2, (img.height - size) * vertical,
              size, size, 0, 0, resolution, resolution);
            ctx.clearRect(0, 0, 8, 8);
            ctx.drawImage(smallPortrait, 0, 0, 8, 8);
            addExtraPortrait(hero.id, rgb());
          }
        }
        portraitCount++;
      }).catch(() => {}).finally(() => {
        finishedPortraits++;
        if (finishedPortraits === heroes.length) resolvePortraits();
        loadNext();
      });
    }
    for (let i = 0; i < 6; i++) loadNext();
  }

  function beginCalibration() {
    if (!dimensions(source())[0]) return;
    resetScan(!imageUrl);
    choosing = true;
    output.textContent = "Bấm góc trên bên trái của vùng game.";
    loadPortraits();
  }

  function findGameRegion(drawable = source()) {
    const [width, height] = dimensions(drawable);
    if (width < 320 || height < 140) return null;
    const full = { x: 0, y: 0, width, height };
    if (Math.abs(width / height - 2346 / 1086) < .08 && lockEvidence(drawable, full) >= 3) return full;
    const finder = document.createElement("canvas");
    finder.width = Math.min(width, 900);
    finder.height = Math.round(height * finder.width / width);
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
          if (span >= finder.width * .26 && y + gameHeight <= finder.height + 2 && (!best || span > best.span)) {
            best = { x: start, y: y + topOffset, span, gameHeight };
          }
          start = x + 1;
        }
      }
      if (best) {
        const scale = width / finder.width;
        const expectedBottom = best.y + best.gameHeight;
        // A dark strip below the game often gives a more precise height than the aspect ratio of a resized video.
        const edgeSpan = Math.round(best.span * .6);
        const edgeStart = Math.round(best.x + best.span * .2);
        const edgeColor = y => {
          let count = 0;
          for (let x = edgeStart; x < edgeStart + edgeSpan; x += 4) {
            if (gameColor(x, y, brightness, saturation)) count++;
          }
          return count * 4 / edgeSpan;
        };
        let bottom = expectedBottom;
        for (let y = Math.max(2, Math.round(expectedBottom - best.gameHeight * .035));
          y < Math.min(finder.height - 2, expectedBottom + best.gameHeight * .035); y++) {
          if (edgeColor(y - 1) < .7 || edgeColor(y) > .12 || edgeColor(y + 1) > .12) continue;
          bottom = y;
          break;
        }
        return { x: best.x * scale, y: best.y * scale, width: best.span * scale,
          height: Math.min((bottom - best.y) * scale, height - best.y * scale) };
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

  calibrate.addEventListener("click", () => {
    if (!imageUrl && !manualRotation && rotation) {
      rotation = 0;
      manualRotation = true;
      videoBounds = undefined;
      updateVideoPreview();
    }
    beginCalibration();
  });
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
    const bounds = sidewaysContent();
    const previousAngle = rotation;
    if (!manualRotation && bounds && rotation % 180 === 0) rotation = 90;
    if (!manualRotation && !bounds && videoBounds) rotation = 0;
    videoBounds = bounds ?? undefined;
    updateVideoPreview();
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
    if (bestAngle === previousAngle && crop && ["x", "y", "width", "height"].every(key => Math.abs(crop[key] - region[key]) < 3)) return;
    rotation = bestAngle;
    updateVideoPreview();
    crop = region;
    consensus.clear();
    textMatches.clear();
    attemptedSlots.clear();
    lastVideoTime = -1;
  }

  video.addEventListener("draft-share-ready", event => {
    if (imageUrl) clearImage();
    file.value = "";
    const session = event.detail ?? video.srcObject;
    resetScan(shareSession === session);
    shareSession = session;
    lastFrame = null;
    lastFrameChange = performance.now();
    rotation = 0;
    videoBounds = undefined;
    manualRotation = false;
    updateVideoPreview();
    trackGame = true;
    lastRegionSearch = -Infinity;
    loadPortraits();
    followSharedGame();
    scanSafely();
  });
  video.addEventListener("draft-share-ended", () => {
    shareSession = undefined;
    if (!imageUrl) resetScan();
  });
  video.addEventListener("resize", () => {
    if ((!trackGame && !crop) || imageUrl || !video.srcObject) return;
    resetScan(true);
    trackGame = true;
    lastRegionSearch = -Infinity;
  });

  function changeRotation(angle, manual) {
    if (!video.srcObject || imageUrl || video.readyState < 2) return;
    resetScan(true);
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
    sourceHash = "";
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
    sourceHash = "";
    image.src = url;
    clear.hidden = false;
    try {
      await image.decode();
      const digest = await crypto.subtle.digest("SHA-256", await selected.arrayBuffer());
      if (imageUrl !== url) return;
      sourceHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
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
  function patchImage(row, size = 128) {
    const patch = document.createElement("canvas");
    patch.width = patch.height = size;
    patch.getContext("2d").drawImage(frame,
      (row.x - 261 - row.width / 2) * frame.width / 2346,
      (row.y - 88 - row.width / 2) * frame.height / 1086,
      row.width * frame.width / 2346, row.width * frame.height / 1086, 0, 0, size, size);
    return patch;
  }
  document.addEventListener("scan-capture-request", async () => {
    const rows = slotObservations.map(row => {
      const suggested = geminiSuggestions.get([row.side, row.kind, row.index].join("|"));
      return { ...row, id: row.id ?? (suggested && sameTarget({ ...row, confirmed: suggested.confirmed }, suggested) ? suggested.id : undefined),
        image: patchImage(row).toDataURL("image/jpeg", .85),
        pixels: Array.from(sample(row.x, row.y, row.width)) };
    });
    let hash = sourceHash;
    if (!hash && rows.length) {
      const digest = await crypto.subtle.digest("SHA-256",
        new TextEncoder().encode(rows.map(row => row.image).join("")));
      hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    }
    document.dispatchEvent(new CustomEvent("scan-review-snapshot", { detail: { rows, sourceHash: hash } }));
  });
  document.addEventListener("scan-library-change", () => {
    refreshUserReferences();
    signature = "";
    scannedPortraitCount = lastVideoTime = -1;
    scanSafely();
  });
  document.addEventListener("scan-evaluate-request", async () => {
    loadPortraits();
    await portraitsReady;
    const results = window.DRAFT_SCAN_LIBRARY.list().filter(row => row.use === "evaluation").map(row => {
      const type = row.kind === "ban" ? "bans" : "picks";
      const predicted = identify([row.pixels], [...references[type], ...userReferences[type]], 27, 6);
      return { expected: row.id, predicted: predicted ?? null, kind: row.kind, matchId: row.matchId,
        sourceHash: row.sourceHash, outcome: !predicted ? "unknown" : predicted === row.id ? "correct" : "wrong" };
    });
    document.dispatchEvent(new CustomEvent("scan-evaluation-result", { detail: {
      evaluatedAt: new Date().toISOString(), method: "local-portrait-only", referenceSamples: userReferences.bans.length + userReferences.picks.length,
      rosterPortraitsLoaded: portraitCount,
      total: results.length, correct: results.filter(row => row.outcome === "correct").length,
      wrong: results.filter(row => row.outcome === "wrong").length,
      unknown: results.filter(row => row.outcome === "unknown").length, results,
    } }));
  });

  async function readNames(targets) {
    if (!crop || readingText || !targets.length) return;
    const region = crop;
    const generation = ocrGeneration;
    readingText = true;
    ocr.disabled = true;
    ocrStatus.textContent = "Đang đọc chữ. Lần đầu có thể cần tải mô hình.";
    try {
      const matches = await window.DRAFT_OCR.read(frame, targets);
      if (crop !== region || generation !== ocrGeneration) return;
      for (const row of matches) textMatches.set(row.side + "|" + row.index, row);
      ocrStatus.textContent = matches.length
        ? "AI đọc được " + matches.length + " tên. Trạng thái cấm/chọn vẫn được kiểm tra riêng."
        : "AI chưa đọc rõ tên tướng trong các ô đội hình.";
    } catch (error) {
      console.warn("Draft OCR:", error);
      if (crop === region) ocrStatus.textContent = "Không tải hoặc chạy được mô hình đọc chữ. Hãy thử lại.";
    } finally {
      readingText = false;
      ocr.disabled = !crop || !slots.length;
      if (crop === region) {
        scannedPortraitCount = lastVideoTime = -1;
        scanSafely();
      }
    }
  }
  ocr.addEventListener("click", () => {
    for (const slot of slots) attemptedSlots.set(slot.side + "|" + slot.index, slot.portrait);
    readNames(slots);
  });

  function scanSafely() {
    try {
      scan();
    } catch (error) {
      console.warn("Draft frame scan:", error);
      const live = Boolean(video.srcObject && !imageUrl);
      resetScan(live);
      trackGame = live;
      lastRegionSearch = -Infinity;
      output.textContent = "Không đọc được khung hình. Hãy chọn lại vùng game.";
    }
  }

  setInterval(() => {
    updateVideoPreview();
    updateFeedStatus();
    if (imageUrl || video.srcObject) {
      calibrate.disabled = !dimensions(source())[0];
      if (!imageUrl) followSharedGame();
      scanSafely();
    } else if (!calibrate.disabled) {
      calibrate.disabled = true;
      resetScan(Boolean(shareSession));
    }
  }, 160);
  document.addEventListener("draft-reset", () => {
    if (imageUrl) {
      clearImage();
      file.value = "";
      if (video.srcObject) {
        trackGame = true;
        lastRegionSearch = -Infinity;
      }
      return;
    }
    const region = crop;
    const auto = trackGame;
    resetScan();
    crop = region;
    trackGame = auto;
    lastRegionSearch = -Infinity;
  });
})();
