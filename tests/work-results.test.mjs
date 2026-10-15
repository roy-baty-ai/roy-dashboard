import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPerCaseStore} from '../firebase/per-case-store.mjs';
import {ROY_UID} from '../firebase/intake.mjs';
import {createWorkResultConsumer,validateWorkResult} from '../firebase/work-results.mjs';
import {consumeWorkResults} from '../scripts/consume-work-results.mjs';
const id='roy-web-0001',base='privateRoy/real';
const event=(n,extra={})=>({schemaVersion:1,eventId:'synthetic-work-'+n,caseId:id,progress:'Private QA complete',nextAction:'Check public preview '+n,completedAt:null,receivedAt:`2026-10-14T02:${String(n).padStart(2,'0')}:00Z`,evidence:['Synthetic completed task reference'],...extra});
function fixture(){
 const payload={id,business_name:'Synthetic only',sent:false,status:'NOT_READY',readiness:'NOT_READY',confirmed_revenue_usd:0,sent_evidence:null,confirmed_gates:[],missing_gates:[{code:'public_preview',label:'Public preview missing'}],restrictions:['No send without approval'],preview_url:null,next_action:'Old action',internal_note:'Preserve manual note',last_checked_at:'2026-10-13T00:00:00Z',gate_checks:{},email:{body:'Fixed synthetic text'}};
 const record={schemaVersion:2,revision:1,source:{version:1,hash:'source-hash',intakeId:'intake-id'},sourceData:structuredClone(payload),payload,changeKind:'source',operationId:'old-id',updatedBy:ROY_UID,updatedAt:'synthetic-time'};
 const docs=new Map([[base+'/control/state',{mode:'active',allowSourceIngest:false}],[base+'/registry/current',{caseIds:[id]}],[base+'/cases/'+id,record],[base+'/cases/'+id+'/history/1',{record:structuredClone(record)}]]),listeners=new Map(),writes=[];const auth={currentUser:{uid:ROY_UID}};let denied=false,retry=false,corruptReadback=false;
 const deliver=p=>{for(const x of listeners.get(p)||[])x.next({metadata:{fromCache:false,hasPendingWrites:false},exists:()=>docs.has(p),data:()=>structuredClone(docs.get(p))});};
 const sdk={initializeFirestore:()=> 'db',memoryLocalCache:()=> 'memory',doc:(_,p)=>p,serverTimestamp:()=> 'synthetic-time',onSnapshot(p,_,next,error){const x={next,error};if(!listeners.has(p))listeners.set(p,new Set());listeners.get(p).add(x);queueMicrotask(()=>deliver(p));return()=>listeners.get(p).delete(x);},async runTransaction(_,fn){
  if(denied)throw Object.assign(Error('credential-bearing SDK text must remain private'),{code:'permission-denied'});
  const run=()=>{const pending=[];return fn({get:async p=>({exists:()=>docs.has(p),data:()=>structuredClone(docs.get(p))}),set:(p,v)=>pending.push([p,structuredClone(v)])}).then(result=>({result,pending}));};
  let out=await run();
  if(retry&&out.pending.length){retry=false;const c=structuredClone(docs.get(base+'/cases/'+id));c.revision++;c.payload.internal_note+='\nConcurrent manual note';docs.set(base+'/cases/'+id,c);docs.set(base+'/cases/'+id+'/history/'+c.revision,{record:structuredClone(c)});out=await run();}
  for(const [p,v] of out.pending){assert.ok(!p.includes('/control/')&&!p.includes('/registry/')&&!p.includes('/intakes/')&&!p.includes('/validation/'));docs.set(p,v);writes.push(p);}
  if(corruptReadback&&out.pending.length)docs.delete(base+'/cases/'+id+'/history/'+out.result.revision);
  if(out.pending.length)deliver(base+'/cases/'+id);
  return out.result;
 }};
 const store=createPerCaseStore(sdk,{},auth,p=>p.cases.map(c=>({state:c.sent?'sent':'preparing',previewUrl:null})),{space:'real'});
 return {store,docs,writes,auth,setDenied:v=>denied=v,setRetry:()=>retry=true,setCorrupt:()=>corruptReadback=true,original:structuredClone(record)};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('completion stream saves multiple real-namespace records and updates existing subscription without reload',async()=>{
 const f=fixture(),views=[];const stop=f.store.watchPrivate(v=>{if(v)views.push(v);},assert.fail);await tick();
 const statuses=[];await consumeWorkResults([JSON.stringify(event(1)),JSON.stringify(event(2,{completedAt:'2026-10-14T02:01:30Z'}))],{store:f.store,caseIds:[id],onStatus:x=>statuses.push(x)});
 assert.equal(f.writes.length,4);assert.equal(views.at(-1).revision,id+':3');assert.equal(views.at(-1).payload.cases[0].next_action,'Check public preview 2');
 const current=f.docs.get(base+'/cases/'+id);assert.equal(current.payload.last_checked_at,'2026-10-14T02:01:30Z');assert.match(current.payload.internal_note,/Preserve manual note/);assert.match(f.docs.get(base+'/cases/'+id+'/history/2').record.payload.internal_note,/completedAt":null/);
 for(const key of ['source','sourceData'])assert.deepEqual(current[key],f.original[key]);
 for(const key of ['sent','status','readiness','confirmed_revenue_usd','email','confirmed_gates','missing_gates','restrictions'])assert.deepEqual(current.payload[key],f.original.payload[key]);
 assert.equal(statuses.filter(x=>x.state==='verified').length,2);stop();
});
test('unknown completion time preserves last checked date, duplicate after another event is idempotent, collision stops',async()=>{
 const f=fixture(),save=createWorkResultConsumer(f.store,{caseIds:[id]});await save(event(1));assert.equal(f.docs.get(base+'/cases/'+id).payload.last_checked_at,f.original.payload.last_checked_at);await save(event(2));const count=f.writes.length;const duplicate=await save(event(1));assert.equal(duplicate.unchanged,true);assert.equal(f.writes.length,count);await assert.rejects(save(event(1,{nextAction:'Changed retry body'})),{code:'failed-precondition'});assert.equal(f.writes.length,count);
});
test('paused control, missing registry, unauthorized identity and case scope stop before writing',async()=>{
 for(const change of [f=>f.docs.get(base+'/control/state').mode='paused',f=>f.docs.get(base+'/registry/current').caseIds=[],f=>f.auth.currentUser=null,f=>f.auth.currentUser.uid='not-Roy']){
  const f=fixture();change(f);await assert.rejects(createWorkResultConsumer(f.store,{caseIds:[id]})(event(1)));assert.equal(f.writes.length,0);
 }
 const f=fixture();await assert.rejects(createWorkResultConsumer(f.store,{caseIds:['roy-web-0002']})(event(1)),{code:'permission-denied'});assert.equal(f.writes.length,0);
});
test('SDK conflict retry preserves concurrent notes and immutable history',async()=>{
 const f=fixture();f.setRetry();const result=await createWorkResultConsumer(f.store,{caseIds:[id]})(event(1));assert.equal(result.revision,3);assert.match(f.docs.get(base+'/cases/'+id).payload.internal_note,/Concurrent manual note/);assert.deepEqual(f.docs.get(base+'/cases/'+id+'/history/1').record,f.original);
});
test('readback failure and access denial never report verified or expose SDK messages',async()=>{
 for(const action of ['setDenied','setCorrupt']){const f=fixture(),status=[];f[action](true);await assert.rejects(createWorkResultConsumer(f.store,{caseIds:[id],onStatus:s=>status.push(s)})(event(1)));assert.ok(!status.some(s=>s.state==='verified'));assert.ok(!JSON.stringify(status).includes('credential-bearing'));}
});
test('out-of-order, oversized evidence, forbidden fields and expired business dates reject safely',async()=>{
 const f=fixture(),save=createWorkResultConsumer(f.store,{caseIds:[id]});await save(event(2));const count=f.writes.length;
 for(const e of [event(1),event(3,{sent:true}),event(3,{evidence:['x'.repeat(501)]}),event(3,{completedAt:'2026-02-30T00:00:00Z'}),event(3,{completedAt:'2026-10-12T00:00:00Z'}),event(3,{receivedAt:null})])await assert.rejects(save(e));
 assert.equal(f.writes.length,count);assert.throws(()=>validateWorkResult(event(1,{evidence:['Bearer forbidden-placeholder']})));
});
test('audit capacity stops without silently deleting notes and history',async()=>{
 const f=fixture();f.docs.get(base+'/cases/'+id).payload.internal_note='x'.repeat(3990);await assert.rejects(createWorkResultConsumer(f.store,{caseIds:[id]})(event(1)),{code:'resource-exhausted'});assert.equal(f.writes.length,0);
});


test('long completion stream retains audit in immutable history without growing current managed note',async()=>{
 const f=fixture(),save=createWorkResultConsumer(f.store,{caseIds:[id]});
 for(let n=1;n<=20;n++)await save(event(n));
 const record=f.docs.get(base+'/cases/'+id);assert.equal(record.revision,21);assert.ok(record.payload.internal_note.length<1000);assert.match(record.payload.internal_note,/Preserve manual note/);
 const before=f.writes.length;assert.equal((await save(event(1))).unchanged,true);assert.equal(f.writes.length,before);
 assert.ok(f.docs.has(base+'/cases/'+id+'/history/2'));assert.ok(f.docs.has(base+'/cases/'+id+'/history/21'));
});

test('existing private queue report adapter preserves unknown QA time, requires verified IDs and receipt time',async()=>{
 const {queueReportEvents}=await import('../scripts/private-queue-adapter.mjs');
 const report={kind:'PRIVATE_QUEUE_RECONCILED_NEW_CASE_CANDIDATES_NOT_EXECUTABLE',entries:[{privateQueueId:'lead-synthetic',qa:{status:'private_browser_QA_passed_parent_report',completed_at:null,parent_result_reported_at:'2026-10-14T02:00:00Z',cloud_thread_id:'synthetic-thread'}}]};
 assert.equal((await queueReportEvents(report,{})).blocked[0].code,'verified-case-mapping-required');
 const batch=await queueReportEvents(report,{'lead-synthetic':id});assert.equal(batch.events.length,1);assert.equal(batch.events[0].completedAt,null);assert.equal(batch.events[0].receivedAt,'2026-10-14T02:00:00Z');assert.ok(batch.events[0].evidence.includes('thread: synthetic-thread'));
 report.entries[0].qa.parent_result_reported_at=null;assert.equal((await queueReportEvents(report,{'lead-synthetic':id})).blocked[0].code,'actual-result-receipt-time-required');
});
test('private queue adapter polls supplied source, acks verified events and stops without repeating',async()=>{
 const {runPrivateQueueAdapter}=await import('../scripts/private-queue-adapter.mjs');const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roy-source-adapter-'));
 try{
  const sourcePath=path.join(dir,'source.json'),ackPath=path.join(dir,'ack.json'),report={kind:'PRIVATE_QUEUE_RECONCILED_NEW_CASE_CANDIDATES_NOT_EXECUTABLE',entries:[{privateQueueId:'lead-synthetic',qa:{status:'private_browser_QA_passed_parent_report',completed_at:null,parent_result_reported_at:'2026-10-14T02:00:00Z',cloud_thread_id:'synthetic-thread'}}]};await fs.writeFile(sourcePath,JSON.stringify(report));
  const f=fixture(),options={sourcePath,ackPath,caseMap:{'lead-synthetic':id},store:f.store,once:true};await runPrivateQueueAdapter(options);assert.equal(f.writes.length,2);await runPrivateQueueAdapter(options);assert.equal(f.writes.length,2);assert.equal((await fs.stat(ackPath)).mode&0o777,0o600);
  const controller=new AbortController();controller.abort();await runPrivateQueueAdapter({...options,once:false,signal:controller.signal});assert.equal(f.writes.length,2);
  const noAuthAck=path.join(dir,'no-auth.json'),statuses=[];await runPrivateQueueAdapter({...options,store:null,ackPath:noAuthAck,onStatus:s=>statuses.push(s)});assert.ok(statuses.some(s=>s.state==='not-connected'));await assert.rejects(fs.stat(noAuthAck));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('running adapter receives a later real-shaped queue change and graceful stop preserves verified ack',async()=>{
 const {runPrivateQueueAdapter}=await import('../scripts/private-queue-adapter.mjs');const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roy-source-live-'));
 try{
  const sourcePath=path.join(dir,'source.json'),ackPath=path.join(dir,'ack.json'),report={kind:'PRIVATE_QUEUE_RECONCILED_NEW_CASE_CANDIDATES_NOT_EXECUTABLE',entries:[{privateQueueId:'lead-synthetic',qa:{status:'private_browser_QA_passed_parent_report',completed_at:null,parent_result_reported_at:'2026-10-14T02:00:00Z',cloud_thread_id:'synthetic-thread'}}]};await fs.writeFile(sourcePath,JSON.stringify(report));
  const f=fixture(),controller=new AbortController();let verified=0,update;
  await runPrivateQueueAdapter({sourcePath,ackPath,caseMap:{'lead-synthetic':id},store:f.store,intervalMs:1000,signal:controller.signal,onStatus:s=>{if(s.state==='verified'){verified++;if(verified===1){report.entries[0].qa.parent_result_reported_at='2026-10-14T02:01:00Z';update=fs.writeFile(sourcePath,JSON.stringify(report));}else controller.abort();}}});
  await update;assert.equal(verified,2);assert.equal(f.writes.length,4);assert.equal(JSON.parse(await fs.readFile(ackPath,'utf8')).verifiedEventHashes.length,2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
