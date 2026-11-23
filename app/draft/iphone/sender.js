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
    status.textContent = "Hãy mở mã QR mới từ mục Nhận từ iPhone trên máy tính.";
    return;
  }
  if (!devices?.getDisplayMedia || !window.Peer) {
    status.textContent = "Không gọi được chức năng chia sẻ màn hình. Hãy mở liên kết bằng Safari trên iOS 27 trở lên.";
    return;
  }

  status.textContent = "Đang chuẩn bị ghép nối…";
  const peer = new window.Peer(from);
  let capture;
  let call;
  let ended = false;
  let connecting;
  let opening = setTimeout(() => finish("Không ghép nối được. Hãy mở mã QR mới."), 15000);

  function finish(message) {
    if (ended) return;
    ended = true;
    clearTimeout(opening);
    clearTimeout(connecting);
    capture?.getTracks().forEach(track => track.stop());
    peer.destroy();
    start.disabled = true;
    stop.hidden = true;
    status.textContent = message;
  }

  peer.on("open", () => {
    clearTimeout(opening);
    opening = null;
    if (ended) return;
    start.disabled = false;
    status.textContent = "Sẵn sàng phát màn hình.";
  });
  peer.on("error", () => finish("Không ghép nối được. Hãy mở mã QR mới từ máy tính."));
  peer.on("disconnected", () => {
    if (!call) finish("Mất kết nối ghép đôi. Hãy mở mã QR mới.");
  });

  start.addEventListener("click", async () => {
    start.disabled = true;
    status.textContent = "Đang chờ cấp quyền chia sẻ màn hình…";
    try {
      const selected = await devices.getDisplayMedia({ video: true, audio: false });
      if (ended) {
        selected.getTracks().forEach(track => track.stop());
        return;
      }
      capture = selected;
      const [track] = capture.getVideoTracks();
      if (!track || track.readyState === "ended") {
        finish("Không nhận được video từ iPhone. Hãy mở mã QR mới.");
        return;
      }
      if ("contentHint" in track) track.contentHint = "detail";
      track.addEventListener("ended", () => finish("Đã dừng phát màn hình."), { once: true });
      call = peer.call(to, capture);
      if (!call) throw Error("Unable to create media session");
      stop.hidden = false;
      status.textContent = "Đang gửi hình tới máy tính…";
      connecting = setTimeout(() => finish("Máy tính chưa nhận được kết nối. Hãy thử lại trên cùng mạng Wi-Fi."), 25000);
      call.on("close", () => finish("Phiên chia sẻ đã kết thúc."));
      call.on("error", () => finish("Kết nối video thất bại. Hãy mở mã QR mới."));
      const connection = call.peerConnection;
      const videoSender = connection.getSenders().find(sender => sender.track === track);
      if (videoSender) {
        const parameters = videoSender.getParameters();
        parameters.degradationPreference = "maintain-resolution";
        if (parameters.encodings?.length) parameters.encodings[0].maxFramerate = 15;
        videoSender.setParameters(parameters).catch(() => {});
      }
      const updateConnection = () => {
        if (connection.connectionState === "connected") {
          clearTimeout(connecting);
          status.textContent = "Đã kết nối với máy tính. Bạn có thể mở Liên Quân.";
        }
        if (["failed", "closed"].includes(connection.connectionState)) finish("Đã mất kết nối với máy tính.");
      };
      connection.addEventListener("connectionstatechange", updateConnection);
      updateConnection();
    } catch (error) {
      if (ended) return;
      if (error.name === "NotAllowedError" || error.name === "AbortError") {
        start.disabled = false;
        status.textContent = "Chưa cấp quyền chia sẻ. Bạn có thể bấm phát lại.";
      } else {
        finish("Không mở được luồng màn hình. Hãy mở mã QR mới rồi thử lại.");
      }
    }
  });

  stop.addEventListener("click", () => finish("Đã dừng phát màn hình."));
  window.addEventListener("pagehide", () => finish(""));
})();
