// Local Chrome + synthetic SDK only. No Firebase request or private fixture is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const testOnly=process.env.DISPLAY_TEST_SPACE==='synthetic';
const mock=`
const uid='atmDvobZO2U0T5VKrsAe69tEkdt1',auth={currentUser:null},authListeners=new Set(),listeners=new Set(),retired=new Set();
let staleDelivered=0;
let mode='missing';
const base='privateRoy/${testOnly?'synthetic':'real'}';
const row=(id,name,sent,sales)=>({id,business_name:name,sent,status:sent?'SENT_WAITING':'NOT_READY',readiness:sent?'SENT_WAITING':'NOT_READY',confirmed_revenue_usd:0,sent_evidence:sent?{kind:'synthetic'}:null,confirmed_gates:[],missing_gates:[],restrictions:['架空限定'],preview_url:null,last_checked_at:id==='roy-web-0001'?'2026-10-12T10:00:00Z':null,next_action:'架空の次の作業',internal_note:'PRIVATE_MARKER_NOTE',gate_checks:{},email:sent?{body:'PRIVATE_MARKER_BODY',sent_at:'2026-10-13T15:22+09:00',sent_at_precision:'minute'}:{},contact:{email:'private-marker@example.invalid'},sales,region:null,location:null});
const rows=[row('roy-web-0001','PRIVATE_MARKER_A',true,{stage:'interested',evidence:'架空の見本希望返信'}),row('roy-web-0002','PRIVATE_MARKER_B',false,{stage:'hold',evidence:'架空の保留根拠'}),row('roy-web-0003','PRIVATE_MARKER_C',true,{stage:'paid'})];
const data=p=>p==='admins/'+uid?{enabled:true}:p===base+'/control/state'?{mode:'paused',allowSourceIngest:false}:p===base+'/registry/current'?(mode==='missing'?null:{caseIds:mode==='empty'?[]:rows.map(r=>r.id),revision:1}):rows.some(r=>p===base+'/cases/'+r.id)?{payload:{...rows.find(r=>p===base+'/cases/'+r.id),...(mode==='unknownRevenue'?{confirmed_revenue_usd:null}:{})},revision:1,updatedAt:{toDate:()=>new Date('2026-10-13T19:00:00Z')}}:null;
const deliver=x=>{if(mode==='denied'&&x.p.startsWith(base+'/')){x.error?.(Object.assign(Error('synthetic denial'),{code:'permission-denied'}));return;}const value=data(x.p);x.next({metadata:{fromCache:mode==='cached',hasPendingWrites:false},exists:()=>value!==null,data:()=>value});};
export const initializeApp=()=>({}),getAuth=()=>auth,initializeFirestore=()=>({}),memoryLocalCache=()=>({}),inMemoryPersistence={},setPersistence=async()=>{},doc=(_,p)=>p,serverTimestamp=()=>null;
export function onIdTokenChanged(a,fn){authListeners.add(fn);queueMicrotask(()=>fn(auth.currentUser));return()=>authListeners.delete(fn);}
export function onSnapshot(p,o,next,error){const x={p,next,error};listeners.add(x);queueMicrotask(()=>{if(listeners.has(x))deliver(x);});return()=>{listeners.delete(x);retired.add(x);};}
export const runTransaction=async()=>{throw Error('Writes disabled in display test');};
export class GoogleAuthProvider{};
export async function signInWithPopup(){auth.currentUser={uid};for(const fn of [...authListeners])fn(auth.currentUser);}
export async function signOut(){const stale=[...retired,...listeners];retired.clear();auth.currentUser=null;for(const fn of [...authListeners])fn(null);setTimeout(()=>stale.forEach(x=>{staleDelivered++;deliver(x);}),25);}
window.__displayTest={completeWork(){rows[0].next_action='Synthetic next work after QA';rows[0].internal_note='ROY_WORK_RESULT '+JSON.stringify({progress:'Synthetic private QA completed',evidence:['Synthetic task evidence'],completedAt:null,receivedAt:'2026-10-14T02:00:00Z'});for(const x of [...listeners])if(x.p===base+'/cases/roy-web-0001')deliver(x);},setMode(value){mode=value;for(const x of [...listeners])if(x.p===base+'/registry/current')deliver(x);},staleDelivered:()=>staleDelivered,listenerCount:()=>listeners.size};
`;
const config='window.RoyFirebaseConfig='+JSON.stringify({enabled:true,storageVersion:2,testOnly,authProvider:'google',firebase:{apiKey:'synthetic',authDomain:'example.invalid',projectId:'demo-roy-local',appId:'synthetic'}})+';';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,attempts=120){for(let i=0;i<attempts;i++){if(await fn())return;await wait(50);}throw Error('Timed out: '+label);}
(async()=>{
 const output=process.env.BROWSER_RESULTS_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'roy-display-results-'));fs.mkdirSync(output,{recursive:true});
 const pendingSummaries=[];
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'roy-display-chrome-'));let chrome,ws,server;
 try{
  server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let body,mime;
   if(name==='/outbound-summary.json'){pendingSummaries.push(res);return;}
   if(name==='/__release-public-summary'){
    const fail=new URL(req.url,'http://localhost').searchParams.has('fail'),count=pendingSummaries.length;
    for(const pending of pendingSummaries.splice(0)){pending.writeHead(fail?503:200,{'Content-Type':'application/json'});pending.end(JSON.stringify({candidateCount:7,readyCount:2,preparingCount:4,sentCount:1,targetCount:10,confirmedRevenueUsd:9,note:'Synthetic public summary',verifiedAt:null}));}
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({released:count}));return;
   }
   if(name==='/vendor/firebase-sdk.js'){body=mock;mime='text/javascript';}
   else if(name==='/firebase/config.js'){body=config;mime='text/javascript';}
   else{const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}body=fs.readFileSync(file);mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';}
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(body);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const chromePath=process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
  const stderr=fs.openSync(path.join(output,'chrome.log'),'w');
  chrome=spawn(chromePath,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore','ignore',stderr]});fs.closeSync(stderr);
  await until(()=>{if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode+' before debug endpoint');return fs.existsSync(path.join(profile,'DevToolsActivePort'));},'Chrome debug endpoint',600);
  const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
  const page=await (await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000)});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const metricValues=()=>evaluate("[...document.querySelectorAll('#sales-metrics .sales-metric strong')].map(x=>x.textContent)");
  const assertScope=async privateVisible=>{
   assert.equal(await evaluate("document.querySelector('#data-scope').textContent"),privateVisible?(testOnly?'管理者専用の架空データ試験':'管理者専用の営業データ'):'公開可能な概要');
   assert.equal(await evaluate("document.querySelector('#footer-data-scope').textContent"),privateVisible?(testOnly?'SYNTHETIC TEST DATA · ADMIN ONLY':'PRIVATE SALES DATA · ADMIN ONLY'):'PUBLIC SUMMARY · PRIVATE DATA NOT DISPLAYED');
  };
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
  const results=[];
  for(const width of [1440,393,320]){
   await send('Page.navigate',{url:'about:blank'});await until(()=>evaluate("location.href==='about:blank'&&!window.__displayTest"),'fresh document');
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
   await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/#map'});
   await until(()=>evaluate("!!window.__displayTest && !document.querySelector('#firebase-login').disabled"),'application ready');await assertScope(false);assert.deepEqual(await metricValues(),[]);assert.match(await evaluate("document.querySelector('#sales-metrics').textContent"),/未取得/);
   assert.match(await evaluate("document.querySelector('#map-stats').textContent"),/未取得/);
   await evaluate("document.querySelector('[data-view=\"settings\"]').click();document.querySelector('#firebase-login').click()");
   await until(()=>evaluate("document.querySelector('#firebase-status').textContent.includes('未移行')"),'missing registry');
   assert.match(await evaluate("document.querySelector('#map-stats').textContent"),/未取得/);
   await evaluate("window.__displayTest.setMode('empty')");
   await until(()=>evaluate("document.querySelector('#map-stats').textContent.includes('読込案件 0件')"),'known empty');await assertScope(true);assert.match(await evaluate("document.querySelector('#private-sync-state').textContent"),/対象：0案件/);assert.deepEqual(await metricValues(),['0件','0件','0件','$0']);
   await evaluate("window.__displayTest.setMode('populated')");
   await until(()=>evaluate("document.querySelector('#map-stats').textContent.includes('読込案件 3件')"),'loaded records');await assertScope(true);
   const freshness=await evaluate("document.querySelector('#private-sync-state').textContent");assert.match(freshness,/対象：3案件/);assert.match(freshness,/2026-10-12T10:00:00Z/);assert.match(freshness,/記録あり 1\/3件/);assert.match(freshness,/2026-10-13T19:00:00.000Z/);assert.match(freshness,/書込停止/);assert.match(freshness,/最新確認を意味しません/);
   assert.deepEqual(await metricValues(),['3件','0件','2件','$0']);
   assert.match(await evaluate("document.querySelector('#sales-metrics').textContent"),/準備中 1件/);
   assert.equal(await evaluate("fetch('/__release-public-summary"+(width===320?'?fail=1':'')+"').then(r=>r.json()).then(r=>r.released)"),1);await wait(80);
   assert.deepEqual(await metricValues(),['3件','0件','2件','$0'],'late public response must not override private metrics');
   await evaluate("window.__displayTest.setMode('unknownRevenue')");await until(async()=>JSON.stringify(await metricValues())===JSON.stringify(['3件','0件','2件','未取得']),'unknown revenue is not zero');
   await evaluate("window.__displayTest.setMode('populated')");await until(async()=>JSON.stringify(await metricValues())===JSON.stringify(['3件','0件','2件','$0']),'fresh private metrics');
   await evaluate("document.querySelector('[data-view=\"map\"]').click()");
   const stats=await evaluate("document.querySelector('#map-stats').textContent");assert.match(stats,/所在地あり 0件 \/ 不明 3件/);assert.match(stats,/関心返信（記録あり）1件/);assert.match(stats,/保留・未送信（記録あり）1件/);assert.match(stats,/入金確認（記録あり）0件/);
   assert.equal(await evaluate("document.querySelectorAll('.pin').length"),0);
   assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,'no viewport overflow '+width);
   const image=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'map-'+width+'.png'),Buffer.from(image.data,'base64'));
   await evaluate("document.querySelector('#map-filter').value='sales:interested';document.querySelector('#map-filter').dispatchEvent(new Event('change'))");
   assert.equal(await evaluate("document.querySelectorAll('#unmapped-cases button').length"),1);
   await evaluate("document.querySelector('#unmapped-cases button').click()");
   await evaluate("document.querySelector('#close-drawer').click();window.__displayTest.completeWork()");
   await until(()=>evaluate("document.querySelector('#all-rows').textContent.includes('Synthetic next work after QA')"),'live work update without reload');
   await evaluate("document.querySelector('#unmapped-cases button').click()");
   const detail=await evaluate("document.querySelector('#drawer-content').textContent");assert.match(detail,/Synthetic private QA completed/);assert.match(detail,/Synthetic task evidence/);assert.match(detail,/未取得（結果受領日時とは別）/);assert.match(detail,/分精度・秒不明/);assert.match(detail,/2026-10-13 15:22\+09:00/);assert.doesNotMatch(detail,/15:22:00/);assert.match(detail,/不明（確認済みの位置情報なし）/);
   assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,'drawer overflow '+width);
   const detailImage=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'detail-'+width+'.png'),Buffer.from(detailImage.data,'base64'));
   await evaluate("document.querySelector('#close-drawer').click();document.querySelector('[data-view=\"settings\"]').click();document.querySelector('#firebase-logout').click()");await wait(80);
   assert.equal(await evaluate("/PRIVATE_MARKER|private-marker@example/.test(document.body.textContent+' '+[...document.querySelectorAll('input,textarea,select')].map(x=>x.value).join(' '))"),false,'private DOM/form values cleared');
   assert.equal(await evaluate("document.querySelector('#firebase-case').onchange===null"),true);
   assert.equal(await evaluate("document.querySelector('#firebase-test-summary').textContent"),'');
   assert.equal(await evaluate("window.__displayTest.listenerCount()"),0);await assertScope(false);
   assert.deepEqual(await metricValues(),width===320?[]:['7件','2件','1件','$9'],'logout restores public metrics or unknown');
   assert.match(await evaluate("document.querySelector('#sales-source').textContent"),/公開概要/);if(width!==320){assert.match(await evaluate("document.querySelector('#sales-source').textContent"),/固定記録・自動更新なし/);assert.match(await evaluate("document.querySelector('#sales-metrics').textContent"),/固定公開概要/);}assert.equal(await evaluate("document.querySelector('#private-sync-state').textContent"),'');assert.equal(await evaluate("document.querySelector('#private-sync-state').hidden"),true);
   assert.ok(await evaluate("window.__displayTest.staleDelivered()")>=3,'retired callbacks actually delivered');
   assert.match(await evaluate("document.querySelector('#map-stats').textContent"),/未取得/);
   assert.equal(await evaluate("document.querySelectorAll('.pin').length"),0);
   assert.equal(await evaluate("localStorage.length+sessionStorage.length"),0);
   await evaluate("document.querySelector('#firebase-login').click()");await until(()=>evaluate("document.querySelector('#map-stats').textContent.includes('読込案件 3件')"),'relogin restoration');await assertScope(true);assert.deepEqual(await metricValues(),['3件','0件','2件','$0']);
   await evaluate("window.__displayTest.setMode('cached')");await until(()=>evaluate("document.querySelector('#map-stats').textContent.includes('未取得')"),'cached snapshot clear');await assertScope(false);
   assert.equal(await evaluate("document.body.textContent.includes('PRIVATE_MARKER')"),false);
   await evaluate("window.__displayTest.setMode('populated')");await until(()=>evaluate("document.querySelector('#map-stats').textContent.includes('読込案件 3件')"),'fresh snapshot restoration');
   await evaluate("window.__displayTest.setMode('denied')");await until(()=>evaluate("document.querySelector('#map-stats').textContent.includes('未取得')"),'denial clear');await assertScope(false);assert.deepEqual(await metricValues(),width===320?[]:['7件','2件','1件','$9']);
   assert.equal(await evaluate("document.body.textContent.includes('PRIVATE_MARKER')"),false);
   results.push({width,status:'PASS',checks:['business-check versus DB-write timestamps, missing checks, stopped writes and metadata clearing','Overview private metrics, empty versus unknown, delayed public success/failure, logout public restoration','scope badge and footer follow private/public visibility','unread versus empty','evidence stages','unknown locations/no pins','minute precision','map filtering/detail','no viewport overflow','logout clears DOM/forms/listeners including delayed snapshots','relogin','cached snapshot clear and fresh restoration','permission failure clear','no browser storage']});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({kind:'LOCAL_CHROME_SYNTHETIC_SDK_ONLY',realFirebaseRequests:0,namespace:testOnly?'synthetic':'real',results,uncaughtErrors:errors},null,2));console.log(JSON.stringify({pass:results.length,fail:0,widths:results.map(r=>r.width),output}));
 }finally{ws?.close();chrome?.kill('SIGTERM');if(server)await new Promise(r=>server.close(r));await wait(100);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
