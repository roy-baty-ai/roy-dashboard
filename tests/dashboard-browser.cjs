const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const ready={businessName:'検証カフェ <img src=x onerror=alert(1)>',region:'東京都',category:'カフェ',status:'READY_FOR_HUMAN_GO',remainingChecks:[],readiness:{published:true,qa:true,gmail:true},previewUrl:'https://example.invalid/sample',lastVerifiedAt:'2026-10-08T09:00:00+09:00',salesBody:'端末内だけの検証本文',recipient:'private-test@example.invalid',nextAction:'初回送信の判断'};
const fixture={cases:[ready,{...ready,businessName:'同地域の検証',status:'NOT_READY',remainingChecks:['表示QA待ち']},{businessName:'所在地不明の検証',region:'関東',status:'NOT_READY'},{...ready,businessName:'沖縄の検証',region:'沖縄県',status:'SENT'}]};
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.geojson':'application/json'};
(async()=>{
  const server=http.createServer((req,res)=>{const filename=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',types[path.extname(filename)]||'text/plain');res.end(fs.readFileSync(filename));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    for(const width of [1440,393]){
      const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[],violations=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('console',m=>{if(m.text().includes('violates the following Content Security Policy'))violations.push(m.text());});
      await page.route('**/firebase/config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.RoyFirebaseConfig={enabled:false};'}));
      await page.goto(base);await page.waitForSelector('.sales-metric');
      assert.equal(await page.locator('.sales-metric').count(),4);assert.equal(await page.locator('.pin').count(),0);
      assert.ok((await page.locator('#sales-metrics').innerText()).includes('8件'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`/workspace/work/roy-preview/live-public-${width}.png`,fullPage:true});
      await page.locator('[data-view="settings"]').click();
      assert.equal(await page.locator('#firebase-import').isVisible(),false);
      await page.locator('#outbound-file').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
      await page.locator('[data-view="cases"]').click();assert.equal(await page.locator('#all-rows tr').count(),4);
      await page.locator('#all-rows .case-link').first().click();assert.equal(await page.locator('#drawer').isVisible(),true);
      assert.ok((await page.locator('#drawer').innerText()).includes(ready.recipient));assert.equal(await page.locator('#drawer img').count(),0);
      await page.locator('#drawer summary').click();assert.equal(await page.locator('#drawer pre').textContent(),ready.salesBody);await page.keyboard.press('Escape');
      await page.locator('#outbound-search').fill('沖縄');assert.equal(await page.locator('#all-rows tr').count(),1);await page.locator('#outbound-filter').selectOption('ready');assert.ok((await page.locator('#all-rows').innerText()).includes('該当する案件はありません'));await page.locator('#outbound-search').fill('');await page.locator('#outbound-filter').selectOption('all');
      await page.locator('[data-view="map"]').click();assert.equal(await page.locator('#full-map .pin').count(),2);assert.equal(await page.locator('#unmapped-cases button').count(),1);
      await page.locator('#full-map .pin').first().click();assert.equal(await page.locator('#drawer .group-case').count(),2);await page.locator('#drawer .group-case').first().click();assert.ok((await page.locator('#drawer').innerText()).includes(ready.businessName));await page.keyboard.press('Escape');
      await page.locator('#map-filter').selectOption('sent');assert.equal(await page.locator('#full-map .pin').count(),1);await page.locator('#map-filter').selectOption('all');
      await page.locator('.map-3d[data-map="full-map"]').click();await page.waitForFunction(()=>!document.querySelector('.map-3d[data-map="full-map"]').disabled);
      const three=await page.locator('#full-map canvas').count();console.log(`${width}px 3D: ${three?'WebGL rendered':'2D fallback'}`);
      await page.screenshot({path:`/workspace/work/roy-preview/live-map-${width}.png`,fullPage:true});
      if(three)await page.locator('.map-3d[data-map="full-map"]').click();
      await page.locator('[data-view="overview"]').click();await page.screenshot({path:`/workspace/work/roy-preview/live-private-test-${width}.png`,fullPage:true});
      await page.locator('[data-view="logs"]').click();assert.ok(await page.locator('#recent .event').count());
      await page.locator('[data-view="settings"]').click();await page.locator('#clear-outbound').click();assert.equal(await page.locator('.pin').count(),0);assert.equal(await page.locator('#all-rows tr').count(),0);assert.equal(await page.locator('#drawer-content').textContent(),'');assert.ok(!(await page.locator('body').textContent()).includes(ready.recipient));
      await page.locator('#outbound-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});await page.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('読み込みできません'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
      assert.ok(requests.every(url=>url.startsWith(base)),requests.filter(url=>!url.startsWith(base)).join('\n'));assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
      await page.goto(base+'/#map');await page.waitForSelector('#full-map .geo-land');assert.equal(await page.locator('#view-map').isVisible(),true);assert.equal(await page.locator('.pin').count(),0);
      await page.close();console.log(`PASS ${width}px: public counts, navigation, private import, details, search/filter, pins/group/Okinawa/unknown, clear, errors, no external requests/storage, no overflow`);
    }
    const fallback=await browser.newPage({viewport:{width:1440,height:1000}});
    await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};});
    await fallback.route('**/firebase/config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.RoyFirebaseConfig={enabled:false};'}));
    await fallback.goto(base+'/#map');await fallback.locator('.map-3d[data-map="full-map"]').click();await fallback.waitForFunction(()=>!document.querySelector('.map-3d[data-map="full-map"]').disabled);
    assert.equal(await fallback.locator('#full-map canvas').count(),0);assert.equal(await fallback.locator('#full-map .geographic-land').getAttribute('visibility'),null);assert.ok((await fallback.locator('#map-status').innerText()).includes('2D地図'));
    await fallback.close();console.log('PASS WebGL unavailable: 2D fallback remains visible');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
