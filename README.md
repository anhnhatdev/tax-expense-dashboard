# Tax & Expense Control Dashboard (Verdency / Onesie)

Action-oriented tax compliance and marketplace reconciliation dashboard for e-commerce (Shopee, TikTok Shop, Lazada). Built with **pure Node.js (Zero external npm dependencies)** and vanilla HTML5/CSS/JS.

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
├── server.js            # Node.js backend (REST API, in-memory cache, static file server)
├── package.json         # Cấu hình dự án & scripts (start, dev)
├── .env.example         # Biến môi trường mẫu
├── .gitignore           # File loại trừ cho git
├── public/              # Giao diện người dùng tĩnh
│   ├── index.html       # Single-Page Dashboard HTML
│   ├── css/dashboard.css# Theme Dark/Light, Design System tokens
│   └── js/dashboard.js  # Xử lý render dữ liệu, bảng tính, modal
└── documents/           # Tài liệu phân tích nghiệp vụ & kiến trúc dữ liệu
```

---

## 📡 Danh Sách API Chính

| Phương thức | Endpoint | Chức năng |
|---|---|---|
| `GET` | `/api/health` | Kiểm tra kết nối DB và trạng thái máy chủ |
| `GET` | `/api/kpi?year=2026` | Chỉ số doanh thu, chi phí, thuế, rủi ro phạt |
| `GET` | `/api/suppliers` | Phân tích nhà cung cấp thiếu chứng từ |
| `GET` | `/api/trends` | Xu hướng chi phí & thuế 12 tháng |
| `GET` | `/api/missing-docs` | Danh sách chi tiết các khoản chi thiếu hóa đơn |
| `GET` | `/api/alerts/overdue-payouts` | Cảnh báo sàn TMĐT giam tiền quá hạn |
| `GET` | `/api/alerts/lost-returns` | Cảnh báo đơn hoàn hàng thất lạc |
| `GET` | `/api/alerts/unstocked` | Cảnh báo hàng hoàn về chưa nhập kho |
| `GET` | `/api/documents` | Danh sách hóa đơn hợp lệ sẵn sàng ghép cặp |
| `POST` | `/api/link-document` | Ghép chứng từ vào giao dịch ngân hàng |
| `POST` | `/api/create-econtract` | Sinh hợp đồng khoán giải trình chi phí |
| `GET` | `/api/export-csv` | Xuất file CSV phục vụ kiểm toán / thanh tra thuế |

---

## 🎯 5 Tính Năng Nghiệp Vụ Cốt Lõi

1. **Tổng Quan Quyết Toán Thuế**: Tính toán tự động mức phạt thuế dự kiến (20%) đối với chi phí thiếu hóa đơn hợp lệ theo Thông tư 88/2021/TT-BTC.
2. **Bảng Giải Trình Dòng Tiền**: Phân loại chi tiết dòng tiền ngân hàng (MBBank/Techcombank) và nhập mua tồn kho.
3. **Ghép Hóa Đơn Điện Tử**: Khớp nối trực tiếp hóa đơn GTGT của Tổng cục Thuế với giao dịch ngân hàng.
4. **Đối Soát Công Nợ Sàn TMĐT**: Phát hiện các đơn hàng Shopee / TikTok Shop giao hoàn hoặc giải ngân chậm quá hạn để tự động sinh phiếu khiếu nại.
5. **Hợp Thức Hóa Hợp Đồng Khoán**: Tạo hợp đồng giao dịch/dịch vụ điện tử để bổ sung chứng từ chi phí thợ gia công/KOL.
