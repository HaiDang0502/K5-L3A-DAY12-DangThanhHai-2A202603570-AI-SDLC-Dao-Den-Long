# ADR 0001 — Đèn có nhiên liệu và luật thắng lúc bình minh (Ticket-03)

- **Trạng thái:** Đã chấp nhận (Phase 3, Contract v1.2)
- **Bối cảnh:** Playtest cho thấy người chơi giỏi thắp hết đèn trong 2 phút. Ticket-03 đổi mục tiêu thành "giữ đảo sáng tới bình minh": đèn có thể tắt, Bóng Mực hút dầu, chỉ xét thắng ở tick cuối.

## Quyết định

1. **Mô hình trạng thái đèn** đổi từ hai trạng thái (`chưa sáng → đã sáng`, một chiều) thành vòng lặp:

   ```
   tắt(ever_lit=false) --nạp 10--> sáng(fuel=100) --fuel<=0--> tắt(ever_lit=true, deposited=0) --nạp 5--> sáng(fuel=100) ...
                                     |  ^
                          fuel<30: mất vùng an toàn, Bóng Mực tới hút (drain)
                                     |  |
                                  châm dầu (+10 fuel / đom đóm)
   ```

   Đèn lưu thêm `fuel`, `everLit` và `relit`. Chi phí thắp là `costOf(L) = everLit ? 5 : 10`.
2. **Dầu là số nguyên** theo đơn vị 1/60 (100 dầu = 6000). Hao 1 đơn vị mỗi tick, mỗi Bóng Mực đang hút trừ thêm 5 mỗi tick. Chỉ làm tròn 1 chữ số khi xuất snapshot hoặc sự kiện. Cách này tránh sai số số thực và giữ tính tất định, theo đúng ghi chú độ chính xác của ticket.
3. **Thứ tự trong tick:** trừ dầu ở bước 2 (bộ đếm), rồi tắt ngay những đèn có fuel ≤ 0, trước bước di chuyển. Hệ quả: đèn chỉ "đầy" (used = 0) đúng trong tick vừa được thắp hoặc châm. Ở tick sau, dầu đã hao còn 99,98 nên bấm Tương tác vẫn châm được 1 đom đóm. Đây là hệ quả đúng của thứ tự bắt buộc, có test FL-03 khóa lại.
4. **Vùng an toàn** là thuộc tính suy ra: `lit && fuel >= 30`. Không cần cờ riêng, nên không thể lệch với dầu thật. Châm dầu từ dưới 30 lên ≥ 30 dùng lại cơ chế "đẩy ra trong 30 tick" có sẵn từ Ticket-02 (cờ `justLit`).
5. **Bóng Mực** có thêm trạng thái `drain` trong máy trạng thái sẵn có. Chỉ con đang `wander` mới chọn đèn yếu gần nhất (bằng nhau thì id nhỏ hơn), sau đó mới chọn đèn tắt gần nhất. Lối thoát khỏi `drain`:
   - sang `chase` khi Mây ở trong 6 m;
   - sang `stunned` khi trúng Tỏa Sáng (+15 điểm thay vì +5);
   - sang `wander` khi đèn tắt, dầu ≥ 30, hoặc khoảng cách > 2 m.
6. **Luật thắng** chuyển hẳn sang bước "xét thắng/thua" cuối tick:
   - hết Ngọn Lửa: thua `no_flames` (luôn xét trước);
   - đến giờ bình minh: thắng `dawn_survived` nếu số đèn sáng ≥ ceil(0,6 × n), ngược lại thua `dawn`.

   Bỏ hoàn toàn nhánh `all_lit`.
7. **Điểm:**
   - +5 mỗi đom đóm nạp hoặc châm;
   - +100 thắp lần đầu, +40 thắp lại;
   - khi thắng: +50 + floor(fuel) cho mỗi đèn còn sáng, +50 cho mỗi Ngọn Lửa;
   - bỏ thưởng thời gian (`per_second_left: 0`).

   Các khóa điểm mới được thêm vào `tuning.score` để contract tự mô tả công thức.
8. **Sức chứa** là thuộc tính suy ra: `min(20, 10 + 2 × successful_lights)`. Bộ đếm `lights` nằm ở player, tính cả thắp lại, không tính đèn đặt sẵn bằng scenario, và về 0 khi tạo Sim mới (đầu mỗi Đêm).

## Hệ quả

- Test cũ bị thay đã được sửa có ghi chú, không có test nào bị skip: AC-01 (thời lượng), AC-05 (điểm), AC-09 (thắng). Danh sách đầy đủ ở [CHANGELOG](../../CHANGELOG.md).
- Bot tự chơi vẫn thắng Đêm 1 nhờ trụ tới bình minh. Trong lượt chơi đó có 2 lần đèn tắt rồi được thắp lại (bằng chứng P2-15).
- Phương án đã cân nhắc: lưu dầu bằng số thực rồi so với epsilon. Bị loại vì sai số tích lũy qua 18000 tick có thể làm lệch tick `lantern_out` và phá tính tất định.
