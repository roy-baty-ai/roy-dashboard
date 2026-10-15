// Local integration only: real SDK + Firestore emulator, synthetic auth claims/data.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright-core');
const {build}=require('esbuild');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {initializeTestEnvironment}=await import('@firebase/rules-unit-testing');
 const sdk=await import('firebase/firestore');
 const {ROY_UID,digest}=await import('../firebase/intake.mjs');
 const {createPerCaseStore}=await import('../firebase/per-case-store.mjs');
 const env=await initializeTestEnvironment({projectId:'demo-roy-local',firestore:{host:'127.0.0.1',port:8085,rules:await fs.readFile(path.join(root,'firebase/firestore-finalized.rules'),'utf8')}});
 const claims={email:'roy.lab.20261001@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
 const manifest=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/synthetic-one-intake.json'),'utf8'));
 const caseId=manifest.entries[0].caseId,base='privateRoy/synthetic';
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await sdk.setDoc(sdk.doc(db,'admins/'+ROY_UID),{enabled:true});await sdk.setDoc(sdk.doc(db,base+'/control/state'),{mode:'active',allowSourceIngest:true});});
 const db=env.authenticatedContext(ROY_UID,claims).firestore();
 const store=createPerCaseStore({...sdk,initializeFirestore:()=>db,memoryLocalCache:()=>({})},{},{currentUser:{uid:ROY_UID}},globalThis.OutboundModel.parse,{space:'synthetic'});
 await store.ingest(manifest);
 const entry=`export * from './sdk-entry.js';
 import * as sdk from 'firebase/firestore';
 const uid=${JSON.stringify(ROY_UID)},claims=${JSON.stringify(claims)};
 const auth={currentUser:{uid}};const observers=new Set();
 export const getAuth=()=>auth;
 export const setPersistence=async()=>{};
 export const onIdTokenChanged=(_,fn)=>{observers.add(fn);queueMicrotask(()=>fn(auth.currentUser));return()=>observers.delete(fn);};
 export const signOut=async()=>{auth.currentUser=null;observers.forEach(fn=>fn(null));};
 export const initializeFirestore=(app,options)=>{if(app.options.projectId!=='demo-roy-local')throw Error('Emulator only');const db=sdk.initializeFirestore(app,options);sdk.connectFirestoreEmulator(db,'127.0.0.1',8085,{mockUserToken:{sub:uid,...claims}});return db;};`;
 const bundle=await build({stdin:{contents:entry,resolveDir:path.join(root,'firebase'),sourcefile:'test-emulator-sdk.mjs'},bundle:true,format:'esm',write:false});
 let feed={schemaVersion:1,space:'synthetic',items:[]},navigations=0;
 const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
 const server=http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0];
  if(url==='/__test-feed'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(feed));return;}
  const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');let body=await fs.readFile(file);if(file.endsWith('index.html'))body=body.toString().replace("connect-src ","connect-src http://127.0.0.1:8085 ");res.end(body);}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();if(url.pathname==='/vendor/firebase-sdk.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});if(url.pathname==='/firebase/config.js')return route.fulfill({contentType:'text/javascript',body:'window.RoyFirebaseConfig='+JSON.stringify({enabled:true,storageVersion:2,authProvider:'google',testOnly:true,firebase:{apiKey:'fake',authDomain:'localhost',projectId:'demo-roy-local',appId:'fake'}})});return route.continue();});
  await context.addInitScript(()=>{window.showOpenFilePicker=async()=>[{getFile:async()=>{const text=await (await fetch('/__test-feed')).text();return {size:text.length,text:async()=>text};}}];});
  const writer=await context.newPage(),viewer=await context.newPage();
  for(const page of [writer,viewer]){page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())navigations++;});await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#firebase-status').textContent.includes('認証済み'));}
  await writer.locator('[data-view="settings"]').click();await writer.locator('#result-feed-start').click();
  const event=n=>({schemaVersion:1,eventId:'browser-synthetic-'+n,caseId,progress:'Synthetic work '+n,nextAction:'Synthetic next '+n,completedAt:null,receivedAt:`2026-10-15T00:0${n}:00Z`,evidence:['Emulator-only synthetic result']});
  for(const n of [1,2]){
   feed.items.push({kind:'work-result',value:event(n)});
   for(const page of [writer,viewer])await page.waitForFunction(expected=>document.querySelector('#firebase-next').value===expected,'Synthetic next '+n,{timeout:20000});
   const current=(await sdk.getDoc(sdk.doc(db,base+'/cases/'+caseId))).data();assert.equal(current.revision,n+1);assert.equal(current.payload.next_action,'Synthetic next '+n);
   const history=(await sdk.getDoc(sdk.doc(db,base+'/cases/'+caseId+'/history/'+(n+1)))).data();assert.equal(history.record.revision,n+1);
  }
  const updated=structuredClone(manifest),entry=updated.entries[0];entry.expectedRevision=3;entry.sourceVersion=2;
  Object.assign(entry.payload,{sent:true,status:'SENT_WAITING',readiness:'SENT_WAITING',sent_evidence:{kind:'synthetic-only'},sales:{stage:'interested',evidence:'Synthetic reply proof',checked_at:'2026-10-15T00:03:00Z'},next_action:'Synthetic reply next'});
  entry.payload.email.sent_at='2026-10-15T00:02:00Z';entry.sourceHash=await digest(entry.payload);delete updated.manifestHash;updated.manifestHash=await digest(updated);
  feed.items.push({kind:'intake',value:updated});
  for(const page of [writer,viewer])await page.waitForFunction(()=>document.querySelector('#firebase-next').value==='Synthetic reply next'&&document.querySelector('#all-rows').textContent.includes('関心返信'),null,{timeout:20000});
  assert.equal((await sdk.getDoc(sdk.doc(db,base+'/cases/'+caseId))).data().revision,4);
  assert.equal(navigations,2,'two pages stayed open without reload');
  for(const width of [1440,393]){await viewer.setViewportSize({width,height:1000});assert.ok(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await viewer.screenshot({path:`/tmp/roy-continuous-${width}.png`,fullPage:false});}
  // A failed new update stops the writer; it must not claim the file was verified.
  await env.withSecurityRulesDisabled(async context=>sdk.updateDoc(sdk.doc(context.firestore(),base+'/control/state'),{mode:'paused'}));
  await writer.waitForFunction(()=>document.querySelector('#result-feed-status').textContent.includes('同期停止'));
  feed.items.push({kind:'work-result',value:event(3)});await new Promise(r=>setTimeout(r,5500));assert.equal((await sdk.getDoc(sdk.doc(db,base+'/cases/'+caseId))).data().revision,4);
  await viewer.locator('[data-view="settings"]').click();await viewer.locator('#firebase-logout').click();await viewer.waitForFunction(()=>document.querySelector('#firebase-case').options.length===0);
  assert.equal(await viewer.locator('#firebase-next').inputValue(),'');assert.equal(await viewer.evaluate(()=>localStorage.length+sessionStorage.length),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,emulator:'demo-roy-local',writes:3,verifiedHistory:[2,3,4],sourceIntakeAndReply:true,pagesWithoutReload:2,widths:[1440,393],pauseStops:true,logoutClears:true,productionTest:false}));
 }finally{await browser.close();await new Promise(r=>server.close(r));await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
