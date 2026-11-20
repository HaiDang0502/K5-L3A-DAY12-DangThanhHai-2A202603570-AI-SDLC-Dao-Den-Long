# Phase 2 — Ticket-02 "Ba hòn đảo" (Contract v1.1)

## 1. Luật Phase 1 bị Ticket-02 thay thế

| Phase 1 (giả định cũ) | Ticket-02 (bắt buộc) |
|---|---|
| Điểm +10 khi **nhặt** đom đóm | +10 cho mỗi đom đóm **nạp** vào đèn |
| `safe_radius` cho **mọi** đèn (A3) | Chỉ đèn **đã sáng**; Bóng Mực bên trong lúc đèn vừa thắp bị đẩy ra trong ≤ 30 tick |
| Bị đánh: đom đóm rơi **mất hẳn** (A5) | Rơi ra vành 1,5–2,5 m, tồn tại 480 tick, nhặt lại được |
| Không thể rơi khỏi đảo (A8) | Rơi khi Y < −10: −1 Ngọn Lửa, mất hết đom đóm, chờ 60 tick rồi hồi sinh |
| Tỏa Sáng tốn 1, bán kính 6 m (XZ), choáng 2 s, đẩy tức thì | Tốn 3, bán kính 5 m (3D, tâm = chân + 0,8 m), đẩy 4 m trong 15 tick đầu |
| Điểm thưởng giây ×1, choáng +20 | Giây ×2, choáng +5 |
| Bóng Mực: 2 con lúc dựng màn, luôn `chase` | Lịch sinh từ tick 300, trạng thái `spawning/wander/chase/recoil/stunned` |
| Đèn ở bán kính 25 m tính bằng sin/cos | Tọa độ chuẩn (23.8, 0, 7.7)… |

**Test bị ảnh hưởng (sửa, không tắt):** AC-04 (bán kính nhặt 1.0, không cộng điểm khi nhặt), AC-05 (bán kính 2, điểm theo đom đóm nạp), AC-07 (Tỏa Sáng v1.1), AC-09 (rơi đom đóm ra đất), AC-12 (thứ tự thắng/thua), AC-13 (vùng an toàn chỉ quanh đèn sáng). Ở CT-05, đom đóm được nhặt ở tick 40 thay vì 35 vì bán kính đổi từ 1.5 thành 1.0. Các test Phase 1 còn đúng vẫn giữ: mô hình tick, di chuyển và camera, nhảy, tất định, mã thoát.

## 2. Giả định cho chỗ Ticket-02 chưa quy định

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A2-01 | Quy ước góc | θ đo từ +X về phía +Z: điểm = (r·cosθ, r·sinθ). Khớp tọa độ đèn chuẩn và "tầng 1 ở nửa z > 0". |
| A2-02 | Tăng tốc ≤ 0,1 s | Vận tốc đổi **tức thì** (0 s ≤ 0,1 s), điều khiển trên không đầy đủ. |
| A2-03 | Điểm xuất phát Đêm 3 | (0, 0, 0) nằm **trong tháp chuông**, nên dùng **(0, 0, −30)**, quay mặt về +Z. Đêm 1 và 2 giữ (0, 0, 0). |
| A2-04 | Bậc thềm / vách | Mây bước lên chênh lệch ≤ 0,3 m (đủ cho dốc). Cao hơn là vách, chặn theo từng trục (trượt dọc vách). |
| A2-05 | Lướt trên không | Lướt giữ nguyên độ cao (vy = 0); hết lướt thì rơi tiếp từ vy = 0. Lướt dùng hướng di chuyển, nếu đứng yên thì hướng mặt. |
| A2-06 | Trạng thái `spawning` | Kéo dài 30 tick: Bóng Mực đứng yên, không gây sát thương, sau đó chuyển `wander`. |
| A2-07 | `wander` | Bay chậm 1,5 m/s tới điểm ngẫu nhiên cách 2–8 m. Bóng Mực bay lơ lửng (y = mặt đất + 1), bỏ qua vách tầng, nhưng không ra khỏi đảo và không vào tháp. |
| A2-08 | Chênh cao khi chạm | So `player.pos.y` (chân) với `shade.pos.y` (tâm). Pulse đo 3D từ chân Mây + 0,8 m tới tâm Bóng Mực. |
| A2-09 | Bóng Mực bị đẩy ra khỏi đèn vừa thắp | Báo trạng thái hiện tại của nó (thường là `wander` hoặc `chase`). Trong lúc bị đẩy, nó không gây sát thương và không di chuyển theo AI. |
| A2-10 | Gió Lạc: "điểm sương ngẫu nhiên" | Dùng các điểm sinh Bóng Mực của Đêm đó. Bay ở mặt đất + 1,5 m. Khi bỏ chạy có thể bay ra ngoài đảo. Con `removed` vẫn nằm trong mảng `drifters`. |
| A2-11 | Gió | Cơn gió bắt đầu ở sim_tick 1800, 3600, …, kéo dài 300 tick, hướng `dir_deg` là số nguyên ngẫu nhiên 0–359. Gió chỉ đẩy Mây. `wind_enabled` mặc định bật ở Đêm 3. |
| A2-12 | `night_start` | Ghi ở tick 0, ngay sau snapshot 0. |
| A2-13 | `invuln` trong snapshot | Kiểu boolean (đang bất tử hay không). Các thời lượng khác dùng giây (`*_s`). |
| A2-14 | Đom đóm rơi ở chỗ không có mặt đất | Lấy độ cao chân Mây làm `pos.y`. Đom đóm vẫn nhặt được nếu Mây với tới. |
| A2-15 | Tạm dừng | Khi đang dừng, các trường input khác vẫn được cập nhật (cạnh lên tính trên giá trị giữ), nhưng không có hành động nào được thực hiện. |
| A2-16 | Cầu tre | Hình chữ nhật x ∈ [26, 44], z ∈ [−2, 2], cao Y = 0. Bước ra ngoài thì rơi. |

## 3. Acceptance criteria — Phần 3 (mỗi mục có ít nhất 1 scenario headless)

| ID | Tính năng | Tiêu chí kiểm chứng được | Test / bằng chứng |
|---|---|---|---|
| FT-01 | Lướt | Nhấn dash: 14 m/s × 12 tick = 2,8 m theo hướng mặt; hồi chiêu 90 tick tính từ lúc bắt đầu; giữ độ cao trên không | features.test.js, P2-07 |
| FT-02 | Tạm dừng | `pause` cạnh lên: tick vẫn tăng, sim_tick/thời gian/hồi chiêu đứng yên, state `paused`, sự kiện `paused`/`resumed` | features.test.js, P2-08 |
| FT-03 | Gió Lạc cướp | idle → chase (≥ 5 đom đóm, ≤ 15 m) → cướp min(3, n) một lần → flee 240 tick → removed; không mất lửa | features.test.js, P2-09 |
| FT-04 | Tỏa Sáng với Gió Lạc | Trúng lúc chase thì flee mà không cướp. Trúng lúc flee có đồ thì `drifter_drop`, đom đóm rơi tại chỗ, biến mất sau 120 tick | features.test.js, P2-10 |
| FT-05 | Lịch Gió Lạc | Sinh ở tick 1200, 2400… chỉ Đêm 2–3, tối đa 2, id D1, D2 | features.test.js |
| FT-06 | Bùa Gió | `charm_picked` 600 tick; chạy 7,2 m/s; lướt không hồi chiêu (nhấn khi đang lướt thì bỏ qua); bùa xuất hiện lại sau 2700 tick | features.test.js, P2-11 |
| FT-07 | Bục nhảy Đêm 2 | Vận tốc 14 m/s lên + 24 m/s ngang về đảo kia, bay khoảng 1,4 s, đáp trên đảo đích | features.test.js, P2-12 |
| FT-08 | Cầu tre | Đi qua cầu không rơi; bước ra mép cầu thì rơi | features.test.js |
| FT-09 | Địa hình Đêm 3 | Vách tầng chặn; dốc lên tầng 1 (Y = 3); bục (0,3,13) đáp tầng 2 (Y = 6); tháp không đi xuyên được | features.test.js, P2-13 |
| FT-10 | Gió Đêm 3 | Cơn gió ở 30 s, kéo dài 5 s, đẩy 2 m/s, có trong snapshot | features.test.js, P2-14 |
| FT-11 | Snapshot v1.1 | Có đủ các trường mới (night, wind, vel, grounded, invuln, cd, motes kind/ttl, drifters, charms) | features.test.js |
| UI-01 | Chuỗi 3 Đêm | Menu → giới thiệu (tên đảo, lời Ông Đăng) → chơi → kết quả → Đêm sau; thắng Đêm 3 → Bình Minh + tổng điểm; thua → chơi lại Đêm đó | chơi thử / review `src/web/main.js` |
| UI-02 | Tạm dừng + Cài đặt | Esc/P mở menu (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu); âm lượng và độ nhạy chuột lưu ở localStorage | chơi thử |
| UI-03 | HUD | Lửa trên trái; đồng hồ trên giữa (đỏ, nhấp nháy khi ≤ 30 s); đèn k/n và điểm trên phải; 10 ô đom đóm dưới giữa; hồi chiêu dưới phải; nhắc "E — Nạp ánh sáng (x/10)"; mũi tên chỉ đèn | ảnh `screenshot-night2/3.png` |
| UI-04 | Âm thanh | Nhạc nền + 10 loại hiệu ứng (nhặt, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s) | review `src/web/sfx.js` (chưa có test tự động) |
| UI-05 | Bảng màu + ánh sáng | Màu hex đúng bảng chuẩn (`C` trong main.js); ánh sáng môi trường = 0,15 + 0,55 × (đèn sáng / tổng) | review code |
| PERF-1 | Headless | Một Đêm đầy đủ ≤ 30 s | P2-16.1–3 (khoảng 0,2–0,3 s) |
| PERF-2 | ≥ 30 FPS ở 1280×720 | Đếm FPS bằng `?fps` | **chưa đo** trên máy có GPU (xem mục 5) |

## 4. Nhật ký dùng AI (Phase 2)

- **Token:** ước tính khoảng 250–300k (viết lại sim, 3 bản đồ, test, UI). _Cập nhật bằng số thật từ `/cost`._ Người dùng nhắc về chi phí token giữa phase, nên sau đó mình giảm đọc file và gộp các lần sửa.
- **AI sai và cách phát hiện:**
  1. Nhiều test viết sai kỳ vọng: đếm sim_tick khi tạm dừng; nhấn lướt khi đang lướt (spec nói bỏ qua); vị trí recoil; số tick bất tử còn lại. Phát hiện bằng cách chạy test rồi đọc giá trị thật trước khi sửa. **Test được sửa theo spec, không sửa code để chiều test.**
  2. Snapshot thiếu vận tốc phóng của bục nhảy (vel = 0 ở tick phóng). Đây là lỗi code thật, phát hiện nhờ FT-07.
  3. **Lặp lại lỗi "kiểm tra yếu" của Phase 1:** P2-16 (hiệu năng một Đêm) báo PASS trong khi Mây chết sớm nên đêm không chạy đủ. Đã sửa: cho Mây rất nhiều lửa và bắt buộc `ticks == thời lượng × 60` và `reason == dawn`. Đã thêm quy tắc này vào AGENTS.md.
  4. Bot Phase 1 không còn thắng với số chuẩn. Bot mới (né, lướt, nạp từng phần, tìm đường qua cầu/dốc/bục) thắng Đêm 1 ở seed 2. Đêm 2–3 chỉ thắp được một phần (xem mục 5).

## 5. Đánh giá Phase 2

- **Đạt:** số chuẩn Phần 1 (CT-01 kiểm tra contract khớp code); bản đồ 3 Đêm; mọi tính năng Phần 3 có scenario headless; Contract v1.1. Kết quả: 31/31 test, 19/19 kiểm tra bằng chứng.
- **Regression:** các test Phase 1 còn hiệu lực vẫn đạt. Test bị luật mới thay được liệt kê ở mục 1.
- **Chưa đạt / chưa kiểm chứng:**
  - **FPS ≥ 30 ở 1280×720:** chưa đo trên GPU thật. Ảnh chụp dùng Chrome headless chạy phần mềm. Cách đo: `npm start`, mở `http://localhost:8080/?autostart=1&night=3&fps`, xem số FPS ở góc trái dưới.
  - **Bot chưa thắng Đêm 2 và 3** (thắp được 2–3 đèn, thua vì rơi hoặc hết giờ). Đây là giới hạn của bot, chưa chứng minh được độ khó vừa phải cho người chơi. Từng cơ chế của Đêm 2–3 đã có scenario riêng.
  - UI (menu, tạm dừng, cài đặt, âm thanh) mới kiểm bằng review và ảnh chụp, chưa có test trình duyệt tự động.
