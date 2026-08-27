import { decideRoyaltyRate, evaluateTreaty } from './treaty-engine.js';

const DEFAULT_CONFIG = {
  nhib: 2.11, nhiLaborThreshold: 20000, nhiSalaryThreshold: 29500,
  salaryThreshold: 90501, salaryRate: 5, laborThreshold: 20010, laborRate: 10,
  incomeTypes: [
    { cat: '薪資所得', code: '50' }, { cat: '執行業務', code: '9A' },
    { cat: '執行業務', code: '9B' }, { cat: '權利金', code: '53' },
    { cat: '機會中獎', code: '91' }
  ],
  items: [
    { name: '購買圖片／文字使用費', cat: '權利金', code: '53' }
  ]
};

let CFG = DEFAULT_CONFIG;
let treatyData = null;
let syncStatus = { status: 'failed', message: '尚未取得同步狀態。' };
let S = freshState();

function freshState() {
  return { code: '', cat: '', identity: '', taxmode: '', union: '', treatyEvaluation: null, treatyKey: '', documentAvailability: '', documentsReady: false };
}

const $ = (id) => document.getElementById(id);
const money = (value) => `NT$ ${Math.round(Math.abs(value || 0)).toLocaleString('zh-TW')}`;
const activate = (id, on) => $(id).classList.toggle('inactive', !on);

async function fetchJson(path, fallback = null) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadTreatyData() {
  let loaded = null;
  try {
    loaded = await fetchJson('treaty-data.json');
    localStorage.setItem('taxTreatyLastKnownGood', JSON.stringify(loaded));
  } catch (error) {
    const cached = localStorage.getItem('taxTreatyLastKnownGood');
    if (cached) loaded = JSON.parse(cached);
    syncStatus = { status: 'failed', message: `資料檔載入失敗；${cached ? '已沿用此瀏覽器最後成功版本' : '且沒有可用的最後成功版本'}。` };
  }
  treatyData = loaded;
}

async function initialize() {
  const configPromise = fetchJson('config.json', DEFAULT_CONFIG).catch(() => DEFAULT_CONFIG);
  const statusPromise = fetchJson('treaty-sync-status.json').catch(() => ({ status: 'failed', message: '同步狀態檔無法載入。' }));
  CFG = Object.assign({}, DEFAULT_CONFIG, await configPromise);
  syncStatus = await statusPromise;
  await loadTreatyData();
  const lastAttempt = Date.parse(syncStatus.lastAttemptAt || '');
  if (syncStatus.status === 'success' && (!Number.isFinite(lastAttempt) || Date.now() - lastAttempt > 7 * 24 * 60 * 60 * 1000)) {
    syncStatus = { ...syncStatus, status: 'failed', message: '超過 7 天未完成官方資料驗證，已沿用最後成功版本。' };
  }
  renderSourceState();
  initContentSelect();
  initCountrySelect();
  bindEvents();
  $('payment-date').value = new Date().toISOString().slice(0, 10);
}

function renderSourceState() {
  const strip = $('source-strip');
  const isSuccess = syncStatus.status === 'success' && treatyData;
  strip.classList.toggle('success', isSuccess);
  strip.classList.toggle('failed', !isSuccess);
  if (isSuccess) {
    const date = (treatyData.lastSuccessfulSync || syncStatus.lastSuccessfulSync || '').slice(0, 10);
    $('source-text').textContent = `財政部官方資料｜最後成功同步 ${date}｜官方頁面更新 ${treatyData.sourcePageUpdatedAt || '—'}`;
  } else {
    $('source-text').textContent = `官方資料同步異常｜${syncStatus.message || '目前沿用最後成功版本'}`;
  }
}

function initContentSelect() {
  const groups = new Map();
  CFG.items.forEach((item) => {
    const key = `${item.cat}|${item.code}`;
    if (!groups.has(key)) groups.set(key, { cat: item.cat, code: item.code, items: [] });
    groups.get(key).items.push(item.name);
  });
  groups.forEach((group) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = `${group.cat} (${group.code})`;
    group.items.forEach((name) => {
      const option = document.createElement('option');
      option.value = JSON.stringify({ name, cat: group.cat, code: group.code });
      option.textContent = name;
      optgroup.appendChild(option);
    });
    $('sel-content').appendChild(optgroup);
  });
}

function initCountrySelect() {
  if (treatyData?.countries) {
    [...treatyData.countries]
      .sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh-Hant'))
      .forEach((country) => {
        const option = document.createElement('option');
        option.value = country.code;
        option.textContent = `${country.nameZh}｜${country.nameEn}`;
        $('sel-country').appendChild(option);
      });
  }
  const other = document.createElement('option');
  other.value = 'OTHER';
  other.textContent = '其他國家／地區（清單中沒有）';
  $('sel-country').appendChild(other);
}

function bindEvents() {
  $('sel-content').addEventListener('change', onContent);
  document.querySelectorAll('input[name="identity"]').forEach((node) => node.addEventListener('change', onRegularIdentity));
  document.querySelectorAll('input[name="payee-location"]').forEach((node) => node.addEventListener('change', onRoyaltyIdentity));
  $('chk183-1').addEventListener('change', on183Check);
  $('chk183-2').addEventListener('change', on183Check);
  $('sel-country').addEventListener('change', onTreatyInput);
  $('payment-date').addEventListener('change', onTreatyInput);
  document.querySelectorAll('input[name="document-availability"]').forEach((node) => node.addEventListener('change', onDocumentAvailability));
  document.querySelectorAll('input[name="taxmode"]').forEach((node) => node.addEventListener('change', onTaxMode));
  document.querySelectorAll('input[name="union"]').forEach((node) => node.addEventListener('change', onUnion));
  $('inp-amt').addEventListener('input', calculate);
}

function onContent() {
  const value = $('sel-content').value;
  $('auto-info').classList.toggle('hidden', !value);
  resetAllAfterContent();
  if (!value) return;
  const selected = JSON.parse(value);
  S.code = selected.code;
  S.cat = selected.cat;
  $('disp-cat').textContent = S.cat;
  $('disp-code').textContent = S.code;
  const royalty = S.code === '53';
  $('step2-title').textContent = royalty ? '台灣／境外給付對象' : '所得人身分';
  $('identity-regular').classList.toggle('hidden', royalty);
  $('identity-royalty').classList.toggle('hidden', !royalty);
  activate('blk2', true);
}

function resetAllAfterContent() {
  const saved = { code: S.code, cat: S.cat };
  S = Object.assign(freshState(), saved);
  document.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach((node) => { node.checked = false; });
  $('checklist-183').classList.add('hidden');
  $('treaty-wrap').classList.add('hidden');
  $('treaty-status').classList.add('hidden');
  $('treaty-documents').classList.add('hidden');
  $('sel-country').value = '';
  activate('blk3', false); activate('blk4', false); activate('blk5', false);
  clearResult();
}

function onRegularIdentity(event) {
  S.identity = event.target.value;
  $('checklist-183').classList.toggle('hidden', S.identity !== 'foreign183');
  $('chk183-1').checked = false; $('chk183-2').checked = false;
  resetFrom(3);
  if (S.identity === 'local' || S.identity === 'foreign') goStep3();
}

function onRoyaltyIdentity(event) {
  S.identity = event.target.value;
  const foreign = S.identity === 'foreign';
  $('treaty-wrap').classList.toggle('hidden', !foreign);
  resetFrom(3);
  if (foreign) onTreatyInput(); else goStep3();
}

function on183Check() {
  resetFrom(3);
  if ($('chk183-1').checked && $('chk183-2').checked) goStep3();
}

function findCountry(code) {
  if (code === 'OTHER') return { code: 'OTHER', nameZh: '其他國家／地區', agreements: [] };
  return treatyData?.countries?.find((country) => country.code === code) || null;
}

function onTreatyInput() {
  resetFrom(3);
  const code = $('sel-country').value;
  const paymentDate = $('payment-date').value;
  if (!code || !paymentDate) {
    $('treaty-status').classList.add('hidden');
    $('treaty-documents').classList.add('hidden');
    S.treatyEvaluation = null;
    return;
  }
  const treatyKey = `${code}|${paymentDate}`;
  if (S.treatyKey && S.treatyKey !== treatyKey) {
    document.querySelectorAll('input[name="document-availability"]').forEach((node) => { node.checked = false; });
    S.documentAvailability = '';
    S.documentsReady = false;
  }
  S.treatyKey = treatyKey;
  const country = findCountry(code);
  S.treatyEvaluation = evaluateTreaty(country, paymentDate, syncStatus);
  renderTreatyStatus(country, paymentDate);
  if (S.treatyEvaluation.status !== 'applicable' || S.documentAvailability) goStep3();
}

function renderTreatyStatus(country, paymentDate) {
  const evaluation = S.treatyEvaluation;
  const card = $('treaty-status');
  card.className = `status-card ${evaluation.status}`;
  $('status-pill').textContent = evaluation.label;
  $('status-rate').textContent = evaluation.status === 'applicable' ? '有租稅協定' : evaluation.status === 'sync_error' ? '需人工確認' : '本次適用 20%';
  let message = evaluation.message;
  const future = country?.agreements?.find((agreement) => agreement.applicableFrom > paymentDate);
  if (evaluation.status === 'applicable' && future) message += ` ${future.label}將自 ${future.applicableFrom} 起改為 ${future.royalty.contentLicenseRate}%。`;
  $('status-message').textContent = message;
  card.classList.remove('hidden');
  const canPrepare = evaluation.status === 'applicable';
  $('treaty-documents').classList.toggle('hidden', !canPrepare);
  if (canPrepare) $('document-treaty-rate').textContent = `${evaluation.treatyRate}%`;
  if (!canPrepare) {
    document.querySelectorAll('input[name="document-availability"]').forEach((node) => { node.checked = false; });
    S.documentAvailability = '';
    S.documentsReady = false;
  }
  updateDocumentDecisionDisplay();
}

function onDocumentAvailability(event) {
  resetFrom(3);
  S.documentAvailability = event.target.value;
  S.documentsReady = S.documentAvailability === 'yes';
  updateDocumentDecisionDisplay();
  goStep3();
}

function updateDocumentDecisionDisplay() {
  const decision = $('document-decision');
  decision.classList.remove('ready', 'no-docs', 'waiting');
  if (S.documentAvailability === 'yes') {
    decision.textContent = `已確認三份文件都可取得：本次可使用協定稅率 ${S.treatyEvaluation?.treatyRate}%。`;
    decision.classList.add('ready');
  } else if (S.documentAvailability === 'no') {
    decision.textContent = '無法確認三份文件都可取得：本次改用非協定稅率 20%。';
    decision.classList.add('no-docs');
  } else {
    decision.textContent = '請先選擇文件是否都能取得，才能繼續試算。';
    decision.classList.add('waiting');
  }
}

function resetFrom(step) {
  if (step <= 3) {
    S.taxmode = '';
    document.querySelectorAll('input[name="taxmode"]').forEach((node) => { node.checked = false; });
    activate('blk3', false);
  }
  if (step <= 4) {
    S.union = '';
    document.querySelectorAll('input[name="union"]').forEach((node) => { node.checked = false; });
    activate('blk4', false);
  }
  if (step <= 5) activate('blk5', false);
  clearResult();
}

function goStep3() {
  if (S.code === '91') {
    S.taxmode = 'normal';
    goStep4();
  } else activate('blk3', true);
}

function onTaxMode(event) {
  S.taxmode = event.target.value;
  resetFrom(4);
  goStep4();
}

function goStep4() {
  const isLocal = S.identity === 'local' || S.identity === 'foreign183';
  const needsUnion = isLocal && ['50', '9A', '9B'].includes(S.code);
  if (needsUnion) activate('blk4', true);
  else { S.union = 'no'; goStep5(); }
}

function onUnion(event) {
  S.union = event.target.value;
  resetFrom(5);
  goStep5();
}

function goStep5() {
  $('amt-label').textContent = S.taxmode === 'net' ? '輸入實拿金額' : '輸入所得額';
  $('inp-amt').value = '';
  activate('blk5', true);
  clearResult();
}

function clearResult() {
  $('result-area').classList.add('hidden');
  $('result-placeholder').classList.remove('hidden');
}

function calculate() {
  const raw = Number.parseFloat($('inp-amt').value);
  if (!(raw > 0) || $('blk5').classList.contains('inactive')) { clearResult(); return; }

  const isLocal = S.identity === 'local' || S.identity === 'foreign183';
  const isForeign = S.identity === 'foreign';
  const isNet = S.taxmode === 'net';
  const hasUnion = S.union === 'yes';
  const code = S.code;
  const NHIB = CFG.nhib / 100;
  let company = raw, taxAmt = 0, nhiAmt = 0, net = raw;
  const notes = [];
  let rateDecision = null;

  const builtinCodes = ['50', '9A', '9B', '53', '91'];
  const customType = CFG.incomeTypes?.find((type) => type.code === code && !builtinCodes.includes(type.code));

  if (customType) {
    if (isForeign) {
      const rate = (customType.foreignRate || 20) / 100;
      company = isNet && customType.hasNetForeign ? Math.round(raw / (1 - rate)) : raw;
      taxAmt = Math.round(company * rate);
      net = company - taxAmt;
      notes.push(`外國人稅率 ${rate * 100}%`);
    } else if (!customType.localTax) {
      notes.push('本國人免扣繳');
    } else {
      const taxRate = (customType.localRate || 10) / 100;
      const threshold = customType.localThreshold || 20010;
      const nhiRate = customType.hasNhi && !hasUnion ? NHIB : 0;
      if (isNet && raw >= threshold) company = Math.round(raw / (1 - taxRate - nhiRate));
      taxAmt = company >= threshold ? Math.round(company * taxRate) : 0;
      nhiAmt = nhiRate && company >= CFG.nhiLaborThreshold ? Math.round(company * nhiRate) : 0;
      net = company - taxAmt - nhiAmt;
    }
  } else if (isForeign) {
    if (code === '50') {
      const boundary = isNet ? Math.round(44250 * .94) : 44250;
      const rate = raw <= boundary ? .06 : .18;
      company = isNet ? Math.round(raw / (1 - rate)) : raw;
      taxAmt = Math.round(company * rate);
      notes.push(rate === .06 ? '稅率 6%（≤44,250）' : '稅率 18%（>44,250）');
    } else if (code === '9B' && raw <= 5000) {
      notes.push('單次給付 ≤5,000，免扣繳');
    } else if (code === '53') {
      rateDecision = decideRoyaltyRate({ treatyEvaluation: S.treatyEvaluation, documentsReady: S.documentsReady });
      const rate = rateDecision.rate / 100;
      company = isNet ? Math.round(raw / (1 - rate)) : raw;
      taxAmt = Math.round(company * rate);
      if (rateDecision.canUseTreatyRate) notes.push(`協定優惠稅率 ${rateDecision.rate}%（文件已齊）`);
      else if (rateDecision.treatyAvailable) notes.push('協定存在，但文件未齊，暫按 20%');
      else notes.push('本次付款按無協定稅率 20%');
    } else {
      const rate = .20;
      company = isNet ? Math.round(raw / (1 - rate)) : raw;
      taxAmt = Math.round(company * rate);
      notes.push('稅率 20%');
    }
    net = company - taxAmt;
  } else {
    let taxRate, taxThreshold, nhiThreshold;
    if (code === '50') { taxRate = CFG.salaryRate / 100; taxThreshold = CFG.salaryThreshold; nhiThreshold = CFG.nhiSalaryThreshold; }
    else if (code === '9A' || code === '9B') { taxRate = CFG.laborRate / 100; taxThreshold = CFG.laborThreshold; nhiThreshold = CFG.nhiLaborThreshold; }
    else { taxRate = CFG.laborRate / 100; taxThreshold = CFG.laborThreshold; nhiThreshold = Number.MAX_SAFE_INTEGER; }
    const nhiRate = hasUnion ? 0 : NHIB;
    if (isNet) {
      if (code === '50' && raw < nhiThreshold) company = raw;
      else if (raw >= Math.round(nhiThreshold * (1 - nhiRate))) company = Math.round(raw / (1 - taxRate - nhiRate));
      else if (raw >= taxThreshold) company = Math.round(raw / (1 - taxRate));
    }
    taxAmt = company >= taxThreshold ? Math.round(company * taxRate) : 0;
    nhiAmt = nhiRate && company >= nhiThreshold ? Math.round(company * nhiRate) : 0;
    net = company - taxAmt - nhiAmt;
    notes.push(taxAmt ? `扣繳稅率 ${taxRate * 100}%` : '未達起扣標準，免扣繳');
    if (hasUnion) notes.push('有工會，免扣補充保費');
  }

  $('r-company').textContent = money(company);
  $('r-tax').textContent = money(taxAmt);
  $('r-nhi').textContent = money(nhiAmt);
  $('r-extra').textContent = money(isNet ? company - net : 0);
  $('r-net').textContent = money(net);
  $('lbl-net').textContent = isNet ? '驗算後所得人實拿金額' : '給付淨額';
  $('r-note').textContent = notes.join('　·　');
  const decisionBox = $('rate-decision');
  if (rateDecision) {
    decisionBox.classList.remove('hidden');
    $('actual-rate').textContent = `${rateDecision.rate}%`;
    $('actual-rate-reason').textContent = rateDecision.canUseTreatyRate
      ? '租稅協定於付款日適用，且已確認三份文件都可取得。'
      : rateDecision.treatyAvailable
        ? '雖有租稅協定，但三份文件無法全部取得或尚未確認，因此改用非協定稅率。'
        : '付款日沒有可套用的租稅協定優惠。';
  } else decisionBox.classList.add('hidden');
  $('result-placeholder').classList.add('hidden');
  $('result-area').classList.remove('hidden');
}

initialize();
