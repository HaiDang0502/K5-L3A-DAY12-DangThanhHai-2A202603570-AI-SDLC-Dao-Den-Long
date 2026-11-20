# Changelog

## [phase-4] / v1.0.0 — Ticket-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)

### Thêm mới
- `game.contract.json`: `contract_version` **1.3**, thêm `bench_cmd` (`node scripts/bench.js`) và `soak_cmd` (`node --expose-gc scripts/soak.js`). `run_cmd` đổi thành `node scripts/serve.js` để nhận được `--export-leaderboard`.
- **Benchmark:**
  - Cảnh chuẩn (`src/sim/bench.js`): 200 Bóng Mực `wander`, 100 đom đóm, L1–L3 đầy dầu. Tắt sinh thêm, sát thương, nhặt, hao dầu và kết thúc Đêm.
  - Camera bay vòng bán kính 30 m, cao 15 m, 15 s một vòng.
  - Đo trong Chrome thật ở cửa sổ 1280×720, tắt vsync. Ghi `bench.json` (avg 139 / p1 71.9 FPS trên máy tác giả).
- **Soak test:** 10 Đêm trong cùng một tiến trình, input ngẫu nhiên theo seed. Ghi `soak.json` (0 crash, RAM ×1.1).
- **Bảng xếp hạng cục bộ:** top 10 lưu trên đĩa, có màn hình xem và lệnh `--export-leaderboard`.
- **Dễ tiếp cận:** đổi phím (báo trùng, khôi phục mặc định), phụ đề và mũi tên chỉ Bóng Mực, giảm chuyển động, chữ ≥ 18 px và chữ lớn ×1.25.
- **Đóng gói:** `npm run package` tạo `dist/dao-den-long-v1.0.0.tar.gz`. Gói đã kèm three.js, chỉ cần Node để chạy.

### Thay đổi phá vỡ tương thích
- Không có thay đổi nào với luật hay định dạng headless của v1.0–v1.2. Contract chỉ thêm khóa mới.
- `run_cmd` đổi từ `npm start` sang `node scripts/serve.js`. `npm start` vẫn chạy được.
- Các phím di chuyển không còn nhận thêm phím mũi tên cố định. Phím nào được dùng hoàn toàn theo cấu hình đổi phím.

### Test
- Thêm `tests/release.test.js` (RL-01…05): quy tắc bảng xếp hạng, lệnh xuất, cảnh bench, công thức số đo, soak. Tổng cộng 47 test.

## [phase-3] — Ticket-03 "Đèn cạn dầu" (Contract v1.2)

### Thay đổi phá vỡ tương thích (breaking)
- `contract_version` từ `1.1` lên **`1.2`**.
- Thời lượng Đêm 1/2/3 từ 300/330/360 s xuống **240/270/300 s**.
- **Không còn thắng sớm.** `game_over.reason = "all_lit"` bị bỏ. Thắng được báo bằng **`dawn_survived`** ở tick bình minh nếu số đèn sáng ≥ ceil(0,6 × tổng đèn).
- **Điểm:**
  - +5 mỗi đom đóm nạp (trước: +10);
  - thắp lần đầu +100, thắp lại +40;
  - Tỏa Sáng +5 mỗi Bóng Mực, +15 nếu nó đang `drain`;
  - khi thắng: +50 + floor(fuel) cho mỗi đèn sáng, +50 cho mỗi Ngọn Lửa;
  - **bỏ thưởng thời gian** (`per_second_left` = 0).
- **Đèn đã sáng vẫn nhận Tương tác** để châm dầu (sự kiện `refuel`). Trước đây chỉ đèn chưa sáng được chọn.
- **Vùng an toàn** chỉ còn ở đèn sáng có **fuel ≥ 30**.
- **Sức chứa** không cố định 10 nữa: `min(20, 10 + 2 × successful_lights)`.
- Sự kiện `lantern_lit` có thêm trường `relight`.

### Thêm mới
- tuning: `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max` (cùng các khóa điểm bổ sung trong `score`).
- Snapshot:
  - đèn có thêm `fuel` (1 chữ số thập phân), `ever_lit`, `relit_count`;
  - `player` có thêm `capacity`;
  - trạng thái Bóng Mực có thêm **`drain`**.
- Scenario:
  - đèn nhận `lit`, `fuel`, `ever_lit` (`lit: true` không kèm fuel thì fuel = 100);
  - `player.successful_lights`;
  - `shades[].target_lantern_id`.
- Sự kiện: `refuel`, `lantern_out`, `fuel_drain` (mỗi 60 tick khi đang hút).
- Web:
  - thanh dầu trên đèn, nhấp nháy 1 Hz khi dầu dưới 30;
  - đèn tắt bị xẹp 20% và có vết rách;
  - HUD hiện `đang mang / sức chứa` và số đèn cần giữ;
  - cài đặt **Bảng màu dễ phân biệt**: viền và mắt Bóng Mực #00B3FF, cảnh báo #FFFFFF kèm ⚠, được lưu lại.
- Web (nằm ngoài ticket, làm sau tag phase-2): camera xoay theo chuột bằng Pointer Lock.

### Test đã sửa vì luật mới (không skip)
- **AC-01:** thời lượng 300 s đổi thành 240 s.
- **AC-05:** điểm +10 đổi thành +5; `lantern_lit` có thêm `relight`.
- **AC-09:** "thắng ngay khi đủ đèn" được thay bằng "không thắng sớm, thắng `dawn_survived` ở bình minh".
- **CT-01:** `contract_version` 1.2.
- **Bằng chứng:**
  - P2-01: điểm 20 đổi thành 10;
  - P2-15: thắng bằng `dawn_survived`;
  - P2-16: số tick một đêm 18000/19800/21600 đổi thành 14400/16200/18000.

## [phase-2] — Ticket-02 "Ba hòn đảo" (Contract v1.1)

### Thay đổi phá vỡ tương thích
- Số chuẩn thay mọi số tự chọn ở Phase 1:
  - nhặt 1.0 m, sức chứa 10, đèn cần 10;
  - Tỏa Sáng tốn 3, bán kính 5 m (3D), hồi chiêu 3 s;
  - Bóng Mực 4 m/s.
- Điểm +10 tính khi **nạp** đom đóm, không còn tính khi nhặt.
- Vùng an toàn chỉ còn quanh **đèn đã sáng**.
- Bị đánh: đom đóm rơi ra đất và nhặt lại được. Có thể rơi khỏi đảo (`player_hit` với `by: "fall"`).
- Trạng thái Bóng Mực: `spawning`, `wander`, `chase`, `recoil`, `stunned`.

### Thêm mới
- `--night 1|2|3` với bản đồ chuẩn: Đảo Bến, Đảo Cau (cầu tre, bục nhảy), Đảo Chuông (3 tầng, dốc, tháp, gió).
- Lướt, tạm dừng, Gió Lạc, Bùa Gió.
- Trường snapshot mới: `night`, `wind`, `vel`, `grounded`, cooldown, `motes`/`drifters`/`charms`.
- Sự kiện mới: `dash`, `charm_picked`, `drifter_steal`, `drifter_drop`, `night_start`, `paused`, `resumed`.
- Web: chuỗi 3 Đêm kèm lời Ông Đăng, tạm dừng và cài đặt, HUD đầy đủ, bảng màu chuẩn, nhạc nền và hiệu ứng âm thanh, zoom bằng cuộn chuột.

## [phase-1] — PRD-0 (Contract v1.0)
- Đêm 1 chơi được từ đầu tới thắng/thua (Three.js, chạy trên trình duyệt).
- Chế độ headless theo Test Contract v1.0, có `game.contract.json`.
- Lõi luật chơi tất định dùng chung cho game và headless.
- 22 test và bằng chứng headless; harness gồm AGENTS.md, skill `verify-game`, hook Stop và CI.
