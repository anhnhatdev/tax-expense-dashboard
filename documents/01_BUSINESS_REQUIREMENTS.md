# TÀI LIỆU YÊU CẦU NGHIỆP VỤ (BUSINESS REQUIREMENTS DOCUMENT)
## DỰ ÁN 1: TAX & EXPENSE DASHBOARD (HỆ THỐNG KIỂM SOÁT THUẾ & CHI PHÍ THEO HÀNH ĐỘNG)

---

### 1. Bối cảnh & Bản chất Vấn đề (The "Why")

Doanh nghiệp (**Verdency / Onesie / Seleen**) là đơn vị bán lẻ thời trang đa kênh quy mô lớn trên các nền tảng:
* **Kênh bán hàng:** Shopee, TikTok Shop, Website Sapo.
* **Hệ thống kho & vận hành:** Sapo Omnichannel (quản lý tồn kho & xuất nhập), Camera Dohana (giám sát đóng gói và hoàn hàng), MISA (kế toán).
* **Quản trị nội bộ:** Lark Base (kế hoạch, sổ phụ ngân hàng, đối soát nhà cung cấp).

#### Thực trạng rủi ro thuế:
* Doanh nghiệp phát sinh khối lượng giao dịch chi tiền rất lớn mỗi ngày (nhập vải, phụ liệu, tiền gia công thợ, tiền dịch vụ livestream, cấn trừ phí sàn, phí vận chuyển...).
* Tuy nhiên, thực tế vận hành luôn diễn ra theo mô hình: **Chi tiền trước, chứng từ bổ sung sau**.
* **Nguyên tắc quyết toán thuế:** Cơ quan Thuế yêu cầu mọi dòng tiền chi ra khỏi doanh nghiệp đều phải có chứng từ hợp pháp, hợp lệ chứng minh. Nếu chỉ có lệnh chuyển tiền ngân hàng mà không có Hóa đơn GTGT hoặc Hợp đồng/Bảng kê hợp lệ:
  * Toàn bộ khoản chi đó sẽ bị **loại trừ chi phí (xuất toán)** khi tính thuế Thu nhập Doanh nghiệp (TNDN).
  * Doanh nghiệp bị **truy thu thuế TNDN 20%** trên tổng số tiền bị loại trừ, kèm phạt chậm nộp 0.03%/ngày và phạt khai sai (20% số tiền thuế truy thu).

---

### 2. Mục tiêu Cốt lõi của Dự án

Đảm bảo nguyên tắc cân bằng tuyệt đối:
$$\sum \text{Dòng Tiền Chi Ra} = \sum \text{Giá Trị Chứng Từ Hợp Lệ (Hóa đơn GTGT + Hợp đồng/Phụ lục)}$$

#### Mục tiêu cụ thể:
1. **Minh bạch 100% dòng tiền chi tiêu:** Gom toàn bộ các nguồn chi về một màn hình duy nhất, tính toán tự động tỷ lệ che phủ chứng từ (*Tax Coverage Ratio*).
2. **Cảnh báo theo định hướng hành động ("Nhìn là phải biết Hành Động"):** Không chỉ là dashboard thống kê thụ động, mà phát hiện ngay khoản chi nào đang thiếu chứng từ, chỉ rõ người phụ trách để đôn đốc xử lý.
3. **Bảo vệ dòng tiền vận hành sàn:** Phát hiện tức thì các đơn hàng sàn đã giao thành công quá 4 ngày mà chưa quyết toán tiền về ví, các đơn hoàn có nguy cơ thất lạc hoặc hàng đã về cửa kho nhưng chưa được nhập kho.

---

### 3. Phân loại 3 Nhóm Dòng Tiền Chi Ra

Dòng tiền chi ra của công ty được chuẩn hóa thành 3 nhóm dữ liệu giao dịch:

#### Nhóm 1: Chi mua hàng tồn kho (`M_Inventory Log`)
* **Bản chất:** Tiền mua vải, nguyên phụ liệu may mặc, bao bì đóng gói, phụ kiện đưa thẳng vào kho để sản xuất hoặc bán lẻ.
* **Nguồn dữ liệu:** Đồng bộ từ Lark Base bảng `M_Inventory Log` (hiện có hơn 9,065 bản ghi trong Supabase).
* **Năm 2026:** Đã chi **2,579,707,829 VNĐ**, trong đó mới có chứng từ **1,206,985,470 VNĐ**, còn thiếu **1,372,722,359 VNĐ** (thiếu 53.2%).

#### Nhóm 2: Chi phí vận hành phát sinh một lần (`F_Bank Transaction`)
* **Bản chất:** Tiền thuê thiết kế, KOL/Agency, chạy quảng cáo (Facebook/TikTok), tiền gia công thợ may, sửa đồ, ăn uống, văn phòng phẩm, v.v.
* **Nguồn dữ liệu:** Bắt biến động số dư qua Webhook n8n ghi vào sổ phụ Lark Base `F_Bank Transaction` (hiện có hơn 8,887 bản ghi trong Supabase từ tài khoản MBBank...).
* **Năm 2026:** Đã chi **5,270,219,257 VNĐ**, hiện tại **100% chưa được link chứng từ hóa đơn hợp lệ** trên hệ thống ngân hàng.

#### Nhóm 3: Chi phí "ẩn" nằm trong các khoản Thu hộ / Cấn trừ (`F_Shipment_Wallet` & Sàn TMĐT)
* **Bản chất:** 
  * **Đơn vị vận chuyển (SPX Express, Sapo Express...):** Thu hộ tiền COD của khách 10.000.000đ, trừ phí giao hàng 70.000đ, chỉ chuyển khoản về ví công ty 9.930.000đ.
  * **Sàn TMĐT (Shopee, TikTok Shop):** Doanh thu bán 100.000.000đ, sàn cấn trừ trực tiếp phí sàn, voucher, phí vận chuyển 30.000.000đ, chỉ giải ngân về ví 70.000.000đ.
* **Lưu ý kế toán thuế:** Tiền phí sàn/phí ship không xuất hiện dưới dạng lệnh chuyển tiền âm trên sao kê ngân hàng, nhưng về thuế công ty bắt buộc phải ghi nhận chi phí và phải có hóa đơn đối soát cấn trừ tương ứng từ sàn/đơn vị vận chuyển.
* **Nguồn dữ liệu:** Lark Base `F_Shipment_Wallet` (671 bản ghi đối soát SPX) và Supabase `ar.settlements`.

---

### 4. Bốn Nhóm Cảnh Báo Nghiệp Vụ ("Nhìn là phải biết Hành Động")

Mỗi bảng cảnh báo trên Dashboard phải gắn liền với một hành động cụ thể cho nhân viên:

| STT | Mục Cảnh Báo | Ý Nghĩa Thực Tế | Nguồn Dữ Liệu | Hành Động Cần Làm Ngay (Action) |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Giao dịch thiếu chứng từ** | Tiền đã chuyển/vật liệu đã nhập nhưng chưa có Hóa đơn hoặc Hợp đồng đi kèm. | `taxdoc.v_chi_ngan_hang`<br/>`taxdoc.v_nhap_kho` | Lọc theo người phụ trách/nhà cung cấp để đôn đốc đòi hóa đơn, hoặc bấm **[Gán Hóa đơn]** / **[Chuẩn bị E-Contract]**. |
| **2** | **Đơn sàn Overdue thanh toán** | Đơn giao thành công (`delivered`) đã **quá 4 ngày** nhưng sàn chưa chịu quyết toán trả tiền về ví. | `ar.v_case`<br/>(`substage = waiting_for_payment`)<br/>*Hiện có 129 đơn* | Bấm **[Khiếu nại sàn ngay]** để bộ phận vận hành gửi ticket sàn thu hồi dòng tiền. |
| **3** | **Đơn hoàn thất lạc** | Sàn báo khách trả hàng, shipper đã lấy hàng (`picked_up_at`) nhưng quá hạn chưa giao về lại kho. | `ar.v_case`<br/>(`coming_back`, `return_picked_up`)<br/>*Hiện có 25 đơn* | Bấm **[Đối soát vận chuyển]** yêu cầu hãng đền bù hàng hóa thất lạc. |
| **4** | **Hàng về chưa nhập kho** | Camera Dohana đã quay video khui hàng trả về (`filmed_at`), nhưng hệ thống Sapo chưa có phiếu quét nhập kho. | `ar.v_case`<br/>(`arrived_not_stocked`)<br/>*Hiện có 23 đơn* | Bấm **[Báo kiểm kho]** cử nhân sự xuống kho rà soát thực tế, tránh shipper chụp ảnh giao hàng ảo hoặc thất thoát nội bộ. |

---

### 5. Tiêu chuẩn Kỹ thuật & Định hướng Quy hoạch

1. **Quy hoạch cổng quản trị:**
   * Không triển khai phân tán trên các URL tạm của Cloudflare Workers.
   * Quy hoạch giao diện Dashboard chuẩn hóa để tích hợp thẳng vào cổng quản trị tập trung **`admin.onesie.com`**.
2. **Nguyên tắc an toàn dữ liệu:**
   * Sử dụng kiến trúc Backend Proxy an toàn, tuyệt đối không phơi lộ `service_role` key hay cho phép quyền ghi tự do từ client.
   * Giao diện chạy mượt mà, tải nhanh, trực quan, hỗ trợ chế độ Dark Mode chuẩn phong cách Enterprise Executive.
