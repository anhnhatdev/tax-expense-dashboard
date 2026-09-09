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

### 3. Phân Loại 3 Nhóm Dòng Tiền Chi Ra (Chuẩn Hóa Meeting 3)

Nhằm loại bỏ hoàn toàn sự nhập nhằng và **triệt tiêu lỗi đếm trùng (Double-count)**, hệ thống phân định rành mạch bản chất kế toán của từng dòng tiền:

#### Nhóm 1: Mua Hàng / Tiền Kho (`M_Inventory Log` - COGS)
* **Bản chất:** Giao dịch phát sinh nghĩa vụ nợ khi nhập kho (vải, xưởng may gia công, phụ liệu).
* **Quy tắc mapping:** Hóa đơn/chứng từ hợp đồng phải **map trực tiếp vào từng lần nhập hàng** theo đích danh từng nhà cung cấp (Hộ KD Quỳnh Lê, Xuân Kỷ, Chí Cường, Chị Hoa, Phạm Phương...). Thiếu ở dòng nhập hàng nào thì kế toán đòi hóa đơn của nhà cung cấp đó.
* **Số liệu 2026:** Tổng giá trị nhập kho: **2.579.707.829 VNĐ** (1.886 phiếu kho). Đã có hóa đơn: **1.206.985.470 VNĐ**, còn thiếu: **1.372.722.359 VNĐ** (Tỷ lệ che phủ: 46.8%).

#### Nhóm 2: Chi Phí Vận Hành Trực Tiếp (`F_Bank Transaction` - Direct Expenses)
* **Bản chất:** Chi phí phát sinh một lần thanh toán ngay: Mua giấy gói hàng, băng keo, chi phí văn phòng, marketing, R&D. Dòng tiền chi ra trùng với thời điểm phát sinh chi phí nên không cần theo dõi công nợ, mà **map trực tiếp hóa đơn vào dòng giao dịch ngân hàng**.
* **Nguyên tắc loại trừ kép (Triệt tiêu Double-Count):**
  * **Loại trừ lệnh trả nợ tiền hàng COGS:** Ví dụ mua hàng ghi nợ nhiều lần trên Inventory Log tổng 11 triệu, sau đó ngân hàng chuyển khoản 11 triệu. Đây chỉ là lệnh thanh toán nợ, hóa đơn đã map ở Inventory Log nên **loại trừ hoàn toàn khỏi ngân hàng, không map thêm lần thứ hai**.
  * **Loại trừ luân chuyển vốn nội bộ:** Vay nợ, trả nợ vay, rút/nộp tiền mặt, chuyển tiền giữa các tài khoản nội bộ (không cấu thành chi phí tính thuế).
* **Số liệu 2026 (Chỉ tính `lv1 = 'Expense'`):** Đã chi **1.718.724.294 VNĐ** (1.419 giao dịch), hiện tại chưa bổ sung hóa đơn GTGT.

#### Nhóm 3: Chi Phí Dịch Vụ Sàn & Vận Chuyển (`F_Shipment_Wallet` & Sàn TMĐT)
* **Bản chất:** Các bên này (SPX Express, Shopee, TikTok Shop) cấn trừ chi phí trực tiếp trên doanh thu bán hàng qua dòng tiền COD và xuất hóa đơn dịch vụ/vận chuyển định kỳ.
* **Quy tắc mapping:** Không đi sâu vào từng đơn hàng lẻ. Gom quản lý và **đối soát map theo hóa đơn tổng từng kỳ/tháng**.
* **Số liệu 2026:** Đã cấn trừ **7.259.147 VNĐ** (403 giao dịch phí vận chuyển SPX).

---

### 4. Ba Chỉ Số Cốt Lõi Của Dashboard (View 1 - Chuẩn Meeting 3)

Màn hình loại bỏ các thông tin rườm rà (đơn hoàn, đơn quá hạn, hay tạm tính thuế 20% vốn chưa cần thiết), tập trung đúng 3 con số:
1. **Tổng tiền giao dịch (Dòng tiền chi ra thực tế):** **4.305.691.270 VNĐ** (Kho COGS 2.58 tỷ + Chi phí trực tiếp 1.72 tỷ + Cấn trừ sàn 7.26 triệu).
2. **Tổng giá trị chứng từ (Đã map thành công):** **1.206.985.470 VNĐ**.
3. **Chênh lệch thiếu (Cần chứng từ hợp lệ chứng minh):** **3.098.705.800 VNĐ** (Tỷ lệ che phủ: 28.0%).

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
