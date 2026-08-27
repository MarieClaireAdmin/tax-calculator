import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoyaltyRate, evaluateTreaty } from '../treaty-engine.js';

const singapore = {
  agreements: [
    { label: '原協定', effectiveDate: '1982-01-01', applicableFrom: '1982-01-01', applicableUntil: '2026-12-31', royalty: { contentLicenseRate: 15 } },
    { label: '新約', effectiveDate: '2026-02-13', applicableFrom: '2027-01-01', royalty: { contentLicenseRate: 10 } }
  ]
};
const tuvalu = {
  agreements: [
    { label: '臺吐所得稅協定', effectiveDate: '2026-06-11', applicableFrom: '2027-01-01', royalty: { contentLicenseRate: 10 } }
  ]
};

test('新加坡 2026 年付款仍套原協定 15%', () => {
  const result = evaluateTreaty(singapore, '2026-08-27');
  assert.equal(result.status, 'applicable');
  assert.equal(result.treatyRate, 15);
});

test('新加坡 2027 年付款改套新約 10%', () => {
  const result = evaluateTreaty(singapore, '2027-01-01');
  assert.equal(result.status, 'applicable');
  assert.equal(result.treatyRate, 10);
});

test('吐瓦魯生效至適用前顯示尚未適用', () => {
  const result = evaluateTreaty(tuvalu, '2026-08-27');
  assert.equal(result.status, 'pending');
});

test('有協定但文件未齊仍使用 20%', () => {
  const treatyEvaluation = evaluateTreaty(singapore, '2027-01-01');
  const result = decideRoyaltyRate({ treatyEvaluation, documentsReady: false });
  assert.equal(result.treatyAvailable, true);
  assert.equal(result.canUseTreatyRate, false);
  assert.equal(result.rate, 20);
});

test('協定適用且文件齊備才使用優惠稅率', () => {
  const treatyEvaluation = evaluateTreaty(singapore, '2027-01-01');
  const result = decideRoyaltyRate({ treatyEvaluation, documentsReady: true });
  assert.equal(result.canUseTreatyRate, true);
  assert.equal(result.rate, 10);
});

test('同步失敗顯示異常且不自動套用優惠稅率', () => {
  const evaluation = evaluateTreaty(singapore, '2027-01-01', { status: 'failed' });
  assert.equal(evaluation.status, 'sync_error');
  assert.equal(decideRoyaltyRate({ treatyEvaluation: evaluation, documentsReady: true }).rate, 20);
});

