const origin = "https://voliad.github.io";
const ttl = 7200;

export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "POST",
      "Cache-Control": "no-store",
    };
    const respond = (status, data) => Response.json(data, { status, headers });
    const route = new URL(request.url).pathname;
    if (route !== "/ice" && route !== "/gemini") return respond(404, {});
    if (request.headers.get("Origin") !== origin) return respond(403, {});
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return respond(405, {});
    if (!env.RELAY_ACCESS) return respond(503, {});
    if (request.headers.get("Authorization") !== "Bearer " + env.RELAY_ACCESS) return respond(401, {});
    if (route === "/gemini") {
      if (!env.GEMINI_API_KEY) return respond(503, {});
      const length = Number(request.headers.get("Content-Length"));
      if (!length || length > 150000) return respond(413, {});
      try {
        const { portrait } = await request.json();
        if (typeof portrait !== "string" || portrait.length > 140000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(portrait)) return respond(400, {});
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: 'Identify the Arena of Valor hero portrait. Return JSON {"hero":"hero name"} or {"hero":null} if uncertain.' },
              { inlineData: { mimeType: "image/jpeg", data: portrait } },
            ] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) return respond(response.status === 429 ? 429 : 502, {});
        const result = await response.json();
        const answer = JSON.parse(result.candidates[0].content.parts.at(-1).text);
        return respond(200, { hero: typeof answer.hero === "string" ? answer.hero.slice(0, 60) : null });
      } catch {
        return respond(502, {});
      }
    }
    if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return respond(503, {});
    try {
      const response = await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/" +
        encodeURIComponent(env.TURN_KEY_ID) + "/credentials/generate-ice-servers", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.TURN_KEY_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl }),
      });
      if (!response.ok) return respond(502, {});
      const data = await response.json();
      const relay = data.iceServers?.find(server => server.username && server.credential);
      return relay ? respond(200, { username: relay.username, credential: relay.credential }) : respond(502, {});
    } catch {
      return respond(502, {});
    }
  },
};
