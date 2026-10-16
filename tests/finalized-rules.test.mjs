import {operationsRules} from '../scripts/build-operations-rules.mjs';
import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {createPerCaseStore} from '../firebase/per-case-store.mjs';
import {evidenceDocuments,stageEvidence} from '../firebase/evidence-validation.mjs';
import {digest,ROY_UID,GATE_CODES,intakeReceipt,sourceRecord} from '../firebase/intake.mjs';

assert.ok(!process.env.FIRESTORE_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8085');
const env=await initializeTestEnvironment({projectId:'demo-roy-local',firestore:{host:'127.0.0.1',port:8085,rules:process.env.ROY_RULES_VARIANT==='operations'?await operationsRules():readFileSync(new URL('../firebase/firestore-finalized.rules',import.meta.url),'utf8')}});
after(()=>env.cleanup());
const claims={email_verified:true,email:'roy.lab.20261001@gmail.com',firebase:{sign_in_provider:'google.com'}};
const db=(uid=ROY_UID,token=claims)=>uid?env.authenticatedContext(uid,token).firestore():env.unauthenticatedContext().firestore();
const base='privateRoy/synthetic',casePath=`${base}/cases/roy-web-0001`;
const fixture=JSON.parse(readFileSync(new URL('./fixtures/synthetic-one-intake.json',import.meta.url)));
const api=(d,override={})=>createPerCaseStore({...sdk,initializeFirestore:()=>d,...override},{},{currentUser:{uid:ROY_UID}},p=>p.cases.map(c=>({state:c.sent?'sent':'preparing',previewUrl:c.preview_url})),{space:'synthetic'});
async function control(value){await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),`${base}/control/state`),value));}
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),`admins/${ROY_UID}`),{enabled:true}));await control({mode:'active',allowSourceIngest:true});});
async function deny(promise){await assert.rejects(promise,e=>{assert.equal(e.code,'permission-denied');assert.doesNotMatch(e.message,/maximum of 1000|maximum.*(?:access|call)|too complex|stack depth/i,'A limit error is not proof of the intended rejection');return true;});}
async function manifest(change=()=>{},previous=null){const m=structuredClone(fixture);if(previous){m.entries[0].payload=structuredClone(previous.payload);m.entries[0].expectedRevision=previous.revision;m.entries[0].sourceVersion=previous.source.version+1;}change(m.entries[0].payload,m);m.entries[0].sourceHash=await digest(m.entries[0].payload);delete m.manifestHash;m.manifestHash=await digest(m);return m;}
const maximum=p=>{p.confirmed_gates=Array.from({length:32},(_,i)=>({code:'extra_'+i,label:'synthetic evidence',evidence:'synthetic proof'}));p.missing_gates=GATE_CODES.map(code=>({code,label:'synthetic missing'}));p.restrictions=Array.from({length:32},(_,i)=>'synthetic restriction '+i);};
async function stage(d,m){await stageEvidence(sdk,d,'synthetic',m.manifestHash,m.entries[0]);}
// Mutation precedes synchronization: an unrelated stale history/sourceData must not
// make a malformed case test pass. Missing fields stay missing; no client validator
// touches the adversarial record. History mismatch is an explicit final mutation.
async function rawCreate(d,m,mutate=()=>{},omit=[],historyMutation=()=>{}) {
 const e=m.entries[0],record={...sourceRecord(null,e,m).record,updatedBy:ROY_UID,updatedAt:sdk.serverTimestamp()};
 const path=`${base}/cases/${e.caseId}`;
 const writes=[
  {path:`${base}/intakes/${m.manifestHash}`,data:intakeReceipt(m)},
  {path:`${base}/registry/current`,data:{caseIds:[e.caseId],revision:1,intakeId:m.manifestHash,updatedBy:ROY_UID,updatedAt:sdk.serverTimestamp()}},
  {path,data:record},
  {path:path+'/history/1',data:{}}
 ];
 mutate(writes);
 const final=writes[2].data;
 if ('sourceData' in final && 'payload' in final) final.sourceData=structuredClone(final.payload);
 // Retain Firestore FieldValue/Timestamp objects by reference, not structuredClone.
 writes[3].path=writes[2].path+'/history/'+(final.revision??1);
 writes[3].data={record:{...final,payload:final.payload&&structuredClone(final.payload),source:final.source&&structuredClone(final.source)}};
 for(const key of ['payload','source']) if(!(key in final)) delete writes[3].data.record[key];
 assert.deepEqual(writes[3].data.record,final,'history must match the mutated case before the dedicated history attack');
 if ('sourceData' in final && 'payload' in final) assert.deepEqual(final.sourceData,final.payload);
 historyMutation(writes[3].data.record);
 const b=sdk.writeBatch(d);
 writes.forEach((w,i)=>{if(!omit.includes(i))b.set(sdk.doc(d,w.path),w.data);});
 return b.commit();
}
async function pairedCreateDenial(d,m,change=()=>{},omit=[],historyMutation=()=>{}) {
 await deny(rawCreate(d,m,change,omit,historyMutation));
 assert.equal((await sdk.getDoc(sdk.doc(d,casePath))).exists(),false);
 // Exactly the same helper, identity, dependencies and batch layout without attack.
 await rawCreate(d,m);
 assert.equal((await current(d)).revision,1);
}
async function current(d){return (await sdk.getDoc(sdk.doc(d,casePath))).data();}
async function manual(d,old,mutate=()=>{},history=true){const r={...old,source:structuredClone(old.source),sourceData:structuredClone(old.sourceData),payload:structuredClone(old.payload),revision:old.revision+1,changeKind:'manual',operationId:await digest({revision:old.revision+1,kind:'manual test'}),updatedAt:sdk.serverTimestamp()};mutate(r);const b=sdk.writeBatch(d);b.set(sdk.doc(d,casePath),r);if(history)b.set(sdk.doc(d,casePath+'/history/'+r.revision),{record:r});return b.commit();}

test('exact fixture and maximum payload: save, independent readback and idempotent retry',async()=>{
 for(const change of [()=>{},maximum]){await env.clearFirestore();await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),`admins/${ROY_UID}`),{enabled:true}));await control({mode:'active',allowSourceIngest:true});const d=db(),m=await manifest(change),s=api(d);assert.equal((await s.ingest(m)).outcomes[0].status,'written');assert.equal((await s.readback(m))[0].revision,1);assert.equal((await s.ingest(m)).outcomes[0].status,'unchanged');}
});
test('maximum source update and manual READY/not-ready transitions preserve evidence/history',async()=>{
 const d=db(),s=api(d),m=await manifest(maximum);await s.ingest(m);let old=await current(d);const next=await manifest(p=>{p.business_name='updated synthetic name';},old);await s.ingest(next);assert.equal((await s.readback(next))[0].revision,2);old=await current(d);
 await manual(d,old,r=>{r.payload.status=r.payload.readiness='READY_FOR_HUMAN_GO';r.payload.gate_checks=Object.fromEntries(GATE_CODES.filter(c=>c!=='initial_send_go').map(c=>[c,true]));});old=await current(d);assert.equal(old.revision,3);assert.equal(old.payload.status,'READY_FOR_HUMAN_GO');
 await manual(d,old,r=>{r.payload.status=r.payload.readiness='NOT_READY';r.payload.internal_note='synthetic follow-up';});assert.equal((await current(d)).revision,4);assert.equal((await sdk.getDoc(sdk.doc(d,casePath+'/history/3'))).data().record.payload.status,'READY_FOR_HUMAN_GO');
});
test('interrupted preparation leaves case absent; retry resumes and completes',async()=>{const d=db();let count=0;const s=api(d,{runTransaction:(d,fn)=>{if(++count===4)throw Object.assign(Error('simulated disconnect'),{code:'unavailable'});return sdk.runTransaction(d,fn);}});await assert.rejects(s.ingest(fixture),{code:'unavailable'});assert.equal((await sdk.getDoc(sdk.doc(d,casePath))).exists(),false);assert.equal((await sdk.getDoc(sdk.doc(d,`${base}/registry/current`))).exists(),false);const parts=evidenceDocuments('synthetic',fixture.manifestHash,'roy-web-0001',fixture.entries[0].payload);assert.equal((await sdk.getDoc(sdk.doc(d,parts[2].path))).exists(),true);await api(d).ingest(fixture);assert.equal((await api(d).readback(fixture))[0].revision,1);});
test('valid but conflicting immutable preparation cannot be silently reused',async()=>{const d=db(),part=evidenceDocuments('synthetic',fixture.manifestHash,'roy-web-0001',fixture.entries[0].payload)[0];part.data.restrictions=['different valid restriction'];await sdk.setDoc(sdk.doc(d,part.path),part.data);await assert.rejects(api(d).ingest(fixture),/collision/);assert.equal((await sdk.getDoc(sdk.doc(d,casePath))).exists(),false);});

for(const [name,uid,token] of [['anonymous',null,claims],['other owner','other-owner',claims],['wrong email',ROY_UID,{...claims,email:'other@example.invalid'}],['unverified email',ROY_UID,{...claims,email_verified:false}],['non-Google provider',ROY_UID,{...claims,firebase:{sign_in_provider:'password'}}]])test(name+' cannot read or write private evidence/cases',async()=>{const owner=db();await stage(owner,fixture);const d=db(uid,token),part=evidenceDocuments('synthetic','a'.repeat(64),'roy-web-0001',fixture.entries[0].payload)[0];await deny(sdk.getDoc(sdk.doc(d,casePath)));await deny(sdk.setDoc(sdk.doc(d,part.path),part.data));await deny(rawCreate(d,fixture));await rawCreate(owner,fixture);});
test('revoked administrator is denied at staging and final commit',async()=>{const d=db();await stage(d,fixture);await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),`admins/${ROY_UID}`),{enabled:false}));const p=evidenceDocuments('synthetic','a'.repeat(64),'roy-web-0001',fixture.entries[0].payload)[0];await deny(sdk.setDoc(sdk.doc(d,p.path),p.data));await deny(rawCreate(d,fixture));await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),`admins/${ROY_UID}`),{enabled:true}));await rawCreate(d,fixture);});
for(const value of [{mode:'paused',allowSourceIngest:true},{mode:'active',allowSourceIngest:false}])test('control gate '+JSON.stringify(value),async()=>{const d=db();await stage(d,fixture);await control(value);const p=evidenceDocuments('synthetic','a'.repeat(64),'roy-web-0001',fixture.entries[0].payload)[0];await deny(sdk.setDoc(sdk.doc(d,p.path),p.data));await deny(rawCreate(d,fixture));await control({mode:'active',allowSourceIngest:true});await rawCreate(d,fixture);});
test('source switch does not prohibit a valid manual edit when mode remains active',async()=>{const d=db();await api(d).ingest(fixture);await control({mode:'active',allowSourceIngest:false});await manual(d,await current(d),r=>{r.payload.internal_note='allowed manual note';});});

for(const field of ['schemaVersion','revision','source','sourceData','payload','changeKind','operationId','updatedBy','updatedAt'])test('required record field '+field,async()=>{const d=db();await stage(d,fixture);await pairedCreateDenial(d,fixture,w=>{delete w[2].data[field];});});
for(const field of ['repo','commit','path','key','version','hash','intakeId'])test('required source field '+field,async()=>{const d=db();await stage(d,fixture);await pairedCreateDenial(d,fixture,w=>{delete w[2].data.source[field];});});
for(const field of ['id','business_name','confirmed_revenue_usd','sent','status','readiness','sent_evidence','confirmed_gates','missing_gates','restrictions','next_action','internal_note','preview_url','gate_checks'])test('end-to-end required payload field '+field,async()=>{const d=db();await stage(d,fixture);await pairedCreateDenial(d,fixture,w=>{delete w[2].data.payload[field];});});
for(const [name,change] of [
 ['extra record field',w=>{w[2].data.unapproved=true;}],['extra source field',w=>{w[2].data.source.unapproved=true;}],['invalid hash',w=>{w[2].data.source.hash='not-a-hash';w[0].data.entries['roy-web-0001'].sourceHash='not-a-hash';}],['wrong owner',w=>{w[2].data.updatedBy='other-owner';}],['wrong timestamp',w=>{w[2].data.updatedAt=sdk.Timestamp.fromMillis(0);}],['revision gap',w=>{w[2].data.revision=2;w[0].data.entries['roy-web-0001'].expectedRevision=1;}],['forged receipt',w=>{w[0].data.entries['roy-web-0001'].sourceHash='f'.repeat(64);}],['registry mismatch',w=>{w[1].data.caseIds=[];}],['end-to-end 33 restrictions',w=>{w[2].data.payload.restrictions=Array(33).fill('synthetic');}],['end-to-end 33 confirmed gates',w=>{w[2].data.payload.confirmed_gates=Array.from({length:33},(_,i)=>({code:'extra_'+i,label:'synthetic'}));}]
])test(name+' rejected without expression exhaustion',async()=>{const d=db();await stage(d,fixture);await pairedCreateDenial(d,fixture,change);});
for(const [name,index] of [['receipt',0],['registry',1],['history',3]])test('final commit requires atomic '+name,async()=>{const d=db();await stage(d,fixture);await pairedCreateDenial(d,fixture,()=>{},[index]);});
test('history mismatch with otherwise valid case is denied',async()=>{const d=db();await stage(d,fixture);await pairedCreateDenial(d,fixture,()=>{},[],r=>{r.payload.internal_note='different';});});
test('manual unknown gate rejected; same update with known boolean gate allowed',async()=>{const d=db();await api(d).ingest(fixture);const old=await current(d);await deny(manual(d,old,r=>{r.payload.gate_checks={initial_send_go:true};}));await manual(d,old,r=>{r.payload.gate_checks={visual_qa:true};});});
for(const scope of ['intake','case','space'])test('certificate binding rejects wrong '+scope+'; matching certificate allows',async()=>{
 const d=db();await stage(d,fixture);
 if(scope==='space'){
  // Real is only a namespace in the demo emulator. Give every other dependency
  // the correct namespace so absence of a control/receipt cannot mask this test.
  await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),'privateRoy/real/control/state'),{mode:'active',allowSourceIngest:true}));
  const target=w=>{w.forEach(x=>{x.path=x.path.replace('/synthetic/','/real/');});w[0].data.space='real';};
  await deny(rawCreate(d,fixture,target));
  await stageEvidence(sdk,d,'real',fixture.manifestHash,fixture.entries[0]);
  await rawCreate(d,fixture,target);
  assert.equal((await sdk.getDoc(sdk.doc(d,'privateRoy/real/cases/roy-web-0001'))).data().revision,1);
 }else{
  const m=await manifest((p,m)=>{if(scope==='intake')p.business_name='other intake';else p.id=m.entries[0].caseId='roy-web-0002';});
  if(scope==='case')await stageEvidence(sdk,d,'synthetic',m.manifestHash,{...m.entries[0],caseId:'roy-web-0001'});
  await deny(rawCreate(d,m));await stage(d,m);await rawCreate(d,m);
  assert.equal((await sdk.getDoc(sdk.doc(d,`${base}/cases/${m.entries[0].caseId}`))).data().revision,1);
 }
});

for(const [name,change] of [['source hash',r=>{r.source.hash='c'.repeat(64);}],['source data',r=>{r.sourceData.internal_note='forged';}],['business identity',r=>{r.payload.business_name='forged';}],['restrictions',r=>{r.payload.restrictions=[];}],['confirmed gates',r=>{r.payload.confirmed_gates=[{code:'forged',label:'forged'}];}],['sent proof',r=>{r.payload.sent_evidence={fake:true};}],['revision',r=>{r.revision+=1;}]])test('manual edit cannot alter '+name,async()=>{const d=db();await api(d).ingest(fixture);const old=await current(d);await deny(manual(d,old,change));await manual(d,old,r=>{r.payload.internal_note='valid paired edit';});});
for(const [name,change] of [['missing checked gate',r=>{delete r.payload.gate_checks.visual_qa;}],['false checked gate',r=>{r.payload.gate_checks.visual_qa=false;}],['invalid calendar',r=>{r.payload.last_checked_at='2026-02-30T00:00:00Z';}],['forged send GO',r=>{r.payload.gate_checks.initial_send_go=true;}]])test('READY rejects '+name,async()=>{const d=db();await api(d).ingest(await manifest(maximum));const old=await current(d),ready=r=>{r.payload.status=r.payload.readiness='READY_FOR_HUMAN_GO';r.payload.gate_checks=Object.fromEntries(GATE_CODES.filter(c=>c!=='initial_send_go').map(c=>[c,true]));};await deny(manual(d,old,r=>{ready(r);change(r);}));await manual(d,old,ready);});
test('READY rejects a source with null preview; same READY update allows after valid source preview',async()=>{
 const d=db(),s=api(d),m=await manifest(p=>{maximum(p);p.preview_url=null;});await s.ingest(m);
 const ready=r=>{r.payload.status=r.payload.readiness='READY_FOR_HUMAN_GO';r.payload.gate_checks=Object.fromEntries(GATE_CODES.filter(c=>c!=='initial_send_go').map(c=>[c,true]));};
 await deny(manual(d,await current(d),ready));
 // preview_url is immutable in manual edits: repair it through an allowed source
 // update, then make exactly the same READY edit. The negative changes no preview.
 const fixed=await manifest(p=>{p.preview_url=fixture.entries[0].payload.preview_url;},await current(d));
 await s.ingest(fixed);await manual(d,await current(d),ready);
});
test('sent case proof and email stay immutable while editorial update remains valid',async()=>{const d=db(),m=await manifest(p=>{p.sent=true;p.status=p.readiness='SENT_WAITING';p.sent_evidence={kind:'synthetic'};p.email.sent_at='2026-10-09T00:00:00Z';});await api(d).ingest(m);let old=await current(d);await manual(d,old,r=>{r.payload.internal_note='synthetic note';});old=await current(d);await deny(manual(d,old,r=>{r.payload.email.sent_at='forged';}));await deny(manual(d,old,r=>{r.payload.offer.amount=1;}));});

function validPart(){return {confirmed:Array.from({length:4},(_,i)=>({code:'extra_'+i,label:'x'.repeat(500),evidence:'e'.repeat(4000)})),missing:[{code:'visual_qa',label:'QA'},{code:'initial_send_go',label:'GO'}],restrictions:Array(4).fill('r'.repeat(2000)),confirmedCodes:['extra_0','extra_1','extra_2','extra_3'],missingCodes:['visual_qa','initial_send_go']};}
const partPath=`${base}/validation/${'a'.repeat(64)}/cases/roy-web-0001/parts/0`;
test('bounded part accepts maximum field lengths',async()=>{await sdk.setDoc(sdk.doc(db(),partPath),validPart());});
for(let i=0;i<4;i++)test('every confirmed gate position validated '+i,async()=>{const p=validPart();p.confirmed[i].label=7;await deny(sdk.setDoc(sdk.doc(db(),partPath),p));await sdk.setDoc(sdk.doc(db(),partPath),validPart());});
for(let i=0;i<2;i++)test('every missing gate position validated '+i,async()=>{const p=validPart();p.missing[i].code='INVALID';p.missingCodes[i]='INVALID';await deny(sdk.setDoc(sdk.doc(db(),partPath),p));await sdk.setDoc(sdk.doc(db(),partPath),validPart());});
for(let i=0;i<4;i++)test('every restriction position validated '+i,async()=>{const p=validPart();p.restrictions[i]='';await deny(sdk.setDoc(sdk.doc(db(),partPath),p));await sdk.setDoc(sdk.doc(db(),partPath),validPart());});
for(const [name,change] of [['extra field',p=>{p.extra=true;}],['missing field',p=>{delete p.confirmed;}],['fake codes',p=>{p.confirmedCodes[0]='fake';}],['too many confirmed',p=>{p.confirmed.push({code:'extra_4',label:'x'});p.confirmedCodes.push('extra_4');}],['too many missing',p=>{p.missing.push({code:'public_preview',label:'x'});p.missingCodes.push('public_preview');}],['too many restrictions',p=>{p.restrictions.push('x');}],['long evidence',p=>{p.confirmed[3].evidence='x'.repeat(4001);}],['long label',p=>{p.confirmed[3].label='x'.repeat(501);}],['long restriction',p=>{p.restrictions[3]='x'.repeat(2001);}]])test('part rejects '+name,async()=>{const p=validPart();change(p);await deny(sdk.setDoc(sdk.doc(db(),partPath),p));await sdk.setDoc(sdk.doc(db(),partPath),validPart());});
test('parts and certificates cannot be changed or deleted',async()=>{const d=db();await stage(d,fixture);const docs=evidenceDocuments('synthetic',fixture.manifestHash,'roy-web-0001',fixture.entries[0].payload);for(const x of [docs[0],docs.at(-1)]){await deny(sdk.setDoc(sdk.doc(d,x.path),x.data));await deny(sdk.deleteDoc(sdk.doc(d,x.path)));}await deny(sdk.setDoc(sdk.doc(d,partPath.replace('/parts/0','/parts/8')),validPart()));});
for(const [name,change] of [['duplicate across parts',p=>{p.confirmed_gates[31].code=p.confirmed_gates[0].code;}],['confirmed/missing overlap',p=>{p.confirmed_gates[31].code=p.missing_gates[0].code;}],['unknown missing code',p=>{p.missing_gates[8].code='not_allowed';}]])test('certificate rejects '+name,async()=>{const d=db(),m=await manifest(maximum);const good=evidenceDocuments('synthetic','b'.repeat(64),'roy-web-0001',m.entries[0].payload);for(const x of good)await sdk.setDoc(sdk.doc(d,x.path),x.data);change(m.entries[0].payload);const docs=evidenceDocuments('synthetic',m.manifestHash,'roy-web-0001',m.entries[0].payload);for(const x of docs.slice(0,8))await sdk.setDoc(sdk.doc(d,x.path),x.data);await deny(sdk.setDoc(sdk.doc(d,docs[8].path),docs[8].data));});
test('certificate requires every part and exact reconstruction',async()=>{const d=db(),docs=evidenceDocuments('synthetic',fixture.manifestHash,'roy-web-0001',fixture.entries[0].payload);for(const x of docs.slice(0,7))await sdk.setDoc(sdk.doc(d,x.path),x.data);await deny(sdk.setDoc(sdk.doc(d,docs[8].path),docs[8].data));await sdk.setDoc(sdk.doc(d,docs[7].path),docs[7].data);const bad=structuredClone(docs[8].data);bad.restrictions=[];await deny(sdk.setDoc(sdk.doc(d,docs[8].path),bad));await sdk.setDoc(sdk.doc(d,docs[8].path),docs[8].data);});

async function rawSourceUpdate(d,old,m){
 const e=m.entries[0];
 const r={...old,revision:old.revision+1,source:{repo:m.sourceRepo,commit:m.sourceCommit,path:e.sourcePath,key:e.sourceKey,version:e.sourceVersion,hash:e.sourceHash,intakeId:m.manifestHash},sourceData:structuredClone(e.payload),payload:structuredClone(e.payload),changeKind:'source',operationId:m.manifestHash,updatedBy:ROY_UID,updatedAt:sdk.serverTimestamp()};
 const b=sdk.writeBatch(d);b.set(sdk.doc(d,`${base}/intakes/${m.manifestHash}`),intakeReceipt(m));b.set(sdk.doc(d,casePath),r);b.set(sdk.doc(d,casePath+'/history/'+r.revision),{record:r});return b.commit();
}

// Deliberately bypass sourceRecord/client validation: exercise server sourceUpdate invariants.
for(const [name,change,sent=false] of [
 ['removed restriction',p=>{p.restrictions.pop();}],
 ['removed confirmed evidence',p=>{p.confirmed_gates.pop();}],
 ['rewritten confirmed evidence',p=>{p.confirmed_gates[31].label='rewritten';}],
 ['rewritten internal note',p=>{p.internal_note='overwritten';}],
 ['skipped source version',(p,m)=>{m.entries[0].sourceVersion+=1;}],
 ['stale expected revision',(p,m)=>{m.entries[0].expectedRevision=0;}],
 ['cleared sent status',p=>{p.sent=false;p.status=p.readiness='NOT_READY';p.sent_evidence=null;},true],
 ['rewritten sent email',p=>{p.email.sent_at='2026-10-10T00:00:00Z';},true],
 ['rewritten sent proof',p=>{p.sent_evidence={kind:'changed'};},true],
 ['rewritten sent offer',p=>{p.offer.amount=1;},true]
])test('raw source update rejects '+name,async()=>{
 const d=db(),initial=await manifest(p=>{maximum(p);p.internal_note='keep this note';if(sent){p.sent=true;p.status=p.readiness='SENT_WAITING';p.sent_evidence={kind:'synthetic'};p.email.sent_at='2026-10-09T00:00:00Z';}});await api(d).ingest(initial);const old=await current(d),m=await manifest(change,old),e=m.entries[0];await stage(d,m);
 await deny(rawSourceUpdate(d,old,m));assert.equal((await current(d)).revision,old.revision);assert.equal((await sdk.getDoc(sdk.doc(d,`${base}/intakes/${m.manifestHash}`))).exists(),false);
 const good=await manifest(()=>{},old);await stage(d,good);await rawSourceUpdate(d,old,good);assert.equal((await current(d)).revision,old.revision+1);
});
test('minimal confirmed send permits explicit unknown facts and retains history',async()=>{
 const d=db(),m=await manifest(p=>{p.sent=true;p.status=p.readiness='SENT_WAITING';p.confirmed_revenue_usd=null;p.sent_evidence={kind:'synthetic-confirmation',observed_at:'2026-10-16T00:00:00Z'};p.email={sent_at:null,subject:'Synthetic'};});
 await api(d).ingest(m);const row=await current(d);assert.equal(row.payload.confirmed_revenue_usd,null);assert.equal(row.payload.email.sent_at,null);assert.equal('body' in row.payload.email,false);
 await manual(d,row,r=>{r.payload.internal_note='Synthetic editorial edit';});
 const after=await current(d);assert.equal(after.payload.email.sent_at,null);
 await deny(manual(d,after,r=>{r.payload.email.sent_at='2026-10-16T00:00:00Z';}));
});
for(const [label,change] of [['missing sent_at',p=>delete p.email.sent_at],['empty sent_at',p=>p.email.sent_at=''],['string revenue',p=>p.confirmed_revenue_usd='0'],['negative revenue',p=>p.confirmed_revenue_usd=-1]])test('minimal send rejects '+label,async()=>{
 const d=db(),m=await manifest(p=>{p.sent=true;p.status=p.readiness='SENT_WAITING';p.confirmed_revenue_usd=null;p.sent_evidence={kind:'synthetic'};p.email={sent_at:null};});await stage(d,m);await pairedCreateDenial(d,m,w=>change(w[2].data.payload));
});
for(const precision of ['second','minute'])test('source fills unknown sent time once at '+precision+' precision',async()=>{
 const d=db(),m=await manifest(p=>{p.sent=true;p.status=p.readiness='SENT_WAITING';p.confirmed_revenue_usd=null;p.sent_evidence={kind:'synthetic'};p.email={sent_at:null,subject:'Keep'};});await api(d).ingest(m);const old=await current(d);
 const n=await manifest(p=>{p.email.sent_at=precision==='minute'?'2026-10-16T12:34+09:00':'2026-10-16T12:34:56Z';p.email.sent_at_precision=precision;},old);await api(d).ingest(n);const updated=await current(d);assert.equal(updated.revision,2);assert.equal(updated.payload.email.sent_at,n.entries[0].payload.email.sent_at);
 const history=await sdk.getDoc(sdk.doc(d,casePath+'/history/1'));assert.equal(history.data().record.payload.email.sent_at,null);
});
for(const [label,change] of [['changed subject',p=>{p.email.sent_at='2026-10-16T12:34:56Z';p.email.subject='Rewritten';}],['removed unknown timestamp',p=>delete p.email.sent_at],['local time without timezone',p=>p.email.sent_at='2026-10-16T12:34'],['changed proof',p=>{p.email.sent_at='2026-10-16T12:34:56Z';p.sent_evidence={kind:'changed'};}]])test('raw source unknown-time enrichment rejects '+label,async()=>{
 const d=db(),m=await manifest(p=>{p.sent=true;p.status=p.readiness='SENT_WAITING';p.confirmed_revenue_usd=null;p.sent_evidence={kind:'synthetic'};p.email={sent_at:null,subject:'Keep'};});await api(d).ingest(m);const old=await current(d),n=await manifest(change,old);await stage(d,n);await deny(rawSourceUpdate(d,old,n));assert.equal((await current(d)).revision,old.revision);
});
