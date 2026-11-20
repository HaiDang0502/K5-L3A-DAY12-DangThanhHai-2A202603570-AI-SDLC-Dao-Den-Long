# Bằng chứng Phase 2

Tái lập ở tag `phase-2`: `npm install && npm test && npm run proof` (ghi [results.md](results.md)).

| Yêu cầu Ticket-02 | Kiểm chứng | Kết quả |
|---|---|---|
| Số chuẩn Phần 1 khớp contract | CT-01, AC-02…AC-14 | Đạt |
| Nhặt/nạp/điểm chuẩn hóa | AC-04, AC-05, P2-01 | Đạt |
| Tỏa Sáng v1.1 | AC-06, P2-02 | Đạt |
| Bị đánh: rơi đom đóm, bất tử, recoil | AC-07, P2-03 | Đạt |
| Rơi khỏi đảo + hồi sinh | AC-08, P2-04 | Đạt |
| Vùng an toàn quanh đèn sáng + đẩy ra trong 30 tick | AC-10, AC-11, P2-05 | Đạt |
| Lịch sinh đom đóm, Bóng Mực | AC-12, AC-14, P2-06 | Đạt |
| Trạng thái Bóng Mực (spawning/wander/chase/recoil/stunned), tốc độ Đêm 3 | AC-13 | Đạt |
| Lướt, Tạm dừng, Gió Lạc, Bùa Gió | FT-01…FT-06, P2-07…P2-11 | Đạt |
| Bản đồ Đêm 2 (đảo đôi, cầu, bục) | FT-07, FT-08, P2-12 | Đạt |
| Bản đồ Đêm 3 (tầng, dốc, bục, tháp, gió) | FT-09, FT-10, P2-13, P2-14 | Đạt |
| Snapshot/scenario/input/sự kiện v1.1 | FT-11, P2-17, CT-02…04 | Đạt |
| Tất định | AC-15, P2-15 | Đạt |
| Headless 1 Đêm ≤ 30 s | P2-16.1–3 (0,2–0,3 s) | Đạt |
| Đêm 1 chơi được tới thắng | P2-15 (bot seed 2) | Đạt |
| Đêm 2–3 chơi được tới thắng | bot chỉ thắp 2–3 đèn | **Chưa chứng minh** |
| HUD, bảng màu, Mây khăn đỏ, 3 bản đồ hiển thị | `screenshot-night2.png`, `screenshot-night3.png` | Đạt (kiểm tra bằng mắt) |
| Menu, tạm dừng, cài đặt lưu lại, âm thanh | review code `src/web/` | Đạt (chưa có test tự động) |
| ≥ 30 FPS ở 1280×720 | `?fps` | **Chưa đo** trên GPU thật |
