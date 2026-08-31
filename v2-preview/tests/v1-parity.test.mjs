import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAmounts } from '../calculation-engine.js';

const CFG = {
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
    { cat:'其他所得',code:'92',localTax:false,hasNhi:false,hasUnion:false,hasNetLocal:false,foreignRate:20,hasNetForeign:true }
  ]
};

function v1Reference({ raw, code, identity, taxmode, union='no' }) {
  const isLocal = identity === 'local' || identity === 'foreign183';
  const isForeign = identity === 'foreign';
  const isNet = taxmode === 'net';
  const hasUnion = union === 'yes';
  const NHIB = CFG.nhib / 100;
  const salaryThr = CFG.salaryThreshold;
  const salaryRate = CFG.salaryRate / 100;
  const laborThr = CFG.laborThreshold;
  const laborRate = CFG.laborRate / 100;
  const nhiLaborThr = CFG.nhiLaborThreshold;
  const nhiSalaryThr = CFG.nhiSalaryThreshold;
  let company, taxAmt, nhiAmt = 0, net;

  const BUILTIN_CODES = ['50','9A','9B','53','91'];
  const customType = CFG.incomeTypes.find(t => t.code === code && !BUILTIN_CODES.includes(t.code));

  if (customType) {
    if (isForeign) {
      const rate = (customType.foreignRate || 20) / 100;
      if (!isNet) {
        company = raw;
        taxAmt = Math.round(raw * rate);
      } else if (customType.hasNetForeign) {
        company = Math.round(raw / (1 - rate));
        taxAmt = Math.round(company * rate);
      } else {
        company = raw;
        taxAmt = Math.round(raw * rate);
      }
      nhiAmt = 0;
      net = company - taxAmt;
    } else {
      if (!customType.localTax) {
        company = raw;
        taxAmt = 0;
        nhiAmt = 0;
        net = raw;
      } else {
        const taxRate = (customType.localRate || 10) / 100;
        const taxThreshold = customType.localThreshold || 20010;
        const nhiRate = (customType.hasNhi && !hasUnion) ? NHIB : 0;
        const nhiThreshold = customType.hasNhi ? CFG.nhiLaborThreshold : 999999999;
        if (!isNet) {
          company = raw;
          taxAmt = raw >= taxThreshold ? Math.round(raw * taxRate) : 0;
          nhiAmt = (nhiRate > 0 && raw >= nhiThreshold) ? Math.round(raw * nhiRate) : 0;
        } else {
          if (raw < taxThreshold) company = raw;
          else {
            const c = Math.round(raw / (1 - taxRate - (nhiRate || 0)));
            company = c >= taxThreshold ? c : raw;
          }
          taxAmt = company >= taxThreshold ? Math.round(company * taxRate) : 0;
          nhiAmt = (nhiRate > 0 && company >= nhiThreshold) ? Math.round(company * nhiRate) : 0;
        }
        net = company - taxAmt - nhiAmt;
      }
    }
  } else if (isForeign) {
    if (code === '50') {
      if (!isNet) {
        const rate = raw <= 44250 ? 0.06 : 0.18;
        company = raw;
        taxAmt = Math.round(raw * rate);
      } else {
        const boundary = Math.round(44250 * (1 - 0.06));
        const rate = raw <= boundary ? 0.06 : 0.18;
        company = Math.round(raw / (1 - rate));
        taxAmt = Math.round(company * rate);
      }
    } else if (code === '9A') {
      if (!isNet) {
        company = raw;
        taxAmt = Math.round(raw * 0.20);
      } else {
        company = Math.round(raw / (1 - 0.20));
        taxAmt = Math.round(company * 0.20);
      }
    } else if (code === '9B') {
      if (!isNet) {
        company = raw;
        taxAmt = raw <= 5000 ? 0 : Math.round(raw * 0.20);
      } else if (raw <= 5000) {
        company = raw;
        taxAmt = 0;
      } else {
        company = Math.round(raw / (1 - 0.20));
        taxAmt = Math.round(company * 0.20);
      }
    } else if (code === '91') {
      company = raw;
      taxAmt = Math.round(raw * 0.20);
    } else {
      throw new Error(`Foreign code ${code} intentionally excluded from parity test`);
    }
    net = company - taxAmt;
  } else {
    let taxRate, taxThreshold, nhiThreshold;
    if (code === '50') {
      taxRate = salaryRate;
      taxThreshold = salaryThr;
      nhiThreshold = nhiSalaryThr;
    } else if (code === '9A' || code === '9B') {
      taxRate = laborRate;
      taxThreshold = laborThr;
      nhiThreshold = nhiLaborThr;
    } else {
      taxRate = laborRate;
      taxThreshold = laborThr;
      nhiThreshold = 999999999;
    }
    const nhiRate = hasUnion ? 0 : NHIB;

    if (!isNet) {
      company = raw;
      taxAmt = raw >= taxThreshold ? Math.round(raw * taxRate) : 0;
      nhiAmt = (nhiRate > 0 && raw >= nhiThreshold) ? Math.round(raw * nhiRate) : 0;
    } else {
      if (code === '50') {
        if (raw < nhiThreshold) {
          company = raw;
        } else {
          const mid = Math.round(taxThreshold * (1 - nhiRate));
          if (raw < mid) company = Math.round(raw / (1 - nhiRate));
          else company = Math.round(raw / (1 - taxRate - nhiRate));
        }
      } else if (code === '9A' || code === '9B') {
        if (hasUnion) {
          if (raw < taxThreshold) company = raw;
          else {
            const c = Math.round(raw / (1 - taxRate));
            company = c >= taxThreshold ? c : raw;
          }
        } else {
          const nhiLimit = Math.round(nhiThreshold * (1 - nhiRate));
          if (raw < nhiLimit) company = raw;
          else {
            const c = Math.round(raw / (1 - taxRate - nhiRate));
            company = c >= taxThreshold ? c : raw;
          }
        }
      } else {
        if (raw < taxThreshold) company = raw;
        else {
          const c = Math.round(raw / (1 - taxRate));
          company = c >= taxThreshold ? c : raw;
        }
      }
      taxAmt = company >= taxThreshold ? Math.round(company * taxRate) : 0;
      nhiAmt = (nhiRate > 0 && company >= nhiThreshold) ? Math.round(company * nhiRate) : 0;
    }
    net = company - taxAmt - nhiAmt;
  }

  return { company, taxAmt, nhiAmt, net, extraCost: isNet ? company - net : 0 };
}

function v2Result(args) {
  const result = calculateAmounts({ raw:args.raw, cfg:CFG, state:{
    code:args.code,
    identity:args.identity,
    taxmode:args.taxmode,
    union:args.union || 'no',
    treatyEvaluation:null,
    documentsReady:false
  }});
  return { company:result.company, taxAmt:result.taxAmt, nhiAmt:result.nhiAmt, net:result.net, extraCost:result.extraCost };
}

function assertScenarioParity(scenario, max=120000) {
  for (let raw = 1; raw <= max; raw += 1) {
    const args = { ...scenario, raw };
    const expected = v1Reference(args);
    const actual = v2Result(args);
    try {
      assert.deepEqual(actual, expected);
    } catch (error) {
      error.message = `${error.message}\nScenario=${JSON.stringify(scenario)} raw=${raw}\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`;
      throw error;
    }
  }
}

const scenarios = [];
for (const identity of ['local','foreign183']) {
  for (const code of ['50','9A','9B']) {
    for (const taxmode of ['normal','net']) {
      for (const union of ['no','yes']) scenarios.push({ identity, code, taxmode, union });
    }
  }
  for (const code of ['53','92']) {
    for (const taxmode of ['normal','net']) scenarios.push({ identity, code, taxmode, union:'no' });
  }
  scenarios.push({ identity, code:'91', taxmode:'normal', union:'no' });
}
for (const code of ['50','9A','9B','92']) {
  for (const taxmode of ['normal','net']) scenarios.push({ identity:'foreign', code, taxmode, union:'no' });
}
scenarios.push({ identity:'foreign', code:'91', taxmode:'normal', union:'no' });

test('V2 非租稅協定計算核心逐元比對 V1：1～120,000 全部一致', { timeout: 60000 }, () => {
  for (const scenario of scenarios) assertScenarioParity(scenario);
});
