import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ixxrefjiirhdzgwtbcvu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'your_supabase_service_role_key_here';

async function querySupabase(endpoint, schema = 'public') {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
  if (schema !== 'public') {
    headers['Accept-Profile'] = schema;
    headers['Content-Profile'] = schema;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Supabase query error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

describe('BỘ TEST 2: KIỂM TRA TÍNH TOÀN VẸN CỦA CƠ SỞ DỮ LIỆU THỰC TẾ (SUPABASE & LARK BASE)', () => {

  it('2.1. View taxdoc.v_dash_tong_quan: Dữ liệu năm 2026 nguồn Kho phải khớp từng đồng', async () => {
    const rows = await querySupabase('v_dash_tong_quan?nam=eq.2026&nguon=eq.kho', 'taxdoc');
    assert.equal(rows.length, 1, 'Phải có đúng 1 dòng tổng hợp năm 2026 nguồn kho');

    const kho2026 = rows[0];
    assert.equal(kho2026.so_dong, 1886, 'Số dòng phiếu kho năm 2026 phải là 1,886 phiếu');
    assert.equal(Math.round(Number(kho2026.tong)), 2579707829, 'Tổng giá trị nhập kho 2026 phải là 2,579,707,829đ');
    assert.equal(Math.round(Number(kho2026.co_chung_tu)), 1206985470, 'Giá trị đã có hóa đơn kho phải là 1,206,985,470đ');
    assert.equal(Math.round(Number(kho2026.chua_co)), 1372722359, 'Chênh lệch thiếu hóa đơn kho phải là 1,372,722,359đ');
  });

  it('2.2. View taxdoc.v_chi_ngan_hang: Lọc lv1 = Expense năm 2026 phải đạt đúng 1,419 giao dịch và 1,718,724,294đ', async () => {
    let allRows = [];
    let offset = 0;
    const limit = 1000;
    const url = 'v_chi_ngan_hang?lv1=eq.Expense&ngay=gte.2026-01-01T00:00:00Z&ngay=lt.2027-01-01T00:00:00Z&select=so_tien,co_chung_tu';

    while (true) {
      const rows = await querySupabase(`${url}&offset=${offset}&limit=${limit}`, 'taxdoc');
      if (!Array.isArray(rows) || rows.length === 0) break;
      allRows = allRows.concat(rows);
      if (rows.length < limit) break;
      offset += limit;
    }

    assert.equal(allRows.length, 1419, 'Số giao dịch chi phí trực tiếp năm 2026 phải là đúng 1,419 giao dịch');
    const totalAmount = allRows.reduce((sum, r) => sum + (Number(r.so_tien) || 0), 0);
    assert.equal(totalAmount, 1718724294, 'Tổng chi phí vận hành trực tiếp ngân hàng năm 2026 phải là đúng 1,718,724,294đ');
  });

  it('2.3. Bảng F_Shipment_Wallet: Phí vận chuyển cấn trừ ví phải gồm cả SPX Express và Sapo Express với tổng 7,259,147đ', async () => {
    const rows = await querySupabase('mirror_lark?source_table=eq.F_Shipment_Wallet&limit=1000', 'taxdoc');
    const feeRows = rows.filter(r => r.fields && r.fields['Loại giao dịch'] === 'Phí vận chuyển');

    assert.equal(feeRows.length, 403, 'Tổng số giao dịch cấn trừ phí vận chuyển phải là đúng 403 giao dịch');

    const sapoFees = feeRows.filter(r => r.fields['Tài khoản'] === 'Sapo Express');
    const spxFees = feeRows.filter(r => r.fields['Tài khoản'] === 'SPX Express');

    assert.equal(sapoFees.length, 300, 'Sapo Express phải có 300 bản ghi phí vận chuyển');
    assert.equal(spxFees.length, 103, 'SPX Express phải có 103 bản ghi phí vận chuyển');

    const totalFee = feeRows.reduce((sum, r) => sum + Math.abs(Number(r.fields['Số tiền']) || 0), 0);
    assert.equal(totalFee, 7259147, 'Tổng phí vận chuyển cấn trừ ví phải đạt chuẩn 7,259,147đ');
  });

  it('2.4. View taxdoc.v_dash_ncc_nam: Danh sách Top Nhà Cung Cấp phải xác định chính xác số tiền cần đòi', async () => {
    const rows = await querySupabase('v_dash_ncc_nam?nam=eq.2026&order=gia_tri_kho.desc&limit=20', 'taxdoc');
    assert.ok(rows.length > 0, 'Phải có dữ liệu nhà cung cấp năm 2026');

    // Tìm NCC Xuân Kỷ
    const xuanKy = rows.find(r => (r.ten_ncc || '').toLowerCase().includes('xuân kỷ'));
    assert.ok(xuanKy, 'Phải tìm thấy NCC Xuân Kỷ');
    assert.equal(Number(xuanKy.gia_tri_kho), 535471400, 'Xuân Kỷ có tổng giá trị kho là 535,471,400đ');
    assert.equal(Number(xuanKy.tien_hoa_don), 0, 'Xuân Kỷ chưa có hóa đơn nào');
    assert.equal(Number(xuanKy.thieu_chung_tu), 956171400, 'Xuân Kỷ còn thiếu đúng 956,171,400đ theo view tổng hợp NCC');

    // Tìm NCC Cty TNHH SX TM Chí Cường
    const chiCuong = rows.find(r => (r.ten_ncc || '').toLowerCase().includes('chí cường'));
    assert.ok(chiCuong, 'Phải tìm thấy NCC Chí Cường');
    assert.equal(Number(chiCuong.gia_tri_kho), 239164000, 'Chí Cường có tổng giá trị kho là 239,164,000đ');

    // Tìm NCC Phạm Phương
    const phamPhuong = rows.find(r => (r.ten_ncc || '').toLowerCase().includes('phạm phương'));
    assert.ok(phamPhuong, 'Phải tìm thấy NCC Phạm Phương');
    assert.equal(Number(phamPhuong.gia_tri_kho), 168481000, 'Phạm Phương có tổng giá trị kho là 168,481,000đ');
  });

  it('2.5. Bảng AR Cases & Settlement: Phải chứa các kênh bán Shopee và TikTok Shop sẵn sàng đồng bộ MISA', async () => {
    const rows = await querySupabase('ar_v_dashboard?select=channel,case_id,order_id,value&limit=20', 'public');
    assert.ok(rows.length > 0, 'View ar_v_dashboard phải có dữ liệu');

    const channels = [...new Set(rows.map(r => r.channel))];
    assert.ok(channels.includes('shopee') || channels.includes('tiktok'), 'Phải chứa dữ liệu settlement của sàn Shopee hoặc TikTok Shop');
  });

});
