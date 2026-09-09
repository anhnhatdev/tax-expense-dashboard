import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('BỘ TEST 3: KIỂM TRA TOÀN DIỆN CÁC REST API ENDPOINTS (API CONTRACT TESTS)', () => {

  it('3.1. GET /api/health: Phải trả về mã 200 và trạng thái database connected', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.equal(res.status, 200, 'HTTP status phải là 200');

    const data = await res.json();
    assert.equal(data.status, 'ok', 'Status phải là ok');
    assert.equal(data.service, 'tax-expense-dashboard');
    assert.equal(data.database, 'connected', 'Database Supabase phải kết nối thành công');
  });

  it('3.2. GET /api/kpi?year=2026: Phải trả về chuẩn cấu trúc 3 tầng (View 1, View 2, MISA Status)', async () => {
    const res = await fetch(`${BASE_URL}/api/kpi?year=2026`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.year, 2026);

    // Kiểm tra View 1
    const v1 = data.view1_core_metrics;
    assert.ok(v1, 'Phải có view1_core_metrics');
    assert.equal(Math.round(v1.total_expense), 4305691270, 'Tổng giá trị giao dịch phải là 4,305,691,270đ');
    assert.equal(Math.round(v1.documented_expense), 1206985470, 'Tổng giá trị chứng từ phải là 1,206,985,470đ');
    assert.equal(Math.round(v1.missing_expense), 3098705800, 'Chênh lệch phải là 3,098,705,800đ');
    assert.equal(v1.coverage_ratio, 28.0, 'Tỷ lệ che phủ phải là 28.0%');

    // Kiểm tra View 2
    const v2 = data.view2_three_groups;
    assert.ok(v2, 'Phải có view2_three_groups');
    assert.ok(v2.cogs_inventory, 'Phải có nhóm cogs_inventory');
    assert.equal(Math.round(v2.cogs_inventory.total), 2579707829, 'Tổng COGS kho phải là 2,579,707,829đ');
    assert.ok(v2.direct_expense, 'Phải có nhóm direct_expense');
    assert.equal(v2.direct_expense.total, 1718724294, 'Tổng chi phí vận hành trực tiếp phải là 1,718,724,294đ');
    assert.ok(v2.marketplace_fee, 'Phải có nhóm marketplace_fee');
    assert.equal(v2.marketplace_fee.total, 7259147, 'Tổng phí vận chuyển thu hộ phải là 7,259,147đ');

    // Kiểm tra MISA status
    const misa = data.misa_sync_status;
    assert.ok(misa, 'Phải có misa_sync_status');
    assert.equal(misa.status_flag_column, 'ar.settlements.misa_booking');
  });

  it('3.3. GET /api/suppliers?year=2026: Phải trả về danh sách NCC sắp xếp theo nợ chứng từ lớn nhất', async () => {
    const res = await fetch(`${BASE_URL}/api/suppliers?year=2026&limit=10`);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.ok(Array.isArray(json.data), 'Data phải là một mảng danh sách NCC');
    assert.ok(json.data.length > 0, 'Phải có ít nhất 1 NCC');

    const first = json.data[0];
    assert.ok(first.ten_ncc, 'NCC phải có tên');
    assert.ok(first.gia_tri_kho > 0, 'Giá trị kho phải lớn hơn 0');
    assert.ok(first.thieu_chung_tu >= 0, 'Số tiền thiếu chứng từ phải không âm');

    // Tìm NCC Xuân Kỷ
    const xuanKy = json.data.find(s => (s.ten_ncc || '').toLowerCase().includes('xuân kỷ'));
    assert.ok(xuanKy, 'Danh sách Top NCC phải có Xuân Kỷ');
    assert.equal(xuanKy.gia_tri_kho, 535471400, 'Giá trị nhập của Xuân Kỷ phải đúng 535,471,400đ');
  });

  it('3.4. GET /api/missing-docs: Phải phân loại chính xác theo từng nhóm cogs, direct, marketplace', async () => {
    // 1. Nhóm COGS
    const resCogs = await fetch(`${BASE_URL}/api/missing-docs?group=cogs&limit=10`);
    assert.equal(resCogs.status, 200);
    const jsonCogs = await resCogs.json();
    assert.ok(jsonCogs.data.every(item => item.group === 'cogs'), 'Tất cả mục phải thuộc nhóm cogs');

    // 2. Nhóm Direct (Ngân hàng Expense)
    const resDirect = await fetch(`${BASE_URL}/api/missing-docs?group=direct&limit=10`);
    assert.equal(resDirect.status, 200);
    const jsonDirect = await resDirect.json();
    assert.ok(jsonDirect.data.every(item => item.group === 'direct'), 'Tất cả mục phải thuộc nhóm direct');

    // 3. Nhóm Marketplace (Thu hộ SPX / Sapo)
    const resMarket = await fetch(`${BASE_URL}/api/missing-docs?group=marketplace&limit=10`);
    assert.equal(resMarket.status, 200);
    const jsonMarket = await resMarket.json();
    assert.ok(jsonMarket.data.every(item => item.group === 'marketplace'), 'Tất cả mục phải thuộc nhóm marketplace');
  });

  it('3.5. GET /api/misa/pending-settlements: Phải lấy lô settlements chưa hạch toán để đồng bộ', async () => {
    const res = await fetch(`${BASE_URL}/api/misa/pending-settlements?batch_size=50`);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.batch_size, 50);
    assert.ok(Array.isArray(json.data), 'Data phải là một mảng các bản ghi settlement');
    assert.ok(json.data.length > 0, 'Phải có bản ghi settlement chờ đồng bộ');
    assert.equal(json.data[0].misa_booking, false, 'Các bản ghi phải chưa được đánh dấu (misa_booking = false)');
  });

  it('3.6. POST /api/misa/mark-booked: Phải cập nhật cờ hạch toán MISA thành công', async () => {
    const postData = {
      txn_ids: ['TXN_TEST_UNIT_001', 'TXN_TEST_UNIT_002'],
      voucher_no: 'PKT-TEST-2026-999'
    };

    const res = await fetch(`${BASE_URL}/api/misa/mark-booked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData)
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.voucher_no, 'PKT-TEST-2026-999');
    assert.equal(json.booked_count, 2);
    assert.ok(json.booked_at);
  });

  it('3.7. GET /api/export-csv: Phải xuất file CSV hợp lệ phục vụ quyết toán', async () => {
    const res = await fetch(`${BASE_URL}/api/export-csv`);
    assert.equal(res.status, 200);

    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('text/csv'), 'Content-Type phải là text/csv');

    const text = await res.text();
    assert.ok(text.includes('BÁO CÁO GIẢI TRÌNH CHI PHÍ VÀ CHỨNG TỪ THUẾ'), 'Phải có tiêu đề báo cáo');
    assert.ok(text.includes('4,305,691,270'), 'Phải chứa tổng số tiền giao dịch 4.31 Tỷ');
  });

});
