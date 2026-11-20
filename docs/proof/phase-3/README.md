# Bằng chứng Phase 3

Tái lập ở tag `phase-3`: `npm install && npm test && npm run proof` (ghi [results.md](results.md)).

| Yêu cầu Ticket-03 | Kiểm chứng | Kết quả |
|---|---|---|
| 1. Nhiên liệu: thắp 100, hao 1/s, châm dầu, tắt, thắp lại 5 | FL-01…FL-03, P3-01, P3-02 | Đạt |
| 2. Dầu < 30 mất vùng an toàn; Bóng Mực `drain` 5/s, `fuel_drain`, các lối thoát, đẩy ra khi châm lên ≥ 30 | FL-05…FL-07, P3-03 | Đạt |
| 3. Thời lượng 240/270/300 s; thắng `dawn_survived` khi đủ ceil(0,6 n) đèn; không thắng sớm; `no_flames` xét trước | AC-01, AC-09, FL-08, FL-09, P3-04, P3-05, P2-16 | Đạt |
| 4. Sức chứa 10 + 2 × số lần thắp, tối đa 20 | FL-04, P3-06 | Đạt |
| 5. Điểm mới | AC-05, FL-02, FL-03, FL-06, FL-08, P3-01, P3-04 | Đạt |
| 6. Chế độ mù màu, đèn tắt xẹp 20% + vết rách, nhấp nháy 1 Hz | review `src/web/main.js` | Đạt (chưa có ảnh ở chế độ mù màu) |
| 7. Contract v1.2 (tuning, snapshot, scenario, sự kiện) | CT-01, FL-01, FL-10 | Đạt |
| Phase 1–2 không bị thay vẫn đúng | toàn bộ AC/FT/CT còn lại, P2-02…P2-14 | Đạt |
| Chơi được tới bình minh (Đêm 1) | P2-15 (bot, thắng `dawn_survived`, 2 lần đèn tắt rồi thắp lại) | Đạt |
| Ảnh HUD Ticket-03 | `screenshot-night1.png` | Đạt (kiểm tra bằng mắt) |
