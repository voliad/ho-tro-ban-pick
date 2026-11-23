const mime = {
  html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", woff2: "font/woff2", svg: "image/svg+xml",
};
const security = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };
const textAsset = new Set(["html", "js", "css", "json"]);
const originalPaths = new Set([
  "/ban-pick/free", "/ban-pick/solo", "/ban-pick/ranked", "/tier-list/create", "/tier-list/mine", "/ai-coach",
]);

async function respond(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname); }
  catch { return new Response("Invalid path", { status: 400 }); }
  if (path.startsWith("/data/")) {
    const key = path.slice(6);
    if (!accepts(key)) return Response.json({ error: "Không có dữ liệu này." }, { status: 404 });
    try {
      return Response.json({ data: await sourceData(key), source: "atg" }, {
        headers: { ...security, "Cache-Control": "public, max-age=300" },
      });
    } catch {
      if (Object.hasOwn(snapshot.data, key)) return Response.json({
        data: snapshot.data[key], source: "snapshot", checkedAt: snapshot.checkedAt,
      }, { headers: { ...security, "Cache-Control": "public, max-age=60" } });
      return Response.json({ error: "Nguồn ATG chưa phản hồi. Hãy thử lại." }, { status: 503 });
    }
  }
  if (path === "/draft") return Response.redirect(new URL("/draft/", url), 308);
  if (path === "/draft/iphone") return Response.redirect(new URL("/draft/iphone/", url), 308);
  if (originalPaths.has(path)) return Response.redirect("https://atgacademy.noxaov.vn" + path, 307);
  const guideAlias = /^\/guides\/(?:basic|advanced)\/(\d+)$/.exec(path);
  if (guideAlias) return Response.redirect(new URL("/guides/" + guideAlias[1], url), 308);
  const root = /^(?:\/(?:tier-list|guides|wiki|esports|ban-pick)(?:\/[^.]+)?)?\/?$/.test(path);
  const draftPage = path === "/draft/" || path === "/draft/iphone/";
  const file = root ? "index.html" : draftPage ? path.slice(1) + "index.html" : path.slice(1);
  if (!Object.hasOwn(assets, file)) return new Response("Không tìm thấy trang", { status: 404, headers: security });
  const ext = file.split(".").at(-1);
  const payload = assets[file];
  const body = textAsset.has(ext) ? payload : Uint8Array.from(atob(payload), char => char.charCodeAt(0));
  return new Response(request.method === "HEAD" ? null : body, { headers: {
    ...security, "Content-Type": mime[ext] ?? "application/octet-stream",
    "Cache-Control": ext === "html" ? "no-cache" : "public, max-age=3600",
  } });
}

export default { fetch: respond };

