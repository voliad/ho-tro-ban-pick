(() => {
  "use strict";

  const urls = [
    "turn:turn.cloudflare.com:3478?transport=udp",
    "turn:turn.cloudflare.com:3478?transport=tcp",
    "turns:turn.cloudflare.com:443?transport=tcp",
  ];
  const valid = (username, credential) => [username, credential].every(
    value => typeof value === "string" && /^[!-~]{1,256}$/.test(value));
  function options(username, credential, relayOnly = false) {
    if (!valid(username, credential)) return undefined;
    return { config: { iceTransportPolicy: relayOnly ? "relay" : "all", iceServers: [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls, username, credential },
    ] } };
  }
  function route(stats) {
    const transport = [...stats.values()].find(row => row.type === "transport" && row.selectedCandidatePairId);
    const pair = transport ? stats.get(transport.selectedCandidatePairId) :
      [...stats.values()].find(row => row.type === "candidate-pair" && row.nominated && row.state === "succeeded");
    if (!pair) return "";
    const local = stats.get(pair.localCandidateId)?.candidateType;
    const remote = stats.get(pair.remoteCandidateId)?.candidateType;
    if (local === "relay" || remote === "relay") return "Qua TURN";
    return local && remote ? "Trực tiếp" : "";
  }
  window.DRAFT_TURN = { options, route };
})();
