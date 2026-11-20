# Phase 1 — PRD-0 + Test Contract v1.0

## 1. Quyết định công nghệ

- **Node.js + Three.js 0.160 (web).** Lý do: máy làm bài là Windows, đề bắt buộc chạy được trên macOS/Linux, và bản web cùng Node chạy trên cả ba. Headless chỉ cần Node, không cần trình duyệt hay GPU.
- **Một lõi luật duy nhất** (`src/sim/`) dùng chung cho game và headless. Phần hiển thị không chứa luật, nên những gì test headless chứng minh cũng đúng với game người chơi thấy.
- Trạng thái thời gian (choáng, bất tử, hồi chiêu) lưu bằng **số tick nguyên** (`stunUntil`, `invulnUntil`, `pulseReadyAt`) để tránh sai số dấu phẩy động và giữ tính tất định.

## 2. Giả định cho chỗ PRD-0 mơ hồ

| # | Chỗ mơ hồ | Giả định đã chọn |
|---|---|---|
| A1 | "Tốn ánh sáng" khi tỏa sáng | Mỗi lần tỏa sáng tốn `pulse_cost = 1` đom đóm đang mang. Không đủ đom đóm hoặc đang hồi chiêu thì không có gì xảy ra và không ghi sự kiện. |
| A2 | Tỏa sáng ảnh hưởng ai | Mọi Bóng Mực trong bán kính ≤ 6 m (kể cả con đang choáng, khi đó thời gian choáng được đặt lại). Mỗi con +20 điểm. Bị đẩy 4 m theo hướng từ Mây ra ngoài. Sự kiện `pulse` vẫn được ghi khi không trúng con nào (`stunned_ids: []`). |
| A3 | `safe_radius` | Áp dụng cho **mọi** đèn, đã sáng hay chưa. Bóng Mực bị đẩy ra cách đèn `safe_radius + 0.01` m. Đây là nghĩa "Bóng Mực sợ những chiếc đèn". |
| A4 | Nạp đèn | Chỉ khi nhấn `interact` (cạnh lên), vào đèn **chưa sáng gần nhất** trong `interact_radius`. Nạp `min(carried, cost − deposited)`, nên có thể nạp từng phần. |
| A5 | Rơi đom đóm khi bị chạm | `dropped = floor(carried × 0.5)`. Đom đóm rơi **mất hẳn** (không rơi xuống đất). |
| A6 | Điểm thưởng cuối màn | `per_second_left` và `per_flame_left` **chỉ cộng khi thắng**. Số giây = `floor(time_left_s)` tại tick thắng. |
| A7 | Thua | Hết lửa → `lost/no_flames`. Hết giờ → `lost/dawn`. Thắp hết đèn → `won/all_lit`. |
| A8 | Rơi khỏi đảo | Không có (`fall_enabled: false`). Đảo bán kính 40 m. Mây và Bóng Mực bị giữ trong đảo. |
| A9 | Vị trí đèn | 5 đèn trên vòng tròn bán kính 25 m, L1 ở (0,0,25) (khớp ví dụ trong contract), các đèn sau cách nhau 72°. |
| A10 | Sinh đom đóm | Mặc định 25 con ngẫu nhiên trong vành 3–38 m. Cứ mỗi 3 s thêm 1 con nếu đang ít hơn 25. Scenario cho `motes` thì danh sách đó thay danh sách ban đầu. `random_motes: false` tắt việc sinh thêm. |
| A11 | Sinh Bóng Mực | Mặc định 2 con lúc dựng màn (không ghi sự kiện). Cứ mỗi 30 s thêm 1 con (sự kiện `shade_spawned`), tối đa 5 con. Sinh trên vòng 36 m, cố gắng cách Mây ≥ 15 m. Bóng Mực luôn đuổi Mây (trạng thái `chase`) trừ khi bị choáng (`stunned`). |
| A12 | Va chạm | Va chạm của Bóng Mực xét theo thứ tự danh sách, mỗi tick tối đa 1 lần. Bóng Mực đang choáng không gây sát thương. |
| A13 | Nhảy | Vận tốc 7 m/s, trọng lực 20 m/s². Mọi khoảng cách theo mặt phẳng XZ nên nhảy **không** né được Bóng Mực (theo quy ước khoảng cách của contract). |
| A14 | Snapshot | Chỉ ghi ở tick chia hết cho `--snapshot-every`. Không ghi thêm snapshot cuối khi game kết thúc giữa chừng (dòng `end` mang trạng thái cuối). Có thêm mảng `motes` (khuyến nghị). |
| A15 | Mã lỗi | File inputs/scenario không đọc được, JSON sai, kiểu sai, tick không tăng nghiêm ngặt, id đèn lạ → exit 2. Tham số CLI sai, `--night` khác 1 → exit 1. |
| A16 | Scenario đặt `deposited ≥ lantern_cost` | Đèn đó được coi là đã sáng, không ghi sự kiện và không cộng điểm. |

## 3. Tiêu chí nghiệm thu (→ test)

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-01 | Mô hình tick: snapshot 0 trước input; `--ticks N` chạy đúng N bước; `time_left = dur − steps/60` | tests/sim.test.js |
| AC-02 | Di chuyển 6 m/s, xoay theo `cam_yaw_deg` đúng công thức, vector dài hơn 1 được chuẩn hóa | tests/sim.test.js |
| AC-03 | Nhảy rồi rơi về y = 0 | tests/sim.test.js |
| AC-04 | Nhặt trong bán kính ≤ 1.5 m, +10 điểm, không vượt sức chứa | tests/sim.test.js |
| AC-05/06 | Nạp đèn (cạnh lên), nạp từng phần, đèn sáng ở 5, +100, ngoài tầm thì không nạp | tests/sim.test.js |
| AC-07/08 | Tỏa sáng: tốn 1, đẩy 4 m, choáng đúng 120 tick, hồi chiêu, thiếu ánh sáng thì không kích hoạt | tests/sim.test.js, proof P-07 |
| AC-09/10 | Bị chạm: −1 lửa, rơi floor(50%), bất tử 90 tick, hết lửa thì thua | tests/sim.test.js, proof P-04 |
| AC-11 | Hết giờ → thua `dawn` | tests/sim.test.js, proof P-05 |
| AC-12 | Thắp đèn cuối → thắng `all_lit` + điểm thưởng; dựng scenario không cộng điểm | tests/sim.test.js, proof P-02 |
| AC-13 | Bóng Mực không vào `safe_radius` | tests/sim.test.js, proof P-06 |
| AC-14 | Bóng Mực đuổi với tốc độ 3.5 m/s | tests/sim.test.js |
| AC-15 | Màn mặc định: 5 đèn, đom đóm ngẫu nhiên, Bóng Mực sinh ra kèm sự kiện | tests/sim.test.js |
| AC-16 | Tất định (cùng seed, scenario, inputs → output giống hệt nhau) | tests/sim.test.js, proof P-03 |
| AC-17 | Tọa độ làm tròn 3 chữ số | tests/sim.test.js |
| CT-01..05 | `game.contract.json` khớp code; định dạng JSONL; mã thoát 0/2/≠0; ví dụ của contract | tests/contract.test.js |
| UI-01 | Game có giao diện: Mây đội nón lá có đèn nhỏ, HUD (lửa, đom đóm, đèn, điểm, thời gian, hồi chiêu), đảo sáng dần | ảnh chụp trong docs/proof/phase-1 |

## 4. Nhật ký dùng AI

- **Công cụ:** Claude Code (Claude Opus 5.5) trong VS Code.
- **Cách làm:** đọc lab board và các file GUIDE/RUBRIC → chọn công nghệ → viết lõi `sim` theo đúng mô hình tick → chạy thử ví dụ của contract → game web → test nghiệm thu → bot tự chơi và script bằng chứng → harness → tài liệu.
- **Lời nhắc chính:** "tạo game 3d 'Đảo đèn lồng' theo hướng dẫn từ github và link (lab board)".
- **Token / chi phí:** ước tính khoảng 150–200k token cho Phase 1. Phần lớn là đọc spec (HTML lab board khoảng 180 KB, chỉ trích đoạn PRD-0 khoảng 36 KB để tiết kiệm) và viết code. _Cập nhật bằng con số thật từ `/cost` hoặc trang usage._
- **Cách tiết kiệm:** chỉ trích phần PRD-0 khỏi file HTML lớn thay vì đọc cả file; dùng script `proof.js` một lệnh thay cho nhiều lần chạy tay; giữ AGENTS.md ngắn.

### Những lần AI sai và cách phát hiện

1. **Test AC-04 lỗi** vì test đưa scenario thô vào `Sim` mà không qua `parseScenario` như CLI thật vẫn làm. Phát hiện khi chạy `npm test`. Đã sửa: test luôn đi qua parser, giống đường đi của CLI.
2. **`node --test tests/`** không chạy được trên Node 24 (Node 24 không nhận thư mục làm đối số). Đã đổi sang liệt kê từng file test.
3. **Phím xoay camera trùng phím E (nạp đèn)** trong bản đầu của `main.js`. Phát hiện khi review diff. Đã đổi sang Z/C.
4. **Cảnh quá tối** trong ảnh chụp đầu tiên. Đã tăng ánh sáng và exposure, chụp lại để kiểm tra.
5. **`import.meta.dirname`** chỉ có từ Node 20.11, trong khi `engines` khai Node ≥ 18. Đã đổi sang `fileURLToPath`.
6. **Kiểm tra P-09 yếu ("luôn đạt"):** bản đầu chỉ kiểm tra "có dòng `end`", trong khi người chơi đứng yên bị hạ ở tick 780, nên chưa hề chạy đủ 18000 tick. Phát hiện khi đọc cột Observed trong results.md. Đã sửa: tắt Bóng Mực và bắt buộc `ticks == 18000` cùng `reason == dawn`. Bài học: luôn đọc giá trị quan sát được, đừng chỉ nhìn PASS.

### Kiểm tra test có "răng"

Cố ý sửa sai hai luật (nhặt `<=` thành `<`; tắt `safe_radius`) rồi chạy `npm test`: AC-04, AC-13 và AC-15 chuyển sang đỏ. Khôi phục code thì lại 22/22 đạt. Như vậy test không phải loại lúc nào cũng đạt.

## 5. Đánh giá Phase 1

- **Đạt:** mọi bàn giao của PRD-0 (game chơi được từ đầu đến thắng/thua, README, contract, headless, bằng chứng, harness). 22/22 test đạt, 9/9 kiểm tra bằng chứng đạt.
- **Chưa kiểm chứng tự động:** cảm giác chơi của người thật (độ khó). Bot thắng mọi seed đã thử trong khoảng 45–55 s, nên độ khó có thể thấp. Chưa chỉnh vì PRD-0 không đặt yêu cầu độ khó.
- **Ảnh chụp:** Chrome headless để lại một dải tối ở mép dưới/phải ảnh vì viewport nhỏ hơn kích thước ảnh. Đây là đặc điểm của chế độ chụp, không phải của game.
- **Harness:** AGENTS.md (lệnh, quy ước, bẫy contract), skill `verify-game`, hook `Stop` chặn kết thúc khi `npm test` đỏ, CI GitHub Actions trên ubuntu và macos.
