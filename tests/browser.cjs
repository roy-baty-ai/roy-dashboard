const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = { businessName: 'テスト専用事業者 <img src=x onerror=alert(1)>', category: '店舗', proposalValue: '見本を使った提案', preparation: '公開・QA未確認', status: 'READY_FOR_HUMAN_GO', recipient: 'private-test@example.invalid', salesBody: '内部本文\nこれはダミーです。', previewUrl: 'https://example.invalid/sample', salesImageUrl: 'https://example.invalid/image.png', remainingChecks: ['QA確認'], readiness: { published: false, qa: false, gmail: false } };
(async () => {
 const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  for (const width of [1440, 393]) {
   const page = await browser.newPage({ viewport: { width, height: 1000 } }); const requests = [], errors = [];
   page.on('request', r => requests.push(r.url())); page.on('pageerror', e => errors.push(e.message));
   await page.goto((process.env.DASHBOARD_URL || 'http://127.0.0.1:8765')); await page.waitForFunction(() => document.querySelectorAll('.sales-metric').length === 5);
   assert.equal(await page.locator('#private-outbound').isVisible(), false);
   assert.ok((await page.locator('#sales-metrics').innerText()).includes('$0'));
   await page.screenshot({ path: `/tmp/roy-public-${width}.png`, fullPage: true });
   const before = requests.length;
   const input = page.locator('#outbound-file');
   await input.setInputFiles({ name: 'outbound.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ cases: [base, { ...base, businessName: '送信済み検証', status: 'SENT' }] })) });
   await page.waitForFunction(() => document.querySelectorAll('.case-card').length === 2);
   assert.equal(await page.locator('.preparing .case-card').count(), 1); assert.equal(await page.locator('.sent .case-card').count(), 1); assert.equal(await page.locator('.ready .case-card').count(), 0);
   assert.equal(await page.locator('#outbound-cases img').count(), 0);
   await page.locator('.sales-body summary').first().click();
   assert.ok((await page.locator('.sales-body pre').first().innerText()).includes('内部本文'));
   assert.equal(requests.length, before, 'Local file must not make network requests');
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
   assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
   await page.screenshot({ path: `/tmp/roy-private-${width}.png`, fullPage: true });
   await page.locator('#outbound-search').fill('送信済み検証'); assert.equal(await page.locator('.case-card').count(), 1);
   await page.locator('#outbound-search').fill(''); await page.locator('#outbound-filter').selectOption('ready'); assert.equal(await page.locator('.case-card').count(), 0);
   await page.locator('#clear-outbound').click(); assert.equal(await page.locator('#private-outbound').isVisible(), false); assert.equal(await page.locator('.case-card').count(), 0);
   await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') }); await page.waitForFunction(() => document.querySelector('#import-status').textContent.includes('読み込みできません'));
   assert.equal(await page.locator('#private-outbound').isVisible(), false);
   assert.deepEqual(errors, []);
   await page.close(); console.log(`PASS browser ${width}px: import, XSS, no upload/storage, filters, clear, errors, layout`);
  }
  const page = await browser.newPage(); await page.route('**/outbound-summary.json', r => r.abort()); await page.goto((process.env.DASHBOARD_URL || 'http://127.0.0.1:8765')); await page.waitForFunction(() => document.querySelector('#sales-metrics').textContent.includes('不明')); await page.close(); console.log('PASS summary fetch failure shows unknown');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
