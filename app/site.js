(() => {
  "use strict";

  const original = "https://atgacademy.noxaov.vn";
  const boot = window.ATG_BOOT ?? {};
  const main = document.getElementById("main");
  const overlay = document.getElementById("overlay");
  const target = document.getElementById("dialog-body");
  const route = location.pathname.replace(/\/$/, "") || "/";
  const [area, detail] = route.split("/").slice(1);
  const lanes = { DSL: "Tà Thần", JGL: "Đi rừng", MID: "Đường giữa", ADL: "Xạ thủ", SUP: "Trợ thủ" };
  const counts = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const cache = new Map();
  let heroList;
  let searchEntry;

  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
  const norm = value => String(value ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d");
  const portraitKey = name => norm(name).replace(/[^a-z0-9]/g, "");
  const number = value => Number.isFinite(value) ? counts.format(value) : "—";
  const percent = value => Number.isFinite(value) ? number(value) + "%" : "—";
  const date = value => value && !Number.isNaN(new Date(value).getTime()) ? dateFormat.format(new Date(value)) : "—";
  const legacy = path => original + path;
  const nameOfLane = code => lanes[code] ?? code ?? "";
  const $ = id => document.getElementById(id);

  function safeAsset(source) {
    if (typeof source === "string" && /^\/(?:draft\/portraits|teams|art)\/[-\w]+\.(?:jpe?g|png|webp|gif)$/.test(source)) return source;
    try {
      const url = new URL(source || "", original + "/");
      return source && url.protocol === "https:" && url.origin === original && url.pathname.startsWith("/images/")
        ? url.href : "";
    } catch {
      return "";
    }
  }

  function photo(source, cssClass = "", lazy = true) {
    const url = safeAsset(source);
    return url ? '<img class="' + cssClass + '" src="' + escape(url) + '" alt="" width="200" height="200"' +
      (lazy ? ' loading="lazy"' : "") + ' decoding="async">' : "";
  }

  function thumb(hero, cssClass = "", showName = true) {
    const name = hero.name ?? hero.heroName;
    const image = photo(boot.portraits?.[portraitKey(name)] ?? hero.avatarUrl ?? hero.heroAvatarUrl ?? hero.heroIconUrl);
    const mark = '<span class="monogram">' + escape(name?.[0] ?? "?") + '</span>';
    return '<span class="thumb ' + cssClass + '"><span class="portrait" aria-hidden="true">' + mark + image +
      '</span>' + (showName ? '<span>' + escape(name) + '</span>' : "") + '</span>';
  }

  function heroButton(hero, css = "") {
    return '<button class="hero-link ' + css + '" type="button" data-hero="' + escape(hero.id) +
      '" aria-label="Xem ' + escape(hero.name) + '">' + thumb(hero) + '</button>';
  }

  function load(key) {
    if (!cache.has(key)) {
      cache.set(key, fetch("/data/" + key).then(async response => {
        if (!response.ok) throw Error("Dữ liệu ATG chưa phản hồi.");
        return response.json();
      }).catch(error => {
        cache.delete(key);
        throw error;
      }));
    }
    return cache.get(key);
  }

  const head = (title, desc, extra = "") => '<div class="page-head"><div><h1>' + title +
    '</h1><p>' + desc + '</p></div>' + extra + '</div>';
  const sectionHead = (title, desc, extra = "") => '<div class="section-head"><div><h2>' + title +
    '</h2>' + (desc ? '<p>' + desc + '</p>' : "") + '</div>' + extra + '</div>';
  const empty = text => '<p class="empty">' + escape(text) + '</p>';
  const button = (label, href, style = "secondary") => '<a class="button ' + style + '" href="' + escape(href) + '">' + escape(label) + '</a>';
  const toggleGroup = (options, chosen, group) => '<div class="tabs" aria-label="' + escape(group) + '">' +
    options.map(([id, label]) => '<button type="button" data-filter="' + escape(id) + '" aria-pressed="' +
      (chosen === id) + '">' + escape(label) + '</button>').join("") + '</div>';
  const search = (id, label) => '<label class="field"><span class="search-icon" aria-hidden="true"></span><span class="sr-only">' +
    escape(label) + '</span><input id="' + id + '" type="search" placeholder="' + escape(label) + '" autocomplete="off"></label>';

  function showError(container, href = "") {
    container.innerHTML = '<div class="empty">Chưa tải được dữ liệu ATG. <button type="button" class="text-button" data-retry>Thử lại</button>' +
      (href ? ' ' + button("Mở trang ATG gốc", href) : "") + '</div>';
  }

  function sourceNote(response = {}) {
    return response.source === "snapshot"
      ? '<p class="source-note">Dữ liệu lưu ngày ' + date(response.checkedAt) + '. Nguồn ATG tạm thời chưa phản hồi.</p>' : "";
  }

  function teamLogo(team) {
    const code = team.teamCode ?? "";
    const local = "teams/" + code + ".webp";
    const url = boot.teamLogos?.includes(local) ? "/" + local : team.logoUrl ||
      (/^[A-Za-z0-9_-]+$/.test(code) ? "/images/teams/" + code + ".png" : "");
    return '<span class="team-logo">' + escape(code.slice(0, 3)) + photo(url) + '</span>';
  }

  function renderHome() {
    const hero = main.querySelector(".hero");
    hero.insertAdjacentHTML("afterend", '<div id="home-stats" class="stats-line"></div>' +
      '<div class="home-columns"><section class="panel meta-preview" aria-labelledby="home-meta-title">' +
        '<div class="section-head"><div><h2 id="home-meta-title">Meta theo vị trí</h2><p>Tier List chính thức của ATG</p></div>' +
        '<a href="/tier-list?source=atg" class="subtle-link">Xem bảng ATG</a></div><div id="home-meta"></div></section>' +
      '<aside class="panel rankings" aria-labelledby="home-esports-title"><div class="section-head"><div><h2 id="home-esports-title">BXH đội tuyển</h2>' +
        '<p>Elo theo dữ liệu ATG</p></div><a href="/esports" class="subtle-link">Xem BXH</a></div><div id="home-teams"></div></aside></div>' +
      '<section class="content-block" aria-label="Tier List cộng đồng" id="home-community"></section>' +
      '<section class="content-block" aria-label="Giáo án nổi bật"><div id="home-guides"></div></section>');
    let activeLane = "JGL";
    let meta = boot.meta;
    let esports = boot.esports;
    let teams = boot.teams;
    let guides = boot.guides;

    function stats() {
      const cells = [
        ["Tướng trong Tier List", meta?.heroCount],
        ["Ván đấu esports", esports?.summary?.totalGames],
        ["Đội tuyển theo dõi", teams?.length],
      ];
      $("home-stats").innerHTML = cells.map(([label, value]) => '<div><strong>' + number(value) +
        '</strong><span>' + label + '</span></div>').join("");
    }

    function preview() {
      const index = meta?.columns.indexOf(activeLane) ?? -1;
      const available = meta?.rows?.flatMap(row => (row.cells[index] ?? []).map(hero => ({ ...hero, tier: row.label }))) ?? [];
      $("home-meta").innerHTML = toggleGroup(Object.entries(lanes), activeLane, "Vị trí") +
        '<div class="featured-heroes">' + (available.slice(0, 5).map(hero => '<div class="featured-tile">' +
          '<span class="rank-badge" data-rank="' + escape(hero.tier) + '">' + escape(hero.tier) + '</span>' +
          heroButton(hero) + '</div>').join("") || empty("Chưa có tướng ở vị trí này.")) + '</div>' +
        '<p class="mini-note">Bảng meta cập nhật ' + date(meta?.updatedAt) + '</p>';
      $("home-meta").querySelector(".tabs").addEventListener("click", event => {
        const field = event.target.closest("[data-filter]");
        if (!field) return;
        activeLane = field.dataset.filter;
        preview();
        $("home-meta").querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
      });
    }

    function rankings() {
      const rows = (teams ?? []).slice().sort((a, b) => b.score - a.score).slice(0, 4);
      $("home-teams").innerHTML = rows.map((team, i) => '<div class="rank-line"><span class="rank-no">' +
        String(i + 1).padStart(2, "0") + '</span>' + teamLogo(team) + '<div><strong>' + escape(team.teamName || team.teamCode) +
        '</strong><small>' + escape(team.region) + '</small></div><b class="elo">' + number(Math.round(team.score)) + '</b></div>').join("") ||
        empty("Chưa có dữ liệu đội tuyển.");
    }

    function guideList() {
      $("home-guides").innerHTML = sectionHead("Giáo án mới", "Build và hướng dẫn từ cộng đồng ATG.", button("Xem giáo án", "/guides")) +
        '<div class="guide-grid">' + (guides ?? []).slice(0, 3).map(guideCard).join("") + '</div>';
    }

    function communityList(rows) {
      $("home-community").innerHTML = sectionHead("Tier List cộng đồng", "Tham khảo các bảng xếp hạng do người chơi tạo.",
        button("Xem cộng đồng", "/tier-list/all")) + '<div class="tier-cards">' +
        (rows ?? []).slice(0, 3).map(tierCard).join("") + '</div>';
    }

    stats();
    preview();
    rankings();
    guideList();
    communityList(boot.community);
    load("meta").then(response => { meta = response.data; stats(); preview(); }).catch(() => {});
    load("esports").then(response => { esports = response.data; stats(); }).catch(() => {});
    load("teams").then(response => { teams = response.data; stats(); rankings(); }).catch(() => {});
    load("guides").then(response => { guides = response.data; guideList(); }).catch(() => {});
    load("community").then(response => communityList(response.data)).catch(() => {});
  }

  function guideCard(guide) {
    return '<a class="guide-card" href="/guides/' + escape(guide.id) + '"><div class="guide-art">' +
      photo(guide.coverImageUrl || guide.hero?.backgroundImageUrl) + '</div><div class="guide-copy"><span class="category">' +
      escape(nameOfLane(guide.lane) || guide.category || "Giáo án") + (guide.readingTimeMinutes ? ' / ' + number(guide.readingTimeMinutes) + ' phút đọc' : "") +
      '</span><h3>' + escape(guide.title) + '</h3><p>' + escape(guide.excerpt) + '</p></div></a>';
  }

  function layout(title, desc, extra = "") {
    main.innerHTML = '<div class="wrap subpage">' + head(title, desc, extra) + '<div id="page-content" aria-live="polite">' +
      empty("Đang tải dữ liệu ATG…") + '</div></div>';
    return $("page-content");
  }

  function tierCard(board) {
    return '<a class="panel tier-card" href="/tier-list/' + escape(board.id) + '"><h2>' + escape(board.title) +
      '</h2><p>' + escape(board.creatorName) + ' / ' + date(board.updatedAt ?? board.createdAt) + '</p><div class="tier-mini">' +
      (board.preview?.[0]?.heroes ?? []).map(hero => thumb(hero, "", false)).join("") + '</div></a>';
  }

  function renderQzaddTier() {
    const { board, order, source, changes } = window.QZADD_TIERS;
    const byId = new Map(boot.roster.map(hero => [hero.id, hero]));
    const heroName = hero => [hero.name, hero.variant].filter(Boolean).join(" ");
    const descriptions = {
      SSS: "Ưu tiên cao nhất", SS: "Ưu tiên hàng đầu", S: "Lựa chọn mạnh",
      "A+": "Mạnh khi hợp đội hình", A: "Tùy đội hình và kèo đấu",
      "B+": "Lựa chọn tình huống", B: "Dễ bị khai thác", "B-": "Ít được ưu tiên",
      Draft: "Cần phối hợp đội hình",
    };
    const positions = Object.keys(board);
    const tierTitle = tier => tier === "Draft" ? "Theo đội hình" : tier;
    let position = positions[0];
    document.title = "Tier List Qzadd | Hỗ trợ Ban Pick";
    const container = layout("Tier List Qzadd",
      "Xếp hạng theo vị trí tại RoV Thái Lan · " + source.date,
      '<div class="knowledge-actions">' + button("Bảng ATG", "/tier-list?source=atg") +
      button("Tier List cộng đồng", "/tier-list/all") + '</div>');
    container.innerHTML = '<section class="panel data-panel qz-board" aria-label="Bảng xếp hạng theo vị trí">' +
      '<div class="qz-tools"><div id="qz-lanes"></div>' + search("qz-search", "Tìm tướng ở vị trí này…") +
      '</div><p class="qz-count" id="qz-count"></p><div class="qz-groups" id="qz-groups"></div>' +
      '<details class="qz-changes"><summary>Thay đổi so với bảng trước</summary><ul>' +
      changes.map(([lane, id, before, after]) => '<li><strong>' + escape(heroName(byId.get(id))) +
        '</strong><span>' + lane + ' · ' + tierTitle(before) + ' → ' + after + '</span></li>').join("") +
      '</ul></details>' +
      '<div class="qz-source"><p>Qzadd tổng hợp ý kiến người chơi rank cao Thái Lan. Các ô chưa xác định được tên tướng Việt Nam có thể tra trong bảng gốc.</p>' +
      '<div class="attack-sources"><a class="subtle-link" href="' + source.post + '">Bài đăng Qzadd</a>' +
      '<a class="subtle-link" href="' + source.image + '">Xem bảng gốc</a></div></div></section>';
    function renderGroups() {
      const query = norm($("qz-search").value.trim());
      let total = 0;
      const groups = order.map(tier => {
        const heroes = (board[position][tier] ?? []).map(id => byId.get(id))
          .filter(hero => hero && norm(heroName(hero)).includes(query));
        if (!heroes.length) return "";
        total += heroes.length;
        const label = tierTitle(tier);
        return '<section class="qz-group" aria-label="' + label + '"><div class="qz-tier" data-rank="' + tier +
          '"><h2>' + label + '</h2><span>' + descriptions[tier] + '</span></div><ul class="qz-heroes">' +
          heroes.map(hero => '<li>' + thumb({ name: heroName(hero) }) + '</li>').join("") + '</ul></section>';
      }).join("");
      $("qz-count").textContent = position + " · " + total + " tướng";
      $("qz-groups").innerHTML = groups || empty("Không tìm thấy tướng ở vị trí này.");
    }
    const tabs = $("qz-lanes");
    const renderTabs = () => {
      tabs.innerHTML = toggleGroup(positions.map(lane => [lane, lane]), position, "Vị trí");
    };
    tabs.addEventListener("click", event => {
      const field = event.target.closest("[data-filter]");
      if (!field || position === field.dataset.filter) return;
      position = field.dataset.filter;
      renderTabs();
      renderGroups();
      tabs.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
    });
    $("qz-search").addEventListener("input", renderGroups);
    renderTabs();
    renderGroups();
  }

  async function showTier() {
    if (!detail && new URLSearchParams(location.search).get("source") !== "atg") {
      renderQzaddTier();
      return;
    }
    const boardId = /^\d+$/.test(detail || "") ? detail : null;
    const isCommunity = detail === "all";
    const container = layout(isCommunity ? "Tier List cộng đồng" : "Tier List", "Tra cứu và so sánh xếp hạng tướng theo vị trí.",
      button("Tier List Qzadd", "/tier-list"));
    if (isCommunity) {
      try {
        const response = await load("community");
        container.innerHTML = sourceNote(response) + '<div class="toolbar">' + search("community-search", "Tìm Tier List…") + '</div><div id="tier-cards" class="tier-cards"></div>';
        function renderCards() {
          const q = norm($("community-search").value);
          $("tier-cards").innerHTML = response.data.filter(board => norm(board.title + " " + (board.creatorName ?? "")).includes(q))
            .map(tierCard).join("") || empty("Không tìm thấy Tier List phù hợp.");
        }
        $("community-search").addEventListener("input", renderCards);
        renderCards();
      } catch { showError(container, legacy("/tier-list/all")); }
      return;
    }
    try {
      const response = await load(boardId ? "tier/" + boardId : "meta");
      const board = response.data;
      container.innerHTML = '<div class="panel data-panel">' + sectionHead(escape(board.title),
        (board.creatorName ? escape(board.creatorName) + ' / ' : "") + date(board.updatedAt ?? board.createdAt) +
        ' / ' + number(board.heroCount) + ' tướng',
        boardId ? button("Bình luận, đánh giá", legacy("/tier-list/" + boardId)) : button("Tạo Tier List", legacy("/tier-list/create"))) +
        sourceNote(response) + '<div class="toolbar">' + search("tier-search", "Tìm trong bảng…") +
        '<div id="tier-lanes"></div></div><div id="tier-board"></div></div>';
      let position = "";
      function filterBoard() {
        const q = norm($("tier-search").value);
        const usedColumns = board.columns.map((lane, index) => ({ lane, index })).filter(item => !position || item.lane === position);
        $("tier-board").innerHTML = '<div class="table-scroll"><table class="tier-table"><thead><tr><th scope="col">Bậc</th>' +
          usedColumns.map(item => '<th scope="col">' + escape(nameOfLane(item.lane)) + '</th>').join("") +
          '</tr></thead><tbody>' + board.rows.map(row => '<tr><th scope="row"><span class="rank-badge" data-rank="' +
            escape(row.label) + '">' + escape(row.label) + '</span></th>' + usedColumns.map(item =>
              '<td><div class="tier-heroes">' + ((row.cells[item.index] ?? []).filter(hero => norm(hero.name).includes(q))
                .map(hero => heroButton(hero)).join("") || '<span class="muted">—</span>') +
              '</div></td>').join("") + '</tr>').join("") + '</tbody></table></div>';
      }
      function renderTabs() {
        $("tier-lanes").innerHTML = toggleGroup([["", "Tất cả"], ...board.columns.map(lane => [lane, nameOfLane(lane)])], position, "Lọc vị trí");
      }
      renderTabs();
      filterBoard();
      $("tier-search").addEventListener("input", filterBoard);
      $("tier-lanes").addEventListener("click", event => {
        const field = event.target.closest("[data-filter]");
        if (!field) return;
        position = field.dataset.filter;
        renderTabs();
        filterBoard();
        $("tier-lanes").querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
      });
    } catch { showError(container, legacy(boardId ? "/tier-list/" + boardId : "/tier-list")); }
  }

  async function showGuides() {
    if (detail === "goi-lenh") {
      window.AOV_STRATEGY.renderCalls(main);
      return;
    }
    const id = /^\d+$/.test(detail || "") ? detail : "";
    const actions = '<div class="knowledge-actions">' +
      (id ? "" : button("Gọi lệnh trong đội", "/guides/goi-lenh")) + button("Đóng góp giáo án", legacy("/guides")) + '</div>';
    const container = layout("Giáo án", "Tìm build và hướng dẫn thực chiến theo tướng hoặc vị trí.", actions);
    try {
      if (id) {
        const response = await load("guide/" + id);
        const guide = response.data;
        const item = i => '<li>' + photo(i.iconUrl) + '<span>' + escape(i.itemName ?? i.name) +
          (i.quantity > 1 ? " ×" + number(i.quantity) : "") + '</span></li>';
        const build = guide.build;
        const groups = [
          ["Trang bị", [build.boot, ...build.majorItems].filter(i => i.itemName)],
          ["Phép bổ trợ", build.spell.name ? [build.spell] : []], ["Ngọc", build.arcanas], ["Phù hiệu", build.enchantments],
        ];
        const blocks = guide.sections.map(block => '<section class="guide-block">' +
          (block.title ? '<h3>' + escape(block.title) + '</h3>' : "") +
          (typeof (block.text ?? block.content) === "string" ? '<p>' + escape(block.text ?? block.content) + '</p>' : "") +
          photo(block.imageUrl) + '</section>').join("");
        container.innerHTML = '<article class="panel article"><div class="article-cover">' + photo(guide.coverImageUrl, "", false) +
          '<div><span>' + escape(nameOfLane(guide.lane)) + '</span><h2>' + escape(guide.title) + '</h2><p>' +
          escape(guide.creatorName) + ' / ' + date(guide.publishedAt || guide.createdAt) + '</p></div></div><div class="article-body">' +
          sourceNote(response) + '<p>' + escape(guide.excerpt) + '</p><div class="build-grid">' + groups.filter(([, entries]) => entries.length)
            .map(([label, entries]) => '<section><h3>' + label + '</h3><ul>' + entries.map(item).join("") + '</ul></section>').join("") +
          '</div>' + (build.skillOrder ? '<section class="guide-block"><h3>Thứ tự nâng kỹ năng</h3><p>' + escape(build.skillOrder) + '</p></section>' : "") +
          blocks + button("Xem đầy đủ trên ATG gốc", legacy("/guides/advanced/" + id)) + '</div></article>';
        return;
      }

      const response = await load("guides");
      container.innerHTML = sourceNote(response) +
        '<div class="toolbar">' + search("guide-search", "Tìm giáo án…") +
        '<label class="field plain"><span>Vị trí</span><select id="guide-lane"><option value="">Tất cả</option>' +
        Object.entries(lanes).map(([k, name]) => '<option value="' + k + '">' + name + '</option>').join("") +
        '</select></label></div><div id="guides-list" class="guide-grid"></div>';
      function render() {
        const q = norm($("guide-search").value);
        const lane = $("guide-lane").value;
        $("guides-list").innerHTML = response.data.filter(guide =>
          (!lane || guide.lane === lane) && norm(guide.title + " " + (guide.heroName ?? "")).includes(q)
        ).map(guideCard).join("") || empty("Chưa có giáo án phù hợp.");
      }
      $("guide-search").addEventListener("input", render);
      $("guide-lane").addEventListener("change", render);
      render();
    } catch { showError(container, legacy(id ? "/guides/advanced/" + id : "/guides")); }
  }

  async function getHeroes() {
    if (!heroList) heroList = (await load("heroes")).data;
    return heroList;
  }

  async function showWiki() {
    if (detail === "toc-danh") {
      window.ATG_ATTACK_SPEED.render(main);
      return;
    }
    if (detail === "hieu-qua-vang") {
      window.AOV_STRATEGY.renderGold(main);
      return;
    }
    const tab = new URLSearchParams(location.search).get("tab") ?? "heroes";
    const container = layout("Wiki", "Tìm tướng, vai trò, phép bổ trợ, phù hiệu và tài nguyên trong game.");
    const tabs = [["heroes", "Tướng"], ["spells", "Phép bổ trợ"], ["enchantments", "Phù hiệu"], ["items", "Trang bị"], ["arcana", "Ngọc"]];
    const nav = '<nav class="tabs nav-tabs" aria-label="Danh mục Wiki">' + tabs.map(([id, label]) =>
      '<a href="/wiki' + (id === "heroes" ? "" : "?tab=" + id) + '"' + (id === tab ? ' aria-current="page"' : "") +
      '>' + label + '</a>').join("") +
      '<a href="/wiki/toc-danh">Mốc tốc đánh</a><a href="/wiki/hieu-qua-vang">Hiệu quả vàng</a></nav>';
    try {
      const kind = tab === "hero" || tab === "heroes" ? "heroes" : tab;
      const catalog = ["items", "arcana"].includes(kind);
      const response = catalog ? await fetch("/catalog.json")
        .then(r => {
          if (!r.ok) throw Error("Danh mục chưa sẵn sàng.");
          return r.json();
        }).then(result => ({ data: result[kind] })) : await load(kind);
      const heroes = kind === "heroes";
      const groups = [...new Set(response.data.map(item => item.category || item.branch).filter(Boolean))];
      if (heroes) heroList = response.data;
      container.innerHTML = nav + sourceNote(response) + '<div class="toolbar">' +
        search("wiki-search", "Tìm trong danh mục…") + (heroes ?
        '<label class="field plain"><span>Vị trí</span><select id="wiki-lane"><option value="">Tất cả</option>' +
        Object.entries(lanes).map(([k, name]) => '<option value="' + k + '">' + name + '</option>').join("") + '</select></label>' : "") +
        (groups.length ? '<label class="field plain"><span>Nhóm</span><select id="wiki-group"><option value="">Tất cả</option>' +
          groups.map(name => '<option value="' + escape(name) + '">' + escape(name) + '</option>').join("") + '</select></label>' : "") +
        '</div><div id="wiki-list" class="' + (heroes ? "wiki-heroes" : "reference-grid") + '"></div>';
      function render() {
        const q = norm($("wiki-search").value);
        const lane = $("wiki-lane")?.value;
        const group = $("wiki-group")?.value;
        const filtered = response.data.filter(item => norm(item.name).includes(q) && (!lane || item.roles?.includes(lane)) &&
          (!group || (item.category || item.branch) === group));
        $("wiki-list").innerHTML = filtered.map(item => heroes ? heroButton(item, "wiki-tile") :
          '<article class="panel reference">' + photo(item.iconUrl ?? item.imageUrl) + '<div><h2>' +
          escape(item.name) + '</h2>' + (typeof item.description === "string" ? '<p>' + escape(item.description) + '</p>' : "") +
          ([item.category, item.type, item.level].filter(Boolean).length ?
            '<p>' + [item.category, item.type, item.level].filter(Boolean).map(escape).join(" / ") + '</p>' : "") +
          (item.name === "Khiên Thánh Quang" ? '<a class="subtle-link" href="/wiki/hieu-qua-vang#khien-thanh-quang">Xem chỉ số và nội tại</a>' : "") +
          '</div></article>').join("") || empty("Không tìm thấy mục phù hợp.");
      }
      $("wiki-search").addEventListener("input", render);
      $("wiki-lane")?.addEventListener("change", render);
      $("wiki-group")?.addEventListener("change", render);
      render();
    } catch { showError(container, legacy("/wiki?tab=" + encodeURIComponent(tab))); }
  }

  async function showEsports() {
    const dataView = detail === "data";
    const container = layout(dataView ? "Dữ liệu Esports" : "Xếp hạng Esports",
      "Theo dõi Elo đội tuyển, thống kê tướng và kết quả thi đấu.",
      button(dataView ? "Xếp hạng đội tuyển" : "Thống kê cấm/chọn", dataView ? "/esports" : "/esports/data"));
    try {
      if (!dataView) {
        const response = await load("teams");
        const teams = response.data.slice().sort((a, b) => b.score - a.score);
        const regions = [...new Set(teams.map(team => team.region).filter(Boolean))];
        let active = "";
        container.innerHTML = sourceNote(response) + '<div id="regions"></div><div class="panel data-panel" id="team-data"></div>' +
          window.AOV_STRATEGY.esportsRecap();
        function renderRegions() {
          $("regions").innerHTML = toggleGroup([["", "Tất cả"], ...regions.map(x => [x, x])], active, "Khu vực");
          $("team-data").innerHTML = '<div class="table-scroll"><table><thead><tr><th>#</th><th>Đội tuyển</th><th>Khu vực</th>' +
            '<th>Elo</th><th>Series thắng</th><th>Series thua</th></tr></thead><tbody>' +
            teams.filter(t => !active || t.region === active).map((t, i) => '<tr><td>' + (i + 1) + '</td><td><span class="table-team">' +
              teamLogo(t) + escape(t.teamName || t.teamCode) + '</span></td><td>' + escape(t.region) +
              '</td><td><strong>' + number(Math.round(t.score)) + '</strong></td><td>' + number(t.matchWins) +
              '</td><td>' + number(t.matchLosses) + '</td></tr>').join("") + '</tbody></table></div>';
        }
        $("regions").addEventListener("click", e => {
          const field = e.target.closest("[data-filter]");
          if (!field) return;
          active = field.dataset.filter;
          renderRegions();
          $("regions").querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
        });
        renderRegions();
        return;
      }

      const tournaments = await load("tournaments").then(r => r.data).catch(() => []);
      container.innerHTML = '<div class="toolbar"><label class="field plain"><span>Giải đấu</span><select id="tournament"><option value="">Tất cả</option>' +
        tournaments.map(item => '<option value="' + escape(item.tournamentId) + '">' + escape(item.tournamentName) + '</option>').join("") +
        '</select></label>' + search("stats-search", "Tìm tướng…") +
        '<label class="field plain"><span>Sắp xếp</span><select id="stats-sort"><option value="banCount">Lượt cấm</option>' +
        '<option value="pickCount">Lượt chọn</option><option value="pickWinRate">Tỷ lệ thắng</option></select></label></div><div id="stats-body"></div>';
      let response;
      let request = 0;
      function statsRows() {
        if (!response) return;
        const source = response.data;
        const q = norm($("stats-search").value);
        const field = $("stats-sort").value;
        const stats = source.heroes.filter(hero => norm(hero.heroName).includes(q))
          .sort((a,b) => (b[field] ?? -1) - (a[field] ?? -1) || (b.pickCount ?? 0) - (a.pickCount ?? 0));
        $("stats-body").innerHTML = sourceNote(response) +
          '<div class="stats-line in-page"><div><strong>' + number(source.summary.totalGames) + '</strong><span>Ván đấu</span></div>' +
          '<div><strong>' + number(source.summary.totalMatches) + '</strong><span>Series</span></div><div><strong>' + percent(source.side.blueWinRate) +
          '</strong><span>Tỷ lệ thắng bên xanh</span></div></div><div class="panel data-panel table-scroll"><table><thead><tr><th>Tướng</th>' +
          '<th>Lượt cấm</th><th>Lượt chọn</th><th>Tỷ lệ thắng</th><th>Chọn bên xanh</th><th>Chọn bên đỏ</th></tr></thead><tbody>' +
          stats.map(h => '<tr><td>' + thumb(h, "inline") + '</td><td>' + number(h.banCount) + '</td><td>' +
            number(h.pickCount) + '</td><td>' + percent(h.pickWinRate) + '</td><td>' + number(h.bluePickCount) +
            '</td><td>' + number(h.redPickCount) + '</td></tr>').join("") +
          '</tbody></table>' + (stats.length ? "" : empty("Không có tướng phù hợp.")) + '</div>';
      }
      async function fetchStats() {
        const id = ++request;
        response = null;
        $("stats-body").innerHTML = empty("Đang tải thống kê…");
        try {
          const current = await load("esports" + ($("tournament").value ? "/" + $("tournament").value : ""));
          if (id !== request) return;
          response = current;
          statsRows();
        } catch {
          if (id === request) showError($("stats-body"), legacy("/esports/data"));
        }
      }
      $("tournament").addEventListener("change", fetchStats);
      $("stats-search").addEventListener("input", statsRows);
      $("stats-sort").addEventListener("change", statsRows);
      await fetchStats();
    } catch { showError(container, legacy("/esports")); }
  }

  function renderDraftTools() {
    const container = layout("Ban/Pick", "Chuẩn bị đội hình, tập draft hoặc mở phòng thi đấu.");
    const tools = [
      ["Rank thường", "Tập cấm chọn một ván xếp hạng từ Kim Cương, với 5 lượt cấm và 5 lượt chọn mỗi bên.", "Vào bàn rank thường", "/draft/?mode=rank"],
      ["Đấu giải", "Điều phối BO1 đến BO7, Global Ban/Pick, đổi bên và ghi lịch sử các ván.", "Vào bàn cấm chọn", "/draft/"],
      ["Cấm chọn tự do", "Thử đội hình và xem điểm cấm chọn của hai bên.", "Mở cấm chọn tự do", legacy("/ban-pick/free")],
      ["Giả lập Solo", "Tạo phòng 1v1 để tập draft với bạn bè.", "Mở phòng Solo", legacy("/ban-pick/solo")],
      ["Đấu Rank Solo", "Đấu xếp hạng và theo dõi Elo trên tài khoản ATG.", "Mở Rank Solo", legacy("/ban-pick/ranked")],
      ["AI Coach", "Tra cứu gợi ý đồng đội, lượt cấm và kèo khó cho tướng bạn chọn.", "Mở AI Coach", legacy("/ai-coach")],
    ];
    container.innerHTML = '<div class="tool-grid">' + tools.map(([title, desc, label, href], i) => '<section class="panel tool"><h2>' +
      title + '</h2><p>' + desc + '</p>' + button(label, href, i === 0 ? "primary" : "secondary") + '</section>').join("") + '</div>';
  }

  async function openSearch() {
    searchEntry = document.activeElement;
    $("dialog-title").textContent = "Tìm tướng";
    target.innerHTML = search("quick-search", "Nhập tên tướng…") + '<div class="quick-results" id="quick-results">' +
      empty("Đang tải tướng…") + '</div>';
    if (!overlay.open) overlay.showModal();
    const input = $("quick-search");
    input.focus();
    try {
      const roster = await getHeroes();
      if (!input.isConnected) return;
      const show = () => {
        const q = norm(input.value);
        $("quick-results").innerHTML = roster.filter(hero => norm(hero.name).includes(q)).slice(0, 10).map(h =>
          '<button class="quick-hero" type="button" data-hero="' + escape(h.id) + '">' + thumb(h, "inline") +
          '<small>' + escape(h.roles.map(nameOfLane).join(", ")) + '</small></button>').join("") || empty("Không tìm thấy tướng.");
      };
      input.addEventListener("input", show);
      show();
    } catch {
      if (input.isConnected) $("quick-results").innerHTML = empty("Chưa tải được danh mục tướng.");
    }
  }

  async function openHero(id) {
    if (!overlay.open) searchEntry = document.activeElement;
    $("dialog-title").textContent = "Thông tin tướng";
    target.innerHTML = empty("Đang tải thông tin…");
    if (!overlay.open) overlay.showModal();
    try {
      const roster = await getHeroes();
      const hero = roster.find(item => String(item.id) === id);
      if (!hero) {
        target.innerHTML = empty("Tướng chưa có trong danh mục ATG.");
        return;
      }
      $("dialog-title").textContent = hero.name;
      target.innerHTML = '<div class="hero-detail">' + photo(hero.backgroundImageUrl || hero.avatarUrl) + '</div>' +
        '<p class="detail-meta">' + escape(hero.classes.join(", ")) + ' / ' + escape(hero.roles.map(nameOfLane).join(", ")) + '</p>' +
        '<div class="stats-line in-page"><div><strong>' + number(hero.banPickScore) + '</strong><span>Điểm Ban/Pick</span></div><div><strong>' +
        number(hero.rankPoint) + '</strong><span>Điểm Rank</span></div><div><strong>' + number(hero.esportPoint) + '</strong><span>Điểm Esports</span></div></div>' +
        '<div class="dialog-actions">' + button("Mở Wiki", "/wiki") + button("Vào bàn cấm chọn", "/draft/", "primary") + '</div>';
      overlay.querySelector("[data-close]").focus();
    } catch { target.innerHTML = empty("Chưa tải được thông tin tướng."); }
  }

  document.addEventListener("error", event => {
    if (event.target instanceof HTMLImageElement && !event.target.closest(".brand")) event.target.hidden = true;
  }, true);
  document.addEventListener("click", event => {
    const hero = event.target.closest("[data-hero]");
    if (hero) openHero(hero.dataset.hero);
    if (event.target.closest("[data-search]")) openSearch();
    if (event.target.closest("[data-close]")) overlay.close();
    if (event.target.closest("[data-retry]")) location.reload();
  });
  overlay.addEventListener("close", () => {
    if (searchEntry?.isConnected) searchEntry.focus();
  });
  document.addEventListener("keydown", event => {
    const editable = (document.activeElement?.matches("input,textarea,select,[contenteditable]"));
    if ((event.key === "/" && !editable) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      openSearch();
    }
  });
  const section = area ? "/" + area : "/";
  document.querySelector('.nav a[href="' + section + '"]')?.setAttribute("aria-current", "page");
  const views = { "tier-list": showTier, guides: showGuides, esports: showEsports, wiki: showWiki, "ban-pick": renderDraftTools };
  (views[area] ?? renderHome)();
})();
