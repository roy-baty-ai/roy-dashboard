// Private input/output remain outside the public repository. No real fixture is committed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const source=JSON.parse(fs.readFileSync(process.env.PRIVATE_JSON,'utf8')),html=process.env.PRIVATE_HTML;
const parsed=require('../outbound-model.js').parse(source);
assert.equal(parsed.length,source.summary.case_count);
assert.equal(parsed.filter(c=>c.state==='ready').length,source.summary.ready_for_human_go);
assert.equal(parsed.filter(c=>c.state==='sent').length,source.summary.sent_cases_in_this_view);
assert.equal(parsed.filter(c=>c.state==='preparing').length,source.summary.unsent_cases_in_this_view-source.summary.ready_for_human_go);
assert.equal(parsed.filter(c=>c.previewUrl).length,source.summary.existing_preview_url_count);
assert.equal(parsed.filter(c=>c.imageRef).length,source.summary.sales_image_library_id_count);
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 for(const width of [1440,393]){
  const page=await browser.newPage({viewport:{width,height:1000}}),requests=[],errors=[],violations=[];
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('violates the following Content Security Policy'))violations.push(m.text());});
  await page.setContent(fs.readFileSync(html,'utf8'));await page.waitForSelector('#priority-rows tr');
  await page.locator('[data-view="cases"]').click();assert.equal(await page.locator('#all-rows tr').count(),parsed.length);
  for(const c of parsed){
   await page.locator('#all-rows .case-link').filter({hasText:c.businessName}).first().click();const card=page.locator('#drawer .case-card');
   const visible=await card.innerText();assert.ok(visible.includes(c.category||'未記録・要確認'));if(c.recipient)assert.ok(visible.includes(c.recipient));if(c.imageRef)assert.ok(visible.includes('添付参照・未取得／未プレビュー'));for(const gate of c.remaining)assert.ok(visible.includes(gate));
   await card.locator('summary').click();assert.equal(await card.locator('pre').textContent(),c.body||'未記録・要確認');await page.keyboard.press('Escape');
  }
  assert.equal(await page.locator('img').count(),0);assert.equal(await page.locator('a[href^="http"]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#outbound-search').fill(parsed[0].businessName);assert.equal(await page.locator('#all-rows .case-link').count(),1);await page.locator('#outbound-search').fill('');await page.locator('#outbound-filter').selectOption('ready');assert.equal(await page.locator('#all-rows .case-link').count(),source.summary.ready_for_human_go);
  await page.locator('[data-view="settings"]').click();await page.locator('#clear-outbound').click();assert.equal(await page.locator('.case-card').count(),0);assert.equal(await page.locator('.pin').count(),0);assert.equal(await page.locator('#all-rows tr').count(),0);
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);await page.close();console.log(`PASS offline private ${width}px: exact bodies/gates, counts, search/filter, clear, no requests/CSP errors/overflow`);
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1;});
