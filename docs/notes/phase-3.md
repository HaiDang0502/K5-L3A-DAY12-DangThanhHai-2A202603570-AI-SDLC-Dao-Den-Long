# Phase 3 — Ticket-03 "Đèn cạn dầu" (Contract v1.2)

Quyết định thiết kế: [ADR 0001](../adr/0001-lantern-fuel-and-dawn-win.md). Thay đổi phá vỡ tương thích: [CHANGELOG](../../CHANGELOG.md).

## Giả định

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A3-01 | "Đèn đầy dầu (used = 0)" | Vì dầu hao ở bước 2, trước bước tương tác, nên đèn chỉ đầy đúng trong tick vừa được thắp hoặc châm. Ở tick sau vẫn châm được 1 đom đóm. Đây là cách đọc thứ tự xử lý theo nghĩa đen. |
| A3-02 | Bóng Mực `wander` khi không có đèn yếu | Đi về **đèn tắt** gần nhất rồi lảng vảng ở đó (trong 2 m). Nếu mọi đèn đều sáng và còn ≥ 30 dầu thì đi lang thang ngẫu nhiên như Phase 2. |
| A3-03 | Bóng Mực tới đèn yếu | Có thể đi vào trong 6 m vì đèn yếu không còn vùng an toàn. Vẫn bị chặn ở mép 6 m của các đèn khác còn ≥ 30 dầu. |
| A3-04 | `fuel_drain` | Mỗi con đang hút có một bộ đếm riêng. Sự kiện được ghi khi bộ đếm đạt 60, 120, … tick kể từ lúc con đó bắt đầu `drain`. `fuel` là dầu còn lại sau lần trừ của tick đó. |
| A3-05 | Thưởng bình minh | `floor(fuel)` dùng dầu thật ở tick bình minh, tính sau khi đã hao trong tick đó. |
| A3-06 | `per_second_left` | Đặt 0 (thưởng thời gian bị bỏ). Các khóa điểm mới (`per_relight`, `per_stun_draining`, `per_lit_lantern_at_dawn`, `per_fuel_at_dawn`) được thêm vào `score`. |
| A3-07 | Bóng Mực đang bị đẩy ra lúc châm lên ≥ 30 | Dùng lại cơ chế đẩy ra của Ticket-02: tối đa 30 tick, không gây sát thương trong lúc đó. |

## Acceptance criteria → test

| ID | Tiêu chí | Test | Bằng chứng |
|---|---|---|---|
| FL-01 | Thắp: fuel = 100, hao đúng 1/s (đơn vị nguyên), có `fuel`/`ever_lit`/`relit_count`/`capacity` | fuel.test.js | P3-01 |
| FL-02 | Hết dầu: `lantern_out`, deposited 0, ever_lit giữ nguyên; thắp lại tốn 5, +40, `relight: true` | fuel.test.js | P3-01 |
| FL-03 | Châm dầu: `used = min(mang, ceil((100−fuel)/10))`, +5 mỗi đom đóm, chọn đèn gần nhất (bằng nhau → id nhỏ) | fuel.test.js | P3-02 |
| FL-04 | Sức chứa 10 + 2 × số lần thắp, tối đa 20 | fuel.test.js | P3-06 |
| FL-05 | Dầu < 30 mất vùng an toàn (đúng 30 vẫn giữ); Bóng Mực wander tới hút 5/s; `fuel_drain` mỗi 60 tick | fuel.test.js | P3-03 |
| FL-06 | Lối thoát khỏi `drain`: chase (≤ 6 m), stunned (+15), wander | fuel.test.js | — |
| FL-07 | Châm lên ≥ 30: Bóng Mực trong vùng bị đẩy ra trong ≤ 30 tick, không gây sát thương | fuel.test.js | — |
| FL-08 | Bình minh: thắng `dawn_survived` nếu số đèn sáng ≥ ceil(0,6 n) (3/5, 4/6, 5/7), kèm thưởng; ngược lại thua `dawn` | fuel.test.js | P3-04 |
| FL-09 | Không còn thắng sớm | fuel.test.js | P3-05 |
| FL-10 | Scenario: `lit: true` không kèm fuel thì fuel = 100; fuel sai → lỗi (exit 2) | fuel.test.js | — |
| UI-06 | Thanh dầu, nhấp nháy 1 Hz khi dầu < 30, đèn tắt xẹp 20% và có vết rách, HUD sức chứa và số đèn cần giữ, chế độ mù màu | review code + `screenshot-night1.png` | — |

## Nhật ký AI và đánh giá

- **Kết quả:** 42/42 test đạt (11 test mới cho Ticket-03), 25/25 kiểm tra bằng chứng đạt. Bot tự chơi thắng Đêm 1 bằng `dawn_survived`.
- **AI sai và cách phát hiện:**
  1. Script sửa test chèn chú thích `//` vào giữa dòng, che mất dấu `)` đóng lệnh → lỗi cú pháp cả file test. Phát hiện vì file test báo đỏ.
  2. Năm kỳ vọng test sai:
     - tính nhầm dầu còn 90,2 (đúng là 90,0);
     - quên rằng dầu hao trước khi tương tác, nên đèn "đầy" vẫn được châm 1 đom đóm;
     - đặt đom đóm ngoài bán kính nhặt 1 m;
     - quên lượng dầu bị hút trong cùng tick (39,9 chứ không phải 40);
     - cho chạy quá ít tick nên đèn chưa kịp tắt.

     Cách xử lý: in giá trị thật, đối chiếu với spec, rồi sửa test. Không sửa code.
  3. Tiêu đề FL-05 hứa kiểm "đúng 30 vẫn còn vùng an toàn" nhưng chưa có assert nào cho điều đó. Đã bổ sung trường hợp biên 30 và 29,98.
- **Token:** ước tính khoảng 120–150k cho Phase 3. Các bản vá được viết thành script trong scratchpad để tránh viết lại cả file lớn. _Cập nhật bằng số thật từ `/cost`._
- **Chưa đạt / chưa kiểm:**
  - UI chế độ mù màu chỉ được review code, chưa chụp ảnh ở chế độ này;
  - FPS vẫn chưa đo trên GPU thật (giống Phase 2);
  - bot vẫn chưa thắng Đêm 2–3.
