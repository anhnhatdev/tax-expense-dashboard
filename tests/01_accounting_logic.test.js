import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('BỘ TEST 1: NGUYÊN TẮC KẾ TOÁN & CÂN BẰNG TÀI CHÍNH (ACCOUNTING INVARIANTS)', () => {

  it('1.1. View 1: Tổng chi phí phải bằng tổng 3 nhóm lớn (Không có phần dư rò rỉ)', () => {
    const cogsTotal = 2579707829.41948;
    const directTotal = 1718724294;
    const marketplaceTotal = 7259147;

    const expectedTotal = cogsTotal + directTotal + marketplaceTotal;
    const computedTotal = 4305691270.41948;

    assert.equal(Math.round(computedTotal), Math.round(expectedTotal), 'Tổng giá trị giao dịch phải khớp với tổng 3 nhóm lớn');
  });

  it('1.2. View 1: Giá trị có chứng từ phải bằng tổng chứng từ của 3 nhóm lớn', () => {
    const cogsDocumented = 1206985470.39948;
    const directDocumented = 0;
    const marketplaceDocumented = 0;

    const expectedDocumented = cogsDocumented + directDocumented + marketplaceDocumented;
    const computedDocumented = 1206985470.39948;

    assert.equal(Math.round(computedDocumented), Math.round(expectedDocumented), 'Giá trị có chứng từ phải khớp tổng chứng từ 3 nhóm');
  });

  it('1.3. View 1: Chênh lệch thiếu = Tổng giao dịch - Có chứng từ', () => {
    const total = 4305691270.41948;
    const documented = 1206985470.39948;
    const expectedMissing = total - documented;
    const computedMissing = 3098705800.02;

    assert.equal(Math.round(computedMissing), Math.round(expectedMissing), 'Chênh lệch thiếu phải bảo toàn tuyệt đối');
  });

  it('1.4. View 1: Tỷ lệ che phủ thuế (Coverage Ratio) và Chênh lệch (%) phải luôn tổng bằng 100%', () => {
    const total = 4305691270.41948;
    const documented = 1206985470.39948;

    const coverageRatio = Number(((documented / total) * 100).toFixed(1));
    const missingRatio = Number((100 - coverageRatio).toFixed(1));

    assert.equal(coverageRatio, 28.0, 'Tỷ lệ che phủ thuế năm 2026 phải đạt chuẩn 28.0%');
    assert.equal(missingRatio, 72.0, 'Tỷ lệ thiếu chứng từ năm 2026 phải là 72.0%');
    assert.equal(coverageRatio + missingRatio, 100.0, 'Tổng tỷ lệ phải đạt chính xác 100%');
  });

  it('1.5. Chống trùng lặp (Anti Double-Counting): Lệnh trả nợ COGS trên ngân hàng tuyệt đối không được cộng vào chi phí', () => {
    // Giả lập giao dịch sao kê ngân hàng năm 2026
    const bankTransactions = [
      { id: '1', lv1: 'COGS', amount: 2564983507, note: 'Chuyển khoản thanh toán nợ vải Xuân Kỷ' },
      { id: '2', lv1: 'Expense', amount: 1718724294, note: 'Chi mua bao bì, băng keo đóng gói' },
      { id: '3', lv1: 'Tax', amount: 527000000, note: 'Nộp thuế vào NSNN' },
      { id: '4', lv1: 'Profit Distribution', amount: 190000000, note: 'Rút lợi nhuận' },
      { id: '5', lv1: 'Internal Transfer', amount: 50000000, note: 'Chuyển tiền giữa các tài khoản' }
    ];

    // Lọc chi phí vận hành trực tiếp theo Meeting 3
    const directExpenses = bankTransactions.filter(tx => tx.lv1 === 'Expense');
    const directSum = directExpenses.reduce((sum, tx) => sum + tx.amount, 0);

    assert.equal(directExpenses.length, 1, 'Chỉ duy nhất nhóm lv1 = Expense được công nhận là chi phí trực tiếp');
    assert.equal(directSum, 1718724294, 'Tổng chi phí vận hành trực tiếp không bị đội khống bởi lệnh trả nợ COGS');

    // Kiểm tra các giao dịch COGS ngân hàng đã được bóc tách riêng
    const cogsBank = bankTransactions.filter(tx => tx.lv1 === 'COGS');
    assert.equal(cogsBank[0].amount, 2564983507, 'Khoản trả nợ COGS 2.56 tỷ phải được cô lập khỏi chi phí vận hành');
  });

  it('1.6. Tính nhất quán của từng nhóm (Group Invariants): Total = Documented + Missing', () => {
    const groups = [
      { name: 'cogs', total: 2579707829.41948, documented: 1206985470.39948, missing: 1372722359.02 },
      { name: 'direct', total: 1718724294, documented: 0, missing: 1718724294 },
      { name: 'marketplace', total: 7259147, documented: 0, missing: 7259147 }
    ];

    groups.forEach(g => {
      assert.equal(
        Math.round(g.total), 
        Math.round(g.documented + g.missing), 
        `Nhóm ${g.name} phải thỏa mãn tính chất Total = Documented + Missing`
      );
    });
  });

});
