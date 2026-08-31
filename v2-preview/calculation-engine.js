import { decideRoyaltyRate } from './treaty-engine.js';

export function calculateAmounts({ raw, state, cfg }) {
  if (!(Number(raw) > 0)) return null;

  const S = state || {};
  const CFG = cfg || {};
  const amount = Number(raw);
  const isLocal = S.identity === 'local' || S.identity === 'foreign183';
  const isForeign = S.identity === 'foreign';
  const isNet = S.taxmode === 'net';
  const hasUnion = S.union === 'yes';
  const code = S.code;
  const NHIB = Number(CFG.nhib || 0) / 100;
  const salaryThr = Number(CFG.salaryThreshold || 0);
  const salaryRate = Number(CFG.salaryRate || 0) / 100;
  const laborThr = Number(CFG.laborThreshold || 0);
  const laborRate = Number(CFG.laborRate || 0) / 100;
  const nhiLaborThr = Number(CFG.nhiLaborThreshold || 0);
  const nhiSalaryThr = Number(CFG.nhiSalaryThreshold || 0);

  let company;
  let taxAmt;
  let nhiAmt = 0;
  let net;
  const notes = [];
  let rateDecision = null;

  const BUILTIN_CODES = ['50', '9A', '9B', '53', '91'];
  const customType = CFG.incomeTypes?.find((type) => type.code === code && !BUILTIN_CODES.includes(type.code));

  if (customType) {
    if (isForeign) {
      const rate = Number(customType.foreignRate || 20) / 100;
      if (!isNet) {
        company = amount;
        taxAmt = Math.round(amount * rate);
      } else if (customType.hasNetForeign) {
        company = Math.round(amount / (1 - rate));
        taxAmt = Math.round(company * rate);
      } else {
        company = amount;
        taxAmt = Math.round(amount * rate);
      }
      nhiAmt = 0;
      net = company - taxAmt;
      notes.push(`外國人稅率${(rate * 100).toFixed(0)}%`);
    } else {
      if (!customType.localTax) {
        company = amount;
        taxAmt = 0;
        nhiAmt = 0;
        net = amount;
        notes.push('本國人免扣繳');
      } else {
        const taxRate = Number(customType.localRate || 10) / 100;
        const taxThreshold = Number(customType.localThreshold || 20010);
        const nhiRate = customType.hasNhi && !hasUnion ? NHIB : 0;
        const nhiThreshold = customType.hasNhi ? nhiLaborThr : Number.MAX_SAFE_INTEGER;

        if (!isNet) {
          company = amount;
          taxAmt = amount >= taxThreshold ? Math.round(amount * taxRate) : 0;
          nhiAmt = nhiRate > 0 && amount >= nhiThreshold ? Math.round(amount * nhiRate) : 0;
        } else {
          if (amount < taxThreshold) {
            company = amount;
          } else {
            const candidate = Math.round(amount / (1 - taxRate - (nhiRate || 0)));
            company = candidate >= taxThreshold ? candidate : amount;
          }
          taxAmt = company >= taxThreshold ? Math.round(company * taxRate) : 0;
          nhiAmt = nhiRate > 0 && company >= nhiThreshold ? Math.round(company * nhiRate) : 0;
        }
        net = company - taxAmt - nhiAmt;
        if (taxAmt > 0) notes.push(`扣繳稅率${(taxRate * 100).toFixed(0)}%`);
        else notes.push('未達起扣標準，免扣繳');
      }
    }
  } else if (isForeign) {
    if (code === '50') {
      if (!isNet) {
        const rate = amount <= 44250 ? 0.06 : 0.18;
        company = amount;
        taxAmt = Math.round(amount * rate);
        notes.push(amount <= 44250 ? '稅率6%（≤44,250）' : '稅率18%（>44,250）');
      } else {
        const boundary = Math.round(44250 * (1 - 0.06));
        const rate = amount <= boundary ? 0.06 : 0.18;
        company = Math.round(amount / (1 - rate));
        taxAmt = Math.round(company * rate);
        notes.push(rate === 0.06 ? '稅率6%（≤44,250）' : '稅率18%（>44,250）');
      }
    } else if (code === '9A') {
      if (!isNet) {
        company = amount;
        taxAmt = Math.round(amount * 0.20);
      } else {
        company = Math.round(amount / (1 - 0.20));
        taxAmt = Math.round(company * 0.20);
      }
      notes.push('稅率20%');
    } else if (code === '9B') {
      if (!isNet) {
        company = amount;
        if (amount <= 5000) {
          taxAmt = 0;
          notes.push('單次給付≤5,000，免扣繳');
        } else {
          taxAmt = Math.round(amount * 0.20);
          notes.push('單次給付>5,000，稅率20%');
        }
      } else if (amount <= 5000) {
        company = amount;
        taxAmt = 0;
        notes.push('單次給付≤5,000，免扣繳');
      } else {
        company = Math.round(amount / (1 - 0.20));
        taxAmt = Math.round(company * 0.20);
        notes.push('稅率20%');
      }
    } else if (code === '53') {
      rateDecision = decideRoyaltyRate({
        treatyEvaluation: S.treatyEvaluation,
        documentsReady: S.documentsReady
      });
      const rate = rateDecision.rate / 100;
      if (!isNet) {
        company = amount;
        taxAmt = Math.round(amount * rate);
      } else {
        company = Math.round(amount / (1 - rate));
        taxAmt = Math.round(company * rate);
      }
      if (rateDecision.canUseTreatyRate) notes.push(`協定優惠稅率 ${rateDecision.rate}%（文件已齊）`);
      else if (rateDecision.treatyAvailable) notes.push('協定存在，但文件未齊，暫按 20%');
      else notes.push('本次付款按無協定稅率 20%');
    } else if (code === '91') {
      company = amount;
      taxAmt = Math.round(amount * 0.20);
      notes.push('稅率20%');
    }
    net = company - taxAmt;
  } else {
    let taxRate;
    let taxThreshold;
    let nhiThreshold;

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
      nhiThreshold = Number.MAX_SAFE_INTEGER;
    }

    const nhiRate = hasUnion ? 0 : NHIB;

    if (!isNet) {
      company = amount;
      taxAmt = amount >= taxThreshold ? Math.round(amount * taxRate) : 0;
      nhiAmt = nhiRate > 0 && amount >= nhiThreshold ? Math.round(amount * nhiRate) : 0;
    } else {
      if (code === '50') {
        if (amount < nhiThreshold) {
          company = amount;
        } else {
          const mid = Math.round(taxThreshold * (1 - nhiRate));
          if (amount < mid) company = Math.round(amount / (1 - nhiRate));
          else company = Math.round(amount / (1 - taxRate - nhiRate));
        }
      } else if (code === '9A' || code === '9B') {
        if (hasUnion) {
          if (amount < taxThreshold) {
            company = amount;
          } else {
            const candidate = Math.round(amount / (1 - taxRate));
            company = candidate >= taxThreshold ? candidate : amount;
          }
        } else {
          const nhiLimit = Math.round(nhiThreshold * (1 - nhiRate));
          if (amount < nhiLimit) {
            company = amount;
          } else {
            const candidate = Math.round(amount / (1 - taxRate - nhiRate));
            company = candidate >= taxThreshold ? candidate : amount;
          }
        }
      } else if (amount < taxThreshold) {
        company = amount;
      } else {
        const candidate = Math.round(amount / (1 - taxRate));
        company = candidate >= taxThreshold ? candidate : amount;
      }

      taxAmt = company >= taxThreshold ? Math.round(company * taxRate) : 0;
      nhiAmt = nhiRate > 0 && company >= nhiThreshold ? Math.round(company * nhiRate) : 0;
    }

    net = company - taxAmt - nhiAmt;
    if (taxAmt > 0) notes.push(`扣繳稅率${(taxRate * 100).toFixed(0)}%`);
    else notes.push('未達起扣標準，免扣繳');
    if (nhiRate > 0) {
      if (nhiAmt > 0) notes.push(`補充保費率${CFG.nhib}%`);
      else notes.push('未達補充保費起扣標準');
    }
    if (hasUnion) notes.push('有工會，免扣補充保費');
  }

  return {
    company,
    taxAmt,
    nhiAmt,
    net,
    extraCost: isNet ? company - net : 0,
    notes,
    rateDecision
  };
}
