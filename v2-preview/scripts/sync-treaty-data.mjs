import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const previewRoot = path.resolve(directory, '..');
const dataPath = path.join(previewRoot, 'treaty-data.json');
const statusPath = path.join(previewRoot, 'treaty-sync-status.json');

const AGREEMENTS_URL = 'https://www.mof.gov.tw/singlehtml/191?cntId=63930';
const RATES_URL = 'https://www.mof.gov.tw/singlehtml/191?cntId=63931';

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#37;|&percnt;/gi, '%')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableRows(html) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeHtml(cell[1]))
  ).filter((cells) => cells.length >= 3);
}

function findCountryRow(rows, countryName) {
  return rows.find((cells) => cells[0].includes(countryName));
}

function numbers(value) {
  return [...value.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((match) => Number(match[1]));
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toOfficialDate(value) {
  return value.replaceAll('-', '/');
}

function validateDataIntegrity(data) {
  if (!Array.isArray(data.countries) || data.countries.length === 0) {
    throw new Error('treaty-data.json 沒有可用的協定國資料。');
  }

  const countryCodes = new Set();
  const countryNames = new Set();

  for (const country of data.countries) {
    if (!country.code || !country.nameZh || !Array.isArray(country.agreements) || country.agreements.length === 0) {
      throw new Error(`協定國資料結構不完整：${country.nameZh || country.code || '未知國家'}`);
    }
    if (countryCodes.has(country.code)) throw new Error(`協定國代碼重複：${country.code}`);
    if (countryNames.has(country.nameZh)) throw new Error(`協定國名稱重複：${country.nameZh}`);
    countryCodes.add(country.code);
    countryNames.add(country.nameZh);

    const ordered = [...country.agreements].sort((a, b) => a.applicableFrom.localeCompare(b.applicableFrom));
    let priorUntil = null;

    for (const agreement of ordered) {
      if (!isIsoDate(agreement.effectiveDate) || !isIsoDate(agreement.applicableFrom)) {
        throw new Error(`${country.nameZh}日期格式錯誤：effectiveDate=${agreement.effectiveDate}；applicableFrom=${agreement.applicableFrom}`);
      }
      if (agreement.applicableFrom < agreement.effectiveDate) {
        throw new Error(`${country.nameZh}適用日早於生效日：${agreement.applicableFrom} < ${agreement.effectiveDate}`);
      }
      if (agreement.applicableUntil) {
        if (!isIsoDate(agreement.applicableUntil)) throw new Error(`${country.nameZh} applicableUntil 日期格式錯誤：${agreement.applicableUntil}`);
        if (agreement.applicableUntil < agreement.applicableFrom) {
          throw new Error(`${country.nameZh}適用截止日早於適用起日：${agreement.applicableUntil} < ${agreement.applicableFrom}`);
        }
      }
      if (!agreement.royalty || !Number.isFinite(agreement.royalty.contentLicenseRate)) {
        throw new Error(`${country.nameZh}缺少圖文授權權利金稅率。`);
      }
      if (priorUntil && agreement.applicableFrom <= priorUntil) {
        throw new Error(`${country.nameZh}新舊協定適用期間重疊：${agreement.applicableFrom} <= ${priorUntil}`);
      }
      priorUntil = agreement.applicableUntil || null;
    }
  }
}

async function fetchOfficial(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'MarieClaireAdmin-tax-calculator/2.0 (+GitHub Actions)' } });
  if (!response.ok) throw new Error(`財政部頁面回應 HTTP ${response.status}: ${url}`);
  return response.text();
}

function validateOfficialSnapshot(data, agreementsHtml, ratesHtml) {
  validateDataIntegrity(data);

  if (!agreementsHtml.includes('我國所得稅協定一覽表') || !ratesHtml.includes('權利金')) {
    throw new Error('官方頁面格式或標題異常。');
  }

  const agreementRows = tableRows(agreementsHtml);
  const rateRows = tableRows(ratesHtml);
  const missing = [];
  const changedRates = [];
  const changedEffectiveDates = [];

  for (const country of data.countries) {
    const agreementRow = findCountryRow(agreementRows, country.nameZh);
    const rateRow = findCountryRow(rateRows, country.nameZh);
    if (!agreementRow || !rateRow) {
      missing.push(country.nameZh);
      continue;
    }

    const officialRates = numbers(rateRow.at(-1));
    const configuredRates = country.agreements.map((agreement) => agreement.royalty.contentLicenseRate);
    if (!configuredRates.every((rate) => officialRates.includes(rate))) {
      changedRates.push(`${country.nameZh}（設定 ${configuredRates.join('/')}%；官方欄位 ${rateRow.at(-1)}）`);
    }

    const officialEffectiveCell = agreementRow.at(-1);
    for (const agreement of country.agreements) {
      const configuredEffectiveDate = toOfficialDate(agreement.effectiveDate);
      if (!officialEffectiveCell.includes(configuredEffectiveDate)) {
        changedEffectiveDates.push(`${country.nameZh}（設定 ${configuredEffectiveDate}；官方生效日欄位 ${officialEffectiveCell}）`);
      }
    }
  }

  if (missing.length) throw new Error(`官方頁面缺少既有國家：${missing.join('、')}`);
  if (changedRates.length) throw new Error(`權利金稅率疑似變動：${changedRates.join('；')}`);
  if (changedEffectiveDates.length) throw new Error(`協定生效日期疑似變動或設定錯誤：${changedEffectiveDates.join('；')}`);

  const officialRateCountryCount = rateRows.filter((cells) =>
    /[\u3400-\u9fff]/.test(cells[0]) &&
    !cells[0].includes('無所得稅協定') &&
    numbers(cells.at(-1)).length > 0
  ).length;

  if (officialRateCountryCount !== data.countries.length) {
    throw new Error(`協定國數量已改變（官方 ${officialRateCountryCount}；目前資料 ${data.countries.length}），為避免誤判，保留最後成功版本並要求人工覆核。`);
  }
}

async function writeStatus(status, message, lastSuccessfulSync) {
  const now = new Date().toISOString();
  await writeFile(statusPath, `${JSON.stringify({
    status,
    lastAttemptAt: now,
    lastSuccessfulSync,
    message
  }, null, 2)}\n`);
  return now;
}

async function main() {
  const data = JSON.parse(await readFile(dataPath, 'utf8'));
  try {
    const [agreementsHtml, ratesHtml] = await Promise.all([
      fetchOfficial(AGREEMENTS_URL),
      fetchOfficial(RATES_URL)
    ]);
    validateOfficialSnapshot(data, agreementsHtml, ratesHtml);
    const successMessage = '財政部協定國清單、權利金稅率與協定生效日期驗證成功；本地日期區間結構檢查通過。';
    const now = await writeStatus('success', successMessage, data.lastSuccessfulSync);
    data.lastSuccessfulSync = now;
    await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
    await writeStatus('success', successMessage, now);
    console.log(`Treaty data verified at ${now}`);
  } catch (error) {
    await writeStatus('failed', String(error.message || error), data.lastSuccessfulSync);
    console.error(error);
    process.exitCode = 2;
  }
}

await main();
