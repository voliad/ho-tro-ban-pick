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
  const peer = new window.Peer(from);
  let capture;
  let track;
  let call;
  let ended = false;
  let connecting;
  let retry;
  let failures = 0;
  let recoveryDeadline = 0;
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

  function retryCall() {
    if (ended || retry) return;
    if (!recoveryDeadline) recoveryDeadline = Date.now() + 85000;
    if (Date.now() >= recoveryDeadline || peer.destroyed) {
      finish("Chưa khôi phục được kết nối. Hãy mở mã QR mới.");
      return;
    }
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
    const current = peer.call(to, capture);
    if (!current) {
      retryCall();
      return;
    }
    call = current;
    const connection = current.peerConnection;
    const videoSender = connection.getSenders().find(sender => sender.track === track);
    if (videoSender) {
      const parameters = videoSender.getParameters();
      if (parameters.encodings?.length) {
        parameters.degradationPreference = "balanced";
        parameters.encodings[0].maxFramerate = 12;
        parameters.encodings[0].maxBitrate = 1600000;
        videoSender.setParameters(parameters).catch(() => {});
      }
    }
    current.on("close", () => { if (call === current) retryCall(); });
    current.on("error", () => { if (call === current) retryCall(); });
    const updateConnection = () => {
      if (call !== current || ended) return;
      const state = connection.connectionState ?? connection.iceConnectionState;
      if (state === "connected" || state === "completed") {
        clearTimeout(connecting);
        failures = 0;
        recoveryDeadline = 0;
        status.textContent = "Đã kết nối với máy tính. Bạn có thể mở Liên Quân.";
      } else if (state === "disconnected") {
        clearTimeout(connecting);
        status.textContent = "Tín hiệu gián đoạn. Đang chờ mạng phục hồi…";
        connecting = setTimeout(retryCall, 5000);
      } else if (state === "failed" || state === "closed") {
        retryCall();
      }
    };
    connecting = setTimeout(retryCall, 25000);
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
    if (ended || requesting || capture) return;
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
      track.addEventListener("ended", () => finish("Đã dừng phát màn hình."), { once: true });
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

  window.addEventListener("online", () => {
    if (!ended && peer.disconnected) peer.reconnect();
  });
  stop.addEventListener("click", () => finish("Đã dừng phát màn hình."));
  window.addEventListener("pagehide", () => finish(""));
})();
