import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sourceData } from "../server/data.mjs";

const repository = process.argv[2] ?? "ho-tro-ban-pick";
if (!/^[\w.-]+$/.test(repository)) throw Error("Invalid GitHub Pages repository name");
const base = "/" + repository;
const output = "dist/pages";
const snapshot = JSON.parse(await readFile("app/snapshot.json", "utf8"));
const data = snapshot.data;
const extra = [
  ...data.guides.map(row => "guide/" + row.id),
  ...data.tournaments.map(row => "esports/" + row.tournamentId),
];
await Promise.all(extra.filter(key => !data[key]).map(async key => {
  try { data[key] = await sourceData(key); }
  catch { console.warn("Snapshot unavailable for " + key); }
}));

const prefix = code => code.replace(
  /((?:href|src)="|url\("|\bbutton\("[^"]*", "|fetch\(")\/(?!\/)/g,
  "$1" + base + "/",
);
const write = async (name, content) => {
  const file = path.join(output, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
};
for (const folder of ["art", "teams", "draft"]) {
  await cp("app/" + folder, path.join(output, folder), { recursive: true });
}
await cp("app/catalog.json", path.join(output, "catalog.json"));
const html = prefix(await readFile("app/index.html", "utf8"));
const routes = ["", "tier-list", "guides", "guides/goi-lenh", "wiki", "wiki/toc-danh",
  "wiki/hieu-qua-vang", "wiki/hut-mau-phep", "esports", "esports/data", "ban-pick",
  ...data.guides.map(row => "guides/" + row.id)];
for (const route of routes) await write(path.join(route, "index.html"), html);
for (const name of ["site.css", "strategy.js", "attack-speed.js", "site.js", "draft/index.html"]) {
  let code = prefix(await readFile("app/" + name, "utf8"));
  if (name === "site.js") {
    code = code.replace("location.pathname.replace", 'location.pathname.slice(' + base.length + ').replace');
    code = code.replace('fetch("' + base + '/data/" + key)', 'fetch("' + base + '/data/" + key + ".json")');
    code = code.replace('const section = area ? "/" + area : "/";', 'const section = ' + JSON.stringify(base) + ' + (area ? "/" + area : "/");');
    code = code.replace('return source;', 'return ' + JSON.stringify(base) + ' + source;');
    code = code.replace('escape(href) +', 'escape(href.startsWith("/") && !href.startsWith(' + JSON.stringify(base + "/") + ') ? ' + JSON.stringify(base) + ' + href : href) +');
  }
  if (name === "strategy.js") code = code.replace(' + parent +', ' + ' + JSON.stringify(base) + ' + parent +');
  await write(name, code);
}
const worker = await readFile("dist/server/index.js", "utf8");
const firstLine = worker.slice(0, worker.indexOf("\n"));
const bundled = JSON.parse(firstLine.slice("const assets = ".length, -1));
await write("boot.js", bundled["boot.js"]);
for (const [key, value] of Object.entries(data)) {
  if (key === "community" || key.startsWith("tier/")) continue;
  await write("data/" + key + ".json", JSON.stringify({ data: value, source: "snapshot", checkedAt: snapshot.checkedAt }));
}
await write(".nojekyll", "");
