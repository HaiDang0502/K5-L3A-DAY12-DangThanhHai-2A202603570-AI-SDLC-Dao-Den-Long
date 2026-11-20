# Bằng chứng Phase 1

Tái lập ở tag `phase-1`: `npm install && npm test && npm run proof`.

| Yêu cầu (PRD-0 / Contract) | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Đi lại, nhảy, camera 3D | AC-02, AC-03; chơi thử | `npm test`; ảnh chụp | Đạt |
| Đom đóm rải rác, nhặt được | AC-04, AC-15, P-01 | [results.md](results.md), `p01_contract_example.jsonl` | Đạt |
| Nạp ánh sáng thắp đèn | AC-05, AC-06, P-02 | `p02_bot_win_seed1.jsonl` (5 × `lantern_lit`) | Đạt |
| Bóng Mực xuất hiện và đuổi | AC-14, AC-15 | `npm test` | Đạt |
| Tỏa sáng xua Bóng Mực | AC-07, AC-08, P-07 | `p07_pulse.jsonl` | Đạt |
| Bóng Mực sợ đèn (`safe_radius`) | AC-13, P-06 | `p06_safe_radius.jsonl` (khoảng cách nhỏ nhất 6.009 m) | Đạt |
| Thắng / thua / điểm | AC-09…AC-12, P-02, P-04, P-05 | `p02`, `p04`, `p05` | Đạt |
| Chơi được từ đầu tới thắng | Bot tự chơi seed 1 qua CLI thật | `inputs/bot_seed1.inputs.json` → `p02_bot_win_seed1.jsonl` | Đạt |
| HUD, nón lá có đèn nhỏ, đảo sáng dần | Ảnh chụp trình duyệt (Chrome headless) | `screenshot-lit0.png` (0 đèn), `screenshot-lit3.png` (3 đèn sáng) | Đạt (kiểm tra bằng mắt) |
| Chơi lại sau thắng/thua | Enter/R ở màn kết thúc gọi `newGame()` | review code `src/web/main.js` | Đạt (chưa có test tự động) |
| `game.contract.json` khớp code | CT-01 | `npm test` | Đạt |
| Định dạng JSONL, mã thoát 0/2 | CT-02…CT-04, P-08 | `npm test`, `p08` | Đạt |
| Tất định | AC-16, P-03 (sha256 giống nhau) | [results.md](results.md) | Đạt |
| Sáng tạo không đổi output headless | Phần thêm chỉ nằm trong `src/web/`; test và bằng chứng chạy lõi `sim` vẫn đạt | `npm test`, [results.md](results.md) | Đạt |

Ghi chú: dải tối ở mép ảnh chụp đến từ viewport của Chrome headless, không phải từ game.
