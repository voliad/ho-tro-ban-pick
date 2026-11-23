(() => {
  "use strict";

  const rules = window.DRAFT_RULES;
  const roster = (window.DRAFT_HEROES ?? []).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const heroesById = new Map(roster.map(hero => [hero.id, hero]));
  const lanePools = window.AOV_LANE_POOLS;
  const $ = id => document.getElementById(id);
  const isRank = new URLSearchParams(location.search).get("mode") === "rank";
  const storeKey = isRank ? "aov-rank-draft-v1" : "aov-draft-desk-v1";
  const perspectiveKey = storeKey + "-perspective";
  const sideLabel = { blue: "Xanh", red: "Đỏ" };
  const actionLabel = { ban: "cấm", pick: "chọn" };
  const allowedViews = ["draft", "history", "rules"];
  const form = $("settings-form");
  const input = name => form.elements.namedItem(name);
  const nameOf = team => rules.nameOf(state.settings, team);
  const heroLabel = hero => hero.variant ? hero.name + " " + hero.variant : hero.name;
  const nameFor = id => heroesById.has(id) ? heroLabel(heroesById.get(id)) : id;
  const norm = value => value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d");
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });

  let state = isRank ? rules.start({ ...structuredClone(rules.defaults), format: 1, mode: "rank", alternate: false }) : rules.start();
  let clock = initialClock();
  let selection = [];
  let role = "";
  let lane = "";
  let restrictions = new Set();
  let dialogReturn;
  let storageIssue = "";

  function initialClock() {
    return { remaining: state.settings.seconds * 1000, deadline: null };
  }

  function applyPerspective(side) {
    const left = side === "red" ? "red" : "blue";
    const right = left === "red" ? "blue" : "red";
    const view = $("view-draft");
    view.dataset.perspective = left;
    $("draft-perspective").value = left;
    const pool = view.querySelector(".pool");
    pool.before($("team-" + left));
    pool.after($("team-" + right));
    const status = view.querySelector(".turn-status");
    status.before($("match-" + left).parentElement);
    status.after($("match-" + right).parentElement);
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
      if (!saved) return;
      if (!saved.state?.games?.length || !saved.state.settings) throw Error("invalid state");
      state = saved.state;
      if (isRank && state.games[0].skipBansFrom === undefined && state.games[0].turns[0]?.ids.length === 1) {
        const game = state.games[0];
        const bans = game.turns.filter(entry => entry.kind === "ban");
        if (bans.length === 10) {
          game.turns = ["blue", "red"].map(side => ({
            kind: "ban", side, ids: bans.filter(entry => entry.side === side).flatMap(entry => entry.ids),
          })).concat(game.turns.filter(entry => entry.kind === "pick"));
          delete state.settings.legacyRankBans;
        } else {
          state.settings.legacyRankBans = true;
        }
      }
      clock = saved.clock ?? initialClock();
    } catch {
      storageIssue = "Không thể đọc dữ liệu lưu trên trình duyệt. Bàn draft đã mở ở trạng thái mặc định.";
    }
  }

  function save() {
    try {
      localStorage.setItem(storeKey, JSON.stringify({ state, clock }));
    } catch {
      storageIssue = "Trình duyệt chưa lưu được series này. Hãy xuất JSON để giữ lại dữ liệu.";
    }
  }

  function tell(message) {
    $("notice").textContent = [message, storageIssue].filter(Boolean).join(" ");
  }

  function route() {
    const [hash, raw] = location.hash.slice(1).split("?", 2);
    const params = new URLSearchParams(raw);
    return { view: allowedViews.includes(hash) ? hash : "draft", params };
  }

  function renderRoute() {
    const { view, params } = route();
    for (const page of allowedViews) {
      $("view-" + page).hidden = page !== view;
      const link = document.querySelector('a[data-view="' + page + '"]');
      if (page === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    if (view === "draft") {
      $("search").value = params.get("q") || "";
      $("available").checked = params.get("available") === "1";
      role = rules.roles.has(Number(params.get("role"))) ? params.get("role") : "";
      lane = Object.hasOwn(lanePools, params.get("lane")) ? params.get("lane") : "";

    }
    render();
  }

  function saveFilters() {
    const params = new URLSearchParams();
    if ($("search").value) params.set("q", $("search").value);
    if (role) params.set("role", role);
    if (lane) params.set("lane", lane);
    if ($("available").checked) params.set("available", "1");
    const query = params.toString();
    history.replaceState(null, "", "#draft" + (query ? "?" + query : ""));
  }

  function portrait(hero, loading = "lazy") {
    const mark = '<span class="image-fallback" aria-hidden="true">' + escapeHtml(hero.name[0]) + '</span>';
    if (!hero?.image) return mark;
    return mark + '<img src="' + escapeHtml(hero.image) + '" width="200" height="200" alt="" loading="' + loading + '" decoding="async">';
  }

  function slot(id, index, current, concealed) {
    if (concealed) return '<li class="slot concealed"><span class="slot-index" aria-hidden="true">◆</span><span class="slot-label">Đã ẩn</span></li>';
    if (!id) {
      return '<li class="slot empty' + (current ? " current" : "") + '"><span class="slot-index">' +
        String(index + 1).padStart(2, "0") + '</span><span class="slot-label">Chưa có tướng</span></li>';
    }
    const hero = heroesById.get(id);
    const name = escapeHtml(nameFor(id));
    return '<li class="slot filled' + (current ? " current" : "") + '" title="' + name + '"><span class="slot-art">' +
      (hero ? portrait(hero, "eager") : "") + '</span><span class="slot-label">' + name + '</span></li>';
  }

  function renderTeam(game, side, turn, hiddenDraft) {
    const team = rules.onSide(game, side);
    const active = turn?.side === side;
    const settings = state.settings;
    const hidePicks = hiddenDraft && Boolean(turn) && !active;
    const teamName = escapeHtml(nameOf(team));
    const committed = game.turns.filter(row => row.side === side);
    const groups = hiddenDraft ? ["pick"] : ["ban", "pick"];
    const slots = groups.map(kind => {
      const count = kind === "ban" && !isRank ? 4 : 5;
      const ids = committed.filter(row => row.kind === kind).flatMap(row => row.ids);
      const concealed = hidePicks && kind === "pick" && ids.length > 0;
      const highlight = active && turn.kind === kind;
      const visibleSelected = highlight ? selection : [];
      const items = Array.from({ length: count }, (_, i) => {
        const current = highlight && i >= ids.length && i < ids.length + turn.count;
        return slot(ids[i] ?? visibleSelected[i - ids.length], i, current, concealed);
      });
      return '<div class="slot-group ' + kind + '"><div class="slot-head"><h3>' +
        (kind === "ban" ? "Lượt cấm" : "Lượt chọn") + '</h3><span>' + ids.length + '/' + count +
        '</span></div><ol class="slot-list">' + items.join("") + '</ol></div>';
    }).join("");
    const used = rules.usedBy(state, team).size;
    $("team-" + side).innerHTML = '<div class="team-head' + (active ? " active-side" : "") +
      '"><div><span>Bên ' + sideLabel[side].toLowerCase() + '</span><h2>' + teamName +
      '</h2></div><span class="side-icon" aria-hidden="true"></span></div>' + slots +
      '<p class="team-foot">' + (settings.mode === "global" ? used + " tướng đã dùng" : "Kho tướng theo từng ván") + '</p>';
  }

  let featuredHeroes = new Map();

  function renderRoster(turn = rules.activeTurn(state)) {
    const keyword = norm($("search").value.trim());
    const onlyAvailable = $("available").checked;
    const reasonFor = rules.eligibility(state, turn, true);
    const pool = lanePools[lane];
    const rosterFiltered = roster.filter(hero => {
      return (!role || hero.roles.includes(Number(role))) && norm(heroLabel(hero)).includes(keyword)
        && (!pool || pool.main.has(hero.id) || pool.extra.has(hero.id))
        && (!onlyAvailable || !turn || !reasonFor(hero.id));
    });
    const roleOptions = [["", "Tất cả"], ...rules.roles];
    for (const button of $("lane-filter").children) {
      button.setAttribute("aria-pressed", button.dataset.lane === lane);
    }
    $("roles").innerHTML = roleOptions.map(([id, label]) => {
      return '<button type="button" data-role="' + id + '" aria-pressed="' + (String(id) === role) +
        '">' + label + '</button>';
    }).join("");
    $("pool-count").textContent = rosterFiltered.length === roster.length
      ? roster.length + " mục tướng"
      : rosterFiltered.length + " / " + roster.length + " mục tướng";
    const grid = $("heroes");
    const scrollTop = grid.scrollTop;
    const hadFocus = document.activeElement?.dataset.hero;
    if (!roster.length) {
      grid.innerHTML = '<p class="pool-empty">Không tải được danh mục tướng. Hãy tải lại trang.</p>';
    } else if (!rosterFiltered.length) {
      grid.innerHTML = '<p class="pool-empty">Không có tướng phù hợp. Thử đổi bộ lọc hoặc từ khóa.</p>';
    } else {
      const tile = hero => {
        const reason = reasonFor(hero.id);
        const selected = selection.includes(hero.id);
        const recommendation = !reason && featuredHeroes.get(hero.id);
        const status = reason && turn ? '<span class="hero-status" aria-hidden="true">×</span>' :
          recommendation ? '<span class="hero-recommendation" aria-hidden="true">' + recommendation + '</span>' : "";
        const roles = hero.roles.map(id => rules.roles.get(id)).filter(Boolean).join(", ");
        const label = [heroLabel(hero), hero.variant ? "" : roles, turn && reason,
          recommendation && "Gợi ý " + recommendation].filter(Boolean).join(", ");
        return '<button type="button" class="hero-tile' + (reason && turn ? " unavailable" : "") +
          (recommendation ? " recommended" : "") +
          '" data-hero="' + escapeHtml(hero.id) + '" aria-label="' + escapeHtml(label) +
          '" title="' + escapeHtml(label) + '" aria-pressed="' + selected + '" aria-disabled="' + Boolean(reason) +
          '"><span class="hero-art">' + portrait(hero) + status + '</span><span class="hero-name">' +
          escapeHtml(heroLabel(hero)) + '</span></button>';
      };
      if (pool) {
        grid.innerHTML = [[pool.main, "Tướng chính"], [pool.extra, "Tướng bổ sung cho đường"]].map(([ids, title]) => {
          const heroes = rosterFiltered.filter(hero => ids.has(hero.id));
          return heroes.length ? '<h3 class="hero-group-heading">' + title + ' <span>' + heroes.length +
            '</span></h3>' + heroes.map(tile).join("") : "";
        }).join("");
      } else {
        grid.innerHTML = rosterFiltered.map(tile).join("");
      }
    }
    grid.scrollTop = scrollTop;
    if (hadFocus) grid.querySelector('[data-hero="' + CSS.escape(hadFocus) + '"]')?.focus({ preventScroll: true });
  }

  const laneCounterRows = Object.entries(window.DRAFT_COUNTERS.lanes).flatMap(([lane, heroes]) => {
    const targets = new Set(Object.keys(heroes));
    for (const pairs of Object.values(heroes)) for (const id of pairs.flat()) targets.add(id);
    if (lane === "Trợ thủ") for (const id of Object.keys(window.DRAFT_COUNTERS.mechanics)) targets.add(id);
    return [...targets].map(target => {
      const direct = heroes[target] ?? [[], []];
      const pairs = direct.map(ids => [...ids]);
      const reverse = [new Set(), new Set()];
      for (const [other, [good, bad]] of Object.entries(heroes)) {
        if (good.includes(target)) reverse[1].add(other);
        if (bad.includes(target)) reverse[0].add(other);
      }
      for (const [index, matches] of reverse.entries()) {
        for (const id of matches) {
          if (!direct.some(ids => ids.includes(id)) && !reverse[1 - index].has(id)) pairs[index].push(id);
        }
      }
      const tips = lane === "Trợ thủ" ? window.DRAFT_COUNTERS.mechanics[target] ?? {} : {};
      for (const id of Object.keys(tips)) if (!pairs.some(ids => ids.includes(id))) pairs[0].push(id);
      return { lane, target, pairs, direct, tips, key: lane + "|" + target };
    }).sort((a, b) => nameFor(a.target).localeCompare(nameFor(b.target), "vi"));
  });
  const tactics = window.DRAFT_COUNTER_TACTICS;
  const referenceRows = roster.filter(({ id }) => Object.hasOwn(tactics, id)).map(({ id }) => {
    const tips = tactics[id];
    return { target: id, lane: "Tham khảo chung", key: "reference|" + id,
      pairs: [Object.keys(tips), []], direct: [[], []], tips, tactical: true };
  });
  const counterRows = [...laneCounterRows, ...referenceRows];

  function missingLanes(ids) {
    const positions = Object.entries(lanePools);
    // Keep the best assignment for each set of occupied lanes.
    let assignments = new Map([[0, 0]]);
    for (const id of ids) {
      const next = new Map(assignments);
      for (const [mask, score] of assignments) {
        for (const [index, [, pool]] of positions.entries()) {
          const bit = 1 << index;
          if (mask & bit || !(pool.main.has(id) || pool.extra.has(id))) continue;
          const value = score + (pool.main.has(id) ? 7 : 6);
          next.set(mask | bit, Math.max(next.get(mask | bit) ?? 0, value));
        }
      }
      assignments = next;
    }
    const best = Math.max(...assignments.values());
    return positions.filter((_, index) => [...assignments].some(([mask, score]) =>
      score === best && !(mask & (1 << index)))).map(([key]) => key);
  }

  let scannedDraft = null;
  document.addEventListener("draft-scan", event => {
    scannedDraft = event.detail;
    renderDraft();
  });

  function renderCounters(game, turn, hidden) {
    const expanded = $("counter-results").querySelector("details")?.open;
    const selectedTarget = $("counter-target").value;
    const scanned = scannedDraft !== null;
    const observed = (scannedDraft ?? []).filter(row => row.confirmed);
    const observedPicks = side => [...new Set(observed.filter(row => row.kind === "pick" && row.side === side).map(row => row.id))];
    const active = scanned ? observed.some(row => row.kind === "pick") : turn?.kind === "pick";
    const opponents = new Set(scanned ? observedPicks("red") : !turn || hidden ? [] : game.turns
      .filter(entry => entry.kind === "pick" && entry.side !== turn.side).flatMap(entry => entry.ids));
    const rows = counterRows.filter(row => selectedTarget ? row.key === selectedTarget : opponents.has(row.target));
    const unavailableIds = new Set(observed.map(row => rules.heroKey(state.settings, row.id)));
    const reason = scanned ? id => unavailableIds.has(rules.heroKey(state.settings, id)) : rules.eligibility(state, turn, true);
    const candidates = new Map();
    for (const row of rows) {
      for (const [index, ids] of row.pairs.entries()) {
        for (const id of ids) {
          if (row.tactical && !selectedTarget && rows.some(other =>
            !other.tactical && other.target === row.target && other.pairs.some(picks => picks.includes(id)))) continue;
          if (!candidates.has(id)) candidates.set(id, { id, good: new Map(), bad: new Map(), verified: new Set(), mixed: new Map() });
          if (!row.tactical && index === 0) candidates.get(id).verified.add(row.target);
          const matchups = index === 0 ? candidates.get(id).good : candidates.get(id).bad;
          const lanes = matchups.get(row.target) ?? [];
          const source = row.direct[index].includes(id) ? "Qzadd" :
            row.tips[id] && index === 0 ? "theo cơ chế" : "tra chéo";
          lanes.push(row.lane + " · " + source);
          matchups.set(row.target, lanes);
        }
      }
    }
    for (const entry of candidates.values()) {
      for (const [target, lanes] of entry.good) {
        if (!entry.bad.has(target)) continue;
        entry.mixed.set(target, [...new Set([...lanes, ...entry.bad.get(target)])]);
        entry.good.delete(target);
        entry.bad.delete(target);
        entry.verified.delete(target);
      }
    }
    const picks = scanned ? observedPicks("blue") : active ? game.turns.filter(row => row.kind === "pick" && row.side === turn.side)
      .flatMap(row => row.ids) : [];
    const needed = active ? (lane ? [lane] : picks.length ? missingLanes(picks) : []) : [];
    const fits = (id, position) => lanePools[position].main.has(id) || lanePools[position].extra.has(id);
    const allies = new Set(picks);
    const combosByHero = new Map();
    const completeCombos = [];
    for (const combo of window.DRAFT_TEAM_COMBOS) {
      const ids = Object.keys(combo.heroes);
      const missing = ids.filter(id => !allies.has(id));
      const joined = ids.length - missing.length;
      if (!joined || missing.some(id => reason(id)) || missing.length > 5 - picks.length) continue;
      const threats = (combo.threats ?? []).filter(id => opponents.has(id));
      if (!missing.length) completeCombos.push(combo);
      for (const id of missing) {
        if (needed.length && !needed.includes(combo.heroes[id])) continue;
        const complete = missing.length === 1;
        const points = (complete ? 2 : 1) - (threats.length ? 1 : 0);
        const current = combosByHero.get(id);
        if (!current || current.points < points || current.points === points && complete && !current.complete) {
          combosByHero.set(id, { combo, points, complete });
        }
        if (!candidates.has(id)) candidates.set(id, { id, good: new Map(), bad: new Map(), mixed: new Map(), verified: new Set() });
      }
    }
    const recommendations = needed.length ? roster.filter(({ id }) =>
      !reason(id) && needed.some(position => fits(id, position))).map(({ id }) =>
      candidates.get(id) ?? { id, good: new Map(), bad: new Map(), mixed: new Map(), verified: new Set() }) :
      [...candidates.values()].filter(entry => (entry.good.size || entry.mixed.size || combosByHero.has(entry.id)) &&
        (!turn || !reason(entry.id)));
    const subset = (left, right) => [...left.keys()].every(id => right.has(id));
    const dominates = (a, b) => subset(b.good, a.good) && subset(a.bad, b.bad) &&
      subset(a.mixed, b.mixed) && (a.good.size > b.good.size || a.bad.size < b.bad.size || a.mixed.size < b.mixed.size);
    const dominated = new Set(recommendations.filter(entry =>
      recommendations.some(other => dominates(other, entry))));
    const { board, tierFor } = window.QZADD_TIERS;
    const evidenceLanes = labels => [...new Set(labels.map(label => label.split(" · ")[0]))]
      .filter(lane => Object.hasOwn(board, lane));
    for (const entry of recommendations) {
      const fitLanes = needed.filter(position => fits(entry.id, position));
      entry.tier = tierFor(entry.id, fitLanes.length ? fitLanes :
        evidenceLanes([...entry.good.values(), ...entry.mixed.values()].flat()));
      entry.fitLanes = fitLanes;
      entry.threats = new Map([...entry.bad].map(([target, labels]) =>
        [target, tierFor(target, evidenceLanes(labels))]));
      const risk = [...entry.threats.values()].reduce((total, tier) => total + 3 + (tier?.weight ?? 0), 0);
      entry.score = 2 * entry.good.size - risk + (entry.tier?.weight ?? 0) + (combosByHero.get(entry.id)?.points ?? 0);
    }
    recommendations.sort((a, b) => b.score - a.score ||
      Number(dominated.has(a)) - Number(dominated.has(b)) ||
      a.bad.size - b.bad.size || a.mixed.size - b.mixed.size ||
      b.verified.size - a.verified.size || b.good.size - a.good.size || nameFor(a.id).localeCompare(nameFor(b.id), "vi"));
    const evidence = map => [...map].map(([target, lanes]) => nameFor(target) + " (" + lanes.join(", ") + ")").join(", ");
    const comboName = combo => Object.keys(combo.heroes).map(nameFor).join(" + ");
    const comboWarning = combo => {
      const threats = (combo.threats ?? []).filter(id => opponents.has(id)).map(nameFor);
      return threats.length ? '<br><span class="counter-risk">Đối thủ có ' +
        escapeHtml(threats.join(", ")) + ' · Giảm ưu tiên bài này.</span>' : "";
    };
    const tierLabel = tier => tier.tier === "Draft" ? "Theo đội hình" : tier.tier;
    const riskDetails = ({ bad, threats }) => [...bad].map(([target, labels]) => {
      const threat = threats.get(target);
      const level = threat?.weight > 0 ? "counter-threat-high" : threat?.weight < 0 ? "counter-threat-low" : "";
      return '<span class="' + level + '" title="' + escapeHtml(labels.join(", ")) + '">' +
        escapeHtml(nameFor(target)) + (threat ? ' · ' + tierLabel(threat) + ' ' + threat.lane : "") + '</span>';
    }).join(", ");
    featuredHeroes = new Map(active && !scanned ? recommendations.slice(0, 3).map(({ id }, index) => [id, index + 1]) : []);
    const cards = recommendations.map((entry, index) => {
      const { id, good, bad, mixed, tier, fitLanes } = entry;
      const synergy = combosByHero.get(id);
      const name = escapeHtml(nameFor(id));
      const featured = index < 3;
      const cardClass = "counter-card" + (featured ? " counter-featured" : "");
      const body = '<span class="counter-avatar">' + portrait(heroesById.get(id)) +
        (featured ? '<span class="counter-rank" aria-hidden="true">' + (index + 1) + '</span>' : "") +
        '</span><span class="counter-copy"><strong>' + name +
        '</strong>' + (tier ? '<span class="counter-tier" data-tier="' + tier.tier + '">' +
          tierLabel(tier) + ' · ' + tier.lane + '</span>' : '') +
        (fitLanes.length ? '<span class="counter-balance">' + fitLanes.map(position => lanePools[position].label).join(" / ") + '</span>' : '') +
        (synergy ? '<span class="counter-synergy"><b>' + (synergy.complete ? "Hoàn thiện bài " : "Ghép bài ") +
          escapeHtml(comboName(synergy.combo)) + '</b><br>' + escapeHtml(synergy.combo.plan) + comboWarning(synergy.combo) + '</span>' : '') +
        '<span class="counter-balance">' + (good.size || bad.size || mixed.size ? good.size + ' thuận · ' + bad.size + ' bất lợi' : 'Chưa có dữ liệu kèo với đối thủ') +
        (mixed.size ? ' · ' + mixed.size + ' trái chiều' : '') + '</span>' +
        (good.size ? '<span>Khắc chế ' + escapeHtml(evidence(good)) + '</span>' : '') +
        rows.filter(row => good.has(row.target) && row.tips[id]).map(row =>
          '<span>' + escapeHtml(row.tips[id]) + '</span>').join("") +
        (bad.size ? '<span class="counter-risk">Bất lợi trước ' + riskDetails(entry) + '</span>' : "") +
        (mixed.size ? '<span class="counter-risk">Kèo trái chiều với ' + escapeHtml(evidence(mixed)) + '</span>' : "") + '</span>';
      return active && !scanned ? '<button type="button" class="' + cardClass + '" data-counter-pick="' + id +
        '" aria-pressed="' + selection.includes(id) + '">' + body +
        '<span class="counter-action">' + (selection.includes(id) ? "Đã chọn" : "Chọn") + '</span></button>' :
        '<div class="' + cardClass + '">' + body + '</div>';
    });
    const status = needed.length ? (lane ? "Đang lọc theo " : "Vị trí đội hình có thể còn thiếu: ") +
      needed.map(position => lanePools[position].label).join(", ") : scanned ? "Nhận diện từ màn hình · bên trái là đội bạn" : selectedTarget ? "Tra cứu kèo đã chọn" :
      combosByHero.size && !opponents.size ? "Gợi ý phối hợp với tướng đồng đội đã chốt" : turn && opponents.size ?
      "Gợi ý cho bên " + sideLabel[turn.side].toLowerCase() + " đang thao tác" : "Chờ đối thủ chốt tướng để gợi ý tự động";
    const unavailable = needed.length ? "Hiện không có tướng khả dụng cho vị trí này." : rows.length ? "Hiện không có tướng khắc chế khả dụng." : opponents.size ?
      "Chưa có dữ liệu cho các tướng đối thủ đã chốt." : "Bạn cũng có thể tra kèo thủ công bên dưới.";
    $("counter-results").innerHTML = '<p class="counter-status">' + escapeHtml(status) + '</p>' +
      completeCombos.map(combo => '<p class="counter-note counter-synergy"><strong>Đã ghép ' +
        escapeHtml(comboName(combo)) + '</strong>. ' + escapeHtml(combo.plan) + comboWarning(combo) + '</p>').join("") +
      (cards.length ? '<div class="counter-cards">' + cards.slice(0, 3).join("") + '</div>' :
        '<p class="counter-note">' + unavailable + '</p>') +
      (cards.length > 3 ? '<details class="counter-more"' + (expanded ? ' open' : '') + '><summary>Xem thêm ' + (cards.length - 3) +
        ' gợi ý</summary><div class="counter-cards">' + cards.slice(3).join("") + '</div></details>' : "") +
      (selectedTarget && rows.length ? '<p class="counter-note">Bất lợi khi gặp tướng này: ' +
        escapeHtml(rows[0].pairs[1].map(nameFor).join(", ") || "Chưa có dữ liệu") + '.</p>' : "");
  }

  function renderDraft() {
    const game = state.games.at(-1);
    const number = state.games.length;
    const settings = state.settings;
    const score = rules.score(state);
    const turn = rules.activeTurn(state);
    const winner = rules.seriesWinner(state);
    const hidden = rules.isBlind(settings, number);
    const blue = game.blue;
    const red = rules.opposite(blue);
    $("format-label").textContent = "BO" + settings.format;
    $("mode-label").textContent = isRank ? "Rank thường" : hidden ? "Chọn Ẩn" : settings.mode === "global" ? "Global Ban/Pick" : "Theo từng ván";
    $("match-blue").textContent = nameOf(blue);
    $("match-red").textContent = nameOf(red);
    $("score-blue").textContent = score[blue];
    $("score-red").textContent = score[red];
    $("game-label").textContent = "Ván " + number;
    $("turn-label").textContent = winner ? nameOf(winner) + " thắng series" :
      turn ? sideLabel[turn.side] + (hidden ? " chọn ẩn" : " " + actionLabel[turn.kind] + " tướng") : "Draft đã hoàn tất";
    $("turn-label").dataset.side = turn?.side ?? "";
    $("games").innerHTML = Array.from({ length: settings.format }, (_, i) => {
      const row = state.games[i];
      const current = i === number - 1 && !row.winner;
      const finished = row?.winner;
      const text = "Ván " + (i + 1) + (finished ? ", " + nameOf(row.winner) + " thắng" : current ? ", đang mở" : ", chưa đấu");
      return '<span class="game-step' + (current ? " current" : "") + (finished ? " finished" : "") +
        '" aria-label="' + escapeHtml(text) + '" title="' + escapeHtml(text) + '">' + (i + 1) + '</span>';
    }).join("");
    renderTeam(game, "blue", turn, hidden);
    renderTeam(game, "red", turn, hidden);
    renderCounters(game, turn, hidden);
    renderRoster(turn);

    $("pool-note").textContent = turn
      ? (hidden ? "Chọn đủ 5 tướng. Đội hình được mở khi hai bên đã chốt." :
        "Tướng đã cấm hoặc đã chọn trong ván được khóa trong kho.")
      : "Xem lại các lượt trong Lịch sử.";
    $("selection").textContent = selection.length
      ? selection.map(nameFor).join(", ")
      : turn ? "Chọn " + turn.count + " tướng từ kho" : winner ? "Series đã kết thúc" : "Chờ ghi kết quả ván";
    $("commit").textContent = turn ? (hidden ? "Chốt đội hình" :
      isRank && turn.kind === "ban" && turn.count > 1 ? "Chốt " + turn.count + " tướng cấm" :
        "Xác nhận " + actionLabel[turn.kind]) : "Ghi kết quả";
    $("commit").disabled = winner !== null || Boolean(turn && selection.length !== turn.count);
    $("skip-draft").hidden = turn?.kind !== "ban";
    $("undo").disabled = !(selection.length || number > 1 || game.turns.length || game.winner || game.draftSkipped || game.skipBansFrom !== undefined);
    $("undo").textContent = selection.length ? "Bỏ chọn" : game.winner || !game.draftSkipped && game.skipBansFrom === undefined && !game.turns.length && number > 1 ? "Hoàn tác kết quả" : "Hoàn tác";
    $("timer-toggle").disabled = !turn;
    positionControl();
    renderClock();
  }

  function renderHistory() {
    const score = rules.score(state);
    const winner = rules.seriesWinner(state);
    $("history-summary").textContent = nameOf("A") + " " + score.A + " – " + score.B + " " + nameOf("B") +
      (winner ? " · " + nameOf(winner) + " thắng series" : " · BO" + state.settings.format);
    $("history-games").innerHTML = state.games.map((game, i) => {
      const number = i + 1;
      const blind = rules.isBlind(state.settings, number);
      const concealed = blind && !game.draftSkipped && game.turns.length < 2;
      const sides = ["blue", "red"].map(side => {
        const team = rules.onSide(game, side);
        const format = kind => game.turns.filter(turn => turn.side === side && turn.kind === kind)
          .flatMap(turn => turn.ids).map(id => escapeHtml(nameFor(id))).join(", ") || "—";
        const list = concealed ? '<p>Đội hình đang ẩn</p>' : '<dl>' + (blind ? "" :
          '<div><dt>Cấm</dt><dd>' + format("ban") + '</dd></div>') +
          '<div><dt>Chọn</dt><dd>' + format("pick") + '</dd></div></dl>';
        return '<section class="history-team ' + side + '"><h3>' + escapeHtml(nameOf(team)) + ' / ' +
          sideLabel[side] + '</h3>' + list + '</section>';
      });
      const status = game.winner ? nameOf(game.winner) + " thắng" : game.draftSkipped ? "Đã bỏ qua cấm/chọn" : game.turns.length ? "Chưa ghi kết quả" : "Chưa cấm chọn";
      return '<article class="history-game"><div class="history-head"><h2>Ván ' + number + '</h2><span>' +
        escapeHtml(status) + '</span></div><div class="history-sides">' + sides.join("") + '</div></article>';
    }).join("");
  }

  function render() {
    if (route().view === "history") renderHistory();
    if (route().view === "draft") renderDraft();
  }

  function chooseHero(id) {
    const turn = rules.activeTurn(state);
    if (!turn || !heroesById.has(id)) return;
    const reason = rules.eligibility(state, turn, true)(id);
    if (reason) {
      tell(nameFor(id) + ". " + reason);
      return;
    }
    if (selection.includes(id)) {
      selection = selection.filter(value => value !== id);
    } else {
      if (selection.length === turn.count) {
        tell("Đã đủ tướng cho lượt này. Bỏ một tướng trong lựa chọn để thay thế.");
        return;
      }
      const match = selection.find(value => rules.heroKey(state.settings, value) === rules.heroKey(state.settings, id));
      if (match) selection = selection.filter(value => value !== match);
      selection.push(id);
    }
    tell("");
    renderDraft();
  }

  function remaining() {
    return clock.deadline === null ? clock.remaining : Math.max(0, clock.deadline - Date.now());
  }

  function renderClock() {
    const value = Math.ceil(remaining() / 1000);
    const minutes = String(Math.floor(value / 60)).padStart(2, "0");
    const seconds = String(value % 60).padStart(2, "0");
    $("timer-display").textContent = minutes + ":" + seconds;
    $("timer-display").classList.toggle("urgent", value <= 5 && Boolean(rules.activeTurn(state)));
    $("timer-toggle").textContent = clock.deadline !== null ? "Tạm dừng" : value === 0 ? "Đặt lại" :
      value < state.settings.seconds ? "Tiếp tục" : "Bắt đầu";
  }

  function toggleClock() {
    if (!rules.activeTurn(state)) return;
    const value = remaining();
    if (clock.deadline !== null) clock = { remaining: value, deadline: null };
    else if (value === 0) clock = initialClock();
    else clock.deadline = Date.now() + value;
    save();
    renderClock();
  }

  function tick() {
    if (clock.deadline !== null && remaining() === 0) {
      clock = { remaining: 0, deadline: null };
      save();
      tell("Hết giờ lượt. Trọng tài có thể xác nhận hoặc đặt lại đồng hồ.");
    }
    if (clock.deadline !== null || clock.remaining === 0) renderClock();
  }

  function commit() {
    const turn = rules.activeTurn(state);
    if (!turn) {
      if (!rules.seriesWinner(state)) openResult();
      return;
    }
    if (!rules.recordTurn(state, selection)) {
      tell("Đội hình chưa hợp lệ. Hãy kiểm tra lựa chọn và quy định trùng tướng.");
      return;
    }
    selection = [];
    clock = initialClock();
    save();
    tell("");
    renderDraft();
  }

  function skipDraft() {
    if (rules.activeTurn(state)?.kind !== "ban") return;
    const game = state.games.at(-1);
    game.skipBansFrom = game.turns.length;
    selection = [];
    clock = initialClock();
    save();
    tell("Đã bỏ qua các lượt cấm còn lại. Tiếp tục chọn tướng.");
    renderDraft();
    $("search").focus({ preventScroll: true });
  }

  function undo() {
    if (selection.length) {
      selection = [];
      tell("");
    } else {
      const action = rules.undo(state);
      if (!action) return;
      clock = initialClock();
      save();
      tell(action === "result" ? "Đã mở lại kết quả của ván trước." : action === "skip" ? "Đã mở lại các lượt cấm." : "Đã hoàn tác lượt vừa chốt.");
    }
    renderDraft();
  }

  function positionControl() {
    const game = state.games.at(-1);
    const enabled = !game.winner && !game.draftSkipped && game.skipBansFrom === undefined && !game.turns.length && !selection.length;
    $("swap").disabled = !enabled;
  }

  function swap() {
    const game = state.games.at(-1);
    if (game.winner || game.draftSkipped || game.skipBansFrom !== undefined || game.turns.length || selection.length) return;
    game.blue = rules.opposite(game.blue);
    if (state.games.length === 1) state.settings.firstBlue = game.blue;
    save();
    tell("Đã đổi bên cho ván " + state.games.length + ".");
    renderDraft();
  }

  function openResult() {
    const dialog = $("result-dialog");
    if (dialog.open) return;
    const game = state.games.at(-1);
    $("result-title").textContent = "Đội thắng ván " + state.games.length;
    $("result-blue").textContent = nameOf(game.blue);
    $("result-red").textContent = nameOf(rules.opposite(game.blue));
    dialog.showModal();
  }

  function result(side) {
    const game = state.games.at(-1);
    if (!rules.recordWinner(state, rules.onSide(game, side))) return;
    $("result-dialog").close();
    clock = initialClock();
    save();
    tell("Đã ghi kết quả ván.");
    renderDraft();
  }

  function renderRestrictions() {
    const q = norm($("restrictions-search").value.trim());
    const candidates = q ? roster.filter(hero => norm(heroLabel(hero)).includes(q)) : roster.filter(hero => restrictions.has(hero.id));
    const canEdit = !state.games.at(-1).turns.length && !state.games.at(-1).winner;
    $("restrictions-list").innerHTML = candidates.length ? candidates.map(hero =>
      '<label><input type="checkbox" data-restrict="' + escapeHtml(hero.id) + '"' +
      (restrictions.has(hero.id) ? " checked" : "") + (canEdit ? "" : " disabled") + '> ' +
      escapeHtml(heroLabel(hero)) + '</label>').join("") :
      '<p>' + (q ? "Không tìm thấy tướng." : "Chưa có tướng bị cấm bởi BTC.") + '</p>';
  }

  function syncSettingsFields() {
    $("final-settings").hidden = Number(input("format").value) !== 7;
    $("mirror-setting").hidden = input("final").value !== "blind";
  }

  function openSettings() {
    const { settings, games } = state;
    const locked = games.length > 1 || games[0].turns.length > 0;
    for (const key of ["teamA", "teamB", "format", "mode", "firstBlue", "alternate", "seconds", "final", "groupFlowborn"]) {
      const value = settings[key];
      input(key).value = typeof value === "boolean" ? (value ? "yes" : "no") : value;
      input(key).disabled = (isRank && ["format", "mode", "alternate"].includes(key)) ||
        (locked && !["teamA", "teamB", "seconds"].includes(key));
    }
    input("mirrors").checked = settings.mirrors;
    input("mirrors").disabled = locked;
    restrictions = new Set(settings.restricted);
    $("restrictions-search").value = "";
    $("settings-note").textContent = locked
      ? "Có thể đổi tên đội và đồng hồ. Tướng cấm của BTC được chỉnh trước lượt đầu của mỗi ván."
      : "Thiết lập luật series trước lượt đầu tiên.";
    syncSettingsFields();
    renderRestrictions();
    $("settings-dialog").showModal();
  }

  function saveSettings(event) {
    event.preventDefault();
    const teamA = input("teamA").value.trim();
    const teamB = input("teamB").value.trim();
    if (!teamA || !teamB || norm(teamA) === norm(teamB)) {
      $("settings-note").textContent = "Nhập hai tên đội khác nhau.";
      input(!teamA ? "teamA" : "teamB").focus();
      return;
    }
    const settings = state.settings;
    const firstGameOpen = state.games.length === 1 && !state.games[0].turns.length;
    const current = state.games.at(-1);
    const seconds = Number(input("seconds").value);
    const updateClock = seconds !== settings.seconds;
    const canEditRestrictions = !current.turns.length && !current.winner;
    Object.assign(settings, {
      teamA, teamB, seconds,
      format: Number(input("format").value), mode: input("mode").value, firstBlue: input("firstBlue").value,
      alternate: input("alternate").value === "yes", final: input("final").value, mirrors: input("mirrors").checked,
      groupFlowborn: input("groupFlowborn").value === "yes",
      restricted: canEditRestrictions ? [...restrictions] : settings.restricted,
    });
    if (firstGameOpen) state.games[0].blue = settings.firstBlue;
    if (updateClock) clock = initialClock();
    selection = [];
    save();
    $("settings-dialog").close();
    tell("Đã lưu thiết lập.");
    render();
  }

  function openRestart() {
    dialogReturn = document.activeElement;
    $("confirm-dialog").returnValue = "";
    $("confirm-dialog").showModal();
  }

  function restart() {
    if ($("confirm-dialog").returnValue !== "confirm") {
      dialogReturn?.focus();
      return;
    }
    state = rules.start(structuredClone(state.settings));
    delete state.settings.legacyRankBans;
    selection = [];
    clock = initialClock();
    save();
    $("settings-dialog").close();
    location.hash = "draft";
    tell("Đã làm mới bàn cấm chọn.");
    renderRoute();
  }

  function exportSeries() {
    const copy = structuredClone(state);
    const game = copy.games.at(-1);
    if (rules.isBlind(copy.settings, copy.games.length) && !game.draftSkipped && game.turns.length < 2) {
      game.turns = [];
      game.hiddenDraftInProgress = true;
    }
    const data = { version: 1, exportedAt: new Date().toISOString(), ...copy };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "draft-desk-series.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("heroes").addEventListener("click", event => {
    const button = event.target.closest("[data-hero]");
    if (button) chooseHero(button.dataset.hero);
  });
  document.addEventListener("error", event => {
    if (event.target instanceof HTMLImageElement) event.target.hidden = true;
  }, true);
  $("roles").addEventListener("click", event => {
    const button = event.target.closest("[data-role]");
    if (!button) return;
    role = button.dataset.role;
    saveFilters();
    $("heroes").scrollTop = 0;
    renderRoster();
    $("roles").querySelector('[data-role="' + role + '"]')?.focus({ preventScroll: true });
  });
  const laneFilter = $("lane-filter");
  const laneOptions = [["", "Mọi đường"], ...Object.entries(lanePools).map(([key, { label }]) => [key, label])];
  laneFilter.innerHTML = laneOptions.map(([key, label]) =>
    '<button type="button" data-lane="' + escapeHtml(key) + '" aria-pressed="false">' + escapeHtml(label) + '</button>').join("");
  laneFilter.addEventListener("click", event => {
    const button = event.target.closest("[data-lane]");
    if (!button) return;
    lane = button.dataset.lane;
    saveFilters();
    $("heroes").scrollTop = 0;
    renderDraft();
  });
  for (const id of ["search", "available"]) {
    $(id).addEventListener("input", () => {
      saveFilters();
      $("heroes").scrollTop = 0;
      renderRoster();
    });
  }
  for (const [id, run] of Object.entries({
    "timer-toggle": toggleClock, commit, undo, swap, settings: openSettings,
    export: exportSeries, "skip-draft": skipDraft, restart: openRestart, "reset-draft": openRestart,
    "result-blue": () => result("blue"), "result-red": () => result("red"),
  })) {
    $(id).addEventListener("click", run);
  }
  window.addEventListener("hashchange", renderRoute);
  form.addEventListener("submit", saveSettings);
  form.addEventListener("change", event => {
    if (event.target === input("format") || event.target === input("final")) syncSettingsFields();
    if (event.target.dataset.restrict) {
      if (event.target.checked) restrictions.add(event.target.dataset.restrict);
      else restrictions.delete(event.target.dataset.restrict);
      if (!$("restrictions-search").value.trim()) renderRestrictions();
    }
  });
  $("restrictions-search").addEventListener("input", renderRestrictions);
  $("confirm-dialog").addEventListener("close", restart);
  for (const button of document.querySelectorAll("[data-close]")) {
    button.addEventListener("click", () => $(button.dataset.close).close());
  }

  $("counter-target").innerHTML = '<option value="">Tự động theo lượt chọn của đối thủ</option>' +
    [...Object.keys(window.DRAFT_COUNTERS.lanes), "Tham khảo chung"].map(lane => '<optgroup label="' + escapeHtml(lane) + '">' +
      counterRows.filter(row => row.lane === lane).map(row => '<option value="' + escapeHtml(row.key) + '">' +
        escapeHtml(nameFor(row.target)) + '</option>').join("") + '</optgroup>').join("");
  $("counter-sources").innerHTML = Object.entries(window.DRAFT_COUNTERS.sources).map(([lane, post]) =>
    '<a href="https://www.facebook.com/Qzaddroaming/posts/' + post + '/">' + escapeHtml(lane) + '</a>').join("");
  $("counter-target").addEventListener("change", renderDraft);
  $("counter-results").addEventListener("click", event => {
    const choice = event.target.closest("[data-counter-pick]");
    if (choice && rules.activeTurn(state)?.kind === "pick") {
      const hero = choice.dataset.counterPick;
      chooseHero(hero);
      $("counter-results").querySelector('[data-counter-pick="' + hero + '"]')?.focus({ preventScroll: true });
    }
  });
  const perspective = $("draft-perspective");
  try {
    applyPerspective(localStorage.getItem(perspectiveKey));
  } catch {
    applyPerspective("blue");
  }
  perspective.addEventListener("change", () => {
    applyPerspective(perspective.value);
    try { localStorage.setItem(perspectiveKey, perspective.value); } catch {}
  });
  restore();
  if (isRank) {
    document.title = "Ban Pick rank thường | Hỗ trợ Ban Pick";
    $("page-title").textContent = "Ban Pick rank thường";
    $("page-title").nextElementSibling.innerHTML = 'Mô phỏng rank từ Kim Cương. Chọn đủ 5 tướng rồi chốt cấm một lần cho mỗi bên. <a href="https://lienquan.garena.vn/chi-tiet-ban-cap-nhat-ngay-hoi-lien-quan-08-07-2026/">Nguồn Garena</a>';
    const rankOption = new Option("Rank thường", "rank");
    input("mode").add(rankOption);
  }
  $("settings").disabled = false;
  $("export").disabled = false;
  renderRoute();
  tell("");
  setInterval(tick, 200);
})();

