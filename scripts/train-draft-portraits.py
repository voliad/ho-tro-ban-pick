"""Train and measure a portrait classifier using roster images and labeled matches.

Run with NumPy, Pillow and scikit-learn installed:
    python scripts/train-draft-portraits.py --fixtures-dir PATH --output report.json
Add --ban-model PATH to export a model fitted on all labeled matches after evaluation.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from sklearn.linear_model import RidgeClassifier


ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT / "app" / "draft"
KINDS = ("ban", "pick")
RESOLUTIONS = (0, 660, 525)


def load_roster():
    source = (DRAFT / "heroes.js").read_text(encoding="utf-8")
    heroes = json.loads(source.split("window.DRAFT_HEROES = ", 1)[1].strip().removesuffix(";"))
    return {
        hero["id"]: Image.open(DRAFT / hero["image"]).convert("RGB")
        for hero in heroes
    }


def patch(image, x, y, width, height):
    return image.transform(
        (32, 32), Image.Transform.EXTENT,
        (x - width / 2, y - height / 2, x + width / 2, y + height / 2),
        Image.Resampling.BILINEAR,
    )


def portrait_pixels(image):
    return np.asarray(image.resize((8, 8), Image.Resampling.BILINEAR), dtype=np.float32) / 255


def features(rgb):
    gray = rgb @ np.array([.299, .587, .114], dtype=np.float32)
    gradients = (np.diff(gray, axis=-1).reshape(*gray.shape[:-2], 56),
                 np.diff(gray, axis=-2).reshape(*gray.shape[:-2], 56))
    return np.concatenate([rgb.reshape(*gray.shape[:-2], 192), *gradients], axis=-1)


def augment(image, rng, kind, from_roster=False):
    if from_roster:
        width, height = image.size
        size = min(width, height) * rng.uniform(.47, .88)
        x = width * rng.uniform(.45, .55)
        y = (height - size) * rng.uniform(.30, .56) + size / 2
        image = patch(image, x, y, size, size)
    else:
        size = rng.uniform(25, 32)
        image = patch(image, rng.uniform(14, 18), rng.uniform(14, 18), size, size)
    image = ImageEnhance.Brightness(image).enhance(rng.uniform(.78, 1.22))
    image = ImageEnhance.Color(image).enhance(rng.uniform(.45 if kind == "ban" else .75, 1.12))
    if rng.random() < .65:
        image = image.filter(ImageFilter.GaussianBlur(rng.uniform(.2, 1.2)))
    resolution = int(rng.integers(8 if kind == "ban" else 14, 26))
    image = image.resize((resolution, resolution), Image.Resampling.BILINEAR)
    rgb = portrait_pixels(image)
    return np.clip(rgb + rng.normal(0, .015, rgb.shape), 0, 1).astype(np.float32)


def match_patch(image, row):
    left = row["side"] == "blue"
    index = row["index"]
    if row["kind"] == "ban":
        x, y, width = (370 if left else 2161) + 84 * index, 137, 34
    else:
        x = (500 if left else 2368) if row["confirmed"] else (530 if left else 2338)
        y, width = 320 + 144.5 * index, 65
    sx, sy = image.width / 2346, image.height / 1086
    return patch(image, (x - 261) * sx, (y - 88) * sy, width * sx, width * sy)


def load_matches(fixtures_dir):
    manifest = json.loads((ROOT / "scripts" / "draft-scan-fixtures.json").read_text(encoding="utf-8"))
    groups = {}
    for fixture in manifest["cases"]:
        group = fixture["matchId"]
        if group in groups:
            continue
        image = Image.open(fixtures_dir / fixture["file"]).convert("RGB")
        views = [image if not width else image.resize((width, round(image.height * width / image.width)),
                                                      Image.Resampling.BILINEAR) for width in RESOLUTIONS]
        groups[group] = [(row, [match_patch(view, row) for view in views]) for row in fixture["expected"]]
    return groups


def rank_ids(scores, ids):
    return ids[np.argsort(-scores, kind="stable")[:4]].tolist()


def measure(predictions):
    return {
        method: {
            "top1": sum(row[method][0] == row["id"] for row in predictions),
            "top4": sum(row["id"] in row[method] for row in predictions),
        }
        for method in ("reference", "learned", "combined", "backup")
    } | {"count": len(predictions)}


def fit_model(synthetic, synthetic_ids, real, rng, kind):
    training = [(row["id"], augment(views[i % len(views)], rng, kind))
                for row, views in real for i in range(64)]
    real_ids, real_pixels = zip(*training)
    return RidgeClassifier(alpha=12, class_weight="balanced").fit(
        np.concatenate((synthetic, features(np.array(real_pixels)))),
        np.concatenate((synthetic_ids, real_ids)),
    )


def benchmark(roster, matches, ban_model_path):
    rng = np.random.default_rng(614)
    ids = np.array(sorted(roster))
    reference_ids = np.repeat(ids, 3)
    references = []
    for hero in ids:
        image = roster[hero]
        for scale, vertical in [(.65, .5), (.82, .5), (.53, .4)]:
            size = min(image.size) * scale
            references.append(portrait_pixels(patch(image, image.width / 2,
                              (image.height - size) * vertical + size / 2, size, size)))
    references = np.array(references, dtype=np.float32)
    predictions = []
    for kind in KINDS:
        synthetic = features(np.array([augment(roster[hero], rng, kind, True)
                                       for hero in ids for _ in range(80)]))
        synthetic_ids = np.repeat(ids, 80)
        gray = references @ np.array([.299, .587, .114], dtype=np.float32)
        refs = np.concatenate((references, .7 * references + .3 * gray[..., None])) if kind == "ban" else references
        group_ids = np.tile(reference_ids, 2) if kind == "ban" else reference_ids
        for held_out, validation in matches.items():
            real = [(row, views) for group, examples in matches.items() if group != held_out
                    for row, views in examples if row["kind"] == kind]
            model = fit_model(synthetic, synthetic_ids, real, rng, kind)
            annotated_pixels = np.array([portrait_pixels(view) for _, views in real for view in views])
            annotated_ids = np.array([row["id"] for row, views in real for _ in views])
            all_refs = np.concatenate((refs, annotated_pixels))
            all_ids = np.concatenate((group_ids, annotated_ids))
            for row, views in validation:
                if row["kind"] != kind:
                    continue
                for width, view in zip(RESOLUTIONS, views):
                    query = portrait_pixels(view)
                    distances = -np.mean((all_refs - query) ** 2, axis=(1, 2, 3))
                    reference_scores = np.array([distances[all_ids == hero].max() for hero in ids])
                    learned_scores = model.decision_function(features(query)[None, :])[0]
                    combined_scores = (reference_scores - reference_scores.mean()) / reference_scores.std()
                    combined_scores += (learned_scores - learned_scores.mean()) / learned_scores.std()
                    reference_ids_ranked = rank_ids(reference_scores, ids)
                    combined = rank_ids(combined_scores, ids)
                    predictions.append({
                        **row, "matchId": held_out, "width": width,
                        "reference": reference_ids_ranked, "learned": rank_ids(learned_scores, ids),
                        "combined": combined,
                        "backup": list(dict.fromkeys(reference_ids_ranked[:3] + combined))[:4],
                    })
        if kind == "ban" and ban_model_path:
            real = [(row, views) for examples in matches.values() for row, views in examples if row["kind"] == kind]
            trained = fit_model(synthetic, synthetic_ids, real, np.random.default_rng(174), kind)
            fitted = [[hero, round(float(bias), 5), weights.round(5).tolist()] for hero, bias, weights in
                      zip(trained.classes_, trained.intercept_, trained.coef_.astype(np.float64))]
            ban_model_path.write_text(json.dumps({"version": 1, "classes": fitted}, separators=(",", ":")) + "\n",
                                      encoding="utf-8")
    return predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ban-model", type=Path)
    args = parser.parse_args()
    roster, matches = load_roster(), load_matches(args.fixtures_dir)
    predictions = benchmark(roster, matches, args.ban_model)
    summary = {
        "classes": len(roster),
        "matches": len(matches),
        "method": "leave-one-match-out; all resolutions of a match are kept together",
        "byKind": {kind: measure([row for row in predictions if row["kind"] == kind]) for kind in KINDS},
        "byResolution": {width: measure([row for row in predictions if row["width"] == width])
                         for width in RESOLUTIONS},
        "smallBans": measure([row for row in predictions if row["kind"] == "ban" and row["width"] in (525, 660)]),
        "overall": measure(predictions),
    }
    print(json.dumps(summary, indent=2))
    args.output.write_text(json.dumps({"summary": summary, "predictions": predictions}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
