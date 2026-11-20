# Retro — Đảo Đèn Lồng (4 phase, Day 12 AI SDLC)

## 1. Tổng hợp Evaluation 4 phase

| Phase | Yêu cầu chính | Test / bằng chứng | Đạt | Chưa đạt hoặc chưa kiểm |
|---|---|---|---|---|
| 1 — PRD-0 | Đêm 1 chơi được, headless v1.0 | 22 test, 9 kiểm tra | Mọi bàn giao; bot thắng | Chưa đo độ khó với người chơi thật |
| 2 — Ticket-02 | Số chuẩn, 3 bản đồ, lướt, tạm dừng, Gió Lạc, Bùa Gió, v1.1 | 31 test, 19 kiểm tra | Mọi tính năng có scenario headless | FPS chưa đo; bot chỉ thắng Đêm 1 |
| 3 — Ticket-03 | Dầu đèn, `drain`, thắng lúc bình minh, sức chứa, mù màu, v1.2 | 42 test, 25 kiểm tra, ADR, CHANGELOG | Bot thắng Đêm 1 bằng `dawn_survived` sau 2 lần thắp lại | Chưa chụp ảnh chế độ mù màu |
| 4 — Ticket-04 | Bench, soak, bảng xếp hạng, dễ tiếp cận, phát hành v1.3 | 47 test, 25 kiểm tra, `bench.json`, `soak.json` | Bench 139 / p1 71,9 FPS; soak 0 crash, RAM ×1,1 | Số đo trên máy chấm; video do tác giả quay |

Không phase nào làm hỏng phase trước. Test bị luật mới thay đều được sửa có ghi lý do (xem CHANGELOG), không test nào bị skip.

## 2. Điều hiệu quả và không hiệu quả khi làm với AI

**Hiệu quả**
- **Một lõi luật tất định, tách khỏi phần hiển thị** (`src/sim/`), quyết định ngay từ giờ đầu. Nhờ vậy cả 4 ticket chỉ cần sửa một chỗ, và mọi test headless cũng đúng với game người chơi thấy.
- **Số liệu tập trung trong `tuning.js`** và test CT-01 so khớp với `game.contract.json`. Khi ticket đổi số, contract không thể lệch với code.
- **Script bằng chứng chạy CLI thật** (`npm run proof`) thay cho "agent bảo chạy rồi". Mỗi phase chỉ thêm kiểm tra mới; các kiểm tra cũ thành bộ regression.
- **Viết bản vá thành script** (Python thay chuỗi, kiểm tra đúng một lần xuất hiện) thay vì viết lại cả file lớn. Cách này rẻ token và không lặng lẽ sửa sai chỗ.

**Không hiệu quả**
- Phase 2 tốn nhiều token nhất: một lần đọc toàn bộ ticket, lập kế hoạch dài, rồi viết lại cả `sim.js` và `main.js`. Người dùng đã phải nhắc về chi phí giữa chừng.
- Bot tự chơi tốn công nhưng chỉ chứng minh được Đêm 1. Đáng lẽ nên quyết định sớm hơn rằng "mỗi cơ chế có scenario riêng là đủ".
- Shell gộp nhiều lệnh (vòng lặp chụp ảnh, curl POST, heredoc có backtick) nhiều lần bị chặn hoặc lỗi phân tích cú pháp. Tách thành từng lệnh nhỏ thì chạy ổn.

## 3. Những lần AI sai và cách phát hiện

| Lỗi | Phát hiện bằng | Chỉnh harness / cách làm |
|---|---|---|
| Kiểm tra "luôn đạt": P-09 (Phase 1) và P2-16 (Phase 2) báo PASS dù đêm không chạy đủ, vì nhân vật đứng yên chết sớm | Đọc cột Observed trong `results.md` | Thêm quy tắc vào AGENTS.md: "a check must prove the claim (ticks == duration*60)"; skill `verify-game` nhắc đọc Observed |
| Khoảng 15 kỳ vọng test sai (đếm tick, làm tròn, thứ tự hao dầu, top 10…) | Test đỏ, rồi in giá trị thật | AGENTS.md: "print the real values first; decide from the SPEC whether code or test is wrong" |
| Lỗi thật trong code: snapshot thiếu vận tốc phóng của bục nhảy | Test FT-07 | Thêm test |
| Lỗi thật trong code: biến bench bị dùng trước khi khởi tạo (TDZ), bench treo | Bench báo hết thời gian chờ, rồi đọc log console của Chrome headless | Thêm log `BENCH_DEBUG`; lệnh khởi động đặt ở cuối file |
| Đo `mem_start` sai thời điểm (sau khi chơi xong Đêm 1 thay vì sau khi tải) | Đối chiếu lại định nghĩa trong ticket | Sửa đúng định nghĩa và đo lại (lần đó trượt ngưỡng, ×1,28). Phân tích 10 Đêm so với 30 Đêm cho thấy không rò rỉ. Thêm GC và thời gian chờ để V8 trả bộ nhớ trước khi đo cuối |
| Chú thích chèn giữa dòng che mất dấu `)` | Lỗi cú pháp cả file test | Bản vá luôn được chạy `node --check` / `npm test` ngay sau đó |

## 4. Harness giúp nhiều nhất

1. **`npm run proof` cùng skill `verify-game`:** một lệnh chạy mọi scenario qua CLI thật và ghi `results.md` có cột Observed. Đây là nơi bắt được cả hai lỗi "luôn đạt".
2. **Hook `Stop`** (`.claude/settings.json`): chặn agent kết thúc khi `npm test` đỏ. Nhờ đó không lần nào tag một phase khi test còn đỏ.
3. **AGENTS.md ngắn** (khoảng 30 dòng), có mục "contract details that are easy to get wrong", được cập nhật ở mỗi phase.
4. **CI GitHub Actions** chạy test trên ubuntu và macos, khớp yêu cầu chạy được trên macOS/Linux.

## 5. Token và chi phí (ước tính)

| Phase | Token ước tính | Ghi chú |
|---|---|---|
| 1 | 150–200k | Đọc lab board (trích 36 KB thay vì 180 KB), dựng lõi, web, test |
| 2 | 250–300k | Viết lại sim, 3 bản đồ, UI. Tốn nhất |
| 3 | 120–150k | Vá bằng script, không viết lại file |
| 4 | 150–200k | Bench, soak, bảng xếp hạng, dễ tiếp cận, tài liệu |
| **Tổng** | **khoảng 0,7–0,85 triệu** | _Thay bằng số thật từ `/cost` hoặc trang usage._ |

Những cách đã tiết kiệm: trích đúng đoạn spec cần; vá bằng script thay vì viết lại file; gom kiểm chứng vào một lệnh; không dùng subagent; dừng tối ưu bot khi nó không còn thêm giá trị kiểm chứng.

## 6. Nếu làm lại

- Dựng `proof.js` với kiểm tra "đêm chạy đủ" **ngay từ đầu**, và tách mẫu kiểm tra yếu thành helper dùng chung.
- Thiết kế máy trạng thái của đèn và Bóng Mực mở rộng được ngay từ Phase 1. Ticket-03 đã cho thấy luật "đèn sáng vĩnh viễn" chắc chắn sẽ bị thay.
- Viết test trình duyệt tự động (Playwright) cho menu, đổi phím, bảng xếp hạng thay vì chỉ review code và chụp ảnh.
- Ước lượng phạm vi bot sớm: chỉ cần bot cho Đêm 1, các Đêm khác dùng scenario.
