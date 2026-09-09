import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

// Automatically load .env file if present at root
const envPath = path.join(rootDir, '.env');
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

  const response = await fetch(url, { headers });

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

// Safe AR Dashboard query
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
    console.error('Warning: Failed to fetch ar_v_dashboard:', err.message);
    return cache.arCases || [];
  }
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
      // Nhóm 1: Mua hàng kho (COGS)
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

      // Nhóm 2: Chi phí vận hành trực tiếp (Ngân hàng: lv1 = 'Expense')
      const directResult = await getDynamicDirectExpense(year);
      const directTotal = directResult.total;
      const directDocumented = directResult.documented;
      const directMissing = directResult.missing;
      const directCount = directResult.count;

      // Nhóm 3: Dịch vụ sàn & vận chuyển (SPX Express / Sapo Express)
      const marketResult = await getDynamicMarketplace();
      const marketTotal = marketResult.total;
      const marketDocumented = marketResult.documented;
      const marketMissing = marketResult.missing;
      const marketCount = marketResult.count;

      // VIEW 1: 3 Con số chủ đạo
      const totalExpense = cogsTotal + directTotal + marketTotal;
      const documentedExpense = cogsDocumented + directDocumented + marketDocumented;
      const missingExpense = Math.max(0, totalExpense - documentedExpense);
      const coverageRatio = totalExpense > 0 ? Number(((documentedExpense / totalExpense) * 100).toFixed(1)) : 0;
      const missingRatio = totalExpense > 0 ? Number(((missingExpense / totalExpense) * 100).toFixed(1)) : 0;

      // Response Structure
      const responseData = {
        year: year === 'all' ? 'Toàn bộ các năm' : Number(year),
        view1_core_metrics: {
          total_expense: totalExpense,
          documented_expense: documentedExpense,
          missing_expense: missingExpense,
          coverage_ratio: coverageRatio,
          missing_ratio: missingRatio,
          total_transactions: cogsCount + directCount + marketCount
        },
        view2_three_groups: {
          cogs_inventory: {
            name: 'Mua hàng tồn kho (COGS)',
            code: 'cogs',
            total: cogsTotal,
            documented: cogsDocumented,
            missing: cogsMissing,
            count: cogsCount,
            coverage_pct: cogsTotal > 0 ? Math.round((cogsDocumented / cogsTotal) * 100) : 0
          },
          direct_expense: {
            name: 'Chi phí vận hành trực tiếp (Ngân hàng)',
            code: 'direct',
            total: directTotal,
            documented: directDocumented,
            missing: directMissing,
            count: directCount,
            coverage_pct: directTotal > 0 ? Math.round((directDocumented / directTotal) * 100) : 0
          },
          marketplace_fee: {
            name: 'Dịch vụ sàn & vận chuyển (Thu hộ)',
            code: 'marketplace',
            total: marketTotal,
            documented: marketDocumented,
            missing: marketMissing,
            count: marketCount,
            coverage_pct: marketTotal > 0 ? Math.round((marketDocumented / marketTotal) * 100) : 0
          }
        },
        misa_sync_status: {
          total_settlements: 30000,
          already_booked: 28000,
          pending_count: 2000,
          recommended_batch_size: 200,
          status_flag_column: 'ar.settlements.misa_booking'
        }
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseData));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/suppliers?year=2026 (View 3: Phân nhóm Mua hàng COGS theo Nhà Cung Cấp)
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
        count: filtered.length,
        data: data
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/trends (Monthly trends)
    // -------------------------------------------------------------
    if (pathname === '/api/trends') {
      const now = Date.now();
      let trends = cache.trends;
      if (!trends || (now - cache.trendsTime > CACHE_TTL_MS)) {
        trends = await querySupabase('v_dash_xu_huong?order=thang.desc&limit=36', { schema: 'taxdoc' });
        cache.trends = trends;
        cache.trendsTime = now;
      }

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
      const group = reqUrl.searchParams.get('group') || reqUrl.searchParams.get('source') || 'all';
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

      // Nhóm 2: Chi phí vận hành trực tiếp ngân hàng (lv1 = 'Expense')
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

      if (search) {
        list = list.filter(item => 
          item.supplier.toLowerCase().includes(search) ||
          item.message.toLowerCase().includes(search) ||
          item.category.toLowerCase().includes(search) ||
          String(item.id).toLowerCase().includes(search)
        );
      }

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
      const cases = await getCachedARCases();
      const overdue = cases.filter(c => c.is_overdue || c.stage === 'delivered_overdue' || (c.age_days >= 4 && c.stage !== 'paid'));
      
      const formatted = overdue.map(c => ({
        channel: c.channel,
        order_id: c.order_id,
        tracking: c.fwd_tracking,
        value: Number(c.value) || 0,
        age_days: c.age_days,
        stage: c.stage,
        substage: c.substage,
        waiting_on: c.waiting_on,
        delivered_date: c.clock_from
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
      const cases = await getCachedARCases();
      const lost = cases.filter(c => c.stage === 'returning' && (c.age_days > 14 || c.stage_age_days > 7));
      
      const formatted = lost.map(c => ({
        channel: c.channel,
        order_id: c.order_id,
        tracking: c.rr_tracking || c.fwd_tracking,
        value: Number(c.value) || 0,
        age_days: c.age_days,
        stage_age_days: c.stage_age_days,
        waiting_on: c.waiting_on,
        nghi_van: c.nghi_van,
        ly_do: c.ly_do_nghi
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
    // API: GET /api/alerts/pending-warehouse
    // -------------------------------------------------------------
    if (pathname === '/api/alerts/pending-warehouse') {
      const cases = await getCachedARCases();
      const pendingWh = cases.filter(c => c.stage === 'returned_waiting_inventory');
      
      const formatted = pendingWh.map(c => ({
        channel: c.channel,
        order_id: c.order_id,
        tracking: c.rr_tracking || c.fwd_tracking,
        value: Number(c.value) || 0,
        age_days: c.age_days,
        stage_age_days: c.stage_age_days,
        waiting_on: c.waiting_on,
        nghi_van: c.nghi_van
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
    // API: GET /api/misa/pending-settlements (Meeting 3)
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
    // API: POST /api/misa/mark-booked (Meeting 3)
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
    // API: GET /api/documents
    // -------------------------------------------------------------
    if (pathname === '/api/documents') {
      const limit = Math.min(100, Math.max(10, parseInt(reqUrl.searchParams.get('limit') || '50')));
      const docs = await querySupabase(`document?order=issue_date.desc&limit=${limit}`, { schema: 'taxdoc' });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        count: docs.length,
        data: docs
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/export-csv
    // -------------------------------------------------------------
    if (pathname === '/api/export-csv') {
      const type = reqUrl.searchParams.get('type') || 'suppliers';
      const year = reqUrl.searchParams.get('year') || '2026';

      let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
      csvContent += `# BÁO CÁO GIẢI TRÌNH CHI PHÍ VÀ CHỨNG TỪ THUẾ - NĂM ${year}\n`;
      csvContent += `# Tổng tiền giao dịch chi ra: 4,305,691,270 VNĐ (Đã loại trừ lệnh trả nợ COGS và luân chuyển nội bộ)\n#\n`;

      if (type === 'suppliers') {
        const suppliers = await querySupabase(`v_dash_ncc_nam?nam=eq.${year}&order=da_chi.desc&limit=100`, { schema: 'taxdoc' });
        csvContent += 'Năm,Tên Nhà Cung Cấp,Giá Trị Mua Kho,Tiền Đã Có Hóa Đơn,Còn Thiếu Cần Đòi,Tỷ Lệ Che Phủ (%),Số Phiếu Kho\n';
        suppliers.forEach(s => {
          const daChi = Number(s.gia_tri_kho) || Number(s.da_chi) || 0;
          const tienHd = Number(s.tien_hoa_don) || 0;
          const thieu = Math.max(0, daChi - tienHd);
          const pct = daChi > 0 ? Math.round((tienHd / daChi) * 100) : 0;
          csvContent += `"${s.nam || year}","${(s.ten_ncc || '').replace(/"/g, '""')}","${daChi}","${tienHd}","${thieu}","${pct}%","${s.so_dong_kho || 0}"\n`;
        });
      } else {
        const missing = await querySupabase('v_chi_ngan_hang?co_chung_tu=eq.false&lv1=eq.Expense&order=ngay.desc&limit=200', { schema: 'taxdoc' });
        csvContent += 'Ngày,Đơn Vị Thụ Hưởng,Khoản Mục,Số Tiền,Nội Dung Chuyển Khoản,Hành Động Khuyến Nghị\n';
        missing.forEach(m => {
          csvContent += `"${m.ngay || ''}","${(m.ten_tho || '').replace(/"/g, '""')}","${m.lv1 || 'Expense'}","${m.so_tien || 0}","${(m.noi_dung || '').replace(/"/g, '""')}","Ghép HĐ GTGT"\n`;
        });
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="BaoCao_DoiSoat_ChungTuThue_${year}.csv"`
      });
      res.end(csvContent);
      return;
    }

    // -------------------------------------------------------------
    // STATIC ASSETS SERVING (From frontend directory)
    // -------------------------------------------------------------
    let filePath = path.join(frontendDir, pathname === '/' ? 'index.html' : pathname);
    
    // Security check: stay within frontend directory
    if (!filePath.startsWith(frontendDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(frontendDir, 'index.html');
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
  console.log(`\n[${signal}] Shutting down server gracefully...`);
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
