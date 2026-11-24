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
      if (!env.GEMINI_API_KEY?.trim()) return respond(503, { error: "missing_key" });
      const length = Number(request.headers.get("Content-Length"));
      if (length > 300000) return respond(413, { error: "image_too_large" });
      try {
        const reader = request.body?.getReader();
        if (!reader) return respond(400, { error: "invalid_image" });
        const buffer = new Uint8Array(300000);
        let size = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (size + value.length > buffer.length) {
            await reader.cancel();
            return respond(413, { error: "image_too_large" });
          }
          buffer.set(value, size);
          size += value.length;
        }
        let portrait, candidates, nameplate;
        try {
          ({ portrait, candidates, nameplate } = JSON.parse(new TextDecoder().decode(buffer.subarray(0, size))));
        } catch {
          return respond(400, { error: "invalid_image" });
        }
        if (typeof portrait !== "string" || portrait.length > 140000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(portrait)) return respond(400, { error: "invalid_image" });
        const validImage = value => typeof value === "string" && value.length <= 40000 &&
          /^[A-Za-z0-9+/]+={0,2}$/.test(value);
        if (candidates !== undefined && (!Array.isArray(candidates) || candidates.length < 2 ||
          candidates.length > 4 || candidates.some(row => !row ||
            typeof row.id !== "string" || !/^[a-z0-9-]{1,60}$/.test(row.id) ||
            typeof row.name !== "string" || row.name.length > 60 || !validImage(row.portrait)) ||
          new Set(candidates.map(row => row.id)).size !== candidates.length))
          return respond(400, { error: "invalid_candidates" });
        if (nameplate !== undefined && !validImage(nameplate)) return respond(400, { error: "invalid_nameplate" });
        const parts = candidates ? [
          { text: 'Compare the target Arena of Valor hero portrait to the labeled reference portraits below. A skin, lighting, border or lock can differ. Use facial features and any hero-name line. Do not treat a player name or skin name as a hero name. Select only a listed candidate when supported, otherwise return null. Return JSON {"candidateId":"listed id"} or {"candidateId":null}.' },
          { text: "Target portrait" },
          { inlineData: { mimeType: "image/jpeg", data: portrait } },
          ...(nameplate ? [{ text: "Hero-name line from the target slot" },
            { inlineData: { mimeType: "image/jpeg", data: nameplate } }] : []),
          ...candidates.flatMap(row => [
            { text: JSON.stringify({ candidateId: row.id, hero: row.name }) },
            { inlineData: { mimeType: "image/jpeg", data: row.portrait } },
          ]),
        ] : [
          { text: 'Identify the Arena of Valor hero portrait. Return JSON {"hero":"hero name"} or {"hero":null} if uncertain.' },
          { inlineData: { mimeType: "image/jpeg", data: portrait } },
        ];
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY.trim() },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => null);
          const rawReason = failure?.error?.details?.find(detail => detail.reason)?.reason;
          const reason = typeof rawReason === "string" && /^[A-Z][A-Z0-9_]{1,60}$/.test(rawReason)
            ? rawReason : undefined;
          return respond(response.status === 429 ? 429 : 502, {
            error: "google_rejected", upstreamStatus: response.status, reason,
          });
        }
        const result = await response.json();
        const content = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought)
          .map(part => part.text ?? "").join("").trim();
        if (!content) return respond(502, { error: "empty_answer" });
        const answer = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, ""));
        if (candidates) return respond(200, {
          candidateId: candidates.some(row => row.id === answer.candidateId) ? answer.candidateId : null,
        });
        return respond(200, { hero: typeof answer.hero === "string" ? answer.hero.slice(0, 60) : null });
      } catch (error) {
        return respond(502, { error: error.name === "TimeoutError" ? "google_timeout" : "invalid_answer" });
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
