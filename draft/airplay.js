(() => {
  "use strict";

  const start = document.getElementById("airplay-start");
  const stop = document.getElementById("airplay-stop");
  const status = document.getElementById("airplay-status");
  const preview = document.getElementById("airplay-preview");
  const devices = navigator.mediaDevices;
  let stream;

  function reset(message) {
    const previous = stream;
    stream = null;
    previous?.getTracks().forEach(track => track.stop());
    preview.srcObject = null;
    preview.hidden = true;
    stop.hidden = true;
    start.disabled = false;
    status.textContent = message;
  }

  if (!devices?.getDisplayMedia) {
    start.disabled = true;
    status.textContent = "Trình duyệt hiện tại chưa hỗ trợ chia sẻ màn hình.";
    return;
  }

  start.addEventListener("click", async () => {
    start.disabled = true;
    status.textContent = "Đang chờ bạn chọn cửa sổ chiếu…";
    try {
      const capture = await devices.getDisplayMedia({ video: { displaySurface: "window" }, audio: false });
      stream = capture;
      const [track] = capture.getVideoTracks();
      if (!track || track.readyState === "ended") {
        reset("Cửa sổ chiếu không còn khả dụng. Hãy chọn lại cửa sổ.");
        return;
      }
      track.addEventListener("ended", () => {
        if (stream === capture) reset("Đã dừng chia sẻ cửa sổ.");
      }, { once: true });
      preview.srcObject = capture;
      preview.hidden = false;
      stop.hidden = false;
      await preview.play();
      if (stream === capture) {
        status.textContent = "Đang hiển thị nguồn đã chia sẻ.";
        preview.dispatchEvent(new Event("draft-share-ready"));
      }
    } catch (error) {
      reset(error.name === "NotAllowedError" || error.name === "AbortError"
        ? "Chưa chia sẻ cửa sổ. Bạn có thể bấm để chọn lại."
        : "Không mở được nguồn chia sẻ. Hãy thử chọn lại.");
    }
  });

  stop.addEventListener("click", () => reset("Đã dừng chia sẻ cửa sổ."));
  window.addEventListener("pagehide", () => {
    if (stream) reset("");
  });
})();
