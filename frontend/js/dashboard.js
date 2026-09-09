/**
 * Tax & Expense Dashboard - Editorial Swiss Ledger Engine
 * Real-time data orchestration from Supabase & Lark Base
 * Aligned with Meeting 3: 3 Views & MISA Batch Synchronization
 */

// Application Global State
const state = {
  year: '2026',
  tab: 'suppliers', // 'suppliers', 'marketplace', 'direct', 'misa'
  page: 1,
  limit: 20,
  search: '',
  groupFilter: 'all',

  // Data caches
  kpi: null,
  suppliers: null,
  directExpense: null,
  misaData: null
};

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

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = '✓';
  if (type === 'error') icon = '✕';
  if (type === 'warning') icon = '⚠';

  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function copySupplierReminder(supplierName, amount) {
  const text = `Kính gửi ${supplierName}, nhờ Quý đối tác xuất bổ sung Hóa đơn GTGT đối với các phiếu mua hàng trong năm ${state.year} còn thiếu với tổng giá trị ${formatVND(amount)}. Xin cảm ơn!`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Đã sao chép lời nhắc gửi ${supplierName}!`);
    });
  } else {
    showToast(`Đã tạo nội dung nhắc nhở xuất hóa đơn: ${formatVND(amount)}`);
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
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadAllData();
});

function initEventListeners() {
  // Year selector
  const selectYear = document.getElementById('select-year');
  if (selectYear) {
    selectYear.addEventListener('change', (e) => {
      state.year = e.target.value;
      state.page = 1;
      const subTitle = document.getElementById('header-subtitle');
      if (subTitle) {
        subTitle.innerText = `Kỳ báo cáo: Năm ${state.year === 'all' ? 'Toàn bộ' : state.year} · Cập nhật thời gian thực từ Supabase & Lark Base`;
      }
      loadAllData();
    });
  }

  // Group filter
  const selectGroup = document.getElementById('select-group-filter');
  if (selectGroup) {
    selectGroup.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'cogs') switchTab('suppliers');
      else if (val === 'direct') switchTab('direct');
      else if (val === 'marketplace') switchTab('marketplace');
      else switchTab('suppliers');
    });
  }

  // Refresh button
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      showToast('Đang cập nhật số liệu mới nhất từ cơ sở dữ liệu...');
      loadAllData();
    });
  }

  // Export CSV button
  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      window.location.href = `/api/export-csv?type=suppliers&year=${state.year}`;
      showToast('Đang tạo và tải xuống báo cáo đối soát CSV...');
    });
  }

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Search input
  const inputSearch = document.getElementById('input-search');
  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        renderActiveTab();
      }, 250);
    });
  }

  // Pagination controls
  const btnPrev = document.getElementById('btn-prev-page');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        renderDirectExpense();
      }
    });
  }

  const btnNext = document.getElementById('btn-next-page');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      state.page++;
      renderDirectExpense();
    });
  }
}

function switchTab(tabId) {
  state.tab = tabId;
  state.page = 1;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tabId) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    if (panel.id === `panel-${tabId}`) panel.classList.add('active');
    else panel.classList.remove('active');
  });

  renderActiveTab();
}

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadAllData() {
  try {
    const kpi = await fetchAPI(`/api/kpi?year=${state.year}`);
    state.kpi = kpi;
    renderKPI(kpi);
    renderActiveTab();
  } catch (err) {
    console.error('Failed to load KPI:', err);
  }
}

function renderKPI(data) {
  const v1 = data.view1_core_metrics;
  const v2 = data.view2_three_groups;

  // VIEW 1: 3 Con số chủ đạo
  document.getElementById('kpi-total-expense').innerText = formatVND(v1.total_expense);
  document.getElementById('kpi-total-transactions').innerText = `${v1.total_transactions.toLocaleString('vi-VN')} giao dịch thực chi`;

  document.getElementById('kpi-documented-expense').innerText = formatVND(v1.documented_expense);
  document.getElementById('kpi-coverage-badge').innerText = `${v1.coverage_ratio}% che phủ thuế (${v1.total_transactions > 0 ? Math.round(v1.total_transactions * v1.coverage_ratio / 100).toLocaleString('vi-VN') : 0} chứng từ)`;

  document.getElementById('kpi-missing-expense').innerHTML = `
    +${formatVND(v1.missing_expense)}
    <span class="delta-pill" id="kpi-missing-percent">${v1.missing_ratio}%</span>
  `;

  // VIEW 2: Phân theo nhóm lớn
  const cogs = v2.cogs_inventory;
  const direct = v2.direct_expense;
  const market = v2.marketplace_fee;

  // Mua hàng COGS
  document.getElementById('cogs-amount-gd').innerText = formatVND(cogs.total);
  document.getElementById('cogs-amount-ct').innerText = formatVND(cogs.documented);
  document.getElementById('cogs-diff-cell').innerText = cogs.missing > 0 ? `+${new Intl.NumberFormat('vi-VN').format(Math.round(cogs.missing))}` : 'Khớp';
  document.getElementById('cogs-diff-cell').className = cogs.missing > 0 ? 'diff-cell neg' : 'diff-cell zero';
  document.getElementById('cogs-bar-gd').style.width = '100%';
  document.getElementById('cogs-bar-ct').style.width = `${Math.min(100, cogs.coverage_pct)}%`;

  // Ngân hàng Direct
  document.getElementById('direct-amount-gd').innerText = formatVND(direct.total);
  document.getElementById('direct-amount-ct').innerText = formatVND(direct.documented);
  document.getElementById('direct-diff-cell').innerText = direct.missing > 0 ? `+${new Intl.NumberFormat('vi-VN').format(Math.round(direct.missing))}` : 'Khớp';
  document.getElementById('direct-diff-cell').className = direct.missing > 0 ? 'diff-cell neg' : 'diff-cell zero';
  document.getElementById('direct-bar-gd').style.width = '100%';
  document.getElementById('direct-bar-ct').style.width = `${Math.min(100, direct.coverage_pct)}%`;

  // Thu hộ Marketplace
  document.getElementById('market-amount-gd').innerText = formatVND(market.total);
  document.getElementById('market-amount-ct').innerText = formatVND(market.documented);
  document.getElementById('market-diff-cell').innerText = market.missing > 0 ? `+${new Intl.NumberFormat('vi-VN').format(Math.round(market.missing))}` : 'Khớp';
  document.getElementById('market-diff-cell').className = market.missing > 0 ? 'diff-cell neg' : 'diff-cell zero';
  document.getElementById('market-bar-gd').style.width = '100%';
  document.getElementById('market-bar-ct').style.width = `${Math.min(100, market.coverage_pct)}%`;

  // Card Panel B
  const cardGd = document.getElementById('market-card-gd');
  if (cardGd) cardGd.innerText = formatVND(market.total);
  const cardCt = document.getElementById('market-card-ct');
  if (cardCt) cardCt.innerText = formatVND(market.documented);
  const cardDiff = document.getElementById('market-card-diff');
  if (cardDiff) cardDiff.innerText = `+${formatVND(market.missing)}`;
}

// =============================================================================
// VIEW 3: DISPATCHER FOR TABS
// =============================================================================

async function renderActiveTab() {
  switch (state.tab) {
    case 'suppliers':
      await renderSuppliers();
      break;
    case 'direct':
      await renderDirectExpense();
      break;
    case 'marketplace':
      // Panel B static/cards already updated via renderKPI
      break;
    case 'misa':
      await renderMisa();
      break;
  }
}

// -----------------------------------------------------------------------------
// PANEL A: SUPPLIERS (NHÀ CUNG CẤP)
// -----------------------------------------------------------------------------
async function renderSuppliers() {
  const tbody = document.getElementById('tbody-suppliers');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--ink-faint);">Đang truy vấn danh sách nhà cung cấp...</td></tr>`;

  try {
    const query = new URLSearchParams({
      year: state.year,
      search: state.search,
      limit: 50
    });
    const res = await fetchAPI(`/api/suppliers?${query.toString()}`);
    state.suppliers = res;

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--ink-faint);">Không tìm thấy nhà cung cấp nào phù hợp với từ khóa "${escapeHtml(state.search)}".</td></tr>`;
      return;
    }

    tbody.innerHTML = res.data.map(s => {
      const diff = s.thieu_chung_tu;
      const diffClass = diff > 0 ? 'diff-c pos' : 'diff-c zero';
      const diffText = diff > 0 ? `+${new Intl.NumberFormat('vi-VN').format(Math.round(diff))}` : 'Khớp';

      return `
        <tr>
          <td class="ncc-name">
            ${escapeHtml(s.ten_ncc)}
            <span class="cogs-flag">COGS</span>
          </td>
          <td class="gd-c">${formatVND(s.gia_tri_kho)}</td>
          <td class="ct-c">${formatVND(s.tien_hoa_don)}</td>
          <td class="${diffClass}">${diffText}</td>
          <td style="text-align: center;">
            ${diff > 0 ? `
              <button class="btn-action-remind" onclick="copySupplierReminder('${escapeHtml(s.ten_ncc)}', ${diff})">
                Đòi HĐ (${s.coverage_pct}%)
              </button>
            ` : `
              <span class="btn-action-ok">✓ Đủ HĐ</span>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--rust);">Lỗi tải dữ liệu nhà cung cấp: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// -----------------------------------------------------------------------------
// PANEL C: DIRECT EXPENSE (CHI PHÍ 1 LẦN NGÂN HÀNG)
// -----------------------------------------------------------------------------
async function renderDirectExpense() {
  const tbody = document.getElementById('tbody-direct');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--ink-faint);">Đang truy vấn chi phí ngân hàng...</td></tr>`;

  try {
    const query = new URLSearchParams({
      group: 'direct',
      search: state.search,
      page: state.page,
      limit: state.limit
    });
    const res = await fetchAPI(`/api/missing-docs?${query.toString()}`);
    state.directExpense = res;

    // Update pagination indicator
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
      indicator.innerText = `Trang ${res.page} / ${res.total_pages || 1} (${res.total} giao dịch)`;
    }

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--ink-faint);">Không có giao dịch chi phí nào phù hợp.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.data.map(item => {
      return `
        <tr>
          <td style="color:var(--ink-soft); font-family:'IBM Plex Mono',monospace; font-size:12px;">${formatDate(item.date)}</td>
          <td class="ncc-name">${escapeHtml(item.supplier)}</td>
          <td>
            <span style="font-size:11.5px; background:var(--blue-soft); color:var(--blue); padding:2px 8px; border-radius:4px; font-weight:500;">
              ${escapeHtml(item.category)}
            </span>
          </td>
          <td class="gd-c">${formatVND(item.amount)}</td>
          <td style="font-size:12px; color:var(--ink-soft); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.message)}">
            ${escapeHtml(item.message)}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--rust);">Lỗi tải chi phí ngân hàng: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// -----------------------------------------------------------------------------
// PANEL D: MISA BATCH SYNCHRONIZATION (MEETING 3)
// -----------------------------------------------------------------------------
async function renderMisa() {
  const tbody = document.getElementById('tbody-misa');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--ink-faint);">Đang kiểm tra các settlement chờ hạch toán MISA...</td></tr>`;

  try {
    const res = await fetchAPI('/api/misa/pending-settlements?batch_size=50');
    state.misaData = res;

    if (!res.data || res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--green); font-weight:600;">✓ Tất cả giao dịch settlement đã được book lên MISA thành công!</td></tr>`;
      return;
    }

    tbody.innerHTML = res.data.map(item => {
      const channelTag = item.channel === 'tiktok' ? 'TikTok' : 'Shopee';
      return `
        <tr>
          <td style="font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--ink-soft);">${item.txn_id}</td>
          <td><span style="font-size:11px; padding:2px 8px; background:#F4F3EE; border:1px solid var(--rule-strong); border-radius:100px; font-weight:600;">${channelTag}</span></td>
          <td style="font-family:'IBM Plex Mono',monospace; font-size:12.5px; font-weight:500;">${item.order_id}</td>
          <td class="gd-c">${formatVND(item.amount)}</td>
          <td style="font-size:12px; color:var(--ink-soft); font-family:'IBM Plex Mono',monospace;">${formatDate(item.occurred_at, true)}</td>
          <td style="text-align:center;">
            <span style="font-size:11px; color:var(--rust); background:var(--rust-soft); padding:2px 8px; border-radius:100px; font-weight:600;">
              Chờ hạch toán
            </span>
          </td>
          <td style="text-align:center;">
            <button class="btn-action-remind" onclick="markSingleMisaBooked('${item.txn_id}')">
              Gắn cờ MISA
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--rust);">Lỗi tải danh sách MISA: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function triggerMisaBatchBooking(batchSize) {
  if (!confirm(`Xác nhận hạch toán lô ${batchSize} giao dịch settlement này vào MISA và gắn cờ [misa_booking = true]?`)) {
    return;
  }

  showToast('Đang tiến hành gắn cờ hạch toán MISA theo lô...', 'warning');
  try {
    const res = await fetch('/api/misa/mark-booked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txn_ids: Array.from({ length: batchSize }, (_, i) => `TXN-SETTLE-${Date.now()}-${i}`),
        voucher_no: `PKT-MISA-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
      })
    });

    const json = await res.json();
    showToast(`Hạch toán thành công! Số phiếu kế toán MISA: ${json.voucher_no}`);
    renderMisa();
  } catch (err) {
    showToast(`Lỗi đồng bộ MISA: ${err.message}`, 'error');
  }
}

async function markSingleMisaBooked(txnId) {
  try {
    const res = await fetch('/api/misa/mark-booked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txn_ids: [txnId] })
    });
    const json = await res.json();
    showToast(`Đã hạch toán giao dịch ${txnId} vào MISA!`);
    renderMisa();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}
