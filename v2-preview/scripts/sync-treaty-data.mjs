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

async function fetchOfficial(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'MarieClaireAdmin-tax-calculator/2.0 (+GitHub Actions)' } });
  if (!response.ok) throw new Error(`財政部頁面回應 HTTP ${response.status}: ${url}`);
  return response.text();
}

function validateOfficialSnapshot(data, agreementsHtml, ratesHtml) {
  if (!agreementsHtml.includes('我國所得稅協定一覽表') || !ratesHtml.includes('權利金')) {
    throw new Error('官方頁面格式或標題異常。');
  }
  const agreementRows = tableRows(agreementsHtml);
  const rateRows = tableRows(ratesHtml);
  const missing = [];
  const changed = [];

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
      changed.push(`${country.nameZh}（設定 ${configuredRates.join('/')}%；官方欄位 ${rateRow.at(-1)}）`);
    }
  }

  if (missing.length) throw new Error(`官方頁面缺少既有國家：${missing.join('、')}`);
  if (changed.length) throw new Error(`權利金稅率疑似變動：${changed.join('；')}`);

  const officialRateCountryCount = rateRows.filter((cells) => /[\u3400-\u9fff]/.test(cells[0]) && cells[0] !== '無所得稅協定國家 Non-treaty Countries').length;
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
    const now = await writeStatus('success', '財政部協定清單與權利金稅率頁面驗證成功。', data.lastSuccessfulSync);
    data.lastSuccessfulSync = now;
    await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
    await writeStatus('success', '財政部協定清單與權利金稅率頁面驗證成功。', now);
    console.log(`Treaty data verified at ${now}`);
  } catch (error) {
    await writeStatus('failed', String(error.message || error), data.lastSuccessfulSync);
    console.error(error);
    process.exitCode = 2;
  }
}

await main();

