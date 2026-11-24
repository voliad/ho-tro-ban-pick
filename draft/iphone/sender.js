(() => {
  "use strict";

  const start = document.getElementById("iphone-send");
  const stop = document.getElementById("iphone-stop");
  const status = document.getElementById("iphone-sender-status");
  const invite = new URLSearchParams(location.hash.slice(1));
  const to = invite.get("to");
  const from = invite.get("from");
  const peerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const devices = navigator.mediaDevices;
  if (!peerId.test(to ?? "") || !peerId.test(from ?? "") || to === from) {
    status.textContent = "Hãy mở mã QR từ mục Nhận từ iPhone trên máy tính.";
    return;
  }
  if (!devices?.getDisplayMedia || !window.Peer) {
    status.textContent = "Trình duyệt hiện tại không hỗ trợ phát màn hình.";
    return;
  }

  status.textContent = "Đang chuẩn bị ghép nối…";
  const relayOnly = invite.get("relay") === "1";
  const turnOptions = window.DRAFT_TURN?.options(invite.get("u"), invite.get("p"), relayOnly);
  const peer = new window.Peer(from, turnOptions);
  let triedRelay = false;

  function recoverTransport() {
    if (ended || retry || !call) return;
    if (turnOptions && !relayOnly) {
      peer.options.config.iceTransportPolicy = triedRelay ? "all" : "relay";
      triedRelay = true;
    }
    retryCall();
  }
  let capture;
  let track;
  let call;
  let channel;
  let ended = false;
  let connecting;
  let retry;
  let failures = 0;
  let recoveryDeadline = 0;
  let quality = 0;
  let lastRecovery = 0;
  let applyQuality;
  let poorReports = 0;
  let healthyReports = 0;
  const profiles = [
    { fps: 12, bitrate: 1600000 },
    { fps: 10, bitrate: 1050000 },
    { fps: 8, bitrate: 750000 },
  ];
  const opening = setTimeout(() => finish("Không ghép nối được. Hãy mở mã QR mới."), 20000);

  function finish(message) {
    if (ended) return;
    ended = true;
    clearTimeout(opening);
    clearTimeout(connecting);
    clearTimeout(retry);
    capture?.getTracks().forEach(item => item.stop());
    peer.destroy();
    start.disabled = true;
    stop.hidden = true;
    status.textContent = message;
  }

  function retryCall(adapt = true) {
    if (ended || retry) return;
    if (!recoveryDeadline) recoveryDeadline = Date.now() + 85000;
    if (peer.destroyed) {
      finish("Dịch vụ ghép đôi đã đóng. Hãy mở lại liên kết ghép đôi.");
      return;
    }
    if (Date.now() >= recoveryDeadline) {
      clearTimeout(connecting);
      const previous = call;
      call = null;
      previous?.close();
      start.disabled = false;
      status.textContent = "Đã tạm dừng thử lại. Bấm Phát màn hình để khôi phục trong cùng phòng.";
      return;
    }
    const now = Date.now();
    if (adapt && lastRecovery && now - lastRecovery < 60000) quality = Math.min(quality + 1, profiles.length - 1);
    if (adapt) lastRecovery = now;
    clearTimeout(connecting);
    const previous = call;
    call = null;
    status.textContent = "Tín hiệu gián đoạn. Đang tự kết nối lại…";
    retry = setTimeout(() => {
      retry = null;
      if (ended) return;
      if (peer.disconnected) peer.reconnect();
      connect();
    }, Math.min(1000 * 2 ** failures, 8000));
    previous?.close();
    failures++;
  }

  function connect() {
    if (ended || call || !track || peer.disconnected || !peer.open) return;
    if (track.readyState === "ended") {
      finish("iPhone đã dừng phát màn hình.");
      return;
    }
    if (!channel || channel.peerConnection?.connectionState === "failed") {
      channel?.close();
      channel = peer.connect(to, { reliable: true });
      const control = channel;
      control?.on("data", message => {
        if (channel !== control || !message) return;
        if (message.type === "restart-video") {
          if (message.network) recoverTransport();
          else retryCall(message.manual !== true);
        }
        if (message.type !== "video-health" || !call) return;
        if (message.grade === "poor") {
          poorReports++;
          healthyReports = 0;
        } else if (message.grade === "healthy") {
          healthyReports++;
          poorReports = 0;
        } else {
          poorReports = healthyReports = 0;
        }
        const next = poorReports >= 2 ? Math.min(quality + 1, profiles.length - 1) :
          healthyReports >= 5 ? Math.max(quality - 1, 0) : quality;
        if (next !== quality) {
          quality = next;
          poorReports = healthyReports = 0;
          applyQuality?.();
        }
      });
      control?.on("close", () => { if (channel === control) channel = null; });
    }
    const current = peer.call(to, capture);
    if (!current) {
      retryCall();
      return;
    }
    call = current;
    const connection = current.peerConnection;
    const videoSender = connection.getSenders().find(sender => sender.track === track);
    poorReports = healthyReports = 0;
    let applying = false;
    applyQuality = async () => {
      if (!videoSender || call !== current || applying) return;
      const parameters = videoSender.getParameters();
      if (!parameters.encodings?.length) return;
      const level = quality;
      parameters.degradationPreference = "maintain-resolution";
      parameters.encodings[0].maxFramerate = profiles[level].fps;
      parameters.encodings[0].maxBitrate = profiles[level].bitrate;
      applying = true;
      try {
        await videoSender.setParameters(parameters);
      } catch {
        // Some browsers restrict changes to the encoder while sending.
      } finally {
        applying = false;
        if (call === current && quality !== level) applyQuality();
      }
    };
    applyQuality();
    current.on("close", () => { if (call === current) retryCall(); });
    current.on("error", () => { if (call === current) retryCall(); });
    const updateConnection = () => {
      if (call !== current || ended) return;
      const state = connection.connectionState ?? connection.iceConnectionState;
      if (state === "connected" || state === "completed") {
        clearTimeout(connecting);
        applyQuality();
        failures = 0;
        recoveryDeadline = 0;
        status.textContent = "Đã kết nối với máy tính. Bạn có thể mở Liên Quân.";
      } else if (state === "disconnected") {
        clearTimeout(connecting);
        status.textContent = "Tín hiệu gián đoạn. Đang chờ mạng phục hồi…";
        connecting = setTimeout(recoverTransport, 5000);
      } else if (state === "failed" || state === "closed") {
        recoverTransport();
      }
    };
    connecting = setTimeout(recoverTransport, 25000);
    connection.addEventListener("connectionstatechange", updateConnection);
    connection.addEventListener("iceconnectionstatechange", updateConnection);
    updateConnection();
  }

  peer.on("open", () => {
    clearTimeout(opening);
    if (ended) return;
    if (capture) connect();
    else if (!requesting) {
      start.disabled = false;
      status.textContent = "Sẵn sàng phát màn hình.";
    }
  });
  peer.on("error", error => {
    if (ended || error.type === "disconnected") return;
    if (peer.destroyed) {
      finish("Dịch vụ ghép đôi đã đóng. Hãy mở mã QR mới.");
      return;
    }
    if (["network", "socket-error", "socket-closed", "peer-unavailable"].includes(error.type)) {
      if (capture && !call) retryCall();
      return;
    }
    if (!capture) finish("Không ghép nối được. Hãy mở mã QR mới từ máy tính.");
  });
  peer.on("disconnected", () => {
    if (ended) return;
    if (capture && !call) retryCall();
    else setTimeout(() => {
      if (!ended && peer.disconnected) peer.reconnect();
    }, 1500);
  });

  let requesting = false;
  start.addEventListener("click", async () => {
    if (ended || requesting) return;
    if (capture) {
      start.disabled = true;
      recoveryDeadline = 0;
      failures = 0;
      if (peer.disconnected) peer.reconnect();
      else connect();
      return;
    }
    requesting = true;
    start.disabled = true;
    status.textContent = "Đang chờ cấp quyền chia sẻ màn hình…";
    try {
      const selected = await devices.getDisplayMedia({ video: true, audio: false });
      if (ended) {
        selected.getTracks().forEach(item => item.stop());
        return;
      }
      capture = selected;
      [track] = capture.getVideoTracks();
      if (!track || track.readyState === "ended") {
        finish("Không nhận được video từ iPhone. Hãy mở mã QR mới.");
        return;
      }
      if ("contentHint" in track) track.contentHint = "detail";
      track.addEventListener("ended", () => {
        if (ended || capture !== selected) return;
        clearTimeout(connecting);
        clearTimeout(retry);
        retry = null;
        recoveryDeadline = 0;
        const previous = call;
        call = null;
        capture = null;
        track = null;
        selected.getTracks().forEach(item => item.stop());
        previous?.close();
        if (channel?.open) channel.send({ type: "capture-ended" });
        start.disabled = false;
        stop.hidden = true;
        status.textContent = "iPhone đã dừng quay màn hình. Bấm Phát màn hình để tiếp tục cùng phòng.";
      }, { once: true });
      stop.hidden = false;
      status.textContent = "Đang gửi hình tới máy tính…";
      if (peer.disconnected) retryCall();
      else connect();
    } catch {
      if (ended) return;
      start.disabled = false;
      status.textContent = "Chưa mở được màn hình. Bạn có thể bấm phát lại.";
    } finally {
      requesting = false;
    }
  });

  function resumeConnection() {
    if (ended || retry || !start.disabled) return;
    if (peer.disconnected) peer.reconnect();
    else if (capture && !call) connect();
  }

  window.addEventListener("online", resumeConnection);
  window.addEventListener("pageshow", resumeConnection);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resumeConnection();
  });
  stop.addEventListener("click", () => finish("Đã dừng phát màn hình."));
  window.addEventListener("pagehide", event => { if (!event.persisted) finish(""); });
})();
