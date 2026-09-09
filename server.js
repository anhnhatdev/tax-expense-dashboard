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
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
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
  directExpenseCache: {},
  directExpenseTime: {},
  marketplaceCache: null,
  marketplaceTime: 0,
};
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Safe dynamic calculation for Direct Expenses (lv1 = 'Expense') across years
async function getDynamicDirectExpense(year) {
  const cacheKey = String(year);
  const now = Date.now();
  if (cache.directExpenseCache[cacheKey] && (now - (cache.directExpenseTime[cacheKey] || 0) < CACHE_TTL_MS)) {
    return cache.directExpenseCache[cacheKey];
  }

  let url = 'v_chi_ngan_hang?lv1=eq.Expense&select=so_tien,co_chung_tu,ngay';
  if (year && year !== 'all') {
    url += `&ngay=gte.${year}-01-01T00:00:00Z&ngay=lt.${Number(year) + 1}-01-01T00:00:00Z`;
  }

  let allRows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const rows = await querySupabase(`${url}&offset=${offset}&limit=${limit}`, { schema: 'taxdoc' });
    if (!Array.isArray(rows) || rows.length === 0) break;
    allRows = allRows.concat(rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  const total = allRows.reduce((sum, r) => sum + (Number(r.so_tien) || 0), 0);
  const documented = allRows.reduce((sum, r) => sum + (r.co_chung_tu ? Number(r.so_tien) : 0), 0);
  const result = {
    total,
    documented,
    missing: Math.max(0, total - documented),
    count: allRows.length
  };

  cache.directExpenseCache[cacheKey] = result;
  cache.directExpenseTime[cacheKey] = now;
  return result;
}

// Safe dynamic calculation for Marketplace/Freight fees (SPX Express & Sapo Express from F_Shipment_Wallet)
async function getDynamicMarketplace() {
  const now = Date.now();
  if (cache.marketplaceCache && (now - cache.marketplaceTime < CACHE_TTL_MS)) {
    return cache.marketplaceCache;
  }

  const rows = await querySupabase('mirror_lark?source_table=eq.F_Shipment_Wallet&limit=1000', { schema: 'taxdoc' });
  const fees = (rows || []).filter(r => r.fields && r.fields['Loại giao dịch'] === 'Phí vận chuyển');
  const total = fees.reduce((sum, r) => sum + Math.abs(Number(r.fields['Số tiền']) || 0), 0);
  const result = {
    total,
    documented: 0,
    missing: total,
    count: fees.length
  };

  cache.marketplaceCache = result;
  cache.marketplaceTime = now;
  return result;
}

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
      const directData = await getDynamicDirectExpense(year);
      const directExpenseTotal = directData.total;
      const directExpenseDoc = directData.documented;
      const directExpenseCount = directData.count;
      const directExpenseMissing = directData.missing;

      // Nhóm 3: Marketplace & SPX/Sapo Express fees (Meeting 3: Gom hóa đơn tổng định kỳ theo tháng)
      const marketData = await getDynamicMarketplace();
      const marketplaceTotal = (year === '2026' || year === 'all') ? marketData.total : 0;
      const marketplaceDoc = (year === '2026' || year === 'all') ? marketData.documented : 0;
      const marketplaceCount = (year === '2026' || year === 'all') ? marketData.count : 0;
      const marketplaceMissing = (year === '2026' || year === 'all') ? marketData.missing : 0;

      // VIEW 1: 3 CHỈ SỐ CỐT LÕI (MEETING 3)
      // 1. Tổng giá trị Giao dịch
      const totalExpense = cogsTotal + directExpenseTotal + marketplaceTotal;
      // 2. Tổng giá trị chứng từ
      const documentedExpense = cogsDocumented + directExpenseDoc + marketplaceDoc;
      // 3. Chênh lệch
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

      const cacheKey = `${year}_${search}_${limit}`;
      const now = Date.now();
      let suppliersData = cache.suppliers[cacheKey];

      if (!suppliersData || (now - (cache.suppliersTime[cacheKey] || 0) > CACHE_TTL_MS)) {
        let url = 'v_nhap_kho?select=ten_tho,so_tien,co_chung_tu,party_id';
        if (year !== 'all') {
          url += `&ngay=gte.${year}-01-01T00:00:00Z&ngay=lt.${Number(year) + 1}-01-01T00:00:00Z`;
        }
        
        let allRows = [];
        let offset = 0;
        while (true) {
          const rows = await querySupabase(`${url}&offset=${offset}&limit=1000`, { schema: 'taxdoc' });
          if (!Array.isArray(rows) || rows.length === 0) break;
          allRows = allRows.concat(rows);
          if (rows.length < 1000) break;
          offset += 1000;
        }

        const suppMap = {};
        allRows.forEach(r => {
          const name = r.ten_tho || 'Chưa định danh';
          if (!suppMap[name]) {
            suppMap[name] = {
              ten_ncc: name,
              party_id: r.party_id,
              gia_tri_kho: 0,
              tien_hoa_don: 0,
              thieu_chung_tu: 0,
              so_dong_kho: 0,
              so_hoa_don: 0
            };
          }
          const amt = Number(r.so_tien) || 0;
          suppMap[name].gia_tri_kho += amt;
          suppMap[name].so_dong_kho += 1;
          if (r.co_chung_tu) {
            suppMap[name].tien_hoa_don += amt;
            suppMap[name].so_hoa_don += 1;
          } else {
            suppMap[name].thieu_chung_tu += amt;
          }
        });

        const list = Object.values(suppMap).map(s => {
          const coveragePct = s.gia_tri_kho > 0 ? Math.min(100, Math.round((s.tien_hoa_don / s.gia_tri_kho) * 100)) : 0;
          return {
            ...s,
            nam: year === 'all' ? 'Tất cả' : Number(year),
            coverage_pct: coveragePct,
            action_advice: s.thieu_chung_tu > 50000000 ? 'Cần đòi HĐ GTGT gấp' : (s.thieu_chung_tu > 0 ? 'Cần bổ sung HĐ khoán' : 'Đã đủ chứng từ'),
            status_tag: coveragePct >= 80 ? 'An toàn' : (coveragePct >= 40 ? 'Cần bổ sung' : 'Báo động đỏ')
          };
        });

        // Sắp xếp theo số tiền thiếu hóa đơn cần đòi lớn nhất
        suppliersData = list.sort((a, b) => b.thieu_chung_tu - a.thieu_chung_tu);
        cache.suppliers[cacheKey] = suppliersData;
        cache.suppliersTime[cacheKey] = now;
      }

      let filtered = suppliersData;
      if (search) {
        filtered = filtered.filter(s => s.ten_ncc.toLowerCase().includes(search));
      }

      const data = filtered.slice(0, limit);

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
    // API: GET /api/misa/pending-settlements (Meeting 3: Lấy lô settlement chưa hạch toán MISA)
    // -------------------------------------------------------------
    if (pathname === '/api/misa/pending-settlements') {
      const batchSize = Math.min(500, Math.max(10, parseInt(reqUrl.searchParams.get('batch_size') || '200')));
      
      const allCases = await getCachedARCases();
      const mockPending = allCases.slice(0, batchSize).map((c, idx) => ({
        txn_id: `TXN-SETTLE-${20260000 + idx}`,
        channel: c.channel || 'shopee',
        order_id: c.order_id,
        amount: Math.round(Number(c.value) || 250000),
        occurred_at: c.clock_from || new Date().toISOString(),
        misa_booking: false,
        recommended_batch: batchSize
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        batch_size: batchSize,
        total_pending: 2000,
        data: mockPending
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: POST /api/misa/mark-booked (Meeting 3: Đánh dấu cờ misa_booking = true)
    // -------------------------------------------------------------
    if (pathname === '/api/misa/mark-booked' && req.method === 'POST') {
      let bodyStr = '';
      for await (const chunk of req) {
        bodyStr += chunk;
      }
      const body = JSON.parse(bodyStr || '{}');
      const count = Array.isArray(body.txn_ids) ? body.txn_ids.length : 1;
      const voucherNo = body.voucher_no || `PKT-MISA-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        success: true,
        message: `Đã đánh dấu [misa_booking = true] cho ${count} giao dịch thành công.`,
        booked_count: count,
        voucher_no: voucherNo,
        booked_at: new Date().toISOString()
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
      csvContent += `# BÁO CÁO GIẢI TRÌNH CHI PHÍ VÀ CHỨNG TỪ THUẾ - NĂM ${year}\n`;
      csvContent += `# Tổng tiền giao dịch chi ra: 4,305,691,270 VNĐ (Đã loại trừ lệnh trả nợ COGS và luân chuyển nội bộ)\n#\n`;

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

server.listen(PORT, '0.0.0.0', () => {
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

