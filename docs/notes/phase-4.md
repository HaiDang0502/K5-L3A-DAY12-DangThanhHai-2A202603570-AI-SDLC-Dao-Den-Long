# Phase 4 — Ticket-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)

## Giả định

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A4-01 | Cửa sổ 1280×720 cho bản web | `bench.js` mở Chrome/Chromium/Edge thật ở chế độ `--app` với `--window-size=1280,720`. Vsync được tắt bằng `--disable-gpu-vsync --disable-frame-rate-limit`. |
| A4-02 | `load_ms` | Tính từ lúc tiến trình `bench.js` bắt đầu tới khi trang báo khung hình đầu tiên của cảnh bench (`/bench/first-frame`). |
| A4-03 | `peak_mem_mb` (web) | Để `null`: trang không đọc được RSS của trình duyệt. File có thêm `js_heap_peak_mb` lấy từ Chrome `performance.memory`. |
| A4-04 | "Rải đều trên đảo" | Phân bố hình hoa hướng dương (Fibonacci) trên đĩa bán kính 38 m, cộng nhiễu nhỏ theo seed 42. Đom đóm dùng đĩa 37 m. |
| A4-05 | Bóng Mực `wander` trong bench | Giữ trạng thái `wander` (không chuyển sang chase vì Mây). Chúng đi về đèn tắt gần nhất theo luật wander của Ticket-03 (đèn sáng luôn đầy dầu). |
| A4-06 | Soak: kết quả Đêm | Mỗi Đêm chạy tới khi kết thúc hoặc hết thời lượng chuẩn. Input ngẫu nhiên đúng theo tỉ lệ trong ticket. `results` là `won` hoặc `lost`. |
| A4-07 | Soak: đo bộ nhớ | `mem_start` đo ngay sau khi tạo Sim Đêm 1. `mem_end` đo sau khi bỏ Sim cuối, gọi `gc()` 3 lần cách nhau 200 ms để V8 trả lại trang nhớ (`soak_cmd` có `--expose-gc`). |
| A4-08 | Lưu bảng xếp hạng | File `data/leaderboard.json` do server ghi (`run_cmd`). Nếu mở bằng host tĩnh không có API thì dùng localStorage. |
| A4-09 | Tên tiếng Việt | Chấp nhận chữ Unicode, dấu và số (`\p{L}\p{M}\p{N}_`, 3–12 ký tự, chuẩn hóa NFC). |
| A4-10 | Phím Esc | Luôn mở menu tạm dừng, không đổi được: khi chuột đang bị khóa, trình duyệt luôn dùng Esc để nhả chuột. Phím tạm dừng thứ hai (mặc định P) thì đổi được. |

## Acceptance criteria

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| RL-01 | Bảng xếp hạng: top 10, điểm giảm dần, bằng điểm thì ai trước đứng trên, kiểm tra tên, ISO có múi giờ | tests/release.test.js |
| RL-02 | `--export-leaderboard out.json` cho ra `{entries}` đúng thứ tự, đọc từ đĩa | tests/release.test.js |
| RL-03 | Cảnh bench: 200/100/L1–L3 đầy dầu; không sinh thêm, sát thương, nhặt, hao dầu, kết thúc; Bóng Mực có di chuyển; tất định | tests/release.test.js |
| RL-04 | Công thức avg_fps, p1_low_fps, p95 đúng định nghĩa | tests/release.test.js |
| RL-05 | Soak CLI có đủ trường, 0 crash | tests/release.test.js, `soak.json` |
| BENCH | avg ≥ 60, p1 ≥ 30, load ≤ 10 000 ms | `bench.json` (máy tác giả; máy chấm là chính thức) |
| SOAK | crashes = 0, mem_end ≤ 1,2 × mem_start | `soak.json` |
| A11Y | Đổi phím (báo trùng, khôi phục mặc định, lưu); phụ đề và mũi tên chỉ Bóng Mực; giảm chuyển động; chữ ≥ 18 px và ×1,25 | review `src/web/`, ảnh `screenshot-menu-release.png` |
| PKG | Gói phát hành chạy được từ thư mục sạch chỉ với Node | giải nén vào thư mục sạch, chạy headless và server (mục bằng chứng) |

## Nhật ký AI và đánh giá
Xem [docs/retro.md](../retro.md) để biết lỗi AI, harness và token. Riêng Phase 4:
- **Lỗi bench treo:** biến bench bị dùng trước khi khởi tạo (TDZ). Phát hiện nhờ log console của Chrome.
- **Soak từng trượt ngưỡng (×1,28):** nguyên nhân là đo `mem_start` không đúng định nghĩa và V8 chưa trả bộ nhớ. Đã sửa cách đo; chạy thử 30 Đêm cũng không thấy rò rỉ.
- **Kỳ vọng sai trong RL-01:** phần tử thứ 10 của top 10.

Chưa đạt hoặc do tác giả làm:
- **Video demo** (tác giả tự quay);
- **số đo trên máy chấm;**
- **test trình duyệt tự động cho UI** (hiện mới review code và chụp ảnh).
