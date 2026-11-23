(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const start = $("iphone-receive");
  const panel = $("iphone-room");
  const invite = $("iphone-invite");
  const qr = $("iphone-qr");
  const status = $("iphone-room-status");
  const recover = $("iphone-recover");
  let room;

  function close(message = "") {
    const previous = room;
    room = null;
    if (previous) {
      clearTimeout(previous.timer);
      clearTimeout(previous.reconnect);
      clearInterval(previous.watch);
      previous.peer.destroy();
      if (previous.stream) window.DRAFT_SCREEN.clear(previous.stream);
    }
    start.disabled = false;
    invite.hidden = true;
    recover.hidden = true;
    qr.replaceChildren();
    panel.hidden = !message;
    status.textContent = message;
  }

  start.addEventListener("click", () => {
    if (room) return;
    panel.hidden = false;
    if (!window.Peer || !window.QRCode || !window.RTCPeerConnection || !crypto.randomUUID) {
      status.textContent = "Không mở được kết nối. Hãy thử Ban Pick qua HTTPS trên Chrome hoặc Edge.";
      return;
    }
    start.disabled = true;
    status.textContent = "Đang tạo kết nối riêng…";
    const receiver = crypto.randomUUID();
    const sender = crypto.randomUUID();
    const peer = new window.Peer(receiver);
    const current = { peer, timer: setTimeout(() => close("Kết nối đã hết hạn. Hãy tạo mã mới."), 180000) };
    room = current;

    peer.on("open", () => {
      if (room !== current) return;
      if (current.link) {
        if (!current.call) status.textContent = "Đang chờ iPhone phát màn hình.";
        return;
      }
      const url = new URL("./iphone/", location.href);
      url.hash = new URLSearchParams({ to: receiver, from: sender }).toString();
      current.link = url.href;
      new window.QRCode(qr, { text: url.href, width: 176, height: 176, correctLevel: window.QRCode.CorrectLevel.M });
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
      const waitForReconnect = () => {
        if (room !== current || current.call !== call) return;
        current.call = null;
        clearInterval(current.watch);
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
      current.timer = setTimeout(waitForReconnect, 25000);
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
          const frameProgress = () => video?.getVideoPlaybackQuality?.().totalVideoFrames || video?.currentTime;
          let frameTime = frameProgress();
          let lastFrame = performance.now();
          let lastRequest = 0;
          current.watch = setInterval(() => {
            if (room !== current || current.call !== call || document.hidden || !video || video.srcObject !== stream) return;
            const now = performance.now();
            const progress = frameProgress();
            if (progress !== frameTime) {
              frameTime = progress;
              lastFrame = now;
              lastRequest = 0;
              if (status.textContent !== "Đã nhận màn hình iPhone.") status.textContent = "Đã nhận màn hình iPhone.";
            } else if (now - lastFrame > 6000) {
              status.textContent = "Chưa nhận được khung hình mới từ iPhone.";
              if (video.paused) video.play().catch(() => {});
              if (current.channel?.open && (!lastRequest || now - lastRequest > 15000)) {
                lastRequest = now;
                status.textContent = "Luồng video đứng. Đang yêu cầu iPhone gửi lại hình…";
                current.channel.send({ type: "restart-video" });
              }
            }
          }, 1000);
        } catch {
          waitForReconnect();
        }
      });
      call.on("close", waitForReconnect);
      call.on("error", waitForReconnect);
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
