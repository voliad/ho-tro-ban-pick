(() => {
  "use strict";

  const start = document.getElementById("airplay-start");
  const stop = document.getElementById("airplay-stop");
  const status = document.getElementById("airplay-status");
  const preview = document.getElementById("airplay-preview");
  const devices = navigator.mediaDevices;
  let stream;
  let stopSource;
  let requesting = false;
  let localStream;
  let shareSession;

  function updateStart() {
    const canCapture = Boolean(devices?.getDisplayMedia);
    start.disabled = !canCapture || requesting || Boolean(stream && stream !== localStream);
    start.textContent = stream && stream === localStream ? "Chọn lại nguồn" : "Chọn nguồn trên máy tính";
  }

  function reset(message, manual = false, reconnecting = false) {
    const cleanup = stopSource;
    stream = null;
    localStream = null;
    stopSource = null;
    preview.srcObject = null;
    preview.hidden = true;
    stop.hidden = true;
    updateStart();
    status.textContent = message;
    if (!reconnecting && shareSession) {
      shareSession = undefined;
      preview.dispatchEvent(new Event("draft-share-ended"));
    }
    cleanup?.(manual);
  }

  async function show(capture, cleanup, message, session = capture) {
    const [track] = capture.getVideoTracks();
    if (!track || track.readyState === "ended") throw Error("No live video track");
    if (stream) reset("", false, shareSession === session);
    shareSession = session;
    stream = capture;
    stopSource = cleanup;
    track.addEventListener("ended", () => {
      if (stream === capture) reset("Đã dừng chia sẻ màn hình.", false, session !== capture);
    }, { once: true });
    track.addEventListener("mute", () => {
      if (stream === capture) status.textContent = "Nguồn chia sẻ tạm ngừng gửi hình.";
    });
    track.addEventListener("unmute", () => {
      if (stream !== capture) return;
      status.textContent = message;
      preview.play().catch(() => {});
    });
    preview.srcObject = capture;
    preview.hidden = false;
    stop.hidden = false;
    updateStart();
    await preview.play();
    if (stream === capture) {
      status.textContent = message;
      preview.dispatchEvent(new CustomEvent("draft-share-ready", { detail: session }));
    }
  }

  window.DRAFT_SCREEN = {
    show,
    clear(capture) {
      if (stream === capture) reset("", false, true);
    },
    end(session) {
      if (shareSession === session) reset("Đã dừng chia sẻ màn hình.");
    },
  };

  updateStart();
  start.addEventListener("click", async () => {
    if (requesting || stream && stream !== localStream) return;
    requesting = true;
    updateStart();
    status.textContent = "Đang chờ bạn chọn cửa sổ chiếu…";
    let capture;
    try {
      capture = await devices.getDisplayMedia({
        video: { displaySurface: "window", frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const cleanup = () => capture.getTracks().forEach(track => track.stop());
      if (stream && stream !== localStream) {
        cleanup();
        return;
      }
      const [track] = capture.getVideoTracks();
      if (!track || track.readyState === "ended") throw Error("No live video track");
      const source = track.getSettings().displaySurface;
      const label = source === "window" ? "cửa sổ" : source === "monitor" ? "màn hình" :
        source === "browser" ? "thẻ trình duyệt" : "nguồn chia sẻ";
      await show(capture, cleanup, "Đang đọc hình từ " + label + " trên máy tính.");
      if (stream === capture) localStream = capture;
    } catch (error) {
      capture?.getTracks().forEach(track => track.stop());
      if (!stream || stream === capture) {
        reset(error.name === "NotAllowedError" || error.name === "AbortError"
          ? "Chưa chia sẻ cửa sổ. Bạn có thể bấm để chọn lại."
          : "Không mở được nguồn chia sẻ. Hãy thử chọn lại.");
      } else if (stream === localStream) {
        status.textContent = "Vẫn đang đọc nguồn trước. Bạn có thể chọn lại khi sẵn sàng.";
      }
    } finally {
      requesting = false;
      updateStart();
    }
  });

  stop.addEventListener("click", () => reset("Đã dừng chia sẻ màn hình.", true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && localStream && preview.paused) preview.play().catch(() => {});
  });
  window.addEventListener("pagehide", event => {
    if (stream && !event.persisted) reset("");
  });
})();
