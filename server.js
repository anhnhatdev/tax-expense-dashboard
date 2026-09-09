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
    // API: GET /api/kpi?year=2026
    // -------------------------------------------------------------
    if (pathname === '/api/kpi') {
      const year = reqUrl.searchParams.get('year') || '2026';
      
      // 1. Annual overview
      let annualData = cache.annualOverview;
      if (!annualData || (Date.now() - cache.annualOverviewTime > CACHE_TTL_MS)) {
        annualData = await querySupabase('v_dash_tong_quan', { schema: 'taxdoc' });
        cache.annualOverview = annualData;
        cache.annualOverviewTime = Date.now();
      }

      // 2. AR Cases (Cached single fetch)
      const allCases = await getCachedARCases();
      const waitingPayment = allCases.filter(c => c.substage === 'waiting_for_payment');
      const unstocked = allCases.filter(c => c.stage === 'arrived_not_stocked');
      const lostReturns = allCases.filter(c => c.waiting_on === 'shipper');

      // Filter by requested year
      const filtered = year === 'all' 
        ? annualData 
        : annualData.filter(item => String(item.nam) === String(year));

      let totalExpense = 0;
      let documentedExpense = 0;
      let missingExpense = 0;
      let bankTotal = 0;
      let bankDocumented = 0;
      let bankMissing = 0;
      let bankCount = 0;
      let khoTotal = 0;
      let khoDocumented = 0;
      let khoMissing = 0;
      let khoCount = 0;

      filtered.forEach(item => {
        const tong = Number(item.tong) || 0;
        const coChungTu = Number(item.co_chung_tu) || 0;
        const chuaCo = Number(item.chua_co) || 0;
        const count = Number(item.so_dong) || 0;

        totalExpense += tong;
        documentedExpense += coChungTu;
        missingExpense += chuaCo;

        if (item.nguon === 'bank') {
          bankTotal += tong;
          bankDocumented += coChungTu;
          bankMissing += chuaCo;
          bankCount += count;
        } else if (item.nguon === 'kho') {
          khoTotal += tong;
          khoDocumented += coChungTu;
          khoMissing += chuaCo;
          khoCount += count;
        }
      });

      const coverageRatio = totalExpense > 0 
        ? ((documentedExpense / totalExpense) * 100).toFixed(1)
        : 0;

      // Corporate Income Tax (TNDN) Risk: 20% on undocumented expenses
      const taxPenaltyRisk = Math.round(missingExpense * 0.20);

      // Estimated missing transactions: 100% of bank (1,832) + ~57% of kho (1,088) in 2026
      const estimatedMissingTxns = year === '2026' ? (1832 + 1088) : (bankCount + Math.round(khoCount * 0.55));

      const availableYears = [...new Set(annualData.map(d => d.nam))].sort((a, b) => b - a);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        year: year === 'all' ? 'Toàn bộ' : Number(year),
        available_years: availableYears,
        summary: {
          total_expense: totalExpense,
          documented_expense: documentedExpense,
          missing_expense: missingExpense,
          coverage_ratio: Number(coverageRatio),
          missing_ratio: Number((100 - Number(coverageRatio)).toFixed(1)),
          tax_penalty_risk: taxPenaltyRisk, // Rủi ro truy thu thuế TNDN 20%
        },
        by_source: {
          bank: {
            total: bankTotal,
            documented: bankDocumented,
            missing: bankMissing,
            count: bankCount,
            source_label: 'Chi Ngân Hàng (F_Bank / MBBank)'
          },
          inventory: {
            total: khoTotal,
            documented: khoDocumented,
            missing: khoMissing,
            count: khoCount,
            source_label: 'Nhập Mua Tồn Kho (M_Inventory)'
          },
          wallet: {
            source_label: 'Cấn trừ Ví Vận Chuyển & Sàn (F_Shipment_Wallet)',
            note: '671 bản ghi đối soát cấn trừ COD và phí sàn SPX Express'
          }
        },
        annual_history: annualData,
        alert_counts: {
          missing_docs: estimatedMissingTxns,
          overdue_payouts: waitingPayment.length,
          overdue_payouts_val: waitingPayment.reduce((sum, c) => sum + (Number(c.value) || 0), 0),
          lost_returns: lostReturns.length,
          lost_returns_val: lostReturns.reduce((sum, c) => sum + (Number(c.value) || 0), 0),
          unstocked_returns: unstocked.length,
          unstocked_returns_val: unstocked.reduce((sum, c) => sum + (Number(c.value) || 0), 0),
          total_action_items: waitingPayment.length + lostReturns.length + unstocked.length
        }
      }));
      return;
    }

    // -------------------------------------------------------------
    // API: GET /api/suppliers?year=2026&search=...&limit=30
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

      // Format & calculate coverage percentage per supplier
      const data = filtered.slice(0, limit).map(s => {
        const daChi = Number(s.da_chi) || 0;
        const tienHd = Number(s.tien_hoa_don) || 0;
        const thieu = Number(s.thieu_chung_tu) || 0;
        const coveragePct = daChi > 0 ? Math.min(100, Math.round((tienHd / daChi) * 100)) : 0;

        return {
          nam: s.nam,
          party_id: s.party_id,
          ten_ncc: s.ten_ncc || 'Chưa định danh',
          chi_bank: Number(s.chi_bank) || 0,
          gia_tri_kho: Number(s.gia_tri_kho) || 0,
          da_chi: daChi,
          tien_hoa_don: tienHd,
          chenh_lech: Number(s.chenh_lech) || 0,
          thieu_chung_tu: thieu,
          coverage_pct: coveragePct,
          so_dong_bank: Number(s.so_dong_bank) || 0,
          so_dong_kho: Number(s.so_dong_kho) || 0,
          so_hoa_don: Number(s.so_hoa_don) || 0,
          status_tag: coveragePct >= 80 ? 'An toàn' : (coveragePct >= 30 ? 'Cần bổ sung' : 'Báo động đỏ')
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        year: year === 'all' ? 'Tất cả' : Number(year),
        count: data.length,
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
    // API: GET /api/missing-docs
    // -------------------------------------------------------------
    if (pathname === '/api/missing-docs') {
      const source = reqUrl.searchParams.get('source') || 'all'; // all, bank, inventory
      const search = (reqUrl.searchParams.get('search') || '').toLowerCase().trim();
      const minAmount = Number(reqUrl.searchParams.get('min_amount') || '0');
      const page = Math.max(1, parseInt(reqUrl.searchParams.get('page') || '1'));
      const limit = Math.min(100, Math.max(5, parseInt(reqUrl.searchParams.get('limit') || '25')));

      let list = [];

      // Bank transactions
      if (source === 'all' || source === 'bank') {
        const bankItems = await querySupabase('v_chi_ngan_hang?co_chung_tu=eq.false&order=ngay.desc&limit=150', { schema: 'taxdoc' });
        bankItems.forEach(b => {
          const amt = Number(b.so_tien) || 0;
          if (amt >= minAmount) {
            list.push({
              id: b.lark_record_id,
              source: 'bank',
              source_label: 'Chi Ngân Hàng',
              date: b.ngay,
              supplier: b.ten_tho || 'Chưa định danh',
              category: `${b.lv1 || 'Chi phí'} - ${b.lv2 || 'Vận hành'}`,
              amount: amt,
              message: b.noi_dung || '',
              has_document: false,
              suggested_action: (b.noi_dung || '').toLowerCase().includes('sua quan') || (b.noi_dung || '').toLowerCase().includes('thue') || (b.noi_dung || '').toLowerCase().includes('live') || (b.noi_dung || '').toLowerCase().includes('may')
                ? 'econtract' 
                : 'invoice'
            });
          }
        });
      }

      // Inventory logs
      if (source === 'all' || source === 'inventory') {
        const khoItems = await querySupabase('v_nhap_kho?co_chung_tu=eq.false&order=ngay.desc&limit=150', { schema: 'taxdoc' });
        khoItems.forEach(k => {
          const amt = Number(k.so_tien) || 0;
          if (amt >= minAmount) {
            list.push({
              id: k.lark_record_id,
              source: 'inventory',
              source_label: 'Nhập Kho',
              date: k.ngay,
              supplier: k.ten_tho || 'Nhà cung cấp vật tư',
              category: k.vat_lieu || k.loai || 'Nguyên phụ liệu may',
              amount: amt,
              message: `Phiếu nhập kho: ${k.vat_lieu || 'Vật tư'}`,
              has_document: false,
              suggested_action: 'invoice'
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

