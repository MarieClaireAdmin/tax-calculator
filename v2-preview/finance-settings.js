const OWNER = 'MarieClaireAdmin';
const REPO = 'tax-calculator';
const BRANCH = 'main';
const CONFIG_PATH = 'v2-preview/config.json';
const CONFIG_URL = 'config.json';
const STATUS_URL = 'treaty-sync-status.json';
const TREATY_URL = 'treaty-data.json';
const TOKEN_KEY = 'taxCalcV2GithubToken';
const PASSWORD_KEY = 'taxCalcV2FinancePassword';
const DEFAULT_PASSWORD = 'finance2026';

let financeConfig = null;
let treatyStatus = null;
let treatyData = null;
let activeTab = 'rates';

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('ghToken') || '';
}

function getFinancePassword() {
  const current = localStorage.getItem(PASSWORD_KEY);
  if (current) return current;
  try {
    const legacy = JSON.parse(localStorage.getItem('taxCalcFinal') || 'null');
    if (legacy?.password) return legacy.password;
  } catch (_) {}
  return DEFAULT_PASSWORD;
}

async function fetchJson(path) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadFinanceData() {
  financeConfig = await fetchJson(CONFIG_URL);
  [treatyStatus, treatyData] = await Promise.all([
    fetchJson(STATUS_URL).catch(() => null),
    fetchJson(TREATY_URL).catch(() => null)
  ]);
}

function injectModal() {
  if ($('finance-settings-overlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="finance-overlay hidden" id="finance-settings-overlay" role="dialog" aria-modal="true" aria-labelledby="finance-settings-title">
      <div class="finance-modal">
        <header class="finance-modal-top">
          <div>
            <p class="finance-eyebrow">FINANCE ADMIN</p>
            <h2 id="finance-settings-title">財務設定區</h2>
          </div>
          <button type="button" class="finance-icon-btn" id="finance-close" aria-label="關閉">×</button>
        </header>

        <section class="finance-login" id="finance-login">
          <label for="finance-password">請輸入財務設定密碼</label>
          <input type="password" id="finance-password" autocomplete="current-password" placeholder="密碼">
          <p class="finance-error hidden" id="finance-password-error">密碼錯誤，請重試。</p>
          <p class="finance-help">此密碼只用來區分設定介面；實際寫入 GitHub 仍需要有權限的 Token。</p>
          <div class="finance-actions">
            <button type="button" class="finance-primary" id="finance-login-button">確認</button>
            <button type="button" class="finance-secondary" id="finance-cancel-login">取消</button>
          </div>
        </section>

        <div class="finance-admin hidden" id="finance-admin">
          <nav class="finance-tabs" aria-label="財務設定分頁">
            <button type="button" data-finance-tab="rates">稅率參數</button>
            <button type="button" data-finance-tab="income">所得類別</button>
            <button type="button" data-finance-tab="items">費用內容</button>
            <button type="button" data-finance-tab="treaty">租稅協定資料</button>
            <button type="button" data-finance-tab="password">修改密碼</button>
            <button type="button" data-finance-tab="github">GitHub 設定</button>
          </nav>
          <div class="finance-body" id="finance-body"></div>
        </div>
      </div>
    </div>`);

  $('finance-close').addEventListener('click', closeFinanceSettings);
  $('finance-cancel-login').addEventListener('click', closeFinanceSettings);
  $('finance-login-button').addEventListener('click', verifyPassword);
  $('finance-password').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') verifyPassword();
  });
  $('finance-settings-overlay').addEventListener('click', (event) => {
    if (event.target === $('finance-settings-overlay')) closeFinanceSettings();
  });
  document.querySelectorAll('[data-finance-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.financeTab));
  });
}

async function openFinanceSettings() {
  injectModal();
  $('finance-settings-overlay').classList.remove('hidden');
  $('finance-login').classList.remove('hidden');
  $('finance-admin').classList.add('hidden');
  $('finance-password').value = '';
  $('finance-password-error').classList.add('hidden');
  $('finance-password').focus();
  try {
    await loadFinanceData();
  } catch (error) {
    $('finance-password-error').textContent = `設定資料載入失敗：${error.message}`;
    $('finance-password-error').classList.remove('hidden');
  }
}

function closeFinanceSettings() {
  $('finance-settings-overlay')?.classList.add('hidden');
}

function verifyPassword() {
  if (!financeConfig) return;
  if ($('finance-password').value !== getFinancePassword()) {
    $('finance-password-error').textContent = '密碼錯誤，請重試。';
    $('finance-password-error').classList.remove('hidden');
    return;
  }
  $('finance-password-error').classList.add('hidden');
  $('finance-login').classList.add('hidden');
  $('finance-admin').classList.remove('hidden');
  showTab('rates');
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-finance-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.financeTab === tab);
  });
  if (tab === 'rates') renderRates();
  if (tab === 'income') renderIncomeTypes();
  if (tab === 'items') renderItems();
  if (tab === 'treaty') renderTreatyStatus();
  if (tab === 'password') renderPassword();
  if (tab === 'github') renderGithub();
}

function numberField(id, label, value, step = '1') {
  return `<label class="finance-field"><span>${esc(label)}</span><input type="number" id="${id}" value="${esc(value)}" min="0" step="${step}"></label>`;
}

function renderRates() {
  $('finance-body').innerHTML = `
    <section class="finance-section">
      <h3>補充保費</h3>
      ${numberField('fin-nhib', '補充保費率（%）', financeConfig.nhib, '0.001')}
      ${numberField('fin-nhi-labor', '勞務補充保費起扣點（元）', financeConfig.nhiLaborThreshold)}
      ${numberField('fin-nhi-salary', '薪資補充保費起扣點（元）', financeConfig.nhiSalaryThreshold)}
    </section>
    <section class="finance-section">
      <h3>薪資所得扣繳</h3>
      ${numberField('fin-salary-threshold', '薪資扣繳起扣點（元）', financeConfig.salaryThreshold)}
      ${numberField('fin-salary-rate', '薪資扣繳稅率（%）', financeConfig.salaryRate, '0.1')}
    </section>
    <section class="finance-section">
      <h3>勞務所得扣繳</h3>
      ${numberField('fin-labor-threshold', '勞務扣繳起扣點（元）', financeConfig.laborThreshold)}
      ${numberField('fin-labor-rate', '勞務扣繳稅率（%）', financeConfig.laborRate, '0.1')}
    </section>
    ${savePanel('儲存稅率參數', 'finance-save-rates')}`;
  $('finance-save-rates').addEventListener('click', saveRates);
}

function savePanel(label, id) {
  return `<div class="finance-save-panel"><p>儲存後會更新 v2 預覽版設定，並重新載入本頁套用新設定。</p><button type="button" class="finance-primary" id="${id}">${esc(label)}</button><div class="finance-status" id="finance-save-status"></div></div>`;
}

async function saveRates() {
  financeConfig.nhib = Number($('fin-nhib').value);
  financeConfig.nhiLaborThreshold = Number($('fin-nhi-labor').value);
  financeConfig.nhiSalaryThreshold = Number($('fin-nhi-salary').value);
  financeConfig.salaryThreshold = Number($('fin-salary-threshold').value);
  financeConfig.salaryRate = Number($('fin-salary-rate').value);
  financeConfig.laborThreshold = Number($('fin-labor-threshold').value);
  financeConfig.laborRate = Number($('fin-labor-rate').value);
  await persistConfig('Update v2 finance tax parameters');
}

function builtinCode(code) {
  return ['50', '9A', '9B', '53', '91'].includes(code);
}

function renderIncomeTypes() {
  const rows = (financeConfig.incomeTypes || []).map((type, index) => {
    if (builtinCode(type.code)) {
      return `<div class="finance-card locked"><strong>${esc(type.cat)} (${esc(type.code)})</strong><small>內建規則固定</small></div>`;
    }
    return `<div class="finance-card" data-income-index="${index}">
      <div class="finance-inline">
        <input type="text" data-income-field="cat" value="${esc(type.cat)}" placeholder="所得類別名稱">
        <input type="text" data-income-field="code" value="${esc(type.code)}" placeholder="代碼">
        <button type="button" class="finance-danger" data-delete-income="${index}">刪除</button>
      </div>
      <div class="finance-mini-title">本國人規則</div>
      <div class="finance-check-grid">
        ${checkField('localTax', '有扣繳', type.localTax)}
        ${checkField('hasNhi', '補充保費', type.hasNhi)}
        ${checkField('hasUnion', '工會判斷', type.hasUnion)}
        ${checkField('hasNetLocal', '實拿版', type.hasNetLocal)}
      </div>
      <div class="finance-inline compact">
        <label>起扣點<input type="number" data-income-field="localThreshold" value="${esc(type.localThreshold ?? 20010)}" min="0"></label>
        <label>稅率 %<input type="number" data-income-field="localRate" value="${esc(type.localRate ?? 10)}" min="0" step="0.1"></label>
      </div>
      <div class="finance-mini-title">外國人規則</div>
      <div class="finance-inline compact">
        <label>外國人稅率 %<input type="number" data-income-field="foreignRate" value="${esc(type.foreignRate ?? 20)}" min="0" step="0.1"></label>
        <label class="finance-check"><input type="checkbox" data-income-field="hasNetForeign" ${type.hasNetForeign ? 'checked' : ''}> 實拿版</label>
      </div>
    </div>`;
  }).join('');

  $('finance-body').innerHTML = `
    <p class="finance-intro">內建所得類別維持原計算規則；可新增或調整公司自訂所得類別。</p>
    <div id="finance-income-list">${rows}</div>
    <button type="button" class="finance-add" id="finance-add-income">＋ 新增所得類別</button>
    ${savePanel('儲存所得類別', 'finance-save-income')}`;

  bindIncomeEvents();
  $('finance-add-income').addEventListener('click', () => {
    financeConfig.incomeTypes ||= [];
    financeConfig.incomeTypes.push({ cat: '', code: '', builtin: false, localTax: false, hasNhi: false, hasUnion: false, hasNetLocal: false, foreignRate: 20, hasNetForeign: false });
    renderIncomeTypes();
  });
  $('finance-save-income').addEventListener('click', async () => {
    syncIncomeInputs();
    financeConfig.incomeTypes = financeConfig.incomeTypes.filter((type) => type.cat?.trim() && type.code?.trim());
    await persistConfig('Update v2 finance income types');
  });
}

function checkField(field, label, checked) {
  return `<label class="finance-check"><input type="checkbox" data-income-field="${field}" ${checked ? 'checked' : ''}> ${esc(label)}</label>`;
}

function syncIncomeInputs() {
  document.querySelectorAll('[data-income-index]').forEach((card) => {
    const index = Number(card.dataset.incomeIndex);
    const target = financeConfig.incomeTypes[index];
    card.querySelectorAll('[data-income-field]').forEach((input) => {
      const field = input.dataset.incomeField;
      if (input.type === 'checkbox') target[field] = input.checked;
      else if (input.type === 'number') target[field] = Number(input.value);
      else target[field] = input.value;
    });
  });
}

function bindIncomeEvents() {
  document.querySelectorAll('[data-delete-income]').forEach((button) => {
    button.addEventListener('click', () => {
      syncIncomeInputs();
      financeConfig.incomeTypes.splice(Number(button.dataset.deleteIncome), 1);
      renderIncomeTypes();
    });
  });
}

function incomeOptions(selectedCode) {
  return (financeConfig.incomeTypes || []).map((type) => `<option value="${esc(type.code)}" ${type.code === selectedCode ? 'selected' : ''}>${esc(type.cat)} (${esc(type.code)})</option>`).join('');
}

function renderItems() {
  const rows = (financeConfig.items || []).map((item, index) => `
    <div class="finance-item-row" data-item-index="${index}">
      <input type="text" data-item-name value="${esc(item.name)}" placeholder="費用內容名稱">
      <select data-item-code>${incomeOptions(item.code)}</select>
      <button type="button" class="finance-danger" data-delete-item="${index}">刪除</button>
    </div>`).join('');

  $('finance-body').innerHTML = `
    <p class="finance-intro">新增、修改或刪除「選擇費用內容」中的項目。</p>
    <div id="finance-items-list">${rows}</div>
    <button type="button" class="finance-add" id="finance-add-item">＋ 新增費用內容</button>
    ${savePanel('儲存費用內容', 'finance-save-items')}`;

  document.querySelectorAll('[data-delete-item]').forEach((button) => {
    button.addEventListener('click', () => {
      syncItemInputs();
      financeConfig.items.splice(Number(button.dataset.deleteItem), 1);
      renderItems();
    });
  });
  $('finance-add-item').addEventListener('click', () => {
    syncItemInputs();
    const first = financeConfig.incomeTypes?.[0] || { cat: '薪資所得', code: '50' };
    financeConfig.items ||= [];
    financeConfig.items.push({ name: '', cat: first.cat, code: first.code });
    renderItems();
  });
  $('finance-save-items').addEventListener('click', async () => {
    syncItemInputs();
    financeConfig.items = financeConfig.items.filter((item) => item.name?.trim());
    await persistConfig('Update v2 finance items');
  });
}

function syncItemInputs() {
  document.querySelectorAll('[data-item-index]').forEach((row) => {
    const index = Number(row.dataset.itemIndex);
    const name = row.querySelector('[data-item-name]').value;
    const code = row.querySelector('[data-item-code]').value;
    const type = financeConfig.incomeTypes.find((candidate) => candidate.code === code);
    financeConfig.items[index] = { name, cat: type?.cat || '', code };
  });
}

function renderTreatyStatus() {
  const ok = treatyStatus?.status === 'success' && treatyData;
  const count = Array.isArray(treatyData?.countries) ? treatyData.countries.length : 0;
  const lastSync = (treatyData?.lastSuccessfulSync || treatyStatus?.lastSuccessfulSync || '').slice(0, 10) || '—';
  const pageUpdated = treatyData?.sourcePageUpdatedAt || '—';
  $('finance-body').innerHTML = `
    <div class="finance-treaty ${ok ? 'ok' : 'warn'}">
      <strong>${ok ? '官方租稅協定資料正常' : '官方租稅協定資料需注意'}</strong>
      <p>${esc(treatyStatus?.message || (ok ? '目前使用最近一次成功同步資料。' : '同步狀態無法取得。'))}</p>
    </div>
    <section class="finance-section">
      <h3>目前資料狀態</h3>
      <dl class="finance-kv">
        <div><dt>資料中的國家／地區</dt><dd>${count}</dd></div>
        <div><dt>最後成功同步</dt><dd>${esc(lastSync)}</dd></div>
        <div><dt>財政部頁面更新日</dt><dd>${esc(pageUpdated)}</dd></div>
      </dl>
    </section>
    <div class="finance-readonly-note">
      <strong>此區不提供人工修改協定國家或權利金稅率。</strong>
      <p>v2 的協定國家、適用日期與權利金優惠稅率由 <code>treaty-data.json</code> 官方同步資料判斷，避免與人工設定互相衝突。</p>
    </div>`;
}

function renderPassword() {
  $('finance-body').innerHTML = `
    <section class="finance-section">
      <h3>修改財務設定密碼</h3>
      <label class="finance-field"><span>新密碼</span><input type="password" id="finance-new-password-1" autocomplete="new-password"></label>
      <label class="finance-field"><span>確認新密碼</span><input type="password" id="finance-new-password-2" autocomplete="new-password"></label>
      <p class="finance-help">密碼只儲存在這台瀏覽器，不會寫入 GitHub。若換電腦，會使用預設密碼或該電腦既有設定。</p>
      <p class="finance-error hidden" id="finance-change-password-error"></p>
      <button type="button" class="finance-primary" id="finance-change-password">確認修改</button>
    </section>`;
  $('finance-change-password').addEventListener('click', () => {
    const p1 = $('finance-new-password-1').value;
    const p2 = $('finance-new-password-2').value;
    const error = $('finance-change-password-error');
    if (!p1) {
      error.textContent = '請輸入新密碼。';
      error.classList.remove('hidden');
      return;
    }
    if (p1 !== p2) {
      error.textContent = '兩次密碼不一致。';
      error.classList.remove('hidden');
      return;
    }
    localStorage.setItem(PASSWORD_KEY, p1);
    error.classList.add('hidden');
    showMessage('財務設定密碼已更新（僅此瀏覽器）。');
  });
}

function renderGithub() {
  const token = getToken();
  $('finance-body').innerHTML = `
    <section class="finance-section">
      <h3>GitHub 連線設定</h3>
      <p class="finance-intro">財務設定儲存目標固定為 <code>${CONFIG_PATH}</code>；正式版根目錄 <code>config.json</code> 不會由 v2 設定區修改。</p>
      <label class="finance-field"><span>GitHub Token</span><input type="password" id="finance-github-token" value="${esc(token)}" placeholder="github_pat_… 或 ghp_…"></label>
      <p class="finance-help">Token 只儲存在這台瀏覽器。建議使用只限本 Repo、Contents read/write 的 fine-grained token。</p>
      <p class="finance-error hidden" id="finance-github-error"></p>
      <div class="finance-actions">
        <button type="button" class="finance-primary" id="finance-save-token">儲存並測試 Token</button>
        <button type="button" class="finance-secondary" id="finance-clear-token">清除 Token</button>
      </div>
      <div class="finance-status" id="finance-github-status">${token ? '已找到瀏覽器中的 Token。' : '尚未設定 Token。'}</div>
    </section>`;
  $('finance-save-token').addEventListener('click', saveAndTestToken);
  $('finance-clear-token').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    $('finance-github-token').value = '';
    $('finance-github-status').textContent = 'Token 已從此瀏覽器清除。';
  });
}

async function saveAndTestToken() {
  const token = $('finance-github-token').value.trim();
  const error = $('finance-github-error');
  if (!token) {
    error.textContent = '請輸入 Token。';
    error.classList.remove('hidden');
    return;
  }
  try {
    const response = await githubFetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONFIG_PATH}?ref=${BRANCH}`, token);
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    localStorage.setItem(TOKEN_KEY, token);
    error.classList.add('hidden');
    $('finance-github-status').textContent = '✓ Token 可讀取 v2-preview/config.json；儲存設定時將使用這個 Token。';
  } catch (err) {
    error.textContent = `Token 測試失敗：${err.message}`;
    error.classList.remove('hidden');
  }
}

function githubFetch(url, token, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
}

async function persistConfig(message) {
  const status = $('finance-save-status');
  const token = getToken();
  if (!token) {
    status.textContent = '尚未設定 GitHub Token。請先到「GitHub 設定」。';
    status.classList.add('error');
    return;
  }
  status.classList.remove('error');
  status.textContent = '正在儲存…';
  try {
    const getResponse = await githubFetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONFIG_PATH}?ref=${BRANCH}`, token);
    if (!getResponse.ok) throw new Error(`讀取目前設定失敗（HTTP ${getResponse.status}）`);
    const current = await getResponse.json();
    const configToSave = structuredClone(financeConfig);
    delete configToSave.password;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(configToSave, null, 2))));
    const putResponse = await githubFetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${CONFIG_PATH}`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content, sha: current.sha, branch: BRANCH })
    });
    if (!putResponse.ok) {
      const body = await putResponse.json().catch(() => ({}));
      throw new Error(body.message || `GitHub HTTP ${putResponse.status}`);
    }
    status.textContent = '✓ 已儲存至 v2-preview/config.json，正在重新載入套用。';
    setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    status.textContent = `儲存失敗：${error.message}`;
    status.classList.add('error');
  }
}

function showMessage(message) {
  const box = document.createElement('div');
  box.className = 'finance-toast';
  box.textContent = message;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}

document.addEventListener('DOMContentLoaded', () => {
  injectModal();
  $('finance-settings-trigger')?.addEventListener('click', openFinanceSettings);
});
