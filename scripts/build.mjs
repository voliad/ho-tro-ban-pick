import { readdir, readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { standardKeys, sourceData } from "../server/data.mjs";

const snapshotFile = "app/snapshot.json";
if (process.argv.includes("--refresh")) {
  const entries = await Promise.all(standardKeys.map(async key => [key, await sourceData(key)]));
  const data = Object.fromEntries(entries);
  const details = [...data.community.slice(0, 3).map(i => "tier/" + i.id), ...data.guides.slice(0, 6).map(i => "guide/" + i.id)];
  await Promise.all(details.map(async key => { data[key] = await sourceData(key); }));
  await writeFile(snapshotFile, JSON.stringify({ checkedAt: new Date().toISOString(), data }));
}
const snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
const textTypes = new Set([".html", ".js", ".css", ".json"]);
const assets = {};
async function readAssets(relative = "") {
  for (const entry of await readdir(path.join("app", relative), { withFileTypes: true })) {
    const name = relative ? relative + "/" + entry.name : entry.name;
    if (entry.isDirectory()) await readAssets(name);
    else if (name !== "snapshot.json") {
      assets[name] = await readFile(path.join("app", name), textTypes.has(path.extname(name)) ? "utf8" : "base64");
    }
  }
}
await readAssets();
const draftHeroes = JSON.parse(assets["draft/heroes.js"].split("window.DRAFT_HEROES = ")[1].trim().replace(/;$/, ""));
const portraitKey = name => name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
const portraits = Object.fromEntries(draftHeroes.map(hero => [
  portraitKey(hero.name + (hero.variant ?? "")), "/draft/" + hero.image,
]));
portraits.flowbornmage = portraits.flowbornphapsu;
portraits.flowbornmarksman = portraits.flowbornxathu;
assets["boot.js"] = "window.ATG_BOOT = " + JSON.stringify({
  meta: snapshot.data.meta, guides: snapshot.data.guides, teams: snapshot.data.teams,
  esports: { summary: snapshot.data.esports.summary }, community: snapshot.data.community, portraits,
  teamLogos: Object.keys(assets).filter(file => file.startsWith("teams/")),
}) + ";";
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
const modules = await Promise.all(["server/data.mjs","server/worker.mjs"].map(file => readFile(file, "utf8")));
await writeFile("dist/server/index.js", [
  "const assets = " + JSON.stringify(assets) + ";",
  "const snapshot = " + JSON.stringify(snapshot) + ";",
  ...modules,
].join("\n"));

