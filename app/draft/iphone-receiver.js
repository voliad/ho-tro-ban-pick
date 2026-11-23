(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const start = $("iphone-receive");
  const panel = $("iphone-room");
  const invite = $("iphone-invite");
  const qr = $("iphone-qr");
  const status = $("iphone-room-status");
  let room;

  function close(message = "") {
    const previous = room;
    room = null;
    if (previous) {
      clearTimeout(previous.timer);
      previous.peer.destroy();
      if (previous.stream) window.DRAFT_SCREEN.clear(previous.stream);
    }
    start.disabled = false;
    invite.hidden = true;
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
    let receiving = false;
    peer.on("open", () => {
      if (room !== current) return;
      const url = new URL("./iphone/", location.href);
      url.hash = new URLSearchParams({ to: receiver, from: sender }).toString();
      current.link = url.href;
      new window.QRCode(qr, { text: url.href, width: 176, height: 176, correctLevel: window.QRCode.CorrectLevel.M });
      invite.hidden = false;
      status.textContent = "Đang chờ iPhone phát màn hình.";
    });
    peer.on("call", call => {
      if (room !== current || call.peer !== sender || receiving) {
        call.close();
        return;
      }
      receiving = true;
      invite.hidden = true;
      qr.replaceChildren();
      clearTimeout(current.timer);
      current.timer = setTimeout(() => close("Chưa nhận được hình. Hãy kiểm tra hai thiết bị cùng Wi-Fi rồi tạo mã mới."), 25000);
      status.textContent = "Đã ghép nối. Đang chờ hình từ iPhone…";
      call.on("stream", async stream => {
        if (room !== current || current.stream || !stream.getVideoTracks().length) return;
        current.stream = stream;
        try {
          await window.DRAFT_SCREEN.show(stream, () => {
            if (room === current) close("Đã ngắt kết nối iPhone.");
          }, "Đang hiển thị màn hình iPhone.");
          if (room !== current) return;
          clearTimeout(current.timer);
          status.textContent = "Đã nhận màn hình iPhone.";
        } catch {
          if (room === current) close("Đã kết nối nhưng không phát được video. Hãy thử lại.");
        }
      });
      call.on("close", () => {
        if (room === current) close("iPhone đã dừng chia sẻ.");
      });
      call.on("error", () => {
        if (room === current) close("Mất kết nối video. Hãy tạo mã mới.");
      });
      call.answer();
    });
    peer.on("error", () => {
      if (room === current && !current.stream) close("Không kết nối được dịch vụ ghép đôi. Hãy thử lại.");
    });
    peer.on("disconnected", () => {
      if (room === current && !current.stream) close("Dịch vụ ghép đôi đã ngắt. Hãy tạo mã mới.");
    });
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
  window.addEventListener("pagehide", () => close());
})();
