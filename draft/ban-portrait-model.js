((root) => {
  "use strict";

  function features(pixels) {
    const rgb = Array.from(pixels, value => value / 255);
    const gray = Array.from({ length: 64 }, (_, i) =>
      .299 * rgb[3 * i] + .587 * rgb[3 * i + 1] + .114 * rgb[3 * i + 2]);
    const horizontal = gray.flatMap((value, i) => i % 8 === 7 ? [] : [gray[i + 1] - value]);
    const vertical = gray.slice(0, 56).map((value, i) => gray[i + 8] - value);
    return [...rgb, ...horizontal, ...vertical];
  }

  function standardize(values) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    return values.map(value => deviation ? (value - mean) / deviation : 0);
  }

  function shortlist(ranked, pixels, model) {
    const fallback = ranked.slice(0, 4);
    if (ranked.length <= 4 || pixels.length !== 192 || model?.version !== 1) return fallback;
    const coefficients = new Map(model.classes.map(row => [row[0], row]));
    const input = features(pixels);
    const visual = standardize(ranked.map(([, distance]) => -distance));
    const learned = standardize(ranked.map(([id]) => {
      const row = coefficients.get(id);
      if (!row) return 0;
      const [, bias, weights] = row;
      return input.reduce((score, value, i) => score + value * weights[i], bias);
    }));
    const result = ranked.slice(0, 3);
    let backup = 3;
    for (let i = 4; i < ranked.length; i++) {
      if (visual[i] + learned[i] > visual[backup] + learned[backup]) backup = i;
    }
    return [...result, ranked[backup]];
  }

  root.DRAFT_BAN_PORTRAITS = { shortlist };
})(globalThis);
