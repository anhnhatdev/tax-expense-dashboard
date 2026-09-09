# TÀI LIỆU THIẾT KẾ GIAO DIỆN & LỘ TRÌNH TRIỂN KHAI (SYSTEM DESIGN & ROADMAP)
## DỰ ÁN 1: TAX & EXPENSE DASHBOARD

---

### 1. Triết lý Thiết kế Giao diện (UI/UX Design Philosophy)

Hệ thống được thiết kế theo phong cách **Enterprise Executive Dashboard** (chuẩn giao diện điều hành cấp cao của doanh nghiệp):
* **Tone màu:** Dark Navy / Slate cao cấp (`#0B0F19` nền chính, `#131B2E` thẻ card nổi, viền phát sáng nhẹ `rgba(255,255,255,0.06)`).
* **Màu chỉ báo ngữ nghĩa:**
  * 🟢 **Emerald Green (`#10B981`):** Chi phí đã có chứng từ hợp lệ / An toàn thuế.
  * 🔴 **Rose Red (`#F43F5E`):** Chi phí thiếu chứng từ (Rủi ro thuế xuất toán) / Cảnh báo đơn sàn trễ hạn.
  * 🟡 **Amber Gold (`#F59E0B`):** Đơn hoàn đang trên đường về / Cần kiểm tra rủi ro.
  * 🟣 **Electric Indigo (`#6366F1`):** Nút hành động chính / Tạo hợp đồng / Gán hóa đơn.
* **Typography:** Font chữ hiện đại từ Google Fonts: **Plus Jakarta Sans** / **Inter** cho bảng số liệu tài chính rõ ràng, sắc nét.
* **Micro-animations & Glassmorphism:** Hiệu ứng chuyển động mượt mà khi lọc dữ liệu, hover hiệu ứng thẻ 3D nhẹ nhàng, thanh gauge đo tỷ lệ che phủ thuế trực quan.

---

### 2. Cấu trúc Các Thành phần Giao diện (Wireframe Layout)

```
+-------------------------------------------------------------------------------+
| [LOGO ONESIE / VERDENCY]  TAX & EXPENSE DASHBOARD        [ Năm: 2026 v ] [⚙️]  |
+-------------------------------------------------------------------------------+
|  KPI CARDS:                                                                   |
|  +----------------+  +----------------+  +----------------+  +----------------+
|  | TỔNG CHI PHÍ   |  | CÓ CHỨNG TỪ    |  | THIẾU CHỨNG TỪ |  | CẢNH BÁO GẤP   |
|  | 7.85 TỶ VNĐ    |  | 1.21 TỶ (15.4%)|  | 6.64 TỶ (84.6%)|  | 177 VỤ VIỆC    |
|  +----------------+  +----------------+  +----------------+  +----------------+
+-------------------------------------------------------------------------------+
|  TRỰC QUAN HÓA:                                                               |
|  [ VÒNG ĐO CHE PHỦ THUẾ (Gauge) ]        [ BIỂU ĐỒ CƠ CẤU CHI PHÍ 3 NHÓM ]    |
|  (Đã có 15.4% | Thiếu 84.6%)             (Ngân hàng: 67% | Kho: 33% | Ví SPX) |
+-------------------------------------------------------------------------------+
|  BỘ 4 TABS CẢNH BÁO HÀNH ĐỘNG ("Nhìn là phải biết Hành Động"):                 |
|  [🚨 Thiếu chứng từ (3,718)]  [⏱️ Sàn Overdue (129)]  [📦 Hoàn lạc (25)] [🏬 Chưa nhập (23)] |
+-------------------------------------------------------------------------------+
|  BỘ LỌC & TÌM KIẾM:                                                           |
|  [🔍 Tìm kiếm nội dung / NCC...]  [Nguồn: Tất cả v]  [Người phụ trách: Tất cả v]|
+-------------------------------------------------------------------------------+
|  BẢNG DỮ LIỆU HÀNH ĐỘNG (ACTION TABLE):                                       |
|  Ngày       | Nguồn  | Đối tác / Thợ  | Số tiền     | Nội dung   | Hành động      |
|  28/08/2026 | Bank   | Chị Trang may  | 100,000đ    | MBCT Se... | [+ E-Contract] |
|  28/08/2026 | Kho    | Vải Minh Hạnh  | 15,200,000đ | Nhập vải.. | [Gán Hóa đơn]  |
+-------------------------------------------------------------------------------+
```

---

### 3. Lộ trình Triển khai Cuốn chiếu (Implementation Roadmap)

| Giai đoạn | Nhiệm vụ | Thời gian | Kết quả đầu ra |
| :---: | :--- | :---: | :--- |
| **Giai đoạn 1** *(Hiện tại)* | **Xây dựng Documents & Tax Expense Dashboard MVP** | **Ngày 1 - 2** | - Bộ tài liệu đặc tả đầy đủ trong `documents/`.<br/>- Ứng dụng Dashboard chạy mượt mà kết nối Supabase thật.<br/>- Trực quan hóa 4 tab cảnh báo và thanh đo tỷ lệ thuế. |
| **Giai đoạn 2** | **Tích hợp E-Contract Tool tự động hóa** | **Ngày 3 - 4** | - Form tự động sinh hợp đồng dịch vụ / phụ lục livestream.<br/>- Cổng ký online trên mobile vẽ tay không cần OTP.<br/>- Tự động đóng dấu hash và đổi trạng thái giao dịch sang "Đã có chứng từ". |
| **Giai đoạn 3** | **Tự động hóa thông minh (AI Auto-matching)** | **Ngày 5** | - Claude bóc tách nội dung chuyển khoản tự động gợi ý hóa đơn.<br/>- Đồng bộ ngược kết quả vào Lark Base qua Webhook n8n. |
| **Giai đoạn 4** | **Đóng gói & Tích hợp vào `admin.onesie.com`** | **Sau rà soát** | - Cấu hình Cloudflare Workers xác thực phân quyền (RBAC).<br/>- Bàn giao hệ thống chính thức cho kế toán và ban quản trị. |

---

### 4. Danh mục File Tài liệu Tham chiếu Đã Hoàn tất

Tất cả tài liệu được lưu trữ tại thư mục:
`tax-expense-dashboard/documents/`

1. **`01_BUSINESS_REQUIREMENTS.md`**: Bản chất bài toán thuế, 3 nhóm dòng tiền chi ra, nguyên tắc cân bằng và 4 cảnh báo hành động thực tế.
2. **`02_DATA_ARCHITECTURE_AND_MAPPING.md`**: Cấu trúc CSDL Supabase `taxdoc`, `ar`, bảng kê mirror Lark Base và cơ chế ghép cặp chứng từ.
3. **`03_API_AND_INTEGRATION_SPEC.md`**: Đặc tả kỹ thuật toàn bộ API endpoints JSON cho Dashboard và hành động gán chứng từ.
4. **`04_SYSTEM_DESIGN_AND_ROADMAP.md`**: Thiết kế giao diện Enterprise Executive và lộ trình triển khai chi tiết từng bước.
