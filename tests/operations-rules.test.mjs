import {test,beforeEach,after} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import * as sdk from 'firebase/firestore';
import {operationsRules} from '../scripts/build-operations-rules.mjs';import {createOperationsStore,WRITER_UID} from '../firebase/operations.mjs';import {createPerCaseStore} from '../firebase/per-case-store.mjs';import {ROY_UID} from '../firebase/intake.mjs';
const env=await initializeTestEnvironment({projectId:'demo-roy-local',firestore:{host:'127.0.0.1',port:8085,rules:await operationsRules()}});after(()=>env.cleanup());
const ownerClaims={email:'roy.lab.20261001@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
const claims=()=>({roy_writer:true,writer_scope:'results-v1',auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'custom'}});
const context=(uid=WRITER_UID,c=claims())=>uid?env.authenticatedContext(uid,c).firestore():env.unauthenticatedContext().firestore();
const base='privateRoy/real',path=base+'/businesses/note';
const api=d=>createOperationsStore(sdk,d,{currentUser:{uid:WRITER_UID}},{space:'real'});
const sample=()=>({schemaVersion:1,businessId:'note',expectedRevision:0,sourceCommit:'a'.repeat(40),state:'active',progress:'Synthetic progress',nextAction:'Synthetic next',observedAt:'2026-10-15T00:00:00Z',evidence:'Synthetic reference',metrics:{published_items:{value:0,observedAt:'2026-10-15T00:00:00Z',evidence:'Synthetic zero'},scheduled_items:{value:null,observedAt:null,evidence:''}}});
const deny=p=>assert.rejects(p,e=>e.code==='permission-denied'&&!/maximum|too complex/i.test(e.message));
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await sdk.setDoc(sdk.doc(d,'admins/'+ROY_UID),{enabled:true});await sdk.setDoc(sdk.doc(d,base+'/control/state'),{mode:'active',allowSourceIngest:true});await sdk.setDoc(sdk.doc(d,base+'/control/automation'),{enabled:true});});});
test('dedicated writer saves business/history, retries idempotently, rejects stale revision and preserves sync failure',async()=>{
 const d=context(),s=api(d),p=sample();assert.equal((await s.saveOperation(p)).revision,1);assert.equal((await s.saveOperation(p)).revision,1);await assert.rejects(s.saveOperation({...p,nextAction:'conflict'}),{code:'aborted'});
 await s.saveSync('ok');const before=(await sdk.getDoc(sdk.doc(d,base+'/sync/current'))).data();await s.saveSync('failed','unavailable');const after=(await sdk.getDoc(sdk.doc(d,base+'/sync/current'))).data();assert.equal(after.state,'failed');assert.ok(after.lastSuccessAt.isEqual(before.lastSuccessAt));assert.equal((await sdk.getDoc(sdk.doc(d,path+'/history/1'))).data().record.metrics.published_items.value,0);
 const owner=context(ROY_UID,ownerClaims);assert.equal((await sdk.getDoc(sdk.doc(owner,path))).data().businessId,'note');
});
for(const [name,uid,change] of [['anonymous',null,c=>c],['other user','other',c=>c],['wrong provider',WRITER_UID,c=>({...c,firebase:{sign_in_provider:'google.com'}})],['missing scope',WRITER_UID,c=>({...c,writer_scope:'other'})],['expired session',WRITER_UID,c=>({...c,auth_time:Math.floor(Date.now()/1000)-3601})],['owner UID custom impersonation',ROY_UID,c=>({...c,email:ownerClaims.email,email_verified:true})]])test(name+' denied business reads/writes',async()=>{const d=context(uid,change(claims()));await deny(sdk.getDoc(sdk.doc(d,path)));await deny(api(d).saveOperation(sample()));});
test('writer cannot grant permissions, delete history, read legacy private state or promote READY',async()=>{
 const d=context(),s=api(d);await s.saveOperation(sample());
 for(const p of ['admins/'+ROY_UID,base+'/control/automation',base+'/control/state'])await deny(sdk.setDoc(sdk.doc(d,p),{enabled:true,mode:'active'}));
 await deny(sdk.getDoc(sdk.doc(d,'privatePipeline/current')));await deny(sdk.deleteDoc(sdk.doc(d,path+'/history/1')));
 const m=JSON.parse(readFileSync(new URL('./fixtures/synthetic-one-intake.json',import.meta.url)));m.space='real';const {digest}=await import('../firebase/intake.mjs');delete m.manifestHash;m.manifestHash=await digest(m);
 const cases=createPerCaseStore({...sdk,initializeFirestore:()=>d},{},{currentUser:{uid:WRITER_UID}},globalThis.OutboundModel.parse,{space:'real',writerUid:WRITER_UID});await cases.ingest(m);await cases.readback(m);
 const casePath=base+'/cases/roy-web-0001',old=(await sdk.getDoc(sdk.doc(d,casePath))).data();const changed={...old,changeKind:'manual',operationId:'f'.repeat(64),revision:2,updatedAt:sdk.serverTimestamp(),payload:{...old.payload,status:'READY_FOR_HUMAN_GO',readiness:'READY_FOR_HUMAN_GO'}};
 const b=sdk.writeBatch(d);b.set(sdk.doc(d,casePath),changed);b.set(sdk.doc(d,casePath+'/history/2'),{record:changed});await deny(b.commit());
 await cases.saveWorkResult({schemaVersion:1,eventId:'synthetic-worker',caseId:'roy-web-0001',progress:'Synthetic work',nextAction:'Synthetic next',completedAt:null,receivedAt:'2026-10-15T00:00:00Z',evidence:['Synthetic reference']});
});
test('kill switch denies existing token immediately and anonymous cannot list businesses',async()=>{
 const d=context();await api(d).saveOperation(sample());await env.withSecurityRulesDisabled(c=>sdk.updateDoc(sdk.doc(c.firestore(),base+'/control/automation'),{enabled:false}));await deny(sdk.getDoc(sdk.doc(d,path)));await deny(api(d).saveSync('ok'));await deny(sdk.getDocs(sdk.collection(context(null),base+'/businesses')));
});
test('business rejects extra fields, mismatched history and unsupported metric units',async()=>{
 const d=context(),s=api(d);await s.saveOperation(sample());const old=(await sdk.getDoc(sdk.doc(d,path))).data();
 for(const mutate of [r=>r.extra='unexpected',r=>r.metrics.companies={value:10,observedAt:null,evidence:''},r=>r.metrics.published_items.value=-1]){
  const r={...old,metrics:structuredClone(old.metrics),revision:2,eventId:'c'.repeat(64),updatedAt:sdk.serverTimestamp()};mutate(r);const b=sdk.writeBatch(d);b.set(sdk.doc(d,path),r);b.set(sdk.doc(d,path+'/history/2'),{record:r});await deny(b.commit());
 }
});
