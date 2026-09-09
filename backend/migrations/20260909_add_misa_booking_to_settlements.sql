-- =============================================================================
-- MIGRATION: ADD MISA BOOKING STATUS FLAGS TO SETTLEMENTS TABLE
-- Based on Meeting 3: Settlement Data Architecture & MISA Batch Sync
-- =============================================================================

-- 1. Thêm cột trạng thái MISA trực tiếp vào bảng ar.settlements (Zero-overhead, không làm gãy ETL)
ALTER TABLE ar.settlements 
  ADD COLUMN IF NOT EXISTS misa_booking boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS misa_booked_at timestamptz DEFAULT null,
  ADD COLUMN IF NOT EXISTS misa_voucher_no text DEFAULT null;

COMMENT ON COLUMN ar.settlements.misa_booking IS 'Cờ đánh dấu giao dịch đã được book/hạch toán lên MISA thành công';
COMMENT ON COLUMN ar.settlements.misa_booked_at IS 'Thời điểm đồng bộ lên MISA';
COMMENT ON COLUMN ar.settlements.misa_voucher_no IS 'Số chứng từ hạch toán MISA sinh ra';

-- 2. Tạo Partial Index siêu tốc phục vụ truy vấn batch sync (100 - 500 rows)
-- Workflow đồng bộ chỉ cần quét theo index này, bỏ qua 28.000+ bản ghi đã book
CREATE INDEX IF NOT EXISTS idx_settlements_misa_unbooked 
  ON ar.settlements (occurred_at DESC) 
  WHERE misa_booking IS NOT TRUE;

-- 3. Xác minh tính toàn vẹn:
-- Cả 2 hàm ETL ar.parse_shopee_money() và ar.parse_tiktok_money() đều sử dụng
-- danh sách cột tường minh trong INSERT và chỉ cập nhật order_id trong ON CONFLICT,
-- nên cờ misa_booking KHÔNG BAO GIỜ bị ETL ghi đè hay mất trạng thái khi chạy lại.
