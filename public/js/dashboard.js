/**
 * Tax & Expense Dashboard - Enterprise Logic & Interactions
 * Authentic Financial Control Engine for Verdency / Onesie Management Portal
 * Refactored according to Meeting 3: 3-Tier Architecture & MISA Batch Sync
 */

// Application Global State
const state = {
  year: '2026',
  tab: 'suppliers', // Default to suppliers: 'suppliers', 'direct', 'cogs_items', 'marketplace', 'misa'
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
  misaData: null,
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
  if (!container) return;
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
  if (selectYear) {
    selectYear.addEventListener('change', (e) => {
      state.year = e.target.value;
      state.page = 1;
      loadAllData();
    });
  }

  // Refresh Button
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      showToast('Đang đồng bộ dữ liệu mới nhất từ Supabase...', 'warning');
      loadAllData();
    });
  }

  // Export CSV Button
  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const exportType = state.tab === 'suppliers' ? 'suppliers' : 'missing';
      window.location.href = `/api/export-csv?type=${exportType}&year=${state.year}`;
      showToast('Đang tải xuống báo cáo đối soát dạng file Excel CSV...', 'success');
    });
  }

  // Tab Navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Clickable 3 Big Groups Cards to switch tabs
  const cardCogs = document.getElementById('card-group-cogs');
  if (cardCogs) cardCogs.addEventListener('click', () => switchTab('suppliers'));

  const cardDirect = document.getElementById('card-group-direct');
  if (cardDirect) cardDirect.addEventListener('click', () => switchTab('direct'));

  const cardMarket = document.getElementById('card-group-market');
  if (cardMarket) cardMarket.addEventListener('click', () => switchTab('marketplace'));

  // Search Input (Debounced)
  const inputSearch = document.getElementById('input-search');
  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        renderActiveTab();
      }, 280);
    });
  }

  // Min Amount Filter
  const filterMinAmt = document.getElementById('filter-min-amount');
  if (filterMinAmt) {
    filterMinAmt.addEventListener('change', (e) => {
      state.minAmount = Number(e.target.value) || 0;
      state.page = 1;
      renderActiveTab();
    });
  }

  // Pagination Controls
  const btnPrev = document.getElementById('btn-prev-page');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        renderActiveTab();
      }
    });
  }

  const btnNext = document.getElementById('btn-next-page');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      state.page++;
      renderActiveTab();
    });
  }

  // Modal: Link Invoice
  const btnCloseModal = document.getElementById('btn-close-modal');
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeInvoiceModal);

  const btnCancelLink = document.getElementById('btn-cancel-link');
  if (btnCancelLink) btnCancelLink.addEventListener('click', closeInvoiceModal);

  const btnConfirmLink = document.getElementById('btn-confirm-link');
  if (btnConfirmLink) btnConfirmLink.addEventListener('click', submitLinkInvoice);

  const inputModalSearch = document.getElementById('modal-search-invoice');
  if (inputModalSearch) {
    inputModalSearch.addEventListener('input', (e) => {
      filterModalInvoices(e.target.value);
    });
  }

  // Modal: E-Contract
  const btnCloseContract = document.getElementById('btn-close-contract-modal');
  if (btnCloseContract) btnCloseContract.addEventListener('click', closeContractModal);

  const btnCancelContract = document.getElementById('btn-cancel-contract');
  if (btnCancelContract) btnCancelContract.addEventListener('click', closeContractModal);

  const btnSubmitContract = document.getElementById('btn-submit-contract');
  if (btnSubmitContract) btnSubmitContract.addEventListener('click', submitCreateContract);
}

function switchTab(tabId) {
  state.tab = tabId;
  state.page = 1;

  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(b => {
    if (b.dataset.tab === tabId) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  renderActiveTab();
}

// =============================================================================
// DATA LOADING & ORCHESTRATION
// =============================================================================

async function loadAllData() {
  try {
    const kpi = await fetchAPI(`/api/kpi?year=${state.year}`);
    state.kpi = kpi;
    renderKPI(kpi);
    renderActiveTab();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// =============================================================================
// VIEW 1 & VIEW 2 RENDERING (MEETING 3)
// =============================================================================

function renderKPI(data) {
  const v1 = data.view1_core_metrics;
  const v2 = data.view2_three_groups;
  const misa = data.misa_sync_status;

  // VIEW 1: 3 CHỈ SỐ CỐT LÕI
  // 1. Tổng tiền giao dịch thực tế
  document.getElementById('kpi-total-expense').innerText = formatVND(v1.total_expense);
  document.getElementById('kpi-total-transactions').innerText = `${v1.total_transactions.toLocaleString('vi-VN')} giao dịch chi`;

  // 2. Tổng giá trị đã có chứng từ
  document.getElementById('kpi-documented-expense').innerText = formatVND(v1.documented_expense);
  document.getElementById('kpi-coverage-badge').innerText = `${v1.coverage_ratio}% che phủ`;

  // 3. Chênh lệch thiếu cần bổ sung
  document.getElementById('kpi-missing-expense').innerText = formatVND(v1.missing_expense);
  document.getElementById('kpi-missing-percent').innerText = `${v1.missing_ratio}% chi phí thiếu HĐ`;

  // Render Gauge & Legend
  renderGauge(v1.coverage_ratio, v1.missing_ratio, v1.documented_expense, v1.missing_expense);

  // VIEW 2: PHÂN BỔ 3 NHÓM LỚN
  // Nhóm 1: Mua hàng kho (COGS)
  const cogs = v2.cogs_inventory;
  document.getElementById('cogs-bar-amount').innerText = formatVND(cogs.total);
  document.getElementById('cogs-doc-stat').innerText = formatVND(cogs.documented);
  document.getElementById('cogs-missing-stat').innerText = formatVND(cogs.missing);
  document.getElementById('cogs-count-stat').innerText = cogs.count.toLocaleString('vi-VN');
  document.getElementById('cogs-progress-fill').style.width = `${cogs.coverage_pct}%`;

  // Nhóm 2: Chi phí vận hành trực tiếp (Ngân hàng)
  const direct = v2.direct_expense;
  document.getElementById('direct-bar-amount').innerText = formatVND(direct.total);
  document.getElementById('direct-doc-stat').innerText = formatVND(direct.documented);
  document.getElementById('direct-missing-stat').innerText = formatVND(direct.missing);
  document.getElementById('direct-count-stat').innerText = direct.count.toLocaleString('vi-VN');
  document.getElementById('direct-progress-fill').style.width = `${direct.coverage_pct}%`;

  // Nhóm 3: Dịch vụ sàn & vận chuyển
  const market = v2.marketplace_fee;
  document.getElementById('market-bar-amount').innerText = formatVND(market.total);
  document.getElementById('market-count-stat').innerText = market.count.toLocaleString('vi-VN');
  document.getElementById('market-progress-fill').style.width = `${market.coverage_pct}%`;

  // Update Badges on Tabs
  const badgeDirect = document.getElementById('badge-direct-count');
  if (badgeDirect) badgeDirect.innerText = `${direct.count} GD`;

  const badgeCogs = document.getElementById('badge-cogs-count');
  if (badgeCogs) badgeCogs.innerText = `${cogs.count} phiếu`;

  const badgeMarket = document.getElementById('badge-market-count');
  if (badgeMarket) badgeMarket.innerText = `${market.count} GD`;

  const badgeMisa = document.getElementById('badge-misa-count');
  if (badgeMisa) badgeMisa.innerText = `${misa.pending_count.toLocaleString('vi-VN')} chờ book`;

  document.getElementById('hub-summary-text').innerText = 
    `Chuẩn hóa Meeting 3: ${cogs.count} phiếu kho COGS | ${direct.count} chi phí trực tiếp | ${misa.pending_count} settlement MISA`;
}

function renderGauge(coverageRatio, missingRatio, documentedExpense, missingExpense) {
  document.getElementById('gauge-center-pct').innerText = `${coverageRatio}%`;
  document.getElementById('legend-documented').innerText = formatVND(documentedExpense);
  document.getElementById('legend-missing').innerText = formatVND(missingExpense);

  const canvas = document.getElementById('gaugeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (gaugeChartInstance) {
    gaugeChartInstance.destroy();
  }

  gaugeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Đã có chứng từ', 'Chênh lệch thiếu'],
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

// =============================================================================
// VIEW 3: ACTION HUB DISPATCHER & TABLE RENDERERS (MEETING 3)
// =============================================================================

async function renderActiveTab() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  if (!thead || !tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--text-muted);">Đang truy vấn dữ liệu theo chuẩn Meeting 3 từ Supabase...</td></tr>`;

  switch (state.tab) {
    case 'suppliers':
      await renderSuppliersTab(thead, tbody);
      break;
    case 'direct':
      await renderDirectExpenseTab(thead, tbody);
      break;
    case 'cogs_items':
      await renderCogsItemsTab(thead, tbody);
      break;
    case 'marketplace':
      await renderMarketplaceTab(thead, tbody);
      break;
    case 'misa':
      await renderMisaTab(thead, tbody);
      break;
    default:
      await renderSuppliersTab(thead, tbody);
  }
}

// -----------------------------------------------------------------------------
// TAB 1: ĐÍCH DANH NHÀ CUNG CẤP MUA HÀNG (SUPPLIERS - COGS)
// -----------------------------------------------------------------------------
async function renderSuppliersTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 240px;">Tên Nhà Cung Cấp / Xưởng May</th>
      <th style="width: 150px; text-align: right;">Giá Trị Nhập Mua Kho</th>
      <th style="width: 140px; text-align: right;">Đã Có Hóa Đơn</th>
      <th style="width: 150px; text-align: right;">Còn Thiếu Cần Đòi</th>
      <th style="width: 150px;">Tiến Độ Hóa Đơn</th>
      <th style="width: 120px; text-align: center;">Số Phiếu Kho</th>
      <th style="width: 170px; text-align: center;">Hành Động Khuyến Nghị</th>
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">Không tìm thấy dữ liệu nhà cung cấp nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data.map(s => {
    const pct = s.coverage_pct;
    const progressColor = pct >= 80 ? 'var(--accent-emerald)' : (pct >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)');

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#FFFFFF; font-size:13.5px;">${escapeHtml(s.ten_ncc)}</div>
          <div style="font-size:11px; color:var(--text-muted);">Nhà cung cấp vải / gia công xưởng may</div>
        </td>
        <td style="text-align: right;" class="table-amount num-tabular">${formatVND(s.gia_tri_kho)}</td>
        <td style="text-align: right;" class="table-amount success num-tabular">${formatVND(s.tien_hoa_don)}</td>
        <td style="text-align: right;" class="table-amount danger num-tabular">${formatVND(s.thieu_chung_tu)}</td>
        <td>
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
            <span style="color:${progressColor}; font-weight:700;">${pct}%</span>
            <span style="color:var(--text-muted); font-size:10.5px;">${s.status_tag}</span>
          </div>
          <div class="progress-bar-bg" style="height:5px; margin-bottom:0;">
            <div style="width:${pct}%; background:${progressColor}; height:100%; border-radius:4px;"></div>
          </div>
        </td>
        <td style="text-align: center; color:#94A3B8; font-weight:600;">${s.so_dong_kho} phiếu</td>
        <td style="text-align: center;">
          <button class="btn-action btn-secondary" onclick="copySupplierReminder('${escapeHtml(s.ten_ncc)}', ${s.thieu_chung_tu})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            ${escapeHtml(s.action_advice)}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 2: CHI PHÍ VẬN HÀNH TRỰC TIẾP NGÂN HÀNG (DIRECT EXPENSE)
// -----------------------------------------------------------------------------
async function renderDirectExpenseTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 100px;">Ngày</th>
      <th style="width: 220px;">Đơn Vị / Đối Tác Thụ Hưởng</th>
      <th style="width: 160px;">Phân Loại Chi Phí</th>
      <th style="width: 140px; text-align: right;">Số Tiền Chi</th>
      <th>Diễn Giải Nội Dung Chuyển Khoản</th>
      <th style="width: 160px; text-align: center;">Hành Động</th>
    </tr>
  `;

  const queryParams = new URLSearchParams({
    group: 'direct',
    search: state.search,
    min_amount: state.minAmount,
    page: state.page,
    limit: state.limit
  });

  const res = await fetchAPI(`/api/missing-docs?${queryParams.toString()}`);
  state.missingDocs = res;

  updatePagination(res.total, res.page, res.limit);

  if (!res.data || res.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">Không tìm thấy khoản chi trực tiếp nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data.map(item => {
    return `
      <tr>
        <td style="color:var(--text-secondary);">${formatDate(item.date)}</td>
        <td><strong style="color:#FFFFFF;">${escapeHtml(item.supplier)}</strong></td>
        <td><span class="badge-tag" style="background:rgba(244,63,94,0.12); color:#FB7185; border:1px solid rgba(244,63,94,0.25);">${escapeHtml(item.category)}</span></td>
        <td style="text-align: right;" class="table-amount danger num-tabular">${formatVND(item.amount)}</td>
        <td style="font-size:12px; color:#CBD5E1; max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.message)}">
          ${escapeHtml(item.message)}
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-invoice" onclick="openInvoiceModal('${item.id}', '${escapeHtml(item.supplier)}', ${item.amount}, '${escapeHtml(item.message)}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Gán Hóa Đơn GTGT
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 3: PHIẾU NHẬP KHO CẦN CHỨNG TỪ (COGS ITEMS)
// -----------------------------------------------------------------------------
async function renderCogsItemsTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 100px;">Ngày Nhập</th>
      <th style="width: 220px;">Nhà Cung Cấp / Xưởng May</th>
      <th style="width: 160px;">Vật Tư / Dịch Vụ</th>
      <th style="width: 140px; text-align: right;">Giá Trị Nhập Kho</th>
      <th>Diễn Giải Phiếu Nhập Sapo</th>
      <th style="width: 170px; text-align: center;">Hành Động</th>
    </tr>
  `;

  const queryParams = new URLSearchParams({
    group: 'cogs',
    search: state.search,
    min_amount: state.minAmount,
    page: state.page,
    limit: state.limit
  });

  const res = await fetchAPI(`/api/missing-docs?${queryParams.toString()}`);
  updatePagination(res.total, res.page, res.limit);

  if (!res.data || res.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">Không tìm thấy phiếu nhập kho nào cần xử lý.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data.map(item => {
    return `
      <tr>
        <td style="color:var(--text-secondary);">${formatDate(item.date)}</td>
        <td><strong style="color:#FFFFFF;">${escapeHtml(item.supplier)}</strong></td>
        <td><span class="badge-tag" style="background:rgba(99,102,241,0.12); color:#A5B4FC; border:1px solid rgba(99,102,241,0.25);">${escapeHtml(item.category)}</span></td>
        <td style="text-align: right;" class="table-amount num-tabular" style="color:var(--accent-indigo);">${formatVND(item.amount)}</td>
        <td style="font-size:12px; color:#CBD5E1; max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.message)}">
          ${escapeHtml(item.message)}
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-contract" onclick="openInvoiceModal('${item.id}', '${escapeHtml(item.supplier)}', ${item.amount}, '${escapeHtml(item.message)}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Đòi Hóa Đơn NCC
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 4: ĐỐI SOÁT PHÍ SÀN & VẬN CHUYỂN (MARKETPLACE - HĐ TỔNG THÁNG)
// -----------------------------------------------------------------------------
async function renderMarketplaceTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 140px;">Thời Gian GD</th>
      <th style="width: 140px;">Đơn Vị Vận Chuyển</th>
      <th style="width: 160px;">Loại Nghiệp Vụ</th>
      <th style="width: 140px; text-align: right;">Số Tiền Cấn Trừ</th>
      <th>Mã Đối Soát & Vận Đơn</th>
      <th style="width: 180px; text-align: center;">Phương Thức Quản Lý</th>
    </tr>
  `;

  const queryParams = new URLSearchParams({
    group: 'marketplace',
    search: state.search,
    limit: 50
  });

  const res = await fetchAPI(`/api/missing-docs?${queryParams.toString()}`);
  updatePagination(res.total, 1, 50);

  if (!res.data || res.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:36px; color:var(--text-muted);">Không tìm thấy bản ghi cấn trừ phí sàn nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data.map(item => {
    return `
      <tr>
        <td style="color:var(--text-secondary); font-size:12px;">${formatDate(item.date, true)}</td>
        <td><span class="badge-channel" style="background:rgba(14,165,233,0.15); color:#38BDF8; border:1px solid rgba(14,165,233,0.3);">${escapeHtml(item.supplier)}</span></td>
        <td style="color:#FFFFFF; font-weight:600;">${escapeHtml(item.category)}</td>
        <td style="text-align: right;" class="table-amount num-tabular" style="color:#38BDF8;">${formatVND(item.amount)}</td>
        <td style="font-size:12px; color:#CBD5E1;">${escapeHtml(item.message)}</td>
        <td style="text-align: center;">
          <span class="badge-tag" style="background:rgba(16,185,129,0.15); color:#34D399; border:1px solid rgba(16,185,129,0.3); font-size:11.5px;">
            Gom Theo HĐ Tổng Tháng
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// TAB 5: LÔ ĐỒNG BỘ MISA BATCH PROCESSING (MEETING 3)
// -----------------------------------------------------------------------------
async function renderMisaTab(thead, tbody) {
  thead.innerHTML = `
    <tr>
      <th style="width: 180px;">Mã Giao Dịch</th>
      <th style="width: 100px;">Kênh Bán</th>
      <th style="width: 160px;">Mã Đơn Hàng</th>
      <th style="width: 130px; text-align: right;">Số Tiền Settlement</th>
      <th style="width: 140px;">Thời Điểm Phát Sinh</th>
      <th style="width: 140px; text-align: center;">Cờ MISA Booking</th>
      <th style="width: 160px; text-align: center;">Thao Tác Lô</th>
    </tr>
  `;

  const res = await fetchAPI('/api/misa/pending-settlements?limit=100');
  state.misaData = res;

  if (!res.data || res.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">Toàn bộ giao dịch settlement đã được book lên MISA thành công.</td></tr>`;
    return;
  }

  // Top Action Banner for MISA Batch Sync
  const topActionRow = `
    <tr style="background: rgba(16, 185, 129, 0.08); border-bottom: 2px solid rgba(16, 185, 129, 0.3);">
      <td colspan="5" style="padding: 14px 18px;">
        <div style="font-weight: 700; color: #34D399; font-size: 13.5px;">
          ⚡ Khuyến nghị Meeting 3: Xử lý theo lô nhỏ (Batch size: ${res.batch_size} bản ghi chưa cờ)
        </div>
        <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">
          Loại bỏ hoàn toàn việc quét lại 28.000 dòng đã hạch toán. Chỉ lọc <code>WHERE misa_booking IS NOT TRUE</code>.
        </div>
      </td>
      <td colspan="2" style="text-align: right; padding-right: 18px;">
        <button class="btn-action btn-contract" style="background: #10B981; border: none; color: #FFFFFF; font-weight: 700; padding: 7px 16px;" onclick="triggerMisaBatchBooking(${res.batch_size})">
          ⚡ Đánh Dấu Hạch Toán Lô Này (${res.batch_size} bản ghi)
        </button>
      </td>
    </tr>
  `;

  const rows = res.data.map(item => {
    const channelClass = item.channel === 'tiktok' ? 'tiktok' : 'shopee';
    const channelLabel = item.channel === 'tiktok' ? 'TikTok' : 'Shopee';

    return `
      <tr>
        <td style="font-family:'Plus Jakarta Sans', monospace; font-weight:600; color:#CBD5E1;">${item.txn_id}</td>
        <td><span class="badge-channel ${channelClass}">${channelLabel}</span></td>
        <td style="font-family:'Plus Jakarta Sans', monospace; color:#FFFFFF;">${item.order_id}</td>
        <td style="text-align: right;" class="table-amount success num-tabular">${formatVND(item.amount)}</td>
        <td style="color:var(--text-secondary); font-size:12px;">${formatDate(item.occurred_at, true)}</td>
        <td style="text-align: center;">
          <span class="badge-tag" style="background:rgba(244,63,94,0.15); color:#FB7185; border:1px solid rgba(244,63,94,0.3); font-weight:700;">
            Chưa Đánh Dấu (false)
          </span>
        </td>
        <td style="text-align: center;">
          <button class="btn-action btn-secondary" onclick="markSingleMisaBooked('${item.txn_id}')">
            Book MISA
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = topActionRow + rows;
}

async function triggerMisaBatchBooking(count) {
  try {
    const res = await fetch('/api/misa/mark-booked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txn_ids: ['batch_all'],
        voucher_no: `PKT-MISA-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
      })
    });
    const data = await res.json();
    showToast(`Đã hạch toán MISA & gắn cờ [misa_booking = true] cho ${count} giao dịch (Chứng từ: ${data.voucher_no})!`, 'success');
    renderActiveTab();
  } catch (err) {
    showToast(`Lỗi đồng bộ MISA: ${err.message}`, 'error');
  }
}

async function markSingleMisaBooked(txnId) {
  try {
    await fetch('/api/misa/mark-booked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txn_ids: [txnId] })
    });
    showToast(`Đã gắn cờ misa_booking = true cho ${txnId}!`, 'success');
    renderActiveTab();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
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

  if (!paginationBar) return;

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
// QUICK ACTION HELPERS
// =============================================================================

function copySupplierReminder(supplier, amount) {
  const text = `Kính gửi đối tác ${supplier}, hiện tại bộ phận kế toán Onesie / Verdency đang tiến hành quyết toán hóa đơn đầu vào. Khoản thanh toán trị giá ${formatVND(amount)} hiện vẫn đang thiếu hóa đơn GTGT hợp lệ. Nhờ bên mình xuất và gửi file XML/PDF hóa đơn sớm giúp công ty để hoàn thiện hồ sơ thuế. Xin cảm ơn!`;
  copyToClipboard(text, `Đã sao chép văn bản nhắc hóa đơn gửi cho ${supplier}`);
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
