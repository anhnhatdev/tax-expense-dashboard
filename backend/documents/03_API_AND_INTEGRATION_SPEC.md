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
##### `GET /api/kpi`
* **Mô tả:** Lấy 3 chỉ số cốt lõi và cơ cấu 3 nhóm kế toán chuẩn hóa theo Meeting 3.
* **Tham số query:** `year` (Mặc định: `2026`, hoặc `2025`, `2024`, `all`).
* **Phản hồi mẫu (200 OK):**
```json
{
  "year": 2026,
  "view1_core_metrics": {
    "total_expense": 4305691270,
    "documented_expense": 1206985470,
    "missing_expense": 3098705800,
    "coverage_ratio": 28.0,
    "total_transactions": 3708,
    "missing_transactions": 2501
  },
  "view2_three_groups": {
    "cogs_inventory": {
      "group_id": "cogs",
      "title": "Mua Hàng / Tiền Kho (COGS)",
      "total": 2579707829,
      "documented": 1206985470,
      "missing": 1372722359,
      "coverage_pct": 46.8,
      "count": 1886
    },
    "direct_expense": {
      "group_id": "direct",
      "title": "Chi Phí Vận Hành Trực Tiếp",
      "total": 1718724294,
      "documented": 0,
      "missing": 1718724294,
      "coverage_pct": 0.0,
      "count": 1419
    },
    "marketplace_fee": {
      "group_id": "marketplace",
      "title": "Chi Phí Dịch Vụ Sàn & Vận Chuyển",
      "total": 7259147,
      "documented": 0,
      "missing": 7259147,
      "coverage_pct": 0.0,
      "count": 403
    }
  },
  "misa_sync_status": {
    "total_settlements": 30542,
    "booked_count": 28542,
    "pending_count": 2000,
    "recommended_batch_size": 200,
    "status_flag_column": "ar.settlements.misa_booking"
  }
}
```

##### `GET /api/misa/pending-settlements`
* **Mô tả:** Lấy danh sách settlement chưa book MISA theo lô nhỏ phục vụ đồng bộ định kỳ.
* **Tham số query:** `limit` (Mặc định: `200`, hỗ trợ `100`, `500`).
* **Phản hồi:** Danh sách giao dịch settlement kèm mã đơn và số tiền cần book.

##### `POST /api/misa/mark-booked`
* **Mô tả:** Đánh dấu cờ `misa_booking = true` cho lô giao dịch sau khi MISA hạch toán thành công.
* **Payload:** `{ "txn_ids": ["TXN-1", "TXN-2"], "voucher_no": "PKT-MISA-2026-001" }`.

---

#### 2.2. Nhóm API Xử Lý Chứng Từ & Nhà Cung Cấp

##### `GET /api/suppliers`
* **Mô tả:** Danh sách nhà cung cấp mua hàng kho (COGS) với số tiền còn thiếu để kế toán đòi hóa đơn.

##### `GET /api/missing-docs`
* **Mô tả:** Danh sách chi tiết các khoản chi thiếu chứng từ, phân loại theo 3 nhóm.
* **Tham số query:**
  * `group`: `all`, `cogs`, `direct`, `marketplace`.
  * `search`: Tìm kiếm theo tên nhà cung cấp, nội dung.
  * `min_amount`: Lọc số tiền tối thiểu.
  * `page`, `limit`: Phân trang.

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
