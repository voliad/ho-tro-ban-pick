(() => {
  "use strict";

  const urls = [
    "turn:turn.cloudflare.com:3478?transport=udp",
    "turn:turn.cloudflare.com:3478?transport=tcp",
    "turns:turn.cloudflare.com:443?transport=tcp",
  ];
  const valid = (username, credential) => [username, credential].every(
    value => typeof value === "string" && /^[!-~]{1,256}$/.test(value));
  function options(username, credential) {
    if (!valid(username, credential)) return undefined;
    return { config: { iceTransportPolicy: "all", iceServers: [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls, username, credential },
    ] } };
  }
  window.DRAFT_TURN = { options };
})();
