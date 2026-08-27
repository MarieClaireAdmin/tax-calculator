export const STATUTORY_ROYALTY_RATE = 20;

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateTreaty(country, paymentDate, syncStatus = { status: 'success' }) {
  if (syncStatus.status !== 'success') {
    return {
      status: 'sync_error',
      label: '官方資料同步異常',
      treatyRate: null,
      agreement: null,
      message: '目前沿用最後一次成功同步的資料；請先由財務確認後再套用優惠稅率。'
    };
  }

  const paidAt = toDateOnly(paymentDate);
  if (!country || !paidAt) {
    return { status: 'incomplete', label: '請完成國家與付款日期', treatyRate: null, agreement: null };
  }

  const versions = Array.isArray(country.agreements) ? country.agreements : [];
  const applicable = versions
    .filter((agreement) => {
      const from = toDateOnly(agreement.applicableFrom);
      const until = toDateOnly(agreement.applicableUntil);
      return from && paidAt >= from && (!until || paidAt <= until);
    })
    .sort((a, b) => b.applicableFrom.localeCompare(a.applicableFrom))[0];

  if (applicable) {
    return {
      status: 'applicable',
      label: '目前適用',
      treatyRate: applicable.royalty.contentLicenseRate,
      agreement: applicable,
      message: `付款日可適用 ${applicable.label}；文件齊備後，圖文授權權利金上限稅率為 ${applicable.royalty.contentLicenseRate}%。`
    };
  }

  const pending = versions
    .filter((agreement) => {
      const effective = toDateOnly(agreement.effectiveDate);
      const from = toDateOnly(agreement.applicableFrom);
      return effective && from && paidAt >= effective && paidAt < from;
    })
    .sort((a, b) => a.applicableFrom.localeCompare(b.applicableFrom))[0];

  if (pending) {
    return {
      status: 'pending',
      label: '已生效尚未適用',
      treatyRate: null,
      agreement: pending,
      message: `${pending.label}已生效，但要到 ${pending.applicableFrom} 才適用；本次付款仍按無協定稅率判斷。`
    };
  }

  return {
    status: 'none',
    label: '無協定',
    treatyRate: null,
    agreement: null,
    message: '付款日沒有可適用的全面性所得稅協定，權利金稅率為 20%。'
  };
}

export function decideRoyaltyRate({ treatyEvaluation, documentsReady }) {
  const treatyAvailable = treatyEvaluation?.status === 'applicable' && Number.isFinite(treatyEvaluation.treatyRate);
  const canUseTreatyRate = treatyAvailable && documentsReady;
  return {
    treatyAvailable,
    documentsReady,
    canUseTreatyRate,
    rate: canUseTreatyRate ? treatyEvaluation.treatyRate : STATUTORY_ROYALTY_RATE
  };
}

