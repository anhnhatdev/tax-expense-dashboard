# TÀI LIỆU PHÂN TÍCH KHOẢNG TRỐNG NGHIỆP VỤ & LỘ TRÌNH TÁC NGHIỆP THỰC CHIẾN
## DỰ ÁN: TAX & EXPENSE DASHBOARD (HỆ THỐNG KIỂM SOÁT THUẾ VÀ ĐỐI SOÁT CHỨNG TỪ)
**Mã tài liệu:** `05_OPERATIONAL_GAP_ANALYSIS_AND_ACTION_ROADMAP.md`  
**Tham chiếu chỉ đạo:** Meeting 1, Meeting 2, Meeting 3 (Verdency / Onesie Management)  
**Ngày lập:** 09/09/2026  

---

### 1. Bối cảnh & Vấn đề Cốt lõi: Thoát khỏi bẫy "Demo hóa"

Trong quá trình phát triển giai đoạn 1, hệ thống đã hoàn thành xuất sắc việc:
* **Kiểm toán dữ liệu kế toán:** Triệt tiêu hoàn toàn lỗi đếm trùng (anti double-counting) giữa phiếu kho và lệnh ngân hàng trả nợ.
* **Chuẩn hóa 3 View:** View 1 (3 chỉ số cốt lõi), View 2 (3 nhóm chi phí lớn), View 3 (Bóc tách chi tiết nhà cung cấp & chi phí trực tiếp).
* **Kiểm thử tự động:** Đạt 18/18 test cases xanh (100% PASS) trên dữ liệu thực tế từ Supabase.

Tuy nhiên, **nghiêm túc tự kiểm điểm theo tinh thần Meeting 2**:
> *"Nguyên tắc thiết kế Dashboard: Nhìn là phải hành động được (Action-oriented). Dashboard không chỉ dùng để trưng bày số liệu mà tập trung cảnh báo điểm nghẽn nghiệp vụ để xử lý kịp thời."*

Hiện tại, hệ thống mới chỉ dừng ở mức độ **"Màn hình báo cáo chỉ đọc" (Read-Only Executive Dashboard)**. Người dùng vào xem con số, thấy thiếu chứng từ nhưng **chưa có công cụ để tác nghiệp, duyệt, lưu trạng thái hoặc kích hoạt quy trình thu thập chứng từ**. 

Tài liệu này xác định chi tiết **6 khoảng trống nghiệp vụ (Operational Gaps)** lớn nhất cần giải quyết khi hệ thống được mở quyền ghi (Write Permission) vào cơ sở dữ liệu.

---

### 2. Chi tiết 6 Khoảng trống Nghiệp vụ Cốt lõi (Gap Analysis)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │               THỰC TRẠNG: CHỈ ĐỌC (READ-ONLY)           │
                    │   - Xem số liệu tĩnh                                    │
                    │   - Không duyệt được                                    │
                    │   - Không lưu vết được                                  │
                    └────────────────────────────┬────────────────────────────┘
                                                 │
                                CẦN CHUYỂN DỊCH SANG
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                       HỆ THỐNG TÁC NGHIỆP THỰC CHIẾN (ACTION-ORIENTED)                   │
├───────────────────────────────┬─────────────────────────────┬───────────────────────────┤
│ 1. GHÉP CẶP & DUYỆT HÓA ĐƠN   │ 2. CẦU NỐI E-CONTRACT       │ 3. ĐÔN ĐỐC QUA LARK BOT   │
│ Kế toán chọn HĐ và gán vào GD │ Kích hoạt ký hợp đồng online│ Gắn người phụ trách (PIC) │
├───────────────────────────────┼─────────────────────────────┼───────────────────────────┤
│ 4. CẤN TRỪ HÓA ĐƠN TỔNG SÀN   │ 5. HẠCH TOÁN SỔ SÁCH MISA   │ 6. VẾT KIỂM TOÁN THUẾ     │
│ Gom 403 dòng cấn trừ ví tháng │ Ghi số chứng từ kế toán     │ Audit trail: ai duyệt, khi│
└───────────────────────────────┴─────────────────────────────┴───────────────────────────┘
```

---

#### 2.1. Gap 1: Cơ chế "Ghép cặp & Phê duyệt thủ công" (Manual Mapping & Approval)
* **Đề bài (Meeting 2):** Nhân sự phụ trách mua hàng hoặc kế toán thực hiện đối soát thủ công: *chọn hóa đơn và gán vào đúng giao dịch chuyển khoản / phiếu nhập kho*.
* **Thiếu sót hiện tại:** Chưa có giao diện để kế toán bấm nút "Khớp hóa đơn này vào dòng chi này".
* **Nghiệp vụ thực chiến cần có:**
  1. Khi kế toán thấy dòng chi 15.000.000đ (tiền may gia công) đang gắn cờ `Thiếu chứng từ`.
  2. Bấm nút **"Gán Hóa Đơn GTGT"** $\rightarrow$ Hệ thống mở Modal hiển thị danh sách hóa đơn điện tử đã cào từ cổng thuế GDT (lưu tại bảng `taxdoc.document`).
  3. Kế toán tick chọn hóa đơn tương ứng $\rightarrow$ Bấm **"Phê duyệt & Lưu"**.
  4. Hệ thống ghi nhận vào Database: Cập nhật `mapped_invoice_id`, `status = 'matched'`, lưu vết người duyệt và ngày duyệt.

---

#### 2.2. Gap 2: Cầu nối tác nghiệp sang Tool E-Contract (E-Contract Direct Bridge)
* **Đề bài (Meeting 1 & 2):** Dự án 1 gồm 2 trụ cột song hành: Dashboard giám sát và Tool E-Contract. Đối với các đối tượng không xuất được hóa đơn đỏ (KOC livestream, thợ may lẻ, nhân công phụ trợ), phải hợp thức hóa chi phí bằng Hợp đồng dịch vụ điện tử ký online trên điện thoại.
* **Thiếu sót hiện tại:** Tool E-Contract đang chạy biệt lập ở cổng 3001, Dashboard thuế ở cổng 3000, chưa có điểm chạm kết nối nghiệp vụ trực tiếp.
* **Nghiệp vụ thực chiến cần có:**
  - Tại bảng chi tiết của View 3, đối với các khoản chi không có hóa đơn đỏ, hệ thống có nút: **"⚡ Tạo Hợp Đồng E-Contract"**.
  - Khi bấm nút, hệ thống tự động bốc dữ liệu: Tên đối tác, SĐT, số tiền, ngày phát sinh $\rightarrow$ Gọi API sang E-Contract Tool để tạo dự thảo $\rightarrow$ Sinh link ký điện tử.
  - Sau khi đối tác ký xong trên điện thoại, hệ thống nhận Webhook và tự động chuyển dòng chi đó từ `Thiếu chứng từ` sang `Đã có Hợp đồng hợp lệ (E-Contract Signed)`.

---

#### 2.3. Gap 3: Quản lý Người phụ trách (PIC / Assignee) & Đôn đốc qua Bot Lark
* **Đề bài (Meeting 2):** *"Giao dịch thiếu chứng từ: Tiền đã chuyển nhưng thiếu hóa đơn/hợp đồng $\rightarrow$ Lọc theo người phụ trách để đôn đốc lấy chứng từ hoặc gửi hợp đồng"*.
* **Thiếu sót hiện tại:** Dữ liệu mới chỉ có tên Nhà Cung Cấp, không có thông tin nhân sự nội bộ nào của công ty chịu trách nhiệm về khoản chi đó.
* **Nghiệp vụ thực chiến cần có:**
  - Bổ sung trường `pic_name` (Người phụ trách: Lan Mua Hàng, Hùng Marketing, Tuấn Vận Hành...).
  - Bộ lọc trên giao diện: *"Xem riêng các khoản chi thiếu chứng từ của [Nhân sự A]"*.
  - Nút bấm **"🔔 Bắn tin đôn đốc qua Bot Lark"**: Tự động gửi tin nhắn kèm link đối soát vào group hoặc tin nhắn riêng của nhân sự đó trên Lark: *"Bạn đang phụ trách 3 khoản chi tổng 45.000.000đ cho NCC Xuân Kỷ chưa có hóa đơn, vui lòng nộp chứng từ trước ngày 15/09"*.

---

#### 2.4. Gap 4: Nghiệp vụ Gom & Cấn trừ Hóa đơn tổng tháng cho Sàn TMĐT & Bưu cục
* **Đề bài (Meeting 2 & 3):** Chi phí sàn (Shopee, TikTok Shop) và cước bưu cục (SPX, Sapo Express) cấn trừ liên tục hàng ngày vào ví. Cuối tháng các đơn vị này xuất **1 Hóa đơn dịch vụ tổng** (ví dụ: SPX xuất 1 hóa đơn cước 1.187.000đ cho toàn bộ tháng 8). Quy tắc là gom quản lý và map theo hóa đơn tổng từng tháng.
* **Thiếu sót hiện tại:** View 3 mục Thu hộ mới chỉ hiển thị tổng 7.2 triệu (300 đơn Sapo + 103 đơn SPX) dạng thẻ tĩnh, chưa có luồng đối soát cấn trừ.
* **Nghiệp vụ thực chiến cần có:**
  - Kế toán chọn kỳ tháng (Tháng 8/2026) $\rightarrow$ Chọn Nhà vận chuyển (SPX Express).
  - Hệ thống gom 103 giao dịch cấn trừ ví (tổng 1.187.000đ).
  - Kế toán tải lên hoặc chọn Hóa đơn GTGT dịch vụ do SPX xuất $\rightarrow$ So khớp số tiền.
  - Bấm **"Xác nhận Cấn trừ Hóa đơn tháng"** $\rightarrow$ Hệ thống cập nhật cờ đã cấn trừ cho toàn bộ 103 bản ghi.

---

#### 2.5. Gap 5: Vòng đời trạng thái chi phí & Vết kiểm toán (Lifecycle & Audit Trail)
* **Thực tế kế toán thuế:** Khi cơ quan thuế vào thanh tra, doanh nghiệp phải giải trình rõ ai là người duyệt khoản chi, hóa đơn nào đính kèm, lý do phê duyệt. Trạng thái chứng từ không thể là nhị phân (0 hoặc 1), mà phải theo chu trình:
  $$\text{Chờ thu thập chứng từ} \longrightarrow \text{Đã nộp (Chờ duyệt)} \longrightarrow \text{Đã khớp hợp lệ (Approved)} \longrightarrow \text{Đã hạch toán MISA (Booked)}$$
  *(hoặc trạng thái: `Loại trừ khỏi chi phí thuế` nếu không thể hợp thức hóa).*
* **Thiếu sót hiện tại:** Chưa có bảng lưu lịch sử duyệt (`taxdoc.approval_logs`).
* **Nghiệp vụ thực chiến cần có:** Bảng lưu vết kiểm toán ghi nhận: `transaction_id`, `invoice_id`, `action_type`, `action_by`, `action_at`, `notes`.

---

#### 2.6. Gap 6: Tác vụ Hạch toán MISA thực chiến (MISA Batch Real Action)
* **Đề bài (Meeting 3):** Khắc phục triệt để nghẽn cổ chai (bottleneck) 30.000 dòng bằng cách hạch toán theo từng lô 100 - 500 bản ghi settlement và gắn cờ `misa_booking = TRUE`.
* **Thiếu sót hiện tại:** Mới dừng ở mức độ API backend mô phỏng, chưa có nút bấm nghiệp vụ có phân quyền rõ ràng trên giao diện cho kế toán bấm duyệt vào sổ MISA.
* **Nghiệp vụ thực chiến cần có:** Checkbox chọn lô settlement $\rightarrow$ Bấm "Ghi sổ MISA" $\rightarrow$ Sinh số chứng từ phiếu kế toán (`voucher_no`), cập nhật trực tiếp vào cơ sở dữ liệu.

---

### 3. Thiết Kế Cơ Sở Dữ Liệu Phục Vụ Quyền Ghi (Write Schema Design)

Khi mở quyền ghi vào Supabase, hệ thống cần bổ sung các bảng và cột sau:

```sql
-- 1. Bảng lưu vết phê duyệt và ghép cặp chứng từ
CREATE TABLE IF NOT EXISTS taxdoc.approval_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'inventory_cogs', 'bank_expense', 'marketplace_fee'
    entity_id VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL,  -- 'MATCH_INVOICE', 'UNMATCH', 'REJECT', 'LINK_ECONTRACT'
    invoice_id VARCHAR(100),
    econtract_id VARCHAR(100),
    pic_assignee VARCHAR(100),
    performed_by VARCHAR(100) NOT NULL DEFAULT 'ketoan_admin',
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- 2. Đánh chỉ mục tìm kiếm nhanh lịch sử duyệt
CREATE INDEX IF NOT EXISTS idx_approval_logs_entity 
ON taxdoc.approval_logs (entity_type, entity_id);

-- 3. Bổ sung trường trạng thái nghiệp vụ trên bảng giao dịch ngân hàng
ALTER TABLE taxdoc.f_bank_transactions_manual
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS mapped_invoice_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS pic_name VARCHAR(100);
```

---

### 4. Kế Hoạch Chuẩn Bị Cấu Trúc Dự Án Để Deploy Lên Render

Để chuẩn bị đưa dự án lên **Render Web Service** theo tiêu chuẩn production (chạy độc lập, tự động restart, tương thích môi trường cloud), cấu trúc thư mục và mã nguồn cần được chuẩn hóa như sau:

#### 4.1. Chuẩn hóa Cấu trúc Thư mục (Monorepo Clean Architecture)
```
tax-expense-dashboard/
├── documents/               # Tài liệu nghiệp vụ & đặc tả kiến trúc
├── migrations/              # DDL SQL scripts quản lý schema Supabase
├── public/                  # Static Frontend assets (HTML, CSS, JS)
│   ├── css/
│   │   └── dashboard.css   # Editorial Swiss Ledger CSS
│   ├── js/
│   │   └── dashboard.js    # Client-side API orchestration & interactions
│   └── index.html           # Single Page Application UI
├── tests/                   # 18 Zero-dependency test suites (node:test)
│   ├── 01_accounting_logic.test.js
│   ├── 02_database_integrity.test.js
│   ├── 03_api_endpoints.test.js
│   └── run_all_tests.js
├── .env.example             # Biến môi trường mẫu cho Render
├── package.json             # NPM metadata, scripts (start, test)
├── render.yaml              # Infrastructure as Code (Render blueprint)
└── server.js                # Core HTTP & PostgREST Backend Server
```

#### 4.2. Yêu cầu Cấu hình Tương thích Render:
1. **Biến môi trường Cổng mạng (`PORT`):**
   Render sẽ tự động gán biến môi trường `process.env.PORT` ngẫu nhiên (thường là `10000` hoặc cổng dynamic). `server.js` bắt buộc phải lắng nghe:
   `const PORT = process.env.PORT || 3000;`
2. **Địa chỉ gọi API Frontend tương đối (Relative Path):**
   Tất cả các lệnh `fetch()` từ phía frontend (`public/js/dashboard.js`) bắt buộc phải dùng đường dẫn tương đối (ví dụ: `/api/kpi?year=2026` thay vì `http://localhost:3000/api/kpi`), giúp frontend hoạt động mượt mà ở cả local và trên domain `https://*.onrender.com`.
3. **Khai báo file `render.yaml`:**
   Định nghĩa tài nguyên, lệnh build `npm install`, lệnh start `node server.js` và cấu hình biến môi trường an toàn.
4. **Kiểm tra độ trễ Supabase Connection Pooling:**
   Render host tại Singapore/Oregon cần cấu hình timeout và keep-alive hợp lý khi gọi PostgREST Supabase.

---

### 5. Kết Luận & Khuyến Nghị

* **Bản chất vấn đề:** Nhận định của ban quản lý là hoàn toàn chính xác. Dự án không được dừng lại ở việc "xem cho đẹp", mà phải phục vụ trực tiếp cho mục tiêu cốt lõi: **đối soát, giải trình và bảo vệ từng đồng chi phí khi thanh tra thuế**.
* **Định hướng tiếp theo:** 
  1. Hoàn tất cấu trúc chuẩn Render để deploy bản v1.0 phục vụ ban giám đốc xem trước trên cloud.
  2. Bổ sung tầng tác nghiệp ghi (Write APIs & UI Action Buttons) theo lộ trình 6 bước trên khi được phê duyệt quyền ghi vào database.
