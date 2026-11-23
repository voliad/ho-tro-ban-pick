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

  function labelImage(frame, side, index) {
    const right = side === "red";
    const sx = frame.width / 2346, sy = frame.height / 1086;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 94;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const y = 320 + index * 144.5 + (right ? -49 : index === 0 ? 0 : -17);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 480, 94);
    ctx.drawImage(frame, ((right ? 2035 : 551) - 261) * sx, (y - 88) * sy,
      (right ? 277 : 275) * sx, (right ? 60 : 32) * sy, 12, 10, 456, 74);
    const image = ctx.getImageData(12, 10, 456, 74);
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
      const ink = right ? (r - g - 36) * 8 : (Math.min(g, b) - 135) * 4;
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
    async read(frame, slots) {
      const crops = slots.map(slot => labelImage(frame, slot.side, slot.index));
      const worker = await loadWorker();
      const found = [];
      for (const [index, crop] of crops.entries()) {
        const { data } = await worker.recognize(crop);
        const id = names.get(normalize(data.text));
        if (id && data.confidence >= 50) found.push({ ...slots[index], id });
      }
      return found;
    },
  };
})();
