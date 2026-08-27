import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('文件警示文字與紅色三角訊號存在', () => {
  assert.match(html, />⚠</);
  assert.match(html, /請務必事先確認是否可以取得下列三個文件，才能使用優惠稅率/);
});

test('文件範本以新頁面開啟', () => {
  const links = [...html.matchAll(/<a[^>]+href="documents\.html"[^>]*>/g)].map((match) => match[0]);
  assert.ok(links.length >= 2);
  links.forEach((link) => assert.match(link, /target="_blank"/));
});

test('必須明確選擇文件可否全部取得', () => {
  assert.match(html, /name="document-availability" value="yes"/);
  assert.match(html, /name="document-availability" value="no"/);
  assert.match(html, /否，或目前還不確定/);
});

test('結果區顯示本次實際採用稅率', () => {
  assert.match(html, /本次實際採用稅率/);
  assert.match(html, /id="actual-rate"/);
});

