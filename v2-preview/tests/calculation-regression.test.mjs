import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAmounts } from '../calculation-engine.js';

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
    { cat:'機會中獎',code:'91' },
    { cat:'其他所得', code:'92', localTax:false, foreignRate:20, hasNetForeign:true }
  ]
};

const calc = (raw, code, identity, taxmode, union='no', extra={}) => calculateAmounts({
  raw,
  cfg,
  state: { code, identity, taxmode, union, documentsReady:false, treatyEvaluation:null, ...extra }
});

function pick(r) {
  return { company:r.company, taxAmt:r.taxAmt, nhiAmt:r.nhiAmt, net:r.net, extraCost:r.extraCost };
}

test('薪資 50：本國無工會實拿 30,000 沿用第一版分段 gross-up', () => {
  assert.deepEqual(pick(calc(30000,'50','local','net','no')),
    { company:30647, taxAmt:0, nhiAmt:647, net:30000, extraCost:647 });
});

test('薪資 50：本國無工會實拿 50,000 不得提早套 5% 所得稅', () => {
  assert.deepEqual(pick(calc(50000,'50','local','net','no')),
    { company:51078, taxAmt:0, nhiAmt:1078, net:50000, extraCost:1078 });
});

test('薪資 50：本國無工會實拿 88,590 仍在只反推補充保費區間', () => {
  assert.deepEqual(pick(calc(88590,'50','local','net','no')),
    { company:90500, taxAmt:0, nhiAmt:1910, net:88590, extraCost:1910 });
});

test('薪資 50：本國有工會實拿 30,000 不應 gross-up', () => {
  assert.deepEqual(pick(calc(30000,'50','local','net','yes')),
    { company:30000, taxAmt:0, nhiAmt:0, net:30000, extraCost:0 });
});

test('薪資 50：本國有工會實拿 90,000 不應提早扣 5%', () => {
  assert.deepEqual(pick(calc(90000,'50','local','net','yes')),
    { company:90000, taxAmt:0, nhiAmt:0, net:90000, extraCost:0 });
});

test('9A：本國有工會實拿 20,000 尚未達 20,010 起扣點', () => {
  assert.deepEqual(pick(calc(20000,'9A','local','net','yes')),
    { company:20000, taxAmt:0, nhiAmt:0, net:20000, extraCost:0 });
});

test('9A：本國有工會實拿 20,010 才開始 10% gross-up', () => {
  assert.deepEqual(pick(calc(20010,'9A','local','net','yes')),
    { company:22233, taxAmt:2223, nhiAmt:0, net:20010, extraCost:2223 });
});

test('9A：本國無工會實拿 20,000 沿用第一版稅加補充保費反推', () => {
  assert.deepEqual(pick(calc(20000,'9A','local','net','no')),
    { company:22756, taxAmt:2276, nhiAmt:480, net:20000, extraCost:2756 });
});

test('9B：境外單次 5,000 實拿仍免扣繳', () => {
  assert.deepEqual(pick(calc(5000,'9B','foreign','net','no')),
    { company:5000, taxAmt:0, nhiAmt:0, net:5000, extraCost:0 });
});

test('境外薪資：實拿 41,595 仍走 6%', () => {
  assert.deepEqual(pick(calc(41595,'50','foreign','net','no')),
    { company:44250, taxAmt:2655, nhiAmt:0, net:41595, extraCost:2655 });
});

test('其他所得 92：境外實拿 10,000 依設定 20% gross-up', () => {
  assert.deepEqual(pick(calc(10000,'92','foreign','net','no')),
    { company:12500, taxAmt:2500, nhiAmt:0, net:10000, extraCost:2500 });
});

test('權利金 53：協定適用且文件齊備才用優惠率', () => {
  const treatyEvaluation = { status:'applicable', treatyRate:10 };
  assert.deepEqual(pick(calc(10000,'53','foreign','net','no',{treatyEvaluation,documentsReady:true})),
    { company:11111, taxAmt:1111, nhiAmt:0, net:10000, extraCost:1111 });
});

test('權利金 53：有協定但文件未齊仍 20%', () => {
  const treatyEvaluation = { status:'applicable', treatyRate:10 };
  assert.deepEqual(pick(calc(10000,'53','foreign','net','no',{treatyEvaluation,documentsReady:false})),
    { company:12500, taxAmt:2500, nhiAmt:0, net:10000, extraCost:2500 });
});
