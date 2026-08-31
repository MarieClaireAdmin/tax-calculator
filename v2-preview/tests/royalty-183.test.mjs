import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateAmounts } from '../calculation-engine.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

const cfg = {
  nhib: 2.11,
  nhiLaborThreshold: 20000,
  nhiSalaryThreshold: 29500,
  salaryThreshold: 90501,
  salaryRate: 5,
  laborThreshold: 20010,
  laborRate: 10,
  incomeTypes: [
    { cat:'薪資所得',code:'50' },
    { cat:'執行業務',code:'9A' },
    { cat:'執行業務',code:'9B' },
    { cat:'權利金',code:'53' },
    { cat:'機會中獎',code:'91' }
  ]
};

function calc(raw, taxmode='normal') {
  return calculateAmounts({
    raw,
    cfg,
    state: { code:'53', identity:'foreign183', taxmode, union:'no', treatyEvaluation:null, documentsReady:false }
  });
}

test('權利金 UI 保留外國個人滿 183 天選項', () => {
  assert.match(html, /name="payee-location" value="foreign183"/);
  assert.match(html, /外國個人，主張滿 183 天（視同台灣居住者）/);
});

test('權利金滿 183 天必須先通過兩項確認，不進租稅協定流程', () => {
  assert.match(app, /const foreignResident = S\.identity === 'foreign183';/);
  assert.match(app, /classList\.toggle\('hidden', !foreignResident\)/);
  assert.match(app, /if \(foreign\) onTreatyInput\(\);\s*else if \(!foreignResident\) goStep3\(\);/);
});

test('權利金滿 183 天沿用居住者小額免扣門檻：20,000 免扣', () => {
  const r = calc(20000, 'normal');
  assert.deepEqual(
    { company:r.company, taxAmt:r.taxAmt, nhiAmt:r.nhiAmt, net:r.net },
    { company:20000, taxAmt:0, nhiAmt:0, net:20000 }
  );
});

test('權利金滿 183 天：20,010 起按 10% 扣繳', () => {
  const r = calc(20010, 'normal');
  assert.deepEqual(
    { company:r.company, taxAmt:r.taxAmt, nhiAmt:r.nhiAmt, net:r.net },
    { company:20010, taxAmt:2001, nhiAmt:0, net:18009 }
  );
});

test('權利金滿 183 天實拿 20,010 沿用 V1 gross-up', () => {
  const r = calc(20010, 'net');
  assert.deepEqual(
    { company:r.company, taxAmt:r.taxAmt, nhiAmt:r.nhiAmt, net:r.net },
    { company:22233, taxAmt:2223, nhiAmt:0, net:20010 }
  );
});
