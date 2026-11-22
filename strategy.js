(() => {
  "use strict";

  const fanpage = "https://www.facebook.com/aovtacticsguides";
  const goldArticle = fanpage + "/posts/905465832398976/";
  const patch = "https://lienquan.garena.vn/chi-tiet-ban-cap-nhat-vet-nut-thoi-khong-29-09-2026/";
  const goldFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

  function page(title, tag, parent, description, body) {
    document.title = title + " | Hỗ trợ Ban Pick";
    return '<div class="wrap subpage knowledge-page"><a class="subtle-link" href="' + "/ho-tro-ban-pick" + parent + '">' + tag +
      '</a><div class="page-head attack-head"><div><h1>' + title + '</h1><p>' + description + '</p></div></div>' + body + '</div>';
  }

  function renderGold(container) {
    container.innerHTML = page("Hiệu quả vàng", "Wiki", "/wiki", "Định giá chỉ số cơ bản rồi xét nội tại theo tình huống sử dụng.",
      '<div class="attack-layout"><section class="panel data-panel attack-summary" aria-labelledby="gold-meaning"><h2 id="gold-meaning">Mỗi đồng vàng mua được gì?</h2>' +
      '<p>Lấy giá mỗi đơn vị chỉ số từ món cấp thấp làm mốc. Quy đổi các chỉ số cơ bản sang vàng, cộng lại rồi chia cho giá mua. Kết quả 100% nghĩa là hai giá trị bằng nhau trong hệ quy chiếu đã chọn.</p>' +
      '<p>Bài phân tích ngày 14/3/2026 cho phép xét riêng nội tại cho chỉ số ổn định. Nội tại có điều kiện cần đánh giá theo khả năng kích hoạt và công dụng trong trận. Báo giá từ vài món cấp thấp cũng chỉ định giá được các chỉ số có mốc quy đổi tương ứng.</p>' +
      '<div class="attack-sources"><a class="subtle-link" href="' + goldArticle + '">Bài phân tích AoV Tactics &amp; Guides ngày 14/3/2026</a></div></section>' +
      '<section class="panel data-panel attack-summary" aria-labelledby="gold-calc-title"><h2 id="gold-calc-title">Tính tỷ lệ quy đổi</h2>' +
      '<div class="attack-fields"><label><span>Giá mua (vàng)</span><input id="gold-cost" value="2040" type="number" min="1" step="any" inputmode="decimal"></label>' +
      '<label><span>Giá trị chỉ số (vàng)</span><input id="gold-stats" value="2040" type="number" min="0" step="any" inputmode="decimal"></label></div>' +
      '<div class="gold-output" aria-live="polite"><strong id="gold-ratio"></strong><p id="gold-diff"></p></div>' +
      '<p class="source-note">Ví dụ mặc định là Khiên Thánh Quang theo cách quy đổi của bài ATG ngày 22/11.</p></section></div>' +
      '<section id="khien-thanh-quang" class="panel data-panel knowledge-section attack-summary" aria-labelledby="shield-title">' +
      '<div class="knowledge-item"><img src="/ho-tro-ban-pick/art/khien-thanh-quang.webp" width="64" height="64" alt=""><div><h2 id="shield-title">Khiên Thánh Quang</h2>' +
      '<p>2.040 vàng theo bài ATG ngày 22/11/2026.</p></div></div>' +
      '<dl class="attack-results"><div><dt>Máu tối đa</dt><dd>+1.000</dd></div><div><dt>Giáp vật lý</dt><dd>+180</dd></div>' +
      '<div><dt>Giảm hồi chiêu</dt><dd>+10%</dd></div><div><dt>Hiệu quả vàng theo ATG</dt><dd>100%</dd></div></dl>' +
      '<p>Quang Thuẫn kích hoạt khi gây sát thương lên tướng địch bằng đánh thường hoặc kỹ năng. Lá chắn cho người dùng và đồng minh có máu thấp nhất ở gần tồn tại 3 giây và hấp thụ 250–500 sát thương cộng 4% máu tối đa. Khi đi một mình, lá chắn tăng 50%. Hồi chiêu là 10 giây cho tướng đánh gần và 12,5 giây cho tướng đánh xa theo ghi chú Garena.</p>' +
      '<p>Cân nhắc món này khi cần cùng lúc máu, giáp vật lý và giảm hồi chiêu. Khiên Huyền Thoại nghiêng về hồi chiêu, Áo Choàng Băng Giá dành thêm giá trị cho đòn đánh cường hóa, còn Huân Chương Troy đáp ứng nhu cầu kháng phép. Tỷ lệ 100% của ATG chỉ định giá chỉ số cơ bản, nên giá trị lá chắn cần xét theo số lần bạn kích hoạt đúng lúc.</p>' +
      '<div class="attack-sources"><a class="subtle-link" href="' + fanpage + '">AoV Tactics &amp; Guides, bài phân tích ngày 22/11/2026</a>' +
      '<a class="subtle-link" href="' + patch + '">Garena, chỉ số và nội tại trang bị</a></div></section>' +
      '<section class="panel data-panel knowledge-section attack-summary"><h2>Cách đọc bảng trang bị pháp sư tháng 3</h2>' +
      '<p>Trong bộ trang bị bài viết khảo sát, nhóm pháp sư đạt trung bình khoảng 103,57% theo chỉ số cơ bản. Nhóm đỡ đòn đạt khoảng 85,2%, hoặc 91,84% khi bỏ Giáp Hộ Mệnh khỏi mẫu. Các số này phụ thuộc vào món được đưa vào mẫu và mốc quy đổi. Chúng giúp so sánh giá mua chỉ số ở thời điểm đo; để so trang bị trong trận, còn cần đánh giá kèo đấu, ngưỡng chỉ số và nội tại.</p>' +
      '<a class="subtle-link" href="/ho-tro-ban-pick/wiki?tab=items">Mở danh mục trang bị</a></section>');

    const cost = container.querySelector("#gold-cost");
    const stats = container.querySelector("#gold-stats");
    const ratio = container.querySelector("#gold-ratio");
    const difference = container.querySelector("#gold-diff");
    function calculate() {
      const price = cost.valueAsNumber;
      const value = stats.valueAsNumber;
      const costValid = Number.isFinite(price) && price > 0;
      const statsValid = Number.isFinite(value) && value >= 0;
      cost.setAttribute("aria-invalid", String(!costValid));
      stats.setAttribute("aria-invalid", String(!statsValid));
      const percent = value / price * 100;
      if (!costValid || !statsValid || !Number.isFinite(percent)) {
        ratio.textContent = "—";
        difference.textContent = "Nhập giá mua lớn hơn 0 và giá trị chỉ số từ 0 trở lên.";
        return;
      }
      ratio.textContent = goldFormat.format(percent) + "%";
      difference.textContent = value === price ? "Giá trị quy đổi bằng giá mua." :
        (value > price ? "Giá trị quy đổi cao hơn " : "Giá trị quy đổi thấp hơn ") +
          goldFormat.format(Math.abs(value - price)) + " vàng so với giá mua.";
    }
    cost.addEventListener("input", calculate);
    stats.addEventListener("input", calculate);
    calculate();
    if (location.hash === "#khien-thanh-quang") container.querySelector(location.hash).scrollIntoView();
  }

  function renderCalls(container) {
    container.innerHTML = page("Gọi lệnh trong đội", "Giáo án", "/guides", "Ba vai trò giao tiếp khi đánh đội và cách tập trước mục tiêu lớn.",
      '<div class="tool-grid knowledge-calls"><section class="panel tool"><h2>Báo thông tin</h2>' +
      '<p>Nêu điều vừa quan sát được để cả đội cập nhật bản đồ. Ưu tiên vị trí địch, kỹ năng quan trọng đã dùng và trạng thái lính.</p>' +
      '<p class="knowledge-example">Ví dụ: “Rừng địch vừa lộ ở đường Rồng.”</p></section>' +
      '<section class="panel tool"><h2>Shot-caller</h2><p>Đề xuất hành động cho tình huống đang diễn ra. Người ở gần nhất có thể kêu mở, lùi, đổi mục tiêu hoặc giữ kỹ năng.</p>' +
      '<p class="knowledge-example">Ví dụ: “Lùi khỏi hang, chưa có góc vào.”</p></section>' +
      '<section class="panel tool"><h2>IGL</h2><p>Điều phối quyết định chiến thuật chung. Tổng hợp thông tin, ưu tiên phương án và giúp cả đội thực hiện cùng một kế hoạch.</p>' +
      '<p class="knowledge-example">Ví dụ: “Đẩy giữa trước rồi quay Caesar. Trợ thủ giữ cửa sông.”</p></section></div>' +
      '<section class="panel data-panel knowledge-section attack-summary"><h2>Tập quanh Caesar</h2>' +
      '<ol><li>Trước trận, thống nhất ai chốt nhịp mục tiêu và ai thay khi người đó đang xử lý giao tranh.</li>' +
      '<li>Khi chuẩn bị mục tiêu, từng vị trí báo ngắn điều mình nhìn thấy. Người có góc tốt nhất đề xuất hành động và người điều phối chốt phương án khi có đủ dữ kiện.</li>' +
      '<li>Xem lại mic-check sau trận. Kiểm tra thông tin nào đến muộn, hai lời kêu gọi nào xung đột và cả đội có thực hiện cùng một lựa chọn hay không.</li></ol>' +
      '<p>Bài ATG ngày 21/11/2026 gợi ý thử người chơi Giữa hoặc Trợ thủ cầm nhịp nếu người đi rừng cần tập trung gánh sát thương. Phân vai theo cách đội bạn xử lý thông tin. Một người có thể kiêm nhiều vai trò.</p>' +
      '<div class="attack-sources"><a class="subtle-link" href="' + fanpage + '">AoV Tactics &amp; Guides, bài IGL ngày 21/11/2026</a></div></section>');
  }

  function esportsRecap() {
    return '<section id="dtdv-dong-2026" class="panel data-panel knowledge-section attack-summary">' +
      '<h2>Kết quả ĐTDV mùa Đông 2026</h2><p>Video tổng kết của AoV Tactics &amp; Guides đăng ngày 10/11 nhìn lại việc hai đội tên tuổi dừng bước. Bảng dưới đối chiếu tỷ số công bố của giải.</p>' +
      '<div class="table-scroll"><table><thead><tr><th scope="col">Ngày</th><th scope="col">Trận</th><th scope="col">Tỷ số</th></tr></thead><tbody>' +
      '<tr><td>24/10</td><td>BOX Gaming gặp FPT x Flash</td><td>4–3</td></tr>' +
      '<tr><td>07/11</td><td>BOOM Esports gặp Saigon Phantom</td><td>4–2</td></tr>' +
      '<tr><td>07/11</td><td>FPT Polytechnic gặp BOOM Esports, chung kết</td><td>4–2</td></tr>' +
      '</tbody></table></div><div class="attack-sources"><a class="subtle-link" href="https://www.facebook.com/reel/1035998539048810/">Video tổng kết của AoV Tactics &amp; Guides</a>' +
      '<a class="subtle-link" href="https://fpt.vn/tin-tuc/dtdv-mua-dong-2026-lich-thi-dau-ket-qua-15510.html">Kết quả play-off</a>' +
      '<a class="subtle-link" href="https://fpt.vn/tin-tuc/fpt-polytechnic-vo-dich-dtdv-mua-dong-2026-15826.html">Kết quả chung kết</a></div></section>';
  }

  window.AOV_STRATEGY = { renderGold, renderCalls, esportsRecap };
})();
