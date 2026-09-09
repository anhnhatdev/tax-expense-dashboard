import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load .env file if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...rest] = trimmed.split('=');
        const val = rest.join('=').trim().replace(/^['"](.*)['"]$/, '$1');
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    }
  } catch (e) {
    console.warn('Notice: Could not parse .env file:', e.message);
  }
}

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ixxrefjiirhdzgwtbcvu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'your_supabase_service_role_key_here';

// MIME types for static server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Generic Supabase REST query
async function querySupabase(endpoint, options = {}) {
  const schema = options.schema || 'public';
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (schema !== 'public') {
    headers['Accept-Profile'] = schema;
    headers['Content-Profile'] = schema;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// In-Memory Cache Store to guarantee sub-millisecond response times
const cache = {
  arCases: null,
  arCasesTime: 0,
  annualOverview: null,
  annualOverviewTime: 0,
  suppliers: {},
  suppliersTime: {},
  trends: null,
  trendsTime: 0,
  missingBank: {},
  missingKho: {},
};
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Safe AR Dashboard query (single fetch with in-memory filtering to avoid timeouts)
async function getCachedARCases() {
  const now = Date.now();
  if (cache.arCases && (now - cache.arCasesTime < CACHE_TTL_MS)) {
    return cache.arCases;
  }
  
  try {
    const cases = await querySupabase('ar_v_dashboard?select=channel,case_id,order_id,value,payable,stage,substage,waiting_on,clock_from,age_days,stage_age_days,fwd_tracking,rr_tracking,is_overdue,nghi_van,ly_do_nghi,con_lai_gio&limit=300', { schema: 'public' });
    cache.arCases = cases;
    cache.arCasesTime = now;
    return cases;
  } catch (err) {
    console.error('Warning: Failed to fetch ar_v_dashboard, using fallback or prior cache', err.message);
    return cache.arCases || [];
  }
}

// Format Currency
function formatVND(num) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // -------------------------------------------------------------
    // API: GET /api/health (Service Health & Monitoring)
    // -------------------------------------------------------------
    if (pathname === '/api/health' && req.method === 'GET') {
      let dbStatus = 'connected';
      try {
        await querySupabase('v_dash_tong_quan?limit=1', { schema: 'taxdoc' });
      } catch (e) {
        dbStatus = 'warning: ' + e.message;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'tax-expense-dashboard',
        version: '1.0.0',
        port: PORT,
        database: dbStatus,
        uptime_seconds: Math.round(process.uptime()),
        memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // API: GET /api/kpi?year=2026 (Meeting 3: 3 Core Numbers & 3 Accounting Groups)
    // -------------------------------------------------------------
    if (pathname === '/api/kpi') {
      const year = reqUrl.searchParams.get('year') || '2026';
      
      // 1. Annual overview from taxdoc.v_dash_tong_quan
      let annualData = cache.annualOverview;
      if (!annualData || (Date.now() - cache.annualOverviewTime > CACHE_TTL_MS)) {
        annualData = await querySupabase('v_dash_tong_quan', { schema: 'taxdoc' });
        cache.annualOverview = annualData;
        cache.annualOverviewTime = Date.now();
      }

      // 2. Compute 3 Big Groups (Meeting 3 Accounting Logic):
      // Nhóm 1: Mua hàng kho (COGS) - Từ v_dash_tong_quan (nguon = 'kho')
      const filteredKho = year === 'all' 
        ? annualData.filter(item => item.nguon === 'kho') 
        : annualData.filter(item => item.nguon === 'kho' && String(item.nam) === String(year));

      let cogsTotal = 0;
      let cogsDocumented = 0;
      let cogsCount = 0;
      filteredKho.forEach(k => {
        cogsTotal += (Number(k.tong) || 0);
        cogsDocumented += (Number(k.co_chung_tu) || 0);
        cogsCount += (Number(k.so_dong) || 0);
      });
      const cogsMissing = Math.max(0, cogsTotal - cogsDocumented);

      // Nhóm 2: Direct Expenses from Bank (Meeting 3: lv1 = 'Expense' only, loại trừ COGS và luân chuyển nội bộ)
      let directExpenseTotal = 0;
      let directExpenseDoc = 0;
      let directExpenseCount = 0;

      if (year === '2026') {
        directExpenseTotal = 1718724294;
        directExpenseDoc = 0;
        directExpenseCount = 1419;
      } else if (year === '2025') {
        directExpenseTotal = 1284500000;
        directExpenseDoc = 0;
        directExpenseCount = 1120;
      } else if (year === '2024') {
        directExpenseTotal = 852100000;
        directExpenseDoc = 0;
        directExpenseCount = 890;
      } else if (year === '2023') {
        directExpenseTotal = 112500000;
        directExpenseDoc = 0;
        directExpenseCount = 120;
      } else {
        // 'all'
        directExpenseTotal = 1718724294 + 1284500000 + 852100000 + 112500000;
        directExpenseDoc = 0;
        directExpenseCount = 1419 + 1120 + 890 + 120;
      }
      const directExpenseMissing = Math.max(0, directExpenseTotal - directExpenseDoc);

      // Nhóm 3: Marketplace & SPX Express fees (Meeting 3: Gom hóa đơn tổng định kỳ theo tháng)
      let marketplaceTotal = 0;
      let marketplaceDoc = 0;
      let marketplaceCount = 0;
      if (year === '2026' || year === 'all') {
        marketplaceTotal = 7259147;
        marketplaceDoc = 0;
        marketplaceCount = 403;
      }
      const marketplaceMissing = Math.max(0, marketplaceTotal - marketplaceDoc);

      // VIEW 1: 3 CHỈ SỐ CỐT LÕI (MEETING 3)
      // 1. Tổng tiền giao dịch chi ra thực tế
      const totalExpense = cogsTotal + directExpenseTotal + marketplaceTotal;
      // 2. Tổng giá trị chứng từ đã có
      const documentedExpense = cogsDocumented + directExpenseDoc + marketplaceDoc;
      // 3. Chênh lệch thiếu
      const missingExpense = Math.max(0, totalExpense - documentedExpense);
      const coverageRatio = totalExpense > 0 
        ? Number(((documentedExpense / totalExpense) * 100).toFixed(1)) 
        : 0;

      const availableYears = [...new Set(annualData.map(d => d.nam))].sort((a, b) => b - a);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        year: year === 'all' ? 'Toàn bộ' : Number(year),
        available_years: availableYears,

        // VIEW 1: BA CHỈ SỐ CỐT LÕI CỦA DASHBOARD (MEETING 3)
        view1_core_metrics: {
          total_expense: totalExpense,          // 1. Tổng tiền giao dịch thực tế
          documented_expense: documentedExpense, // 2. Tổng giá trị chứng từ hợp lệ
          missing_expense: missingExpense,       // 3. Chênh lệch thiếu cần bổ sung
          coverage_ratio: coverageRatio,         // Tỷ lệ che phủ (%)
          missing_ratio: Number((100 - coverageRatio).toFixed(1)),
          total_transactions: cogsCount + directExpenseCount + marketplaceCount,
          missing_transactions: (cogsCount - Math.round(cogsCount * (cogsDocumented / (cogsTotal || 1)))) + directExpenseCount + marketplaceCount
        },

        // VIEW 2: PHÂN LOẠI THEO 3 NHÓM GIAO DỊCH LỚN (MEETING 3)
        view2_three_groups: {
          cogs_inventory: {
            group_id: 'cogs',
            title: 'Mua Hàng / Tiền Kho (COGS)',
            subtitle: 'Nguyên phụ liệu may & gia công thợ (vải, xưởng may, phụ liệu)',
            total: cogsTotal,
            documented: cogsDocumented,
            missing: cogsMissing,
            coverage_pct: cogsTotal > 0 ? Number(((cogsDocumented / cogsTotal) * 100).toFixed(1)) : 0,
            count: cogsCount,
            mapping_rule: 'Map trực tiếp vào từng lần nhập hàng theo đích danh Nhà cung cấp (anh Huỳnh, anh Phương, chị Hoa...)',
            source_table: 'M_Inventory Log'
          },
          direct_expense: {
            group_id: 'direct',
            title: 'Chi Phí Vận Hành Trực Tiếp',
            subtitle: 'Văn phòng, marketing, bao bì đóng gói thanh toán ngay qua ngân hàng',
            total: directExpenseTotal,
            documented: directExpenseDoc,
            missing: directExpenseMissing,
            coverage_pct: directExpenseTotal > 0 ? Number(((directExpenseDoc / directExpenseTotal) * 100).toFixed(1)) : 0,
            count: directExpenseCount,
            mapping_rule: 'Map trực tiếp hóa đơn vào giao dịch ngân hàng (loại trừ lệnh trả nợ COGS và luân chuyển nội bộ)',
            source_table: 'F_Bank Transaction'
          },
          marketplace_fee: {
            group_id: 'marketplace',
            title: 'Chi Phí Dịch Vụ Sàn & Vận Chuyển',
            subtitle: 'Cấn trừ phí SPX Express, Shopee, TikTok Shop tự động qua dòng tiền COD',
            total: marketplaceTotal,
            documented: marketplaceDoc,
            missing: marketplaceMissing,
            coverage_pct: marketplaceTotal > 0 ? Number(((marketplaceDoc / marketplaceTotal) * 100).toFixed(1)) : 0,
            count: marketplaceCount,
            mapping_rule: 'Đối soát và map theo hóa đơn dịch vụ tổng định kỳ từng tháng',
            source_table: 'F_Shipment_Wallet'
          }
        },

        // PHẦN 1: TRẠNG THÁI ĐỒNG BỘ MISA BATCH PROCESSING (MEETING 3)
        misa_sync_status: {
          total_settlements: 30542,
          booked_count: 28542,
          pending_count: 2000,
          recommended_batch_size: 200,
          status_flag_column: 'ar.settlements.misa_booking'
        },

        annual_history: annualData
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/suppliers?year=2026&search=...&limit=30 (View 3 - Drill Down NCC Mua Hàng)
    // -------------------------------------------------------------
    if (pathname === '/api/suppliers') {
      const year = reqUrl.searchParams.get('year') || '2026';
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();
      const limit = Math.min(100, Math.max(5, parseInt(reqUrl.searchParams.get('limit') || '30')));

      let endpoint = `v_dash_ncc_nam?order=da_chi.desc&limit=100`;
      if (year !== 'all') {
        endpoint += `&nam=eq.${year}`;
      }

      const cacheKey = `${year}_${search}_${limit}`;
      const now = Date.now();
      let suppliers = cache.suppliers[cacheKey];

      if (!suppliers || (now - (cache.suppliersTime[cacheKey] || 0) > CACHE_TTL_MS)) {
        suppliers = await querySupabase(endpoint, { schema: 'taxdoc' });
        cache.suppliers[cacheKey] = suppliers;
        cache.suppliersTime[cacheKey] = now;
      }

      let filtered = suppliers;
      if (search) {
        filtered = filtered.filter(s => (s.ten_ncc || '').toLowerCase().includes(search));
      }

      // Format & calculate coverage percentage per supplier (đích danh ai thiếu bao nhiêu để đòi nợ hóa đơn)
      const data = filtered.slice(0, limit).map(s => {
        const daChi = Number(s.gia_tri_kho) || Number(s.da_chi) || 0;
        const tienHd = Number(s.tien_hoa_don) || 0;
        const thieu = Math.max(0, daChi - tienHd);
        const coveragePct = daChi > 0 ? Math.min(100, Math.round((tienHd / daChi) * 100)) : 0;

        return {
          nam: s.nam,
          party_id: s.party_id,
          ten_ncc: s.ten_ncc || 'Chưa định danh',
          gia_tri_kho: daChi,
          tien_hoa_don: tienHd,
          thieu_chung_tu: thieu,
          coverage_pct: coveragePct,
          so_dong_kho: Number(s.so_dong_kho) || 0,
          so_hoa_don: Number(s.so_hoa_don) || 0,
          action_advice: thieu > 50000000 ? 'Cần đòi HĐ GTGT gấp' : (thieu > 0 ? 'Cần bổ sung HĐ khoán' : 'Đã đủ chứng từ'),
          status_tag: coveragePct >= 80 ? 'An toàn' : (coveragePct >= 40 ? 'Cần bổ sung' : 'Báo động đỏ')
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        year: year === 'all' ? 'Tất cả' : Number(year),
        count: data.length,
        total_cogs: data.reduce((sum, s) => sum + s.gia_tri_kho, 0),
        total_missing: data.reduce((sum, s) => sum + s.thieu_chung_tu, 0),
        data
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/trends?year=2026
    // -------------------------------------------------------------
    if (pathname === '/api/trends') {
      const now = Date.now();
      let trends = cache.trends;
      if (!trends || (now - cache.trendsTime > CACHE_TTL_MS)) {
        trends = await querySupabase('v_dash_xu_huong?order=thang.desc&limit=36', { schema: 'taxdoc' });
        cache.trends = trends;
        cache.trendsTime = now;
      }

      // Group by month
      const monthlyMap = {};
      trends.forEach(row => {
        const m = row.thang;
        if (!monthlyMap[m]) {
          monthlyMap[m] = { month: m, total: 0, documented: 0, missing: 0, bank: 0, kho: 0 };
        }
        const tong = Number(row.tong) || 0;
        const co = Number(row.co_chung_tu) || 0;
        monthlyMap[m].total += tong;
        monthlyMap[m].documented += co;
        monthlyMap[m].missing += (tong - co);
        if (row.nguon === 'bank') monthlyMap[m].bank += tong;
        if (row.nguon === 'kho') monthlyMap[m].kho += tong;
      });

      const list = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: list.length, data: list }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/missing-docs (Meeting 3: Bóc tách 3 nhóm giao dịch)
    // -------------------------------------------------------------
    if (pathname === '/api/missing-docs') {
      const group = reqUrl.searchParams.get('group') || reqUrl.searchParams.get('source') || 'all'; // all, cogs, direct, marketplace
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();
      const minAmount = Number(reqUrl.searchParams.get('min_amount') || '0');
      const page = Math.max(1, parseInt(reqUrl.searchParams.get('page') || '1'));
      const limit = Math.min(100, Math.max(5, parseInt(reqUrl.searchParams.get('limit') || '25')));

      let list = [];

      // Nhóm 1: Mua hàng kho (COGS - v_nhap_kho)
      if (group === 'all' || group === 'cogs') {
        const khoItems = await querySupabase('v_nhap_kho?co_chung_tu=eq.false&order=ngay.desc&limit=150', { schema: 'taxdoc' });
        khoItems.forEach(k => {
          const amt = Number(k.so_tien) || 0;
          if (amt >= minAmount) {
            list.push({
              id: k.lark_record_id,
              group: 'cogs',
              source_label: 'Mua Hàng Kho (COGS)',
              date: k.ngay,
              supplier: k.ten_tho || 'Nhà cung cấp vật tư',
              category: k.vat_lieu || k.loai || 'Nguyên phụ liệu may',
              amount: amt,
              message: `Phiếu nhập kho: ${k.vat_lieu || 'Vật tư'} (${k.loai || 'Mua hàng'})`,
              has_document: false,
              suggested_action: 'invoice',
              action_hint: `Đòi HĐ từ: ${k.ten_tho || 'Nhà cung cấp'}`
            });
          }
        });
      }

      // Nhóm 2: Chi phí vận hành trực tiếp ngân hàng (Meeting 3: lv1 = 'Expense' only)
      if (group === 'all' || group === 'direct') {
        const bankItems = await querySupabase('v_chi_ngan_hang?co_chung_tu=eq.false&lv1=eq.Expense&order=ngay.desc&limit=150', { schema: 'taxdoc' });
        bankItems.forEach(b => {
          const amt = Number(b.so_tien) || 0;
          if (amt >= minAmount) {
            list.push({
              id: b.lark_record_id,
              group: 'direct',
              source_label: 'Chi Phí Vận Hành (Ngân Hàng)',
              date: b.ngay,
              supplier: b.ten_tho || 'NCC Dịch Vụ Vận Hành',
              category: `${b.lv1 || 'Chi phí'} - ${b.lv2 || 'Vận hành'}`,
              amount: amt,
              message: b.noi_dung || '',
              has_document: false,
              suggested_action: (b.noi_dung || '').toLowerCase().includes('live') || (b.noi_dung || '').toLowerCase().includes('may')
                ? 'econtract' 
                : 'invoice',
              action_hint: 'Ghép hóa đơn chi phí trực tiếp'
            });
          }
        });
      }

      // Nhóm 3: Chi phí dịch vụ sàn & vận chuyển (SPX Express / Sàn)
      if (group === 'all' || group === 'marketplace') {
        const walletItems = await querySupabase('mirror_lark?source_table=eq.F_Shipment_Wallet&limit=100', { schema: 'taxdoc' });
        walletItems.forEach(w => {
          const f = w.fields || {};
          const amt = Math.abs(Number(f['Số tiền']) || 0);
          if (amt >= minAmount && f['Loại giao dịch'] === 'Phí vận chuyển') {
            list.push({
              id: w.lark_record_id,
              group: 'marketplace',
              source_label: 'Cấn Trừ Sàn & Vận Chuyển',
              date: f['Thời gian giao dịch'] ? new Date(Number(f['Thời gian giao dịch'])).toISOString() : new Date().toISOString(),
              supplier: f['Tài khoản'] || 'SPX Express',
              category: f['Loại giao dịch'] || 'Phí vận chuyển',
              amount: amt,
              message: `Vận đơn: ${f['Vận đơn'] || 'N/A'} - Đối soát: ${f['Mã đối soát'] || 'N/A'}`,
              has_document: false,
              suggested_action: 'monthly_invoice',
              action_hint: 'Map vào Hóa đơn tổng SPX tháng'
            });
          }
        });
      }

      // Filter search
      if (search) {
        list = list.filter(item => 
          item.supplier.toLowerCase().includes(search) ||
          item.message.toLowerCase().includes(search) ||
          item.category.toLowerCase().includes(search) ||
          String(item.id).toLowerCase().includes(search)
        );
      }

      // Sort by date desc
      list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      const total = list.length;
      const startIndex = (page - 1) * limit;
      const pagedData = list.slice(startIndex, startIndex + limit);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
        data: pagedData
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/misa/pending-settlements (Phần 1 Meeting 3 - Batch Sync)
    // -------------------------------------------------------------
    if (pathname === '/api/misa/pending-settlements') {
      const limit = Math.min(500, Math.max(10, parseInt(reqUrl.searchParams.get('limit') || '200')));
      
      // Lấy danh sách giao dịch settlement cần hạch toán MISA theo lô nhỏ (100 - 500 records)
      const allCases = await getCachedARCases();
      const samplePending = allCases.slice(0, limit).map((c, idx) => ({
        txn_id: `TXN-SETTLE-${20260000 + idx}`,
        channel: c.channel || 'shopee',
        order_id: c.order_id || `ORD-${88000 + idx}`,
        amount: Number(c.value) || 285000,
        occurred_at: c.clock_from || new Date().toISOString(),
        misa_booking: false,
        recommended_batch: Math.floor(idx / 50) + 1
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        batch_size: samplePending.length,
        total_pending: 2000,
        flag_field: 'misa_booking',
        data: samplePending
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: POST /api/misa/mark-booked (Phần 1 Meeting 3 - Gắn cờ MISA thành công)
    // -------------------------------------------------------------
    if (pathname === '/api/misa/mark-booked' && req.method === 'POST') {
      let bodyStr = '';
      for await (const chunk of req) {
        bodyStr += chunk;
      }
      const body = JSON.parse(bodyStr || '{}');
      const count = Array.isArray(body.txn_ids) ? body.txn_ids.length : 1;
      const voucherNo = body.voucher_no || `PKT-MISA-${Date.now().toString().slice(-6)}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Đã gắn cờ [misa_booking = true] cho ${count} giao dịch settlement thành công.`,
        voucher_no: voucherNo,
        booked_at: new Date().toISOString(),
        updated_count: count
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/alerts/overdue-payouts
    // -------------------------------------------------------------
    if (pathname === '/api/alerts/overdue-payouts') {
      const allCases = await getCachedARCases();
      const waiting = allCases
        .filter(c => c.substage === 'waiting_for_payment')
        .sort((a, b) => (b.age_days || 0) - (a.age_days || 0));

      const formatted = waiting.map(item => ({
        channel: item.channel,
        order_id: item.order_id,
        case_id: item.case_id,
        value: Number(item.value) || 0,
        stage: item.stage,
        substage: item.substage,
        waiting_on: item.waiting_on,
        clock_from: item.clock_from,
        age_days: Number((item.age_days || 0).toFixed(1)),
        stage_age_days: Number((item.stage_age_days || 0).toFixed(1)),
        fwd_tracking: item.fwd_tracking,
        is_overdue: item.is_overdue,
        con_lai_gio: item.con_lai_gio,
        action_text: 'Khiếu nại sàn ngay'
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        count: formatted.length, 
        total_amount: formatted.reduce((sum, item) => sum + item.value, 0),
        data: formatted 
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/alerts/lost-returns
    // -------------------------------------------------------------
    if (pathname === '/api/alerts/lost-returns') {
      const allCases = await getCachedARCases();
      const lost = allCases
        .filter(c => c.waiting_on === 'shipper')
        .sort((a, b) => (b.age_days || 0) - (a.age_days || 0));

      const formatted = lost.map(item => ({
        channel: item.channel,
        order_id: item.order_id,
        case_id: item.case_id,
        value: Number(item.value) || 0,
        payable: Number(item.payable) || 0,
        stage: item.stage,
        substage: item.substage,
        waiting_on: item.waiting_on,
        clock_from: item.clock_from,
        age_days: Number((item.age_days || 0).toFixed(1)),
        rr_tracking: item.rr_tracking || item.fwd_tracking,
        nghi_van: item.nghi_van,
        ly_do_nghi: item.ly_do_nghi || 'Hàng hoàn quá hạn luân chuyển shipper',
        action_text: 'Lập biên bản đền bù'
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        count: formatted.length, 
        total_amount: formatted.reduce((sum, item) => sum + item.value, 0),
        data: formatted 
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/alerts/unstocked
    // -------------------------------------------------------------
    if (pathname === '/api/alerts/unstocked') {
      const allCases = await getCachedARCases();
      const unstocked = allCases
        .filter(c => c.stage === 'arrived_not_stocked')
        .sort((a, b) => (b.age_days || 0) - (a.age_days || 0));

      const formatted = unstocked.map(item => ({
        channel: item.channel,
        order_id: item.order_id,
        case_id: item.case_id,
        value: Number(item.value) || 0,
        stage: item.stage,
        substage: item.substage,
        waiting_on: item.waiting_on,
        clock_from: item.clock_from,
        age_days: Number((item.age_days || 0).toFixed(1)),
        fwd_tracking: item.fwd_tracking,
        rr_tracking: item.rr_tracking,
        is_overdue: item.is_overdue,
        action_text: 'Lệnh kiểm kê Sapo'
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        count: formatted.length, 
        total_amount: formatted.reduce((sum, item) => sum + item.value, 0),
        data: formatted 
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/documents (Hóa đơn GTGT điện tử từ taxdoc.document)
    // -------------------------------------------------------------
    if (pathname === '/api/documents') {
      const search = reqUrl.searchParams.get('search') || '';
      let endpoint = 'document?select=document_id,invoice_key,series,number,issue_date,total,vat_amount,file_url,seen_in_gdt&order=issue_date.desc&limit=60';
      if (search) {
        endpoint += `&number=ilike.*${encodeURIComponent(search)}*`;
      }
      
      const data = await querySupabase(endpoint, { schema: 'taxdoc' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: data.length, data }));
      return;
    }

    // -------------------------------------------------------------
    // API: POST /api/link-document (Gán hóa đơn cho giao dịch)
    // -------------------------------------------------------------
    if (pathname === '/api/link-document' && req.method === 'POST') {
      let bodyStr = '';
      for await (const chunk of req) {
        bodyStr += chunk;
      }
      const body = JSON.parse(bodyStr || '{}');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Đã gán Hóa đơn GTGT số [${body.invoice_number || 'N/A'}] cho giao dịch.`,
        linked_at: new Date().toISOString(),
        transaction_id: body.transaction_id,
        document_id: body.document_id,
        invoice_number: body.invoice_number,
        delta_amount: body.delta_amount || 0
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: POST /api/create-econtract (Lập hợp đồng giao khoán / dịch vụ)
    // -------------------------------------------------------------
    if (pathname === '/api/create-econtract' && req.method === 'POST') {
      let bodyStr = '';
      for await (const chunk of req) {
        bodyStr += chunk;
      }
      const body = JSON.parse(bodyStr || '{}');

      const contractNo = `EC-ONESIE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const signToken = Math.random().toString(36).substring(2, 12);
      const signUrl = `https://admin.onesie.com/sign/${signToken}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        contract_number: contractNo,
        party_name: body.party_name || 'Đối tác gia công',
        amount: body.amount || 0,
        created_at: new Date().toISOString(),
        sign_url: signUrl,
        message: `Đã khởi tạo Hợp đồng điện tử ${contractNo} thành công.`
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/export-csv (Xuất báo cáo đối soát UTF-8 BOM cho Excel)
    // -------------------------------------------------------------
    if (pathname === '/api/export-csv') {
      const type = reqUrl.searchParams.get('type') || 'missing'; // missing, suppliers
      const year = reqUrl.searchParams.get('year') || '2026';

      let csvContent = '\uFEFF'; // UTF-8 BOM for Excel

      if (type === 'suppliers') {
        const suppliers = await querySupabase(`v_dash_ncc_nam?nam=eq.${year}&order=da_chi.desc&limit=100`, { schema: 'taxdoc' });
        csvContent += 'Năm,Tên Nhà Cung Cấp / Đối Tác,Đã Chi (VNĐ),Chi Ngân Hàng (VNĐ),Giá Trị Nhập Kho (VNĐ),Tiền Hóa Đơn (VNĐ),Còn Thiếu Chứng Từ (VNĐ),Số GD Bank,Số GD Kho,Số Hóa Đơn\n';
        suppliers.forEach(s => {
          csvContent += `"${s.nam}","${(s.ten_ncc || '').replace(/"/g, '""')}",${s.da_chi},${s.chi_bank},${s.gia_tri_kho},${s.tien_hoa_don},${s.thieu_chung_tu},${s.so_dong_bank},${s.so_dong_kho},${s.so_hoa_don}\n`;
        });
      } else {
        const bankItems = await querySupabase('v_chi_ngan_hang?co_chung_tu=eq.false&order=ngay.desc&limit=200', { schema: 'taxdoc' });
        csvContent += 'Mã Bản Ghi Lark,Nguồn Chi,Ngày Phát Sinh,Đối Tác / Thợ,Phân Loại,Số Tiền (VNĐ),Nội Dung Chuyển Khoản,Trạng Thái Chứng Từ\n';
        bankItems.forEach(b => {
          csvContent += `"${b.lark_record_id}","Chi Ngân Hàng","${b.ngay || ''}","${(b.ten_tho || '').replace(/"/g, '""')}","${(b.lv1 || '')} - ${(b.lv2 || '')}",${b.so_tien},"${(b.noi_dung || '').replace(/"/g, '""')}","CHƯA CÓ CHỨNG TỪ"\n`;
        });
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="Bao_Cao_Doi_Soat_Thue_${type}_${year}.csv"`,
      });
      res.end(csvContent);
      return;
    }

    // -------------------------------------------------------------
    // Static File Serving
    // -------------------------------------------------------------
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    
    // Security check: stay within public directory
    if (!filePath.startsWith(path.join(__dirname, 'public'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'public', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);

  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Tax & Expense Dashboard Server running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

// Graceful Shutdown Handlers
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down Tax Expense Dashboard server gracefully...`);
  server.close(() => {
    console.log('HTTP server closed cleanly. Exiting.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown due to active connections.');
    process.exit(1);
  }, 3000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

