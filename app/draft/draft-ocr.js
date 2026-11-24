(() => {
  "use strict";

  const normalize = text => text.normalize("NFD").toLowerCase()
    .replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
  const names = new Map();
  for (const { id, name } of window.DRAFT_HEROES) {
    const key = normalize(name);
    names.set(key, names.has(key) ? null : id);
  }
  let pendingWorker;

  function loadWorker() {
    if (pendingWorker) return pendingWorker;
    pendingWorker = (async () => {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
          script.onload = resolve;
          script.onerror = () => {
            script.remove();
            reject(new Error("OCR script unavailable"));
          };
          document.head.append(script);
        });
      }
      const worker = await window.Tesseract.createWorker("eng", 1, {
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
        langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
      });
      await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_LINE });
      return worker;
    })().catch(error => {
      pendingWorker = null;
      throw error;
    });
    return pendingWorker;
  }

  function nameLine(frame, side, index) {
    const right = side === "red";
    const sx = frame.width / 2346, sy = frame.height / 1086;
    const y = 320 + index * 144.5;
    const probe = document.createElement("canvas");
    probe.width = 277;
    probe.height = 48;
    const context = probe.getContext("2d", { willReadFrequently: true });
    const top = y - (right ? 40 : 22);
    context.drawImage(frame, ((right ? 2035 : 551) - 261) * sx, (top - 88) * sy,
      277 * sx, 48 * sy, 0, 0, 277, 48);
    const data = context.getImageData(0, 0, 277, 48).data;
    const active = [];
    for (let row = 0; row < 48; row++) {
      let hits = 0;
      for (let column = 0; column < 277; column++) {
        const i = (row * 277 + column) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (right ? r > 135 && r - g > 35 && r - b > 12 :
          Math.min(g, b) > 120 && g - r > 6 && b - r > 6) hits++;
      }
      if (hits >= 4) active.push(row);
    }
    const bands = [];
    for (const row of active) {
      const band = bands.at(-1);
      if (band && row - band.end <= 3) band.end = row;
      else bands.push({ start: row, end: row });
    }
    const band = bands.filter(row => row.end - row.start >= 4).sort((a, b) =>
      Math.abs(top + (a.start + a.end) / 2 - y - (right ? -5 : 8)) -
      Math.abs(top + (b.start + b.end) / 2 - y - (right ? -5 : 8)))[0];
    return band ? { y: top + band.start - 3, height: band.end - band.start + 7 } :
      { y: y + (right ? -24 : 2), height: right ? 28 : 24 };
  }

  function labelImage(frame, side, index, variant = 0) {
    const right = side === "red";
    const sx = frame.width / 2346, sy = frame.height / 1086;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 94;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const line = variant === 3 ? { y: 320 + index * 144.5 + (right ? -24 : 2),
      height: right ? 28 : 24 } : nameLine(frame, side, index);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 480, 94);
    ctx.drawImage(frame, ((right ? 2035 : 551) - 261) * sx, (line.y - 88) * sy,
      (right ? 277 : 275) * sx, line.height * sy, 12, 10, 456, 74);
    const image = ctx.getImageData(12, 10, 456, 74);
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
      const cyan = Math.min(g, b);
      const ink = variant === 3 ? (right ? (r - g - 36) * 8 : cyan * 1.5) : right ? (r > 110 ? (r - g - [25, 15, 35][variant]) * 10 : 0) :
        variant === 2 ? (cyan > 155 ? 255 : 0) :
        cyan > 110 ? (cyan - r - [3, 7][variant]) * 14 : 0;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255 - Math.max(0, ink);
    }
    ctx.putImageData(image, 12, 10);
    return canvas;
  }

  window.DRAFT_OCR = {
    hasLabel(frame, slot) {
      const patch = labelImage(frame, slot.side, slot.index);
      const pixels = patch.getContext("2d").getImageData(0, 0, patch.width, patch.height).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 190) ink++;
      return ink >= 90 && ink < patch.width * patch.height * .45;
    },
    nameplate(frame, slot) { return labelImage(frame, slot.side, slot.index, 2).toDataURL("image/jpeg", .85).split(",")[1]; },
    async read(frame, slots) {
      const crops = slots.map(slot => [0, 1, 2, 3].map(variant => labelImage(frame, slot.side, slot.index, variant)));
      const worker = await loadWorker();
      const found = [];
      for (const [index, variants] of crops.entries()) {
        const candidates = [];
        for (const crop of variants) {
          const { data } = await worker.recognize(crop);
          const id = names.get(normalize(data.text));
          if (id && data.confidence >= 50) candidates.push({ id, confidence: data.confidence });
        }
        const ids = new Set(candidates.map(row => row.id));
        if (ids.size === 1) {
          const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
          found.push({ ...slots[index], ...best });
        }
      }
      return found;
    },
  };
})();
