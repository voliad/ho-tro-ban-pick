const origin = "https://atgacademy.noxaov.vn";
const list = value => Array.isArray(value) ? value : [];
const pick = (value, names) => Object.fromEntries(names.split(" ").map(name => [name, value?.[name]]));

function hero(item) {
  return {
    ...pick(item, "id slug name avatarUrl backgroundImageUrl banPickScore generalPoint rankPoint esportPoint heroClass"),
    roles: list(item.roles), classes: list(item.classes), attributes: list(item.attributes),
  };
}

function tier(item, full) {
  const result = {
    ...pick(item, "id title description updatedAt createdAt creatorName isOfficial communityRating totalRatings"),
    columns: list(item.contentData?.columns).map(column => column.label),
    preview: list(item.previewTiers).map(row => ({ label: row.label, heroes: list(row.heroes).slice(0, 6).map(hero) })),
  };
  const rows = list(item.contentData?.rows);
  result.heroCount = new Set(rows.flatMap(row => list(row.cells).flatMap(cell => list(cell).map(h => h.id)))).size;
  if (full) result.rows = rows.map(row => ({ label: row.label, cells: list(row.cells).map(cell => list(cell).map(hero)) }));
  return result;
}

function guide(item, full) {
  const summary = {
    ...pick(item, "id title guideType lane category excerpt coverImageUrl readingTimeMinutes createdAt updatedAt publishedAt heroName"),
    creatorName: item.authorName ?? item.author?.name ?? "",
    hero: item.hero ? hero(item.hero) : null,
  };
  if (!full) return summary;
  const build = item.build ?? {};
  return {
    ...summary,
    build: {
      boot: pick(build.boot, "itemName iconUrl"), majorItems: list(build.majorItems).map(i => pick(i, "itemName iconUrl")),
      spell: pick(build.spell, "name iconUrl"), arcanas: list(build.arcanas).map(i => pick(i, "name iconUrl quantity")),
      enchantments: list(build.enchantments).map(i => pick(i, "name iconUrl quantity")), skillOrder: build.skillOrder,
    },
    sections: list(item.contentData?.blocks).map(i => pick(i, "type title text content url caption imageUrl videoUrl")),
  };
}

const team = item => pick(item, "id teamCode teamName logoUrl region score gameWins gameLosses matchWins matchLosses");
const statHero = item => pick(item, "heroId heroName heroAvatarUrl heroIconUrl pickCount pickWinRate banCount banRate presenceCount bluePickCount redPickCount blueBanCount redBanCount");
const esports = item => ({
  summary: pick(item.summary, "totalMatches totalGames blueSideWinRate"),
  side: pick(item.sideAdvantage, "blueWins redWins blueWinRate redWinRate"),
  heroes: list(item.heroStats).map(statHero),
  teams: list(item.teamStats).map(t => pick(t,"teamCode teamName logoUrl region rating matchCount matchWins matchLosses gameCount gameWins gameLosses gameWinRate")),
});
const reference = item => pick(item, "id name slug iconUrl imageUrl description cooldown branch category level");

export const standardKeys = ["meta", "community", "guides", "heroes", "teams", "esports", "tournaments", "spells", "enchantments"];

function target(key) {
  const fixed = {
    meta: ["/api/tier-lists/official", data => tier(data, true)],
    community: ["/api/tier-lists/community/all", data => list(data).map(item => tier(item, false))],
    guides: ["/api/guides?status=PUBLISHED&sort=newest", data => list(data).filter(i => i.status === "PUBLISHED")
      .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
      .map(i => guide(i, false))],
    heroes: ["/api/wiki/heroes", data => list(data).map(hero)],
    teams: ["/api/esports/teams", data => list(data).map(team)],
    esports: ["/api/esports/data/dashboard", esports],
    tournaments: ["/api/esports/data/tournaments", data => list(data).map(t => pick(t, "tournamentId tournamentName franchiseCode"))],
    spells: ["/api/spells", data => list(data).map(reference)],
    enchantments: ["/api/enchantments", data => list(data).map(reference)],
  };
  if (Object.hasOwn(fixed, key)) return fixed[key];
  const match = /^(tier|guide|esports)\/([1-9]\d{0,8})$/.exec(key);
  if (!match) return null;
  const [, kind, id] = match;
  if (kind === "tier") return ["/api/tier-lists/" + id, data => tier(data, true)];
  if (kind === "guide") return ["/api/guides/" + id, data => {
    if (data.status !== "PUBLISHED") throw Error("Guide is not public");
    return guide(data, true);
  }];
  return ["/api/esports/data/dashboard?tournamentId=" + id, esports];
}

export function accepts(key) { return Boolean(target(key)); }

export async function sourceData(key) {
  const entry = target(key);
  if (!entry) throw Error("Unknown source");
  const [path, shape] = entry;
  const response = await fetch(origin + path, {
    headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(7000),
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) throw Error("Upstream HTTP " + response.status);
  const json = await response.json();
  return shape(json?.data ?? json);
}

