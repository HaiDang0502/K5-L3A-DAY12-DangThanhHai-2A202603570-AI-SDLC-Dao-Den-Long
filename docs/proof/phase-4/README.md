# Bằng chứng Phase 4

Tái lập ở tag `phase-4`: `npm install && npm test && npm run proof`, rồi chạy bench và soak như trong README.

| Yêu cầu Ticket-04 | Kiểm chứng | Kết quả |
|---|---|---|
| 1. Benchmark (cảnh chuẩn, 1280×720, vsync tắt, avg ≥ 60, p1 ≥ 30, load ≤ 10 s) | [bench.json](../../bench.json); RL-03, RL-04 | Đạt trên máy tác giả: 139 / 71,9 FPS, load 690 ms (Ryzen 7 5800H, Radeon iGPU, Chrome) |
| 2. Soak 10 Đêm (0 crash, RAM ≤ ×1,2) | [soak.json](../../soak.json); RL-05 | Đạt: 0 crash, 52,9 → 58,2 MB (×1,10). Chạy 30 Đêm: ×1,1 (không rò rỉ) |
| 3. Bảng xếp hạng (top 10, sắp xếp, lưu đĩa, màn hình, export) | RL-01, RL-02; menu có nút "Bảng xếp hạng" ([ảnh](screenshot-menu-release.png)) | Đạt (UI: review code) |
| 4. Dễ tiếp cận (đổi phím, phụ đề, giảm chuyển động, chữ ≥ 18 px / ×1,25) | review `src/web/main.js`, `style.css`; ảnh menu chữ 18 px | Đạt (chưa có test trình duyệt tự động) |
| 5. Đóng gói | `npm run package`; giải nén vào thư mục sạch → `node src/headless.js` chạy, `node scripts/serve.js` phục vụ được menu (ảnh trên do server của gói phục vụ) | Đạt |
| 6. Contract v1.3 (`bench_cmd`, `soak_cmd`) | CT-01 | Đạt |
| Regression Phase 1–3 | 47 test + [results.md](results.md) (25 kiểm tra CLI) | Đạt |
| 7. Retro + video | [docs/retro.md](../retro.md); video | Retro đạt; **video do tác giả quay** |
