// Real Firebase Auth persistence, synthetic local Auth emulator only. No Firestore.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright-core');
const {build}=require('esbuild');
const root=path.resolve(__dirname,'..');
(async()=>{
 const bundle=await build({stdin:{contents:`export * from './sdk-entry.js';
 import * as authSDK from 'firebase/auth';
 export function getAuth(app){if(app.options.projectId!=='demo-roy-local')throw Error('Emulator only');const auth=authSDK.getAuth(app);if(!auth.emulatorConfig)authSDK.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});return auth;}
 export const signInWithPopup=auth=>authSDK.signInAnonymously(auth);`,resolveDir:path.join(root,'firebase'),sourcefile:'test-auth-emulator.mjs'},bundle:true,format:'esm',write:false});
 const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json'};
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(url==='/'?'/index.html':url));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{let body=await fs.readFile(file);if(file.endsWith('index.html'))body=body.toString().replace('connect-src ','connect-src http://127.0.0.1:9099 ');res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext(),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();if(u.pathname==='/vendor/firebase-sdk.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});if(u.pathname==='/firebase/config.js')return route.fulfill({contentType:'text/javascript',body:'window.RoyFirebaseConfig='+JSON.stringify({enabled:true,authOnly:true,authProvider:'google',firebase:{apiKey:'fake',projectId:'demo-roy-local',appId:'synthetic',authDomain:'localhost'}})});return route.continue();});
  const open=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/#settings');await p.waitForFunction(()=>document.querySelector('#firebase-status').textContent.includes('未ログイン'));return p;};
  const login=async p=>{await p.locator('#firebase-login').click();await p.waitForFunction(()=>document.querySelector('#firebase-status').textContent.includes('ログイン成功'));};
  const storage=async p=>p.evaluate(async()=>{const sessionKeys=Object.keys(sessionStorage).filter(k=>k.startsWith('firebase:authUser:'));const localKeys=Object.keys(localStorage).filter(k=>k.startsWith('firebase:authUser:'));const persisted=await new Promise((resolve,reject)=>{const request=indexedDB.open('firebaseLocalStorageDb');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('firebaseLocalStorage')){db.close();resolve([]);return;}const read=db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();read.onsuccess=()=>{const keys=read.result.map(v=>v.fbase_key).filter(k=>k?.startsWith('firebase:authUser:'));db.close();resolve(keys);};read.onerror=()=>reject(read.error);};});return {session:sessionKeys.length,local:localKeys.length,indexedDB:persisted.length};});
  let page=await open();await login(page);assert.deepEqual(await storage(page),{session:1,local:0,indexedDB:0});
  const signedInText=await page.locator('#firebase-status').textContent();await page.reload();await page.waitForFunction(()=>document.querySelector('#firebase-status').textContent.includes('ログイン成功'));assert.equal(await page.locator('#firebase-status').textContent(),signedInText);
  const independent=await open();assert.deepEqual(await storage(independent),{session:0,local:0,indexedDB:0});await independent.close();
  await page.locator('#firebase-logout').click();await page.waitForFunction(()=>document.querySelector('#firebase-status').textContent.includes('未ログイン'));assert.deepEqual(await storage(page),{session:0,local:0,indexedDB:0});await page.reload();await page.waitForFunction(()=>document.querySelector('#firebase-status').textContent.includes('未ログイン'));
  await login(page);await page.close();page=await open();assert.deepEqual(await storage(page),{session:0,local:0,indexedDB:0});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,actualFirebaseAuth:true,emulatorOnly:true,reloadRetainsSameUser:true,logoutClears:true,logoutReloadStaysSignedOut:true,newIndependentTabSignedOut:true,closeThenNewTabSignedOut:true,localStorageAuthRecords:0,indexedDBAuthRecords:0,productionAuth:false}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
