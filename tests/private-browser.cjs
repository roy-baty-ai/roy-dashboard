// Input and output stay outside the public repository. No private fixture is committed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const source = JSON.parse(fs.readFileSync(process.env.PRIVATE_JSON, 'utf8'));
const html = process.env.PRIVATE_HTML;
const parsed = require('../outbound-model.js').parse(source);
assert.equal(parsed.length, source.summary.case_count);
assert.equal(parsed.filter(c => c.state === 'ready').length, source.summary.ready_for_human_go);
assert.equal(parsed.filter(c => c.state === 'sent').length, source.summary.sent_cases_in_this_view);
assert.equal(parsed.filter(c => c.state === 'preparing').length, source.summary.unsent_cases_in_this_view);
assert.equal(parsed.filter(c => c.previewUrl).length, source.summary.existing_preview_url_count);
assert.equal(parsed.filter(c => c.imageRef).length, source.summary.sales_image_library_id_count);
(async () => {
 const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
 try {
  for (const width of [1440, 393]) {
   const page = await browser.newPage({ viewport: { width, height: 1000 } }); const external = [], errors = [], violations = [];
   page.on('request', r => { if (!r.url().startsWith('file:')) external.push(r.url()); });
   page.on('pageerror', e => errors.push(e.message));
   page.on('console', m => { if (m.text().includes('Content Security Policy')) violations.push(m.text()); });
   await page.goto('about:blank'); await page.setContent(fs.readFileSync(html, 'utf8'), { waitUntil: 'load' }); await page.waitForFunction(() => document.querySelectorAll('.case-card').length === 8);
   assert.equal(await page.locator('.ready .case-card').count(), 0); assert.equal(await page.locator('.preparing .case-card').count(), 7); assert.equal(await page.locator('.sent .case-card').count(), 1);
   const counts = await page.locator('#classification-counts').innerText();
   for (const s of ['Owned Presence 8件', '準備優先 5件', '適格予備 1件', '追加準備 1件', 'Preview URL 3件', '未設定 5件', '営業画像参照 3件']) assert.ok(counts.includes(s), s);
   for (const c of source.cases) {
    const card = page.locator('.case-card').filter({ has: page.getByRole('heading', { name: c.business_name, exact: true }) });
    assert.equal(await card.count(), 1);
    const texts = await card.innerText(); assert.ok(texts.includes(c.classification)); assert.ok(texts.includes(c.contact.email));
    if (!c.preview_url) assert.ok(texts.includes('未登録・要確認'));
    if (c.sales_image) assert.ok(texts.includes('添付参照・未取得／未プレビュー'));
    for (const g of c.missing_gates) assert.ok(texts.includes(g.label));
    await card.locator('summary').click(); assert.equal(await card.locator('pre').textContent(), c.email.body);
   }
   assert.equal(await page.locator('img').count(), 0); assert.equal(await page.locator('a[href^="http"]').count(), 0); assert.equal(await page.locator('[src^="libfile"]').count(), 0);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
   await page.screenshot({ path: `/workspace/roy-private/real-${width}.png`, fullPage: true }); await page.screenshot({ path: `/workspace/roy-private/top-${width}.png` });
   await page.locator('#outbound-search').fill(source.cases[0].business_name); assert.equal(await page.locator('.case-card').count(), 1);
   await page.locator('#outbound-search').fill(''); await page.locator('#outbound-filter').selectOption('ready'); assert.equal(await page.locator('.case-card').count(), 0);
   await page.locator('#outbound-filter').selectOption('sent'); assert.equal(await page.locator('.case-card').count(), 1);
   await page.locator('#clear-outbound').click(); assert.equal(await page.locator('.case-card').count(), 0);
   await page.goto('about:blank'); await page.setContent(fs.readFileSync(html, 'utf8'), { waitUntil: 'load' }); await page.waitForFunction(() => document.querySelectorAll('.case-card').length === 8);
   assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(violations, []);
   await page.close(); console.log(`PASS private actual-data ${width}px: 8 records, all bodies/gates exact, 0/7/1 states, OP8 and queues5/1/1, URL3/missing5, image refs3, no external requests/links, filters, clear/reopen, no overflow`);
  }
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
