(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const start = $("iphone-receive");
  const turnEndpoint = "https://aov-ban-pick-turn.checkin-license-server.workers.dev/ice";
  const turnAccess = $("iphone-turn-access");
  const forceRelay = $("iphone-turn-only");
  const rememberTurn = $("iphone-turn-remember");
  const turnStorageKey = "aov-draft-turn-settings-v1";

  try {
    const saved = JSON.parse(localStorage.getItem(turnStorageKey));
    if (typeof saved?.access === "string" && saved.access) {
      turnAccess.value = saved.access;
      forceRelay.checked = saved.force === true;
      rememberTurn.checked = true;
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }

  function saveTurnSettings() {
    try {
      const access = turnAccess.value.trim();
      if (rememberTurn.checked && access) {
        localStorage.setItem(turnStorageKey, JSON.stringify({ access, force: forceRelay.checked }));
      } else {
        localStorage.removeItem(turnStorageKey);
      }
    } catch {
      rememberTurn.checked = false;
    }
  }
  turnAccess.addEventListener("input", saveTurnSettings);
  forceRelay.addEventListener("change", saveTurnSettings);
  rememberTurn.addEventListener("change", saveTurnSettings);

  const panel = $("iphone-room");
  const invite = $("iphone-invite");
  const qr = $("iphone-qr");
  const status = $("iphone-room-status");
  const recover = $("iphone-recover");
  const lastIssue = $("iphone-last-issue");
  const health = $("iphone-video-health");
  const routeStatus = $("iphone-video-route");
  function reportIssue(message) {
    lastIssue.textContent = "Lần gián đoạn gần nhất · " + message;
  }
  let room;

  function close(message = "") {
    const previous = room;
    room = null;
    if (previous) {
      clearTimeout(previous.timer);
      clearTimeout(previous.reconnect);
      clearInterval(previous.watch);
      previous.peer?.destroy();
      if (previous.stream) window.DRAFT_SCREEN.clear(previous.stream);
    }
    start.disabled = false;
    invite.hidden = true;
    recover.hidden = true;
    qr.replaceChildren();
    panel.hidden = !message;
    status.textContent = message;
    health.textContent = "";
    routeStatus.textContent = "";
  }

  start.addEventListener("click", async () => {
    if (room || start.disabled) return;
    panel.hidden = false;
    lastIssue.textContent = "";
    if (!window.Peer || !window.QRCode || !window.RTCPeerConnection || !crypto.randomUUID) {
      status.textContent = "Không mở được kết nối. Hãy thử Ban Pick qua HTTPS trên Chrome hoặc Edge.";
      return;
    }
    start.disabled = true;
    status.textContent = "Đang tạo kết nối riêng…";
    const attempt = {};
    room = attempt;
    let relay;
    const relayOnly = forceRelay.checked;
    if (relayOnly && !turnAccess.value.trim()) {
      close("Nhập mã truy cập TURN trước khi dùng chế độ chỉ qua TURN.");
      return;
    }
    if (turnAccess.value.trim()) {
      try {
        const response = await fetch(turnEndpoint, {
          method: "POST", redirect: "error", cache: "no-store",
          headers: { Authorization: "Bearer " + turnAccess.value.trim() },
          signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) {
          const message = response.status === 401 ? "Mã truy cập TURN chưa đúng." :
            "Cloudflare chưa cấp được thông tin TURN.";
          if (room === attempt) close(message + " Xóa mã để kết nối trực tiếp.");
          return;
        }
        relay = await response.json();
        if (!window.DRAFT_TURN.options(relay.username, relay.credential)) throw Error();
      } catch {
        if (room === attempt) close("Chưa lấy được mã TURN. Bạn có thể xóa mã để kết nối trực tiếp.");
        return;
      }
    }
    if (room !== attempt) return;
    const receiver = crypto.randomUUID();
    const sender = crypto.randomUUID();
    const peer = new window.Peer(receiver, relay ? window.DRAFT_TURN.options(relay.username, relay.credential, relayOnly) : undefined);
    const current = { peer, timer: setTimeout(() => close("Kết nối đã hết hạn. Hãy tạo mã mới."), 180000) };
    room = current;

    peer.on("open", () => {
      if (room !== current) return;
      if (current.link) {
        if (!current.call) status.textContent = "Đang chờ iPhone phát màn hình.";
        return;
      }
      const url = new URL("./iphone/", location.href);
      url.searchParams.set("v", "transport-retry");
      const inviteParams = new URLSearchParams({ to: receiver, from: sender });
      if (relay) {
        inviteParams.set("u", relay.username);
        inviteParams.set("p", relay.credential);
        if (relayOnly) inviteParams.set("relay", "1");
      }
      url.hash = inviteParams.toString();
      current.link = url.href;
      new window.QRCode(qr, { text: url.href, width: relay ? 240 : 176, height: relay ? 240 : 176, correctLevel: window.QRCode.CorrectLevel.M });
      invite.hidden = false;
      if (!current.call) status.textContent = "Đang chờ iPhone phát màn hình.";
    });
    peer.on("connection", channel => {
      if (room !== current || channel.peer !== sender) {
        channel.close();
        return;
      }
      current.channel?.close();
      current.channel = channel;
      channel.on("open", () => {
        if (room === current && current.channel === channel) recover.hidden = false;
      });
      channel.on("close", () => {
        if (room === current && current.channel === channel) recover.hidden = true;
      });
      channel.on("data", message => {
        if (room !== current || current.channel !== channel || message?.type !== "capture-ended") return;
        current.captureEnded = true;
        reportIssue("iPhone đã dừng quay màn hình.");
        invite.hidden = false;
        recover.hidden = true;
        status.textContent = "iPhone đã ngừng quay. Bấm Phát màn hình trên iPhone để tiếp tục cùng phòng.";
      });
    });

    peer.on("call", call => {
      if (room !== current || call.peer !== sender) {
        call.close();
        return;
      }
      clearInterval(current.watch);
      health.textContent = "";
      routeStatus.textContent = "";
      const previousCall = current.call;
      current.call = call;
      current.captureEnded = false;
      recover.hidden = !current.channel?.open;
      if (current.stream) {
        window.DRAFT_SCREEN.clear(current.stream);
        current.stream = null;
      }
      previousCall?.close();
      invite.hidden = true;
      clearTimeout(current.timer);
      const waitForReconnect = reason => {
        if (room !== current || current.call !== call) return;
        if (!current.captureEnded) reportIssue(reason ?? "Luồng video đã đóng.");
        current.call = null;
        clearInterval(current.watch);
        health.textContent = "";
        clearTimeout(current.timer);
        const stream = current.stream;
        current.stream = null;
        if (stream) window.DRAFT_SCREEN.clear(stream);
        call.close();
        if (!current.captureEnded) status.textContent = "Mất tín hiệu video. Đang chờ iPhone tự kết nối lại…";
        current.timer = setTimeout(() => {
          invite.hidden = false;
          status.textContent = "Phòng vẫn mở. Bấm Phát màn hình trên iPhone hoặc mở lại liên kết này.";
        }, 90000);
      };
      current.timer = setTimeout(() => waitForReconnect("Máy tính không nhận được luồng video."), 25000);
      status.textContent = "Đã ghép nối. Đang chờ hình từ iPhone…";
      call.on("stream", async stream => {
        if (room !== current || current.call !== call || current.stream || !stream.getVideoTracks().length) return;
        current.stream = stream;
        try {
          await window.DRAFT_SCREEN.show(stream, manual => manual ? close() : waitForReconnect(), "Đang hiển thị màn hình iPhone.");
          if (room !== current || current.call !== call) return;
          clearTimeout(current.timer);
          status.textContent = "Đã nhận màn hình iPhone.";
          const video = $("airplay-preview");
          const [track] = stream.getVideoTracks();
          const connection = call.peerConnection;
          const frameProgress = () => video?.getVideoPlaybackQuality?.().totalVideoFrames || video?.currentTime;
          let frameTime = frameProgress();
          let lastFrame = performance.now();
          let lastRequest = -Infinity;
          let disconnectedSince;
          let checkingStats = false;
          let previousVideo;
          let lastStatsAt = -Infinity;
          current.watch = setInterval(async () => {
            if (room !== current || current.call !== call || document.hidden || !video || video.srcObject !== stream) return;
            const now = performance.now();
            const progress = frameProgress();
            if (progress !== frameTime) {
              frameTime = progress;
              lastFrame = now;
              if (status.textContent !== "Đã nhận màn hình iPhone.") status.textContent = "Đã nhận màn hình iPhone.";
            }
            const linkState = connection.connectionState ?? connection.iceConnectionState;
            const linkLost = ["disconnected", "failed", "closed"].includes(linkState);
            if (linkLost) disconnectedSince ??= now;
            else disconnectedSince = undefined;
            const persistentLoss = linkLost && (linkState !== "disconnected" || now - disconnectedSince >= 6000);
            const stalled = now - lastFrame > 6000;
            if (linkLost) health.textContent = "";
            let reason = linkLost ? "Đường truyền video bị gián đoạn." :
              track.muted ? "Luồng iPhone tạm ngừng gửi video." : "";
            if (!reason && !checkingStats && connection.getStats && now - lastStatsAt >= 2000) {
              lastStatsAt = now;
              checkingStats = true;
              try {
                const stats = await connection.getStats();
                if (room !== current || current.call !== call) return;
                const route = window.DRAFT_TURN.route(stats);
                if (route) routeStatus.textContent = "Đường truyền video · " + route;
                const inbound = [...stats.values()].find(row =>
                  row.type === "inbound-rtp" && (row.kind ?? row.mediaType) === "video");
                if (inbound && previousVideo && previousVideo.id === inbound.id) {
                  if (stalled && frameProgress() === progress &&
                      inbound.bytesReceived - previousVideo.bytesReceived > 10000 &&
                      inbound.framesDecoded === previousVideo.framesDecoded) {
                    reason = "Máy tính vẫn nhận dữ liệu video nhưng chưa giải mã được khung hình mới.";
                  }
                  const received = inbound.packetsReceived - previousVideo.packetsReceived;
                  const lost = Math.max(0, inbound.packetsLost - previousVideo.packetsLost);
                  const total = received + lost;
                  const jitter = inbound.jitter ?? 0;
                  if (!stalled && received >= 0 && total >= 20) {
                    const loss = lost / total;
                    const grade = loss >= .06 || jitter >= .08 ? "poor" :
                      loss <= .02 && jitter <= .04 ? "healthy" : "fair";
                    if (current.channel?.open) current.channel.send({ type: "video-health", grade });
                    const resolution = video.videoWidth ? video.videoWidth + " × " + video.videoHeight + " · " : "";
                    health.textContent = resolution + "Mất gói " + (loss * 100).toFixed(1) +
                      "% · Dao động " + Math.round(jitter * 1000) + " ms";
                  }
                }
                previousVideo = inbound;
              } catch {
                // Statistics may be unavailable on a closed transport.
              } finally {
                checkingStats = false;
              }
            }
            if (persistentLoss || (stalled && frameProgress() === progress)) {
              const nextStatus = reason || "Đang chờ khung hình mới. Bạn có thể bấm Khôi phục hình nếu màn hình đã đứng.";
              if (status.textContent !== nextStatus) status.textContent = nextStatus;
              if (video.paused) video.play().catch(() => {});
              if (reason && current.channel?.open && now - lastRequest > 15000) {
                lastRequest = now;
                reportIssue(reason);
                current.channel.send({ type: "restart-video", network: linkLost });
              }
            }
          }, 1000);
        } catch {
          waitForReconnect();
        }
      });
      call.on("close", () => waitForReconnect("Kết nối video đã đóng."));
      call.on("error", () => waitForReconnect("WebRTC báo lỗi truyền video."));
      call.answer();
    });
    peer.on("error", error => {
      if (room !== current || current.stream || ["network", "socket-error", "socket-closed", "disconnected"].includes(error.type)) return;
      close("Không kết nối được dịch vụ ghép đôi. Hãy thử lại.");
    });
    peer.on("disconnected", () => {
      if (room !== current) return;
      clearTimeout(current.reconnect);
      if (!current.stream) status.textContent = "Đang khôi phục kết nối ghép đôi…";
      current.reconnect = setTimeout(() => {
        if (room === current && peer.disconnected) peer.reconnect();
      }, 1500);
    });
  });

  recover.addEventListener("click", () => {
    if (!room?.channel?.open || room.captureEnded) return;
    room.channel.send({ type: "restart-video", manual: true });
    status.textContent = "Đã yêu cầu iPhone gửi lại hình.";
  });
  $("iphone-close").addEventListener("click", () => close());
  $("iphone-copy").addEventListener("click", async () => {
    const current = room;
    if (!current?.link) return;
    try {
      await navigator.clipboard.writeText(current.link);
      if (room === current) status.textContent = "Đã sao chép liên kết. Mở liên kết bằng Safari trên iPhone.";
    } catch {
      if (room === current) status.textContent = "Chưa sao chép được liên kết. Bạn có thể dùng mã QR.";
    }
  });
  window.addEventListener("pagehide", event => { if (!event.persisted) close(); });
})();
