# Tax & Expense Control Dashboard (Verdency / Onesie)

Action-oriented tax compliance, marketplace settlement reconciliation, and MISA integration dashboard for e-commerce (Shopee, TikTok Shop). Built with **pure Node.js (Zero external npm dependencies)** and modern responsive HTML5/CSS/JS.

---

## 🚀 Cập Nhật Sau Meeting 3: Tối Ưu Kiến Trúc Dữ Liệu & Giao Diện

1. **Giải Quyết Triệt Để Tắc Nghẽn Đồng Bộ MISA**:
   - Thay vì quét toàn bộ 30.000 dòng settlement so sánh chéo với 28.000 dòng MISA, bảng `ar.settlements` được bổ sung cờ trạng thái `misa_booking boolean DEFAULT false` kèm Partial Index.
   - Script SQL ETL bóc tách từ `raw_documents` sang `ar.settlements` được xác minh an toàn 100% (không bị ảnh hưởng hay ghi đè cờ).
   - Cơ chế chạy theo lô nhỏ (Batch size 100 - 500 records) chỉ lấy các record chưa hạch toán (`misa_booking = false`).
2. **Chuẩn Hóa Phân Loại Dòng Tiền - Chống Trùng Lặp Chi Phí (Double-Counting)**:
   - **Nhóm 1 (Kho / COGS):** Map trực tiếp hóa đơn theo từng lần nhập kho và từng Nhà Cung Cấp cụ thể (Xuân Kỷ, Chí Cường, Phạm Phương, Chị Hoa...).
   - **Nhóm 2 (Chi phí vận hành ngân hàng):** Chỉ map hóa đơn vào các khoản chi trực tiếp (`lv1 = 'Expense'`). **Loại trừ hoàn toàn các lệnh chuyển khoản trả nợ tiền mua hàng** (vì đã map ở Kho) và các giao dịch vốn / luân chuyển nội bộ.
   - **Nhóm 3 (Cấn trừ sàn & vận chuyển):** Shopee, TikTok Shop, SPX cấn trừ trên doanh thu và xuất hóa đơn định kỳ tổng hợp theo tháng.
3. **Cấu Trúc Giao Diện 3 Tầng (3-Tier Hierarchical Dashboard)**:
   - **View 1 (Cốt lõi):** Đúng 3 con số: **Tổng tiền chi ra** (4.31 Tỷ VNĐ) | **Có chứng từ** (1.21 Tỷ VNĐ - 28.0%) | **Chênh lệch thiếu** (3.10 Tỷ VNĐ). Loại bỏ toàn bộ số liệu rườm rà (đơn hoàn, đơn chậm sàn, phạt 20%).
   - **View 2 (Cơ cấu 3 nhóm):** Kho/COGS (2.58 Tỷ) | Chi phí vận hành (1.72 Tỷ) | Chi phí dịch vụ sàn (7.26 Triệu).
   - **View 3 (Action Hub):** Danh sách NCC cần đòi nợ hóa đơn, chi phí trực tiếp thiếu chứng từ, hóa đơn tổng sàn theo tháng, và công cụ đồng bộ lô MISA.

---

## 🤖 Hướng Dẫn Nhanh Cho AI / Lập Trình Viên (Quick Start)

> **Dành cho AI Agent / Dev:** Dự án này được thiết kế **Zero-Dependency** (không cần cài đặt thư viện ngoài). Bất kỳ máy tính nào có Node.js >= 18 đều có thể khởi chạy ngay lập tức.

### 1. Yêu Cầu Tiên Quyết
- **Node.js**: Phiên bản `>= 18.0.0`
- **Không cần chạy `npm install`** (Dự án dùng 100% thư viện chuẩn của Node.js: `node:http`, `node:fs`, `node:path`, `node:url` và native `fetch`).

### 2. Các Bước Khởi Chạy (1 Lệnh)

```bash
# 1. Clone mã nguồn
git clone https://github.com/anhnhatdev/tax-expense-dashboard.git
cd tax-expense-dashboard

# 2. Khởi chạy máy chủ ngay lập tức
npm start
```

Máy chủ sẽ lắng nghe tại: **`http://localhost:3000`**

### 3. Kiểm Tra Trạng Thái Hoạt Động (Health Check)
```bash
curl http://localhost:3000/api/health
```
Kết quả trả về mẫu:
```json
{"status":"ok","service":"tax-expense-dashboard","version":"1.0.0","port":3000,"database":"connected"}
```

### 4. Cấu Hình Môi Trường (Tùy Chọn)
Hệ thống đã tích hợp sẵn giá trị mặc định để chạy ngay. Nếu muốn tùy chỉnh cổng hoặc database, copy file mẫu:
```bash
cp .env.example .env
```
Các biến trong `.env`:
- `PORT`: Cổng máy chủ (mặc định: `3000`)
- `SUPABASE_URL`: Đường dẫn Supabase API
- `SUPABASE_SERVICE_KEY`: Service Role Key kết nối Supabase

---

## 📂 Cấu Trúc Thư Mục

```text
tax-expense-dashboard/
├── server.js            # Node.js backend (REST API, in-memory cache, static file server, MISA batch)
├── package.json         # Cấu hình dự án & scripts (start, dev)
├── .env.example         # Biến môi trường mẫu
├── .gitignore           # File loại trừ cho git
├── migrations/          # DDL migrations cho Supabase
│   └── 20260909_add_misa_booking_to_settlements.sql # DDL cờ misa_booking & partial index
├── public/              # Giao diện người dùng tĩnh
│   ├── index.html       # Single-Page Dashboard 3 Tầng theo chuẩn Meeting 3
│   ├── css/dashboard.css# Theme Dark/Light, Design System tokens, 3-tier card styles
│   └── js/dashboard.js  # Script xử lý render 3 tầng, lọc nhóm, sync MISA batch
└── documents/           # Tài liệu phân tích nghiệp vụ & kiến trúc dữ liệu
    ├── 01_BUSINESS_REQUIREMENTS.md
    ├── 02_DATA_ARCHITECTURE_AND_MAPPING.md
    ├── 03_API_AND_INTEGRATION_SPEC.md
    └── 04_SYSTEM_DESIGN_AND_ROADMAP.md
```

---

## 📡 Danh Sách API Chính

| Phương thức | Endpoint | Chức năng |
|---|---|---|
| `GET` | `/api/health` | Kiểm tra kết nối DB và trạng thái máy chủ |
| `GET` | `/api/kpi?year=2026` | 3 chỉ số cốt lõi (View 1), 3 nhóm dòng tiền (View 2), trạng thái MISA |
| `GET` | `/api/suppliers` | Bảng phân tích NCC cần đòi hóa đơn (Xuân Kỷ, Chí Cường, Phạm Phương...) |
| `GET` | `/api/missing-docs?group=cogs\|direct\|marketplace` | Danh sách chi tiết chứng từ còn thiếu theo từng nhóm |
| `GET` | `/api/misa/pending-settlements?batch_size=200` | Lấy lô settlements chưa hạch toán để đồng bộ sang MISA |
| `POST` | `/api/misa/mark-booked` | Cập nhật cờ `misa_booking = true` sau khi MISA hạch toán thành công |
| `GET` | `/api/documents` | Danh sách hóa đơn hợp lệ sẵn sàng ghép cặp |
| `POST` | `/api/link-document` | Ghép chứng từ vào giao dịch ngân hàng / phiếu kho |
| `POST` | `/api/create-econtract` | Sinh hợp đồng khoán giải trình chi phí |
| `GET` | `/api/export-csv` | Xuất file CSV phục vụ kiểm toán / thanh tra thuế |

