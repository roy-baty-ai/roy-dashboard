import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../firebase/session.mjs';
import {validateConfig,editPayload,aggregate,createStore} from '../firebase/store.mjs';
function fixture(){const f={shown:null,messages:[],reads:0};const api={onAuth(fn){f.auth=fn;return()=>{};},watchAccess(uid,fn,err){f.access=fn;f.accessError=err;return()=>{};},watchPrivate(fn,err){f.reads++;f.data=fn;f.error=err;return()=>{};},async save(){if(f.reject)throw Error('permission-denied');},async logout(){f.auth(null);}};f.session=createSession(api,{clear(){f.shown=null;},show(p){f.shown=p;},state(m){f.messages.push(m);}});return f;}
const record={revision:1,payload:{cases:[{id:'test'}]}};
test('disabled/missing configuration never initializes Firebase',()=>{assert.equal(validateConfig({enabled:false}),false);assert.throws(()=>validateConfig({enabled:true}));});
test('anonymous/unapproved users never subscribe to private records',()=>{const f=fixture();f.auth(null);assert.equal(f.reads,0);f.auth({uid:'test'});f.access(false);assert.equal(f.reads,0);assert.equal(f.shown,null);});
test('auth expiry clears data and rejects a delayed private callback',()=>{const f=fixture();f.auth({uid:'test'});f.access(true);f.data(record);const late=f.data;assert.ok(f.shown);f.auth(null);late(record);assert.equal(f.shown,null);});
test('allowlist revocation clears data and fences previous stream',()=>{const f=fixture();f.auth({uid:'test'});f.access(true);const late=f.data;f.data(record);f.access(false);late(record);assert.equal(f.shown,null);});
test('offline and permission errors clear private data',()=>{const f=fixture();f.auth({uid:'test'});f.access(true);f.data(record);f.data(null);assert.equal(f.shown,null);f.data(record);const late=f.data;f.error(Error());late(record);assert.equal(f.shown,null);});
test('write denial clears editor and never reports success',async()=>{const f=fixture();f.auth({uid:'test'});f.access(true);f.data(record);f.reject=true;await assert.rejects(f.session.save('test',{next_action:'next'}));assert.equal(f.shown,null);assert.ok(!f.messages.some(m=>m.startsWith('保存しました')));});
test('only permitted editorial fields update; no send or GO mutation',()=>{const p={cases:[{id:'test',status:'NOT_READY',next_action:'old'}]};assert.throws(()=>editPayload(p,'test',{status:'SENT'}));assert.throws(()=>editPayload(p,'missing',{next_action:'n'}));assert.throws(()=>editPayload(p,'test',{internal_note:'x'.repeat(4001)}));const n=editPayload(p,'test',{next_action:'new'});assert.equal(p.cases[0].next_action,'old');assert.equal(n.cases[0].next_action,'new');});
test('aggregate is numeric whitelist and excludes private fields',()=>{const a=aggregate({summary:{operating_revenue_usd_last_recorded:0}},()=>[{state:'sent',previewUrl:'https://example.invalid'}]);assert.equal(a.sentCount,1);assert.equal(Object.values(a).every(v=>typeof v==='number'),true);});
test('transaction refuses old revision and JSON canonical mode',async()=>{let writes=0;const state={mode:'json',revision:2};const sdk={initializeFirestore(){},memoryLocalCache(){},doc(db,p){return p;},async runTransaction(db,fn){await fn({async get(path){return {exists:()=>true,data:()=>path==='control/source'?{mode:state.mode}:{revision:state.revision}};},set(){writes++;}});}};const store=createStore(sdk,{}, {currentUser:{uid:'test'}},()=>[]);await assert.rejects(store.save('test',{},2));state.mode='firestore';await assert.rejects(store.save('test',{},1));assert.equal(writes,0);});
test('status/gate edits preserve immutable fields and cannot record send or GO',()=>{
 const gate={code:'qa',label:'QA'},go={code:'initial_send_go',label:'GO'};
 const p={cases:[{id:'x',sent:false,status:'NOT_READY',readiness:'NOT_READY',preview_url:'https://example.invalid',last_checked_at:'2026-10-08T10:00:00Z',email:{body:'original'},confirmed_gates:[],missing_gates:[gate,go]}]};
 const patch={status:'READY_FOR_HUMAN_GO',readiness:'READY_FOR_HUMAN_GO',confirmed_gates:[gate],missing_gates:[go],last_checked_at:'2026-10-08T11:00:00Z'};
 const n=editPayload(p,'x',patch);assert.equal(n.cases[0].email.body,'original');assert.equal(p.cases[0].status,'NOT_READY');
 assert.throws(()=>editPayload(p,'x',{...patch,confirmed_gates:[gate,go],missing_gates:[]}));
 assert.throws(()=>editPayload(p,'x',{...patch,status:'SENT_WAITING',readiness:'SENT_WAITING'}));
 assert.throws(()=>editPayload(p,'x',{email:{body:'changed'}}));
});
test('initial import validates hash, eight unique IDs and source totals',async()=>{
 const {prepareImport,canonicalJSON}=await import('../firebase/store.mjs');const {createHash}=await import('node:crypto');
 const p={schema_version:1,cases:Array.from({length:8},(_,i)=>({id:'test-'+i})),summary:{case_count:8,ready_for_human_go:0,sent_cases_in_this_view:0,operating_revenue_usd_last_recorded:0}};
 const parse=()=>p.cases.map(()=>({state:'preparing',previewUrl:null}));const hash=createHash('sha256').update(canonicalJSON(p)).digest('hex');
 assert.equal((await prepareImport(JSON.stringify(p),hash,parse)).counts.caseCount,8);
 await assert.rejects(prepareImport(JSON.stringify(p),'0'.repeat(64),parse));p.cases[1].id=p.cases[0].id;await assert.rejects(prepareImport(JSON.stringify(p),hash,parse));
});
test('migration transaction refuses existing destination, wrong mode and wrong approved hash',async()=>{
 const {prepareImport,canonicalJSON}=await import('../firebase/store.mjs');const {createHash}=await import('node:crypto');
 const p={schema_version:1,cases:Array.from({length:8},(_,i)=>({id:'test-'+i})),summary:{case_count:8,ready_for_human_go:0,sent_cases_in_this_view:0,operating_revenue_usd_last_recorded:0}};
 const parse=()=>p.cases.map(()=>({state:'preparing',previewUrl:null}));const hash=createHash('sha256').update(canonicalJSON(p)).digest('hex');const prepared=await prepareImport(JSON.stringify(p),hash,parse);
 let exists=true,writes=0,mode='migration',approvedSourceHash=hash;
 const sdk={initializeFirestore(){},memoryLocalCache(){},doc(db,p){return p;},serverTimestamp(){return 'server-time';},async runTransaction(db,fn){return fn({async get(path){return {exists:()=>exists,data:()=>({mode,approvedSourceHash})};},set(){writes++;}});}};
 const store=createStore(sdk,{}, {currentUser:{uid:'test'}},parse);
 await assert.rejects(store.importInitial(prepared));exists=false;mode='json';await assert.rejects(store.importInitial(prepared));mode='migration';approvedSourceHash='0'.repeat(64);await assert.rejects(store.importInitial(prepared));assert.equal(writes,0);approvedSourceHash=hash;await store.importInitial(prepared);assert.equal(writes,1);
});
