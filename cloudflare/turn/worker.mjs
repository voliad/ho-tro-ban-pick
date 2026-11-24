const origin = "https://voliad.github.io";
const ttl = 7200;

export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization",
      "Access-Control-Allow-Methods": "POST",
      "Cache-Control": "no-store",
    };
    const respond = (status, data) => Response.json(data, { status, headers });
    if (new URL(request.url).pathname !== "/ice") return respond(404, {});
    if (request.headers.get("Origin") !== origin) return respond(403, {});
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return respond(405, {});
    if (!env.RELAY_ACCESS || !env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return respond(503, {});
    if (request.headers.get("Authorization") !== "Bearer " + env.RELAY_ACCESS) return respond(401, {});
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
