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

  function reset(message, manual = false) {
    const cleanup = stopSource;
    stream = null;
    stopSource = null;
    preview.srcObject = null;
    preview.hidden = true;
    stop.hidden = true;
    start.disabled = requesting || !devices?.getDisplayMedia;
    status.textContent = message;
    cleanup?.(manual);
  }

  async function show(capture, cleanup, message) {
    const [track] = capture.getVideoTracks();
    if (!track || track.readyState === "ended") throw Error("No live video track");
    if (stream) reset("");
    stream = capture;
    stopSource = cleanup;
    track.addEventListener("ended", () => {
      if (stream === capture) reset("Đã dừng chia sẻ màn hình.");
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
    start.disabled = true;
    await preview.play();
    if (stream === capture) {
      status.textContent = message;
      preview.dispatchEvent(new Event("draft-share-ready"));
    }
  }

  window.DRAFT_SCREEN = {
    show,
    clear(capture) {
      if (stream === capture) reset("");
    },
  };

  start.disabled = !devices?.getDisplayMedia;
  start.addEventListener("click", async () => {
    requesting = true;
    start.disabled = true;
    status.textContent = "Đang chờ bạn chọn cửa sổ chiếu…";
    let capture;
    try {
      capture = await devices.getDisplayMedia({ video: { displaySurface: "window" }, audio: false });
      const cleanup = () => capture.getTracks().forEach(track => track.stop());
      if (stream) cleanup();
      else await show(capture, cleanup, "Đang hiển thị nguồn đã chia sẻ.");
    } catch (error) {
      capture?.getTracks().forEach(track => track.stop());
      if (!stream || stream === capture) {
        reset(error.name === "NotAllowedError" || error.name === "AbortError"
          ? "Chưa chia sẻ cửa sổ. Bạn có thể bấm để chọn lại."
          : "Không mở được nguồn chia sẻ. Hãy thử chọn lại.");
      }
    } finally {
      requesting = false;
      start.disabled = Boolean(stream) || !devices?.getDisplayMedia;
    }
  });

  stop.addEventListener("click", () => reset("Đã dừng chia sẻ màn hình.", true));
  window.addEventListener("pagehide", () => {
    if (stream) reset("");
  });
})();
