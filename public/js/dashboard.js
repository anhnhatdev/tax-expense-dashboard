/**
 * Tax & Expense Dashboard - Enterprise Logic & Interactions
 * Authentic Financial Control Engine for Verdency / Onesie Management Portal
 */

// Application Global State
const state = {
  year: '2026',
  tab: 'missing', // 'missing', 'suppliers', 'overdue', 'lost', 'unstocked'
  page: 1,
  limit: 20,
  search: '',
  source: 'all',
  minAmount: 0,
  channel: 'all',
  
  // Data caches
  kpi: null,
  missingDocs: null,
  suppliers: null,
  overdue: null,
  lost: null,
  unstocked: null,
  documents: [],

  // Interaction targets
  activeTxn: null,
  selectedInvoice: null,
};

let gaugeChartInstance = null;
let searchDebounceTimeout = null;

// =============================================================================
// UTILITIES & FORMATTERS
// =============================================================================

function formatVND(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' ₫';
}

function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }
  return `${day}/${month}/${year}`;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function copyToClipboard(text, successMsg = 'Đã sao chép vào bộ nhớ tạm') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    });
  } else {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast(successMsg);
  }
}

// =============================================================================
// API CLIENT
// =============================================================================

async function fetchAPI(endpoint) {
  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`Fetch error at ${endpoint}:`, err);
    showToast(`Lỗi kết nối máy chủ: ${err.message}`, 'error');
    throw err;
  }
}

// =============================================================================
// INITIALIZATION & EVENT LISTENERS
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadAllData();
});

function initEventListeners() {
  // Year Selector
  const selectYear = document.getElementById('select-year');
  selectYear.addEventListener('change', (e) => {
    state.year = e.target.value;
    state.page = 1;
    loadAllData();
  });

  // Refresh Button
  document.getElementById('btn-refresh').addEventListener('click', () => {
    showToast('Đang đồng bộ dữ liệu mới nhất từ Supabase...', 'warning');
    loadAllData();
  });

  // Export CSV Button
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const exportType = state.tab === 'suppliers' ? 'suppliers' : 'missing';
    window.location.href = `/api/export-csv?type=${exportType}&year=${state.year}`;
    showToast('Đang tải xuống báo cáo đối soát dạng file Excel CSV...', 'success');
  });

  // Tab Navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tab = btn.dataset.tab;
      state.page = 1;
      updateFilterVisibility();
      renderActiveTab();
    });
  });

  // Search Input (Debounced)
  const inputSearch = document.getElementById('input-search');
  inputSearch.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      state.search = e.target.value.trim();
      state.page = 1;
      renderActiveTab();
    }, 280);
  });

  // Source Filter
  document.getElementById('filter-source').addEventListener('change', (e) => {
    state.source = e.target.value;
    state.page = 1;
    renderActiveTab();
  });

  // Min Amount Filter
  document.getElementById('filter-min-amount').addEventListener('change', (e) => {
    state.minAmount = Number(e.target.value) || 0;
    state.page = 1;
    renderActiveTab();
  });

  // Channel Filter
  document.getElementById('filter-channel').addEventListener('change', (e) => {
    state.channel = e.target.value;
    state.page = 1;
    renderActiveTab();
  });

  // Pagination Controls
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      renderActiveTab();
    }
  });

  document.getElementById('btn-next-page').addEventListener('click', () => {
    state.page++;
    renderActiveTab();
  });

  // Modal: Link Invoice
  document.getElementById('btn-close-modal').addEventListener('click', closeInvoiceModal);
  document.getElementById('btn-cancel-link').addEventListener('click', closeInvoiceModal);
  document.getElementById('btn-confirm-link').addEventListener('click', submitLinkInvoice);
  document.getElementById('modal-search-invoice').addEventListener('input', (e) => {
    filterModalInvoices(e.target.value);
  });

  // Modal: E-Contract
  document.getElementById('btn-close-contract-modal').addEventListener('click', closeContractModal);
  document.getElementById('btn-cancel-contract').addEventListener('click', closeContractModal);
  document.getElementById('btn-submit-contract').addEventListener('click', submitCreateContract);

  // Modal: Dispute Ticket
  document.getElementById('btn-close-dispute-modal').addEventListener('click', closeDisputeModal);
  document.getElementById('btn-cancel-dispute').addEventListener('click', closeDisputeModal);
  document.getElementById('btn-copy-dispute').addEventListener('click', () => {
    const text = document.getElementById('dispute-text-content').value;
    copyToClipboard(text, 'Đã sao chép văn bản khiếu nại sàn thành công!');
    closeDisputeModal();
  });
}

function updateFilterVisibility() {
  const sourceFilter = document.getElementById('filter-source');
  const minAmountFilter = document.getElementById('filter-min-amount');
  const channelFilter = document.getElementById('filter-channel');

  if (state.tab === 'missing') {
    sourceFilter.style.display = 'inline-block';
    minAmountFilter.style.display = 'inline-block';
    channelFilter.style.display = 'none';
  } else if (state.tab === 'suppliers') {
    sourceFilter.style.display = 'none';
    minAmountFilter.style.display = 'none';
    channelFilter.style.display = 'none';
  } else {
    // E-commerce alert tabs (overdue, lost, unstocked)
    sourceFilter.style.display = 'none';
    minAmountFilter.style.display = 'none';
    channelFilter.style.display = 'inline-block';
  }
}

// =============================================================================
// DATA LOADING & ORCHESTRATION
// =============================================================================

async function loadAllData() {
  try {
    // Load KPI Overview first
    const kpi = await fetchAPI(`/api/kpi?year=${state.year}`);
    state.kpi = kpi;
    renderKPI(kpi);
    renderGauge(kpi.summary.coverage_ratio, kpi.summary.missing_ratio);
    renderSourceBars(kpi.by_source);

    // Render the active tab view
    renderActiveTab();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// =============================================================================
// KPI & CHARTS RENDERING
// =============================================================================

function renderKPI(data) {
  const { summary, alert_counts } = data;

  document.getElementById('kpi-total-expense').innerText = formatVND(summary.total_expense);
  document.getElementById('kpi-total-transactions').innerText = `${alert_counts.missing_docs} GD thiếu HĐ`;

  document.getElementById('kpi-documented-expense').innerText = formatVND(summary.documented_expense);
  document.getElementById('kpi-coverage-badge').innerText = `${summary.coverage_ratio}% che phủ`;

  document.getElementById('kpi-missing-expense').innerText = formatVND(summary.missing_expense);
  document.getElementById('kpi-missing-percent').innerText = `${summary.missing_ratio}% rủi ro`;

  document.getElementById('kpi-tax-risk').innerText = formatVND(summary.tax_penalty_risk);

  // Update badge counts on tabs
  document.getElementById('badge-missing-count').innerText = (alert_counts.missing_docs || 0).toLocaleString('vi-VN');
  document.getElementById('badge-overdue-count').innerText = alert_counts.overdue_payouts || 0;
  document.getElementById('badge-lost-count').innerText = alert_counts.lost_returns || 0;
  document.getElementById('badge-unstocked-count').innerText = alert_counts.unstocked_returns || 0;

  document.getElementById('hub-summary-text').innerText = 
    `Phát hiện ${alert_counts.total_action_items} sự vụ sàn cần xử lý ngay | ${alert_counts.missing_docs} giao dịch chưa có chứng từ`;
}

function renderGauge(coverageRatio, missingRatio) {
  document.getElementById('gauge-center-pct').innerText = `${coverageRatio}%`;
  
  if (state.kpi) {
    document.getElementById('legend-documented').innerText = formatVND(state.kpi.summary.documented_expense);
    document.getElementById('legend-missing').innerText = formatVND(state.kpi.summary.missing_expense);
  }

  const canvas = document.getElementById('gaugeChart');
  const ctx = canvas.getContext('2d');

  if (gaugeChartInstance) {
    gaugeChartInstance.destroy();
  }

  gaugeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Đã có chứng từ', 'Chưa có chứng từ'],
      datasets: [{
        data: [coverageRatio, missingRatio],
        backgroundColor: ['#10B981', '#F43F5E'],
        borderWidth: 0,
        hoverOffset: 3
      }]
    },
    options: {
      circumference: 180,
      rotation: 270,
      cutout: '75%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.label}: ${context.raw}%`;
            }
          }
        }
      }
    }
  });
}

function renderSourceBars(bySource) {
  const bank = bySource.bank;
  const inv = bySource.inventory;

  // Bank (MBBank)
  document.getElementById('bank-bar-amount').innerText = formatVND(bank.total);
  document.getElementById('bank-doc-stat').innerText = formatVND(bank.documented);
  document.getElementById('bank-missing-stat').innerText = formatVND(bank.missing);
  document.getElementById('bank-count-stat').innerText = (bank.count || 0).toLocaleString('vi-VN');
  const bankPct = bank.total > 0 ? (bank.documented / bank.total) * 100 : 0;
  document.getElementById('bank-progress-fill').style.width = `${bankPct}%`;

  // Inventory
  document.getElementById('kho-bar-amount').innerText = formatVND(inv.total);
  document.getElementById('kho-doc-stat').innerText = formatVND(inv.documented);
  document.getElementById('kho-missing-stat').innerText = formatVND(inv.missing);
  document.getElementById('kho-count-stat').innerText = (inv.count || 0).toLocaleString('vi-VN');
  const khoPct = inv.total > 0 ? (inv.documented / inv.total) * 100 : 0;
  document.getElementById('kho-progress-fill').style.width = `${khoPct}%`;
}

// =============================================================================
// TAB DISPATCHER & TABLE RENDERERS
// =============================================================================

async function renderActiveTab() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--text-muted);">Đang truy vấn dữ liệu từ Supabase...</td></tr>`;

  switch (state.tab) {
    case 'missing':
      await renderMissingDocsTab(thead, tbody);
      break;
    case 'suppliers':
      await renderSuppliersTab(thead, tbody);
      break;
    case 'overdue':
      await renderOverdueTab(thead, tbody);
      break;
    case 'lost':
      await renderLostReturnsTab(thead, tbody);
      break;
    case 'unstocked':
      await renderUnstockedTab(thead, tbody);
      break;
  }
}

// -----------------------------------------------------------------------------
// TAB 1: GIAO DỊCH THIẾU CHỨNG TỪ
// -----------------------------------------------------------------------------
async function renderMissingDocsTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 100px;">Ngày</th>
      <th style="width: 130px;">Nguồn chi</th>
      <th style="width: 220px;">Đối tác / Thợ</th>
      <th style="width: 150px;">Phân loại</th>
      <th style="width: 140px; text-align: right;">Số tiền</th>
      <th>Nội dung chuyển khoản / Nhập kho</th>
      <th style="width: 170px; text-align: center;">Hành động nghiệp vụ</th>
    </tr>
  `;

  const queryParams = new URLSearchParams({
    year: state.year,
    source: state.source,
    search: state.search,
    min_amount: state.minAmount,
    page: state.page,
    limit: state.limit
  });

  const res = await fetchAPI(`/api/missing-docs?${queryParams.toString()}`);
  state.missingDocs = res;

  updatePagination(res.total, res.page, res.limit);

  if (!res.data || res.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">Không tìm thấy giao dịch nào phù hợp bộ lọc.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data.map(item => {
    const isBank = item.source === 'bank';
    const sourceBadge = isBank 
      ? `<span class="badge-tag" style="background:rgba(99, 102, 241, 0.12); color:#A5B4FC; border:1px solid rgba(99, 102, 241, 0.25);">MBBank Chi</span>`
      : `<span class="badge-tag" style="background:rgba(14, 165, 233, 0.12); color:#38BDF8; border:1px solid rgba(14, 165, 233, 0.25);">Kho Nhập</span>`;

    const actionBtn = item.suggested_action === 'econtract'
      ? `<button class="btn-action btn-contract" onclick="openContractModal('${item.id}', '${escapeHtml(item.supplier)}', ${item.amount})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Lập E-Contract
        </button>`
      : `<button class="btn-action btn-invoice" onclick="openInvoiceModal('${item.id}', '${escapeHtml(item.supplier)}', ${item.amount}, '${escapeHtml(item.message)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Gán Hóa Đơn GTGT
        </button>`;

    return `
      <tr>
        <td style="color:var(--text-secondary);">${formatDate(item.date)}</td>
        <td>${sourceBadge}</td>
        <td><strong style="color:#FFFFFF;">${escapeHtml(item.supplier)}</strong></td>
        <td style="color:var(--text-secondary); font-size:12px;">${escapeHtml(item.category)}</td>
        <td style="text-align: right;" class="table-amount danger num-tabular">${formatVND(item.amount)}</td>
        <td style="font-size:12px; color:#CBD5E1; max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.message)}">
          ${escapeHtml(item.message)}
        </td>
        <td style="text-align: center;">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 2: ĐỐI SOÁT THEO NHÀ CUNG CẤP (SUPPLIER RECONCILIATION)
// -----------------------------------------------------------------------------
async function renderSuppliersTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 240px;">Tên Nhà Cung Cấp / Xưởng May</th>
      <th style="width: 140px; text-align: right;">Tổng Tiền Đã Chi</th>
      <th style="width: 130px; text-align: right;">Chi Ngân Hàng</th>
      <th style="width: 130px; text-align: right;">Giá Trị Nhập Kho</th>
      <th style="width: 130px; text-align: right;">Tiền Hóa Đơn GTGT</th>
      <th style="width: 140px; text-align: right;">Còn Thiếu Chứng Từ</th>
      <th style="width: 160px;">Tỷ Lệ Che Phủ HĐ</th>
      <th style="width: 140px; text-align: center;">Hành Động</th>
    </tr>
  `;

  const queryParams = new URLSearchParams({
    year: state.year,
    search: state.search,
    limit: 50
  });

  const res = await fetchAPI(`/api/suppliers?${queryParams.toString()}`);
  state.suppliers = res;

  updatePagination(res.count, 1, 50);

  if (!res.data || res.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--text-muted);">Không tìm thấy dữ liệu nhà cung cấp nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data.map(s => {
    const pct = s.coverage_pct;
    const progressColor = pct >= 80 ? 'var(--accent-emerald)' : (pct >= 30 ? 'var(--accent-amber)' : 'var(--accent-rose)');

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#FFFFFF;">${escapeHtml(s.ten_ncc)}</div>
          <div style="font-size:11px; color:var(--text-muted);">${s.so_dong_bank} GD Bank | ${s.so_dong_kho} Phiếu Kho | ${s.so_hoa_don} HĐ</div>
        </td>
        <td style="text-align: right;" class="table-amount num-tabular">${formatVND(s.da_chi)}</td>
        <td style="text-align: right; color:var(--text-secondary);" class="num-tabular">${formatVND(s.chi_bank)}</td>
        <td style="text-align: right; color:var(--text-secondary);" class="num-tabular">${formatVND(s.gia_tri_kho)}</td>
        <td style="text-align: right;" class="table-amount success num-tabular">${formatVND(s.tien_hoa_don)}</td>
        <td style="text-align: right;" class="table-amount danger num-tabular">${formatVND(s.thieu_chung_tu)}</td>
        <td>
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
            <span style="color:${progressColor}; font-weight:700;">${pct}%</span>
            <span style="color:var(--text-muted);">${s.status_tag}</span>
          </div>
          <div class="progress-bar-bg" style="height:5px; margin-bottom:0;">
            <div style="width:${pct}%; background:${progressColor}; height:100%; border-radius:4px;"></div>
          </div>
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-secondary" onclick="copySupplierReminder('${escapeHtml(s.ten_ncc)}', ${s.thieu_chung_tu})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Đòi Hóa Đơn
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 3: ĐƠN SÀN OVERDUE (>4 NGÀY)
// -----------------------------------------------------------------------------
async function renderOverdueTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 100px;">Kênh bán</th>
      <th style="width: 180px;">Mã đơn hàng</th>
      <th style="width: 180px;">Mã vận đơn (Forward)</th>
      <th style="width: 130px; text-align: right;">Giá trị đơn</th>
      <th style="width: 140px; text-align: center;">Số ngày quá hạn</th>
      <th>Trạng thái & Rủi ro sàn</th>
      <th style="width: 160px; text-align: center;">Hành động</th>
    </tr>
  `;

  const res = await fetchAPI('/api/alerts/overdue-payouts');
  state.overdue = res;

  let filtered = res.data || [];
  if (state.channel !== 'all') {
    filtered = filtered.filter(item => item.channel === state.channel);
  }
  if (state.search) {
    filtered = filtered.filter(item => 
      (item.order_id || '').toLowerCase().includes(state.search) ||
      (item.fwd_tracking || '').toLowerCase().includes(state.search)
    );
  }

  updatePagination(filtered.length, 1, filtered.length);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">Không có đơn hàng nào bị sàn giam tiền quá 4 ngày.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const channelClass = item.channel === 'tiktok' ? 'tiktok' : 'shopee';
    const channelLabel = item.channel === 'tiktok' ? 'TikTok' : 'Shopee';

    return `
      <tr>
        <td><span class="badge-channel ${channelClass}">${channelLabel}</span></td>
        <td>
          <span style="font-family:'Plus Jakarta Sans', monospace; font-weight:700; color:#FFFFFF;">${item.order_id}</span>
          <button onclick="copyToClipboard('${item.order_id}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-left:4px;" title="Sao chép">📋</button>
        </td>
        <td style="font-family:'Plus Jakarta Sans', monospace; color:#94A3B8;">${item.fwd_tracking || '-'}</td>
        <td style="text-align: right;" class="table-amount num-tabular">${formatVND(item.value)}</td>
        <td style="text-align: center;">
          <span class="badge-tag" style="background:rgba(244, 63, 94, 0.15); color:#FB7185; font-weight:700; border:1px solid rgba(244, 63, 94, 0.3);">
            +${item.age_days} ngày
          </span>
        </td>
        <td>
          <div style="font-size:12.5px; color:#F1F5F9;">Đã giao thành công nhưng ví sàn chưa quyết toán</div>
          <div style="font-size:11px; color:var(--text-muted);">Chờ sàn giải ngân ví người bán</div>
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-dispute" onclick="openDisputeModal('${item.channel}', '${item.order_id}', '${item.fwd_tracking}', ${item.value}, ${item.age_days})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Khiếu Nại Sàn
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 4: ĐƠN HOÀN NGHI THẤT LẠC SHIPPER
// -----------------------------------------------------------------------------
async function renderLostReturnsTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 100px;">Kênh bán</th>
      <th style="width: 170px;">Mã đơn hàng</th>
      <th style="width: 180px;">Mã vận đơn hoàn</th>
      <th style="width: 130px; text-align: right;">Giá trị hàng</th>
      <th style="width: 140px; text-align: center;">Thời gian shipper giữ</th>
      <th>Cảnh báo nguy cơ</th>
      <th style="width: 160px; text-align: center;">Hành động</th>
    </tr>
  `;

  const res = await fetchAPI('/api/alerts/lost-returns');
  state.lost = res;

  let filtered = res.data || [];
  if (state.channel !== 'all') {
    filtered = filtered.filter(item => item.channel === state.channel);
  }
  if (state.search) {
    filtered = filtered.filter(item => 
      (item.order_id || '').toLowerCase().includes(state.search) ||
      (item.rr_tracking || '').toLowerCase().includes(state.search)
    );
  }

  updatePagination(filtered.length, 1, filtered.length);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">Không phát hiện đơn hàng hoàn nào bị ngâm vận chuyển.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const channelClass = item.channel === 'tiktok' ? 'tiktok' : 'shopee';
    const channelLabel = item.channel === 'tiktok' ? 'TikTok' : 'Shopee';

    return `
      <tr>
        <td><span class="badge-channel ${channelClass}">${channelLabel}</span></td>
        <td>
          <span style="font-family:'Plus Jakarta Sans', monospace; font-weight:700; color:#FFFFFF;">${item.order_id}</span>
        </td>
        <td style="font-family:'Plus Jakarta Sans', monospace; color:#94A3B8;">${item.rr_tracking || '-'}</td>
        <td style="text-align: right;" class="table-amount num-tabular">${formatVND(item.value)}</td>
        <td style="text-align: center;">
          <span class="badge-tag" style="background:rgba(245, 158, 11, 0.15); color:#FBBF24; font-weight:700; border:1px solid rgba(245, 158, 11, 0.3);">
            ${item.age_days} ngày luân chuyển
          </span>
        </td>
        <td>
          <div style="font-size:12.5px; color:#F87171; font-weight:600;">Nguy cơ shipper làm mất hàng hoàn</div>
          <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(item.ly_do_nghi)}</div>
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-secondary" onclick="copyCarrierClaim('${item.channel}', '${item.order_id}', '${item.rr_tracking}', ${item.value})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Biên Bản Đền Bù
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 5: HÀNG VỀ CHƯA NHẬP KHO SAPO
// -----------------------------------------------------------------------------
async function renderUnstockedTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 100px;">Kênh bán</th>
      <th style="width: 170px;">Mã đơn hàng</th>
      <th style="width: 180px;">Mã kiện / Vận đơn</th>
      <th style="width: 130px; text-align: right;">Giá trị kiện hàng</th>
      <th style="width: 160px;">Camera Dohana quay</th>
      <th>Tình trạng tồn đọng</th>
      <th style="width: 160px; text-align: center;">Hành động</th>
    </tr>
  `;

  const res = await fetchAPI('/api/alerts/unstocked');
  state.unstocked = res;

  let filtered = res.data || [];
  if (state.channel !== 'all') {
    filtered = filtered.filter(item => item.channel === state.channel);
  }
  if (state.search) {
    filtered = filtered.filter(item => 
      (item.order_id || '').toLowerCase().includes(state.search) ||
      (item.fwd_tracking || '').toLowerCase().includes(state.search)
    );
  }

  updatePagination(filtered.length, 1, filtered.length);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">Kho Sapo đã nhập đầy đủ mọi kiện hàng camera đã quay.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const channelClass = item.channel === 'tiktok' ? 'tiktok' : 'shopee';
    const channelLabel = item.channel === 'tiktok' ? 'TikTok' : 'Shopee';

    return `
      <tr>
        <td><span class="badge-channel ${channelClass}">${channelLabel}</span></td>
        <td>
          <span style="font-family:'Plus Jakarta Sans', monospace; font-weight:700; color:#FFFFFF;">${item.order_id}</span>
        </td>
        <td style="font-family:'Plus Jakarta Sans', monospace; color:#94A3B8;">${item.fwd_tracking || item.rr_tracking || '-'}</td>
        <td style="text-align: right;" class="table-amount num-tabular">${formatVND(item.value)}</td>
        <td style="color:var(--text-secondary); font-size:12px;">${formatDate(item.clock_from, true)}</td>
        <td>
          <div style="font-size:12.5px; color:#38BDF8; font-weight:600;">Đã về cửa kho nhưng chưa quét Barcode Sapo</div>
          <div style="font-size:11px; color:var(--text-muted);">Đã quá ${item.age_days} ngày chưa lên tồn kho</div>
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-invoice" onclick="triggerStockScanAlert('${item.order_id}', '${item.fwd_tracking}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
            Lệnh Quét Kho
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// =============================================================================
// PAGINATION COMPONENT
// =============================================================================

function updatePagination(total, page, limit) {
  const paginationBar = document.getElementById('pagination-bar');
  const paginationInfo = document.getElementById('pagination-info');
  const pageDisplay = document.getElementById('page-display');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');

  if (total <= limit) {
    paginationBar.style.display = 'none';
    return;
  }

  paginationBar.style.display = 'flex';
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);

  paginationInfo.innerText = `Hiển thị từ ${start} - ${end} trên tổng số ${total.toLocaleString('vi-VN')} bản ghi`;
  pageDisplay.innerText = `Trang ${page} / ${totalPages}`;

  btnPrev.disabled = page <= 1;
  btnNext.disabled = page >= totalPages;
}

// =============================================================================
// MODAL: GÁN HÓA ĐƠN GTGT (LINK INVOICE)
// =============================================================================

async function openInvoiceModal(id, supplier, amount, message) {
  state.activeTxn = { id, supplier, amount, message };
  state.selectedInvoice = null;

  document.getElementById('modal-txn-desc').innerText = `${supplier} - ${message || 'Khoản chi'}`;
  document.getElementById('modal-txn-amount').innerText = formatVND(amount);
  document.getElementById('btn-confirm-link').disabled = true;
  document.getElementById('modal-matching-delta').style.display = 'none';

  const modal = document.getElementById('modal-link-invoice');
  modal.classList.add('active');

  const listContainer = document.getElementById('modal-invoice-list');
  listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Đang tải danh sách hóa đơn từ CSDL...</div>`;

  try {
    const res = await fetchAPI('/api/documents');
    state.documents = res.data || [];
    renderModalInvoices(state.documents);
  } catch (err) {
    listContainer.innerHTML = `<div style="color:var(--accent-rose); padding:10px;">Không thể nạp danh sách hóa đơn.</div>`;
  }
}

function renderModalInvoices(list) {
  const container = document.getElementById('modal-invoice-list');
  if (!list || list.length === 0) {
    container.innerHTML = `<div style="padding:16px; color:var(--text-muted); text-align:center;">Không tìm thấy hóa đơn nào phù hợp.</div>`;
    return;
  }

  container.innerHTML = list.map(inv => {
    return `
      <div class="invoice-card-select" id="inv-card-${inv.document_id}" onclick="selectInvoiceForLinking('${inv.document_id}')">
        <div>
          <div style="font-weight:700; color:#FFFFFF; font-family:'Plus Jakarta Sans', monospace;">
            HĐ #${inv.number || 'N/A'} (Ký hiệu: ${inv.series || 'N/A'})
          </div>
          <div style="font-size:11.5px; color:var(--text-muted);">
            Ngày lập: ${formatDate(inv.issue_date)} | Định danh: ${inv.invoice_key}
          </div>
        </div>
        <div style="text-align:right;">
          <div class="num-tabular" style="font-weight:700; color:var(--accent-emerald); font-size:14px;">
            ${formatVND(inv.total)}
          </div>
          <div style="font-size:10.5px; color:#94A3B8;">Cổng Thuế GDT: Xác thực</div>
        </div>
      </div>
    `;
  }).join('');
}

function selectInvoiceForLinking(docId) {
  const cards = document.querySelectorAll('.invoice-card-select');
  cards.forEach(c => c.classList.remove('selected'));

  const selectedCard = document.getElementById(`inv-card-${docId}`);
  if (selectedCard) selectedCard.classList.add('selected');

  const inv = state.documents.find(d => d.document_id === docId);
  if (!inv) return;

  state.selectedInvoice = inv;
  document.getElementById('btn-confirm-link').disabled = false;

  const deltaBox = document.getElementById('modal-matching-delta');
  deltaBox.style.display = 'block';

  const txnAmt = state.activeTxn.amount;
  const invAmt = Number(inv.total) || 0;
  const delta = invAmt - txnAmt;

  if (Math.abs(delta) < 1000) {
    deltaBox.style.background = 'rgba(16, 185, 129, 0.1)';
    deltaBox.style.color = '#34D399';
    deltaBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    deltaBox.innerHTML = `<strong>Khớp 100%</strong>: Số tiền hóa đơn hoàn toàn trùng khớp với khoản chuyển khoản.`;
  } else if (delta > 0) {
    deltaBox.style.background = 'rgba(99, 102, 241, 0.1)';
    deltaBox.style.color = '#A5B4FC';
    deltaBox.style.border = '1px solid rgba(99, 102, 241, 0.3)';
    deltaBox.innerHTML = `Chênh lệch: Hóa đơn lớn hơn khoản chi <strong>${formatVND(delta)}</strong> (Có thể bao gồm VAT hoặc gộp nhiều giao dịch).`;
  } else {
    deltaBox.style.background = 'rgba(245, 158, 11, 0.1)';
    deltaBox.style.color = '#FCD34D';
    deltaBox.style.border = '1px solid rgba(245, 158, 11, 0.3)';
    deltaBox.innerHTML = `Chênh lệch: Hóa đơn nhỏ hơn khoản chi <strong>${formatVND(Math.abs(delta))}</strong>. Cần đối chiếu thêm chứng từ phụ.`;
  }
}

function filterModalInvoices(query) {
  const q = (query || '').toLowerCase();
  const filtered = state.documents.filter(d => 
    (d.number || '').toLowerCase().includes(q) ||
    (d.series || '').toLowerCase().includes(q) ||
    (d.invoice_key || '').toLowerCase().includes(q)
  );
  renderModalInvoices(filtered);
}

async function submitLinkInvoice() {
  if (!state.activeTxn || !state.selectedInvoice) return;

  try {
    const payload = {
      transaction_id: state.activeTxn.id,
      document_id: state.selectedInvoice.document_id,
      invoice_number: state.selectedInvoice.number,
      delta_amount: (state.selectedInvoice.total || 0) - state.activeTxn.amount
    };

    const res = await fetch('/api/link-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    showToast(data.message || 'Ghép cặp chứng từ thành công!', 'success');
    closeInvoiceModal();
    
    // Refresh table view
    renderActiveTab();
  } catch (err) {
    showToast(`Không thể gán hóa đơn: ${err.message}`, 'error');
  }
}

function closeInvoiceModal() {
  document.getElementById('modal-link-invoice').classList.remove('active');
  state.activeTxn = null;
  state.selectedInvoice = null;
}

// =============================================================================
// MODAL: LẬP HỢP ĐỒNG ĐIỆN TỬ (E-CONTRACT)
// =============================================================================

function openContractModal(id, partyName, amount) {
  state.activeTxn = { id, partyName, amount };

  document.getElementById('contract-party-name').value = partyName || 'Đối tác gia công thợ may';
  document.getElementById('contract-amount').value = formatVND(amount);

  document.getElementById('modal-create-contract').classList.add('active');
}

async function submitCreateContract() {
  if (!state.activeTxn) return;

  try {
    const template = document.getElementById('contract-template-select').value;
    const res = await fetch('/api/create-econtract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: state.activeTxn.id,
        party_name: state.activeTxn.partyName,
        amount: state.activeTxn.amount,
        template_type: template
      })
    });
    const data = await res.json();

    copyToClipboard(data.sign_url, `Đã khởi tạo ${data.contract_number} và copy link ký online vào clipboard!`);
    closeContractModal();
    renderActiveTab();
  } catch (err) {
    showToast(`Lỗi tạo hợp đồng: ${err.message}`, 'error');
  }
}

function closeContractModal() {
  document.getElementById('modal-create-contract').classList.remove('active');
  state.activeTxn = null;
}

// =============================================================================
// MODAL: KHIẾU NẠI SÀN TMĐT (DISPUTE TICKET)
// =============================================================================

function openDisputeModal(channel, orderId, tracking, value, ageDays) {
  const channelName = channel === 'tiktok' ? 'TikTok Shop' : 'Shopee';
  const textContent = 
`KÍNH GỬI BỘ PHẬN HỖ TRỢ ĐỐI SOÁT TÀI CHÍNH ${channelName.toUpperCase()} SELLER:

Gian hàng: ONESIE / VERDENCY OFFICIAL
Mã đơn hàng: ${orderId}
Mã vận đơn bưu kiện: ${tracking || 'N/A'}
Giá trị đơn hàng: ${formatVND(value)}
Thời gian giao thành công: Đã quá ${ageDays} ngày

NỘI DUNG YÊU CẦU GIẢI QUYẾT:
Đơn hàng trên của chúng tôi đã được đơn vị vận chuyển cập nhật trạng thái "Giao hàng thành công" tới khách hàng quá hạn 4 ngày theo chính sách quyết toán của sàn. Tuy nhiên, hiện tại hệ thống vẫn chưa giải ngân tiền về Số dư / Ví người bán.

Kính đề nghị Bộ phận Tài chính sàn rà soát và kích hoạt lệnh thanh toán ngay cho gian hàng.

Trân trọng cảm ơn!`;

  document.getElementById('dispute-text-content').value = textContent;
  document.getElementById('modal-dispute-ticket').classList.add('active');
}

function closeDisputeModal() {
  document.getElementById('modal-dispute-ticket').classList.remove('active');
}

// =============================================================================
// QUICK ACTION HELPERS
// =============================================================================

function copySupplierReminder(supplier, amount) {
  const text = `Kính gửi đối tác ${supplier}, hiện tại bộ phận kế toán Onesie / Verdency đang tiến hành quyết toán hóa đơn đầu vào. Khoản thanh toán trị giá ${formatVND(amount)} hiện vẫn đang thiếu hóa đơn GTGT hợp lệ. Nhờ bên mình xuất và gửi file XML/PDF hóa đơn sớm giúp công ty để hoàn thiện hồ sơ thuế. Xin cảm ơn!`;
  copyToClipboard(text, `Đã sao chép văn bản nhắc hóa đơn gửi cho ${supplier}`);
}

function copyCarrierClaim(channel, orderId, tracking, value) {
  const text = `YÊU CẦU ĐỐI SOÁT ĐỀN BÙ HÀNG HOÀN THẤT LẠC: Đơn hàng #${orderId} (Vận đơn hoàn: ${tracking}) giá trị ${formatVND(value)} đã được shipper lấy hàng hoàn nhưng quá hạn luân chuyển vẫn chưa bàn giao về kho của chúng tôi. Kính đề nghị đơn vị vận chuyển xác minh và tiến hành thủ tục bồi hoàn 100% giá trị kiện hàng theo cam kết dịch vụ.`;
  copyToClipboard(text, `Đã sao chép nội dung khiếu nại bồi hoàn hãng vận chuyển`);
}

function triggerStockScanAlert(orderId, tracking) {
  showToast(`Đã gửi lệnh khẩn cấp xuống Thủ kho Sapo kiểm tra kiện #${orderId} (${tracking || ''})`, 'success');
}

// Helper: Escape HTML to avoid XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
