# Đảo Đèn Lồng

> **Video demo:** _(sẽ thêm ở Phase 4 — Release `v1.0.0`)_
> Đề bài lab: [lab board](https://claude.ai/artifact/Q1RYyv1dxjUczzCbd2ZnoW) · [GUIDE](GUIDE.md) · [RUBRIC](RUBRIC.md) · [SUBMISSION](SUBMISSION.md) · [RULES](RULES.md) · [CHECKPOINTS](CHECKPOINTS.md)

Game 3D góc nhìn thứ ba (Three.js, chạy trên trình duyệt). Mây, người giữ đèn nhỏ tuổi đội nón lá có treo một chiếc đèn lồng nhỏ, gom đom đóm để thắp lại các Đèn Lồng Lớn qua **3 Đêm**: Đảo Bến, Đảo Cau, Đảo Chuông. Mây phải né Bóng Mực và Gió Lạc trong sương đen. Mọi luật chơi nằm trong một lõi mô phỏng tất định (`src/sim/`), dùng chung cho game có giao diện và chế độ headless theo **Test Contract v1.1**.

![Đảo Đèn Lồng — Đêm 3, Đảo Chuông](docs/proof/phase-2/screenshot-night3.png)

## Cài đặt và chạy (macOS / Linux / Windows, cần Node.js ≥ 18)

```bash
git clone <repo-url> dao-den-long && cd dao-den-long
npm install
npm start          # mở http://localhost:8080
```

Headless (Test Contract v1.0):

```bash
node src/headless.js --seed 1 --night 1|2|3 --ticks 3600 --out out.jsonl [--scenario s.json] [--inputs i.json] [--snapshot-every 10]
```

Kiểm chứng: `npm test` (31 test: luật chơi, tính năng Ticket-02, contract) · `npm run proof` (chạy CLI thật trên các scenario, ghi [docs/proof/phase-2/results.md](docs/proof/phase-2/results.md)). Đếm FPS: mở `http://localhost:8080/?autostart=1&night=3&fps`.

## Điều khiển

| Phím | Hành động |
|---|---|
| W A S D / phím mũi tên | Di chuyển theo hướng camera |
| Kéo chuột / Z, C | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Cuộn chuột | Đưa camera ra xa / lại gần (4–22 m) |
| Space | Nhảy |
| Shift | Lướt (14 m/s trong 0,2 s, hồi chiêu 1,5 s) |
| E | Nạp đom đóm vào đèn gần nhất (trong 2 m) |
| F / chuột phải | Tỏa Sáng: tốn 3 đom đóm, choáng 2 s và đẩy lùi 4 m mọi Bóng Mực trong 5 m (hồi chiêu 3 s) |
| Esc / P | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |
| Enter | Bắt đầu, sang Đêm tiếp theo, chơi lại |

## Luật chơi và cách tính điểm (số chuẩn Ticket-02)

- Có 3 Đêm: Đảo Bến (5 đèn, 300 s), Đảo Cau (6 đèn trên hai đảo nối bằng cầu tre, có bục nhảy, 330 s), Đảo Chuông (7 đèn trên 3 tầng, dốc, bục, tháp chuông, gió mạnh, 360 s).
- Mang tối đa **10** đom đóm. Mỗi đèn cần **10** và nhớ tiến độ, nên có thể nạp nhiều lần.
- Bóng Mực chạy 4 m/s (Đêm 3 là 4,5 m/s). Bị chạm thì mất 1 Ngọn Lửa, rơi một nửa số đom đóm ra đất (nhặt lại được trong 8 s), rồi bất tử 1,5 s. Bóng Mực không vào được vùng 6 m quanh **đèn đã sáng**.
- Rơi khỏi đảo thì mất 1 Ngọn Lửa và toàn bộ đom đóm, rồi hồi sinh ở điểm xuất phát.
- **Gió Lạc** (Đêm 2–3) cướp tối đa 3 đom đóm khi Mây mang từ 5 con trở lên. Tỏa Sáng trúng nó thì nó thả lại đom đóm đã cướp.
- **Bùa Gió** (đỏ viền vàng) cho 10 s chạy 7,2 m/s và lướt không hồi chiêu.
- Có 3 Ngọn Lửa, hồi đầy đầu mỗi Đêm. Thắp hết đèn thì thắng. Hết lửa hoặc trời sáng thì thua và được chơi lại Đêm đó. Thắng Đêm 3 thì tới màn Bình Minh.

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm nạp vào đèn | +10 |
| Thắp sáng 1 đèn | +100 |
| Mỗi Bóng Mực trúng Tỏa Sáng | +5 |
| Khi **thắng**: mỗi giây còn lại (làm tròn xuống) | +2 |
| Khi **thắng**: mỗi Ngọn Lửa còn lại | +50 |

Tổng điểm là tổng điểm các Đêm đã thắng. Mọi con số nằm trong [src/sim/tuning.js](src/sim/tuning.js) và được khai báo y hệt trong [game.contract.json](game.contract.json) (test CT-01). Bản đồ chuẩn nằm trong [src/sim/maps.js](src/sim/maps.js).

## Sáng tạo của tôi

Tất cả chỉ nằm trong `src/web/` (phần hiển thị) và không chạm vào `src/sim/`, nên đầu ra headless không đổi. Bằng chứng: `npm test` và `npm run proof` chỉ chạy lõi mô phỏng và vẫn đạt toàn bộ (xem [results.md](docs/proof/phase-1/results.md)).

- **Đèn trời:** khi một Đèn Lồng Lớn sáng lại, 6 chiếc đèn trời bay lên từ cột đèn.
- **Đom đóm quanh nón:** số đom đóm Mây đang mang bay vòng quanh chiếc nón lá, nhìn là biết đang mang bao nhiêu.
- **Đảo sáng dần:** sương chuyển từ tím đen sang xanh ấm và ánh sáng chung tăng theo số đèn đã thắp.
- **Âm thanh tổng hợp bằng WebAudio** (không dùng file âm thanh), gồm cả nhạc nền đêm.
- **Ông Đăng:** người kể chuyện giới thiệu từng Đêm.
- **Gió Lạc mang theo đom đóm đã cướp** (nhìn thấy được), và đom đóm rơi sẽ nhấp nháy khi sắp tan.

## Cấu trúc

```text
src/sim/       luật chơi (thuần JS, tất định, không DOM): tuning.js, maps.js, sim.js, runner.js
src/headless.js  CLI theo Test Contract v1.0
src/web/       Three.js: hiển thị, input, HUD, âm thanh
tests/         test nghiệm thu (AC-xx) và test contract (CT-xx), scenario mẫu
scripts/       serve.js (server tĩnh), bot.js (tự chơi), proof.js (sinh bằng chứng)
docs/notes/    giả định, tiêu chí nghiệm thu, nhật ký dùng AI, đánh giá từng phase
docs/proof/    bằng chứng từng phase
AGENTS.md, CLAUDE.md, .claude/   harness AI: hướng dẫn, skill verify-game, hook Stop chạy test
```

Ghi chép: [Phase 1](docs/notes/phase-1.md) · [Phase 2](docs/notes/phase-2.md) · Bằng chứng: [Phase 1](docs/proof/phase-1/README.md) · [Phase 2](docs/proof/phase-2/README.md) · Nguồn: [CREDITS.md](CREDITS.md) · Giấy phép: [LICENSE](LICENSE)
