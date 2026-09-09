# TÀI LIỆU ĐẶC TẢ API & TÍCH HỢP HỆ THỐNG (API & INTEGRATION SPECIFICATION)
## DỰ ÁN 1: TAX & EXPENSE DASHBOARD

---

### 1. Kiến trúc Tích hợp & Nguyên tắc Bảo mật

```
+-----------------------------------------------------------+
|               Trình duyệt Người dùng (Client)            |
|       (admin.onesie.com / Local Dashboard Interface)       |
+-----------------------------------------------------------+
                              |
                     REST JSON Requests
                              |
                              v
+-----------------------------------------------------------+
|            Node.js Backend Proxy (Cổng an toàn)           |
|  - Xác thực & Phân quyền RBAC                             |
|  - Giữ bí mật Service Role Key phía Server                |
|  - Cung cấp API chuẩn hóa cho Frontend                    |
+-----------------------------------------------------------+
                              |
                    Supabase PostgREST API
                              |
                              v
+-----------------------------------------------------------+
|              Supabase CSDL (ixxrefjiirhdzgwtbcvu)         |
|  - Schemas: taxdoc, ar, econtract                         |
+-----------------------------------------------------------+
```

---

### 2. Danh mục API Endpoints

#### 2.1. Nhóm API Thống kê & KPI Tổng quan

##### `GET /api/kpi`
* **Mô tả:** Lấy số liệu tổng quan chi phí, số tiền đã có/chưa có chứng từ, tỷ lệ che phủ thuế.
* **Tham số query:**
  * `year` (Tùy chọn, mặc định: `2026`): `2026`, `2025`, `2024`, hoặc `all`.
* **Phản hồi mẫu (200 OK):**
```json
{
  "year": 2026,
  "summary": {
    "total_expense": 7849927086,
    "documented_expense": 1206985470,
    "missing_expense": 6642941616,
    "coverage_ratio": 15.38
  },
  "by_source": {
    "bank": {
      "total": 5270219257,
      "documented": 0,
      "missing": 5270219257,
      "count": 1832
    },
    "inventory": {
      "total": 2579707829,
      "documented": 1206985470,
      "missing": 1372722359,
      "count": 1886
    },
    "shipment_wallet": {
      "count": 671,
      "note": "Cấn trừ SPX Express & ví sàn"
    }
  },
  "alert_counts": {
    "missing_docs": 3718,
    "overdue_payouts": 129,
    "lost_returns": 25,
    "unstocked_returns": 23
  }
}
```

##### `GET /api/trends`
* **Mô tả:** Lấy dữ liệu phân bổ chi phí theo các tháng trong năm để vẽ biểu đồ xu hướng.
* **Phản hồi:** Mảng các tháng kèm tổng chi và số tiền đã có chứng từ.

---

#### 2.2. Nhóm API 4 Cảnh Báo Hành Động

##### `GET /api/missing-docs`
* **Mô tả:** Lấy danh sách chi tiết các giao dịch chi tiêu đang thiếu chứng từ hợp lệ.
* **Tham số query:**
  * `source`: `all`, `bank`, `inventory`, `shipment` (mặc định: `all`).
  * `search`: Từ khóa tìm kiếm theo nội dung, tên nhà cung cấp / thợ.
  * `page`: Trang hiện tại (mặc định: `1`).
  * `limit`: Số bản ghi mỗi trang (mặc định: `20`).
* **Phản hồi mẫu (200 OK):**
```json
{
  "total": 3718,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id": "recvtz35ptG2sv",
      "source": "bank",
      "date": "2026-08-28T04:57:00.000Z",
      "supplier": "Chị Trang may",
      "category": "Chi gia công / sửa quần áo",
      "amount": 100000,
      "message": "MBCT Seleen gui chi Trang cam on chi da ho tro sua quan a D2HSNJGK/025109",
      "has_document": false,
      "suggested_action": "econtract"
    }
  ]
}
```

##### `GET /api/alerts/overdue-payouts`
* **Mô tả:** Lấy danh sách các đơn hàng sàn giao thành công quá 4 ngày chưa thanh toán (từ `ar.v_case`).
* **Phản hồi mẫu (200 OK):**
```json
{
  "count": 129,
  "data": [
    {
      "order_id": "26062632JJM9K3",
      "channel": "shopee",
      "stage": "delivered",
      "substage": "waiting_for_payment",
      "value": 508950,
      "delivered_at": "2026-06-25T10:00:00Z",
      "age_days": 75.4,
      "action": "dispute_marketplace"
    }
  ]
}
```

##### `GET /api/alerts/lost-returns`
* **Mô tả:** Lấy danh sách các ca hoàn hàng có nguy cơ thất lạc (vận chuyển quay đầu kéo dài).
* **Phản hồi mẫu (200 OK):**
```json
{
  "count": 25,
  "data": [
    {
      "order_id": "260620K5WW0VBD",
      "channel": "tiktok",
      "substage": "return_picked_up",
      "value": 280000,
      "picked_up_at": "2026-06-24T14:20:00Z",
      "action": "claim_logistics"
    }
  ]
}
```

##### `GET /api/alerts/unstocked`
* **Mô tả:** Lấy danh sách các kiện hàng hoàn đã về cửa kho (có camera Dohana) nhưng chưa quét nhập kho Sapo.
* **Phản hồi mẫu (200 OK):**
```json
{
  "count": 23,
  "data": [
    {
      "case_id": "260618CUN7BQ7K",
      "channel": "shopee",
      "stage": "arrived_not_stocked",
      "substage": "arrived_no_video",
      "value": 614621,
      "clock_from": "2026-06-29T17:55:17Z",
      "action": "audit_warehouse"
    }
  ]
}
```

---

#### 2.3. Nhóm API Thao tác Gán Chứng từ

##### `GET /api/documents`
* **Mô tả:** Lấy danh sách hóa đơn GTGT điện tử sẵn có từ `taxdoc.document` để gán vào giao dịch.
* **Tham số:** `search` (theo số hóa đơn, tên nhà cung cấp, MST).

##### `POST /api/link-document`
* **Mô tả:** Thực hiện gán một hóa đơn GTGT hoặc mã hợp đồng E-Contract vào giao dịch chi tiêu.
* **Payload:**
```json
{
  "transaction_id": "recvtz35ptG2sv",
  "document_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "allocated_amount": 100000,
  "notes": "Gán hóa đơn GTGT tiền vải tháng 8"
}
```
* **Kết quả:** Trả về `success: true` và cập nhật ngay trạng thái che phủ thuế trên Dashboard.
