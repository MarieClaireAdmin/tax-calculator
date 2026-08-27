import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../finance-settings.js', import.meta.url), 'utf8');

test('v2 預覽版有財務設定入口與獨立模組', () => {
  assert.match(html, /id="finance-settings-trigger"/);
  assert.match(html, /finance-settings\.js/);
  assert.match(html, /finance-settings\.css/);
});

test('財務設定只寫 v2-preview config，不寫正式版 root config', () => {
  assert.match(js, /const CONFIG_PATH = 'v2-preview\/config\.json'/);
  assert.doesNotMatch(js, /const CONFIG_PATH = 'config\.json'/);
});

test('租稅協定設定為唯讀官方同步資訊', () => {
  assert.match(js, /不提供人工修改協定國家或權利金稅率/);
  assert.match(js, /treaty-data\.json/);
  assert.doesNotMatch(js, /saveTreaty/);
});

test('寫入設定時不包含 password', () => {
  assert.match(js, /delete configToSave\.password/);
});
