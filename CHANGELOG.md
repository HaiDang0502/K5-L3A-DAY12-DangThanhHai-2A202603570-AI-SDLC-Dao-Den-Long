# Changelog

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
Có số chuẩn, 3 bản đồ, lướt, tạm dừng, Gió Lạc, Bùa Gió, rơi khỏi đảo. Chi tiết trong `docs/notes/phase-2.md`.

## [phase-1] — PRD-0 (Contract v1.0)
Đêm 1 chơi được, có chế độ headless.
