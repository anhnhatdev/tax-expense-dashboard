# Tax & Expense Reconciliation Portal

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/anhnhatdev/tax-expense-dashboard)

> **Hệ thống Kiểm soát Chi phí & Đối chiếu Chứng từ Thuế Đa Kênh**  
> Nền tảng chuyên dụng cho doanh nghiệp thương mại điện tử (Shopee, TikTok Shop, Sapo) nhằm giám sát dòng tiền chi ra, tự động đối soát Hóa đơn GTGT / Hợp đồng điện tử và đồng bộ hạch toán kế toán MISA.

---

## 📌 Tính Năng Cốt Lõi

1. **Kiến Trúc Đối Chiếu 3 Tầng (3-Tier Accounting Views):**
   - **View 1 (Chỉ số chủ đạo):** Giám sát 3 con số trọng yếu: Tổng giá trị giao dịch thực chi, Tổng giá trị đã có chứng từ hợp lệ, và Chênh lệch thiếu cần bổ sung giải trình.
   - **View 2 (Phân theo 3 nhóm chi phí):**
     - *Nhóm 1 - Mua hàng tồn kho (COGS):* Dữ liệu bóc tách từ phiếu nhập kho Sapo/Lark (`v_nhap_kho`).
     - *Nhóm 2 - Chi phí ngân hàng (Expense):* Chi phí vận hành một lần từ sao kê ngân hàng (`v_chi_ngan_hang` với `lv1 = 'Expense'`).
     - *Nhóm 3 - Dịch vụ sàn & thu hộ (Marketplace COD):* Cước vận chuyển và cấn trừ ví tự động (SPX Express, Sapo Express).
   - **View 3 (Tác nghiệp chi tiết):**
     - Bảng phân tích công nợ hóa đơn theo từng Nhà Cung Cấp (COGS).
     - Chi tiết từng khoản chi ngân hàng phát sinh một lần.
     - Thống kê cấn trừ ví theo sàn & hãng vận chuyển.
     - Quản lý lô giao dịch settlement chờ hạch toán MISA.

2. **Cơ Chế Chống Trùng Lặp Chi Phí (Anti Double-Counting Engine):**
   - Tự động phân tách rành mạch giữa nghiệp vụ mua hàng nhập kho và lệnh chuyển khoản trả nợ trên ngân hàng.
   - Triệt tiêu 100% rủi ro cộng dồn hai lần cùng một nghiệp vụ kinh tế.

3. **Thiết Kế Sổ Cái Kế Toán Cao Cấp (Editorial Swiss Ledger Aesthetic):**
   - Giao diện thiết kế theo phong cách sổ cái kế toán Thụy Sĩ cổ điển: nền giấy mộc ấm (`#EFF1EC`), viền kẻ chỉ tiêu (`#DEDDD3`), typography biên tập cao cấp (**Fraunces** serif kết hợp **IBM Plex Sans / Mono**).
   - Hiển thị thanh tiến độ so sánh kép (Dual-bar comparison: Xanh dương Giao dịch & Xanh ngọc Chứng từ).

4. **Kiến Trúc Tối Ưu Hiệu Năng & Zero-Dependency:**
   - Xây dựng hoàn toàn bằng **Node.js nguyên bản (Zero external dependencies)**, khởi chạy ngay lập tức mà không cần cài đặt thêm thư viện npm nặng nề.
   - Cơ chế bộ nhớ đệm thông minh (In-memory TTL Cache) đảm bảo thời gian phản hồi API dưới 10ms.

---

## 📂 Cấu Trúc Dự Án

Dự án được quy hoạch tinh gọn thành 2 phân hệ rõ ràng:

```text
tax-expense-dashboard/
├── frontend/                     # Toàn bộ giao diện người dùng (Client SPA)
│   ├── css/
│   │   └── dashboard.css         # Bộ stylesheet Editorial Swiss Ledger
│   ├── js/
│   │   └── dashboard.js          # Client-side API orchestration & DOM binding
│   └── index.html                # Single Page Application
│
├── backend/                      # Toàn bộ máy chủ, dịch vụ dữ liệu & tài liệu
│   ├── documents/                # Bộ tài liệu kiến trúc & đặc tả nghiệp vụ
│   │   ├── 01_BUSINESS_REQUIREMENTS.md
│   │   ├── 02_DATA_ARCHITECTURE_AND_MAPPING.md
│   │   ├── 03_API_AND_INTEGRATION_SPEC.md
│   │   ├── 04_SYSTEM_DESIGN_AND_ROADMAP.md
│   │   └── 05_OPERATIONAL_GAP_ANALYSIS_AND_ACTION_ROADMAP.md
│   ├── migrations/               # Script DDL SQL quản trị schema Supabase
│   │   └── 20260909_add_misa_booking_to_settlements.sql
│   ├── tests/                    # Bộ kiểm thử tự động toàn diện (18 test cases)
│   │   ├── 01_accounting_logic.test.js
│   │   ├── 02_database_integrity.test.js
│   │   ├── 03_api_endpoints.test.js
│   │   └── run_all_tests.js
│   └── server.js                 # Máy chủ HTTP REST API & Static File Server
│
├── .env.example                  # Mẫu biến môi trường
├── .gitignore                    # Danh sách loại trừ Git
├── package.json                  # Cấu hình dự án & scripts thực thi
├── render.yaml                   # File cấu hình Blueprint Deploy lên Render
└── server.js                     # Root entrypoint chuyển tiếp vào backend
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu Cầu Môi Trường
* **Node.js**: Phiên bản `>= 18.0.0`
* **Không bắt buộc cài đặt package ngoài** (Sử dụng 100% built-in modules: `node:http`, `node:fs`, `node:path`, `node:test`).

### 2. Khởi Chạy Nhanh Trong 1 Bước

```bash
# Clone mã nguồn
git clone https://github.com/anhnhatdev/tax-expense-dashboard.git
cd tax-expense-dashboard

# Khởi chạy máy chủ
npm start
```

Máy chủ sẽ lắng nghe tại: **`http://localhost:3000`**

### 3. Kiểm Tra Sức Khỏe Máy Chủ (Health Check)

```bash
curl http://localhost:3000/api/health
```

Kết quả phản hồi mẫu:
```json
{
  "status": "ok",
  "service": "tax-expense-dashboard",
  "version": "1.0.0",
  "port": 3000,
  "database": "connected",
  "uptime_seconds": 42
}
```

### 4. Chạy Bộ Kiểm Thử Tự Động (Test Suite)

Dự án tích hợp sẵn **18 bài kiểm thử toàn diện** (Bất biến kế toán, Tính toàn vẹn database, và Hợp đồng API):

```bash
npm test
```

---

## 📡 Danh Sách API Endpoints

| Method | Endpoint | Mô tả chức năng |
|---|---|---|
| `GET` | `/api/health` | Kiểm tra trạng thái máy chủ và kết nối database |
| `GET` | `/api/kpi?year=2026` | Trả về dữ liệu 3 tầng: View 1 (Tổng quan), View 2 (3 nhóm), Trạng thái MISA |
| `GET` | `/api/suppliers?year=2026` | Danh sách Nhà Cung Cấp sắp xếp theo số tiền thiếu hóa đơn cần đòi |
| `GET` | `/api/missing-docs?group={cogs\|direct\|marketplace}` | Danh sách chi tiết các giao dịch chưa có chứng từ hợp lệ |
| `GET` | `/api/misa/pending-settlements?batch_size=200` | Lấy danh sách lô settlement chưa hạch toán để đồng bộ MISA |
| `POST` | `/api/misa/mark-booked` | Cập nhật cờ `misa_booking = true` kèm số chứng từ kế toán MISA |
| `GET` | `/api/documents?limit=50` | Danh sách Hóa đơn GTGT điện tử từ cổng thuế |
| `GET` | `/api/export-csv?type=suppliers&year=2026` | Xuất file CSV giải trình đối soát thuế tương thích Microsoft Excel |
| `GET` | `/api/alerts/overdue-payouts` | Cảnh báo đơn giao thành công quá 4 ngày chưa quyết toán về ví |

---

## ☁️ Hướng Dẫn Triển Khai Lên Cloud (Render Deployment)

Dự án đã được cấu hình sẵn file [`render.yaml`](./render.yaml) để triển khai tự động dạng **Render Web Service**:

1. Đẩy mã nguồn lên kho lưu trữ GitHub của bạn.
2. Đăng nhập vào [Render Dashboard](https://dashboard.render.com).
3. Chọn **New** $\rightarrow$ **Blueprint** và liên kết với repository này.
4. Render sẽ tự động nhận diện cấu hình:
   - **Runtime:** Node
   - **Region:** Singapore
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
5. Nhấn **Apply**, ứng dụng sẽ tự động build và chạy với tên miền công khai dạng `https://tax-expense-dashboard.onrender.com`.

---

## ⚖️ Giấy Phép & Bản Quyền

Phát triển và duy trì bởi **Verdency Tech Team**. Bản quyền thuộc về Verdency / Onesie Management. Giấy phép ISC.
