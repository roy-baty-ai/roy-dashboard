import {test,after,beforeEach} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs,writeBatch,serverTimestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-roy-local',firestore:{host:'127.0.0.1',port:8085,rules:readFileSync('firebase/firestore.rules','utf8')}});
after(()=>env.cleanup());
const db=uid=>uid?env.authenticatedContext(uid,{email_verified:true,email:'roy.lab.20261001@gmail.com',firebase:{sign_in_provider:'google.com'}}).firestore():env.unauthenticatedContext().firestore();
const privateData=(rev=1)=>({revision:rev,sourceHash:'0'.repeat(64),payload:{schema_version:1,cases:Array.from({length:8},(_,i)=>({id:'fake-'+i,preview_url:null,sent:false,status:'NOT_READY',readiness:'NOT_READY',confirmed_gates:[],missing_gates:[],last_checked_at:'2026-10-08T00:00:00Z'})),summary:{not_ready_unsent_count:8,ready_for_human_go:0,sent_cases_in_this_view:0,operating_revenue_usd_last_recorded:0}},updatedBy:'atmDvobZO2U0T5VKrsAe69tEkdt1',updatedAt:serverTimestamp()});
const publicData=rev=>({caseCount:8,readyCount:0,preparingCount:8,sentCount:0,previewCount:0,confirmedRevenueUsd:0,targetCount:10,revision:rev,updatedAt:serverTimestamp()});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'admins/atmDvobZO2U0T5VKrsAe69tEkdt1'),{enabled:true});await setDoc(doc(ctx.firestore(),'control/source'),{mode:'json'});await setDoc(doc(ctx.firestore(),'privatePipeline/current'),privateData());await setDoc(doc(ctx.firestore(),'publicSummary/current'),publicData(1));});});
test('anonymous only gets public summary; no list or private access',async()=>{await assertSucceeds(getDoc(doc(db(),'publicSummary/current')));for(const path of ['privatePipeline/current','admins/atmDvobZO2U0T5VKrsAe69tEkdt1','control/source'])await assertFails(getDoc(doc(db(),path)));await assertFails(getDocs(collection(db(),'publicSummary')));});
test('unapproved and revoked accounts are denied',async()=>{await assertFails(getDoc(doc(db('outsider-test'),'privatePipeline/current')));await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'admins/atmDvobZO2U0T5VKrsAe69tEkdt1'),{enabled:false}));await assertFails(getDoc(doc(db('atmDvobZO2U0T5VKrsAe69tEkdt1'),'privatePipeline/current')));});
test('allowlisted verified account reads but cannot grant access or flip source',async()=>{const d=db('atmDvobZO2U0T5VKrsAe69tEkdt1');await assertSucceeds(getDoc(doc(d,'privatePipeline/current')));await assertFails(setDoc(doc(d,'admins/other-test'),{enabled:true}));await assertFails(updateDoc(doc(d,'control/source'),{mode:'firestore'}));});
test('unverified email is denied even on allowlist',async()=>{const d=env.authenticatedContext('atmDvobZO2U0T5VKrsAe69tEkdt1',{email_verified:false,email:'roy.lab.20261001@gmail.com',firebase:{sign_in_provider:'google.com'}}).firestore();await assertFails(getDoc(doc(d,'privatePipeline/current')));});
test('JSON remains canonical: even owner cannot update',async()=>{await assertFails(setDoc(doc(db('atmDvobZO2U0T5VKrsAe69tEkdt1'),'privatePipeline/current'),privateData(2)));});
test('active mode requires revision and atomic numeric-only public projection',async()=>{await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'control/source'),{mode:'firestore'}));const d=db('atmDvobZO2U0T5VKrsAe69tEkdt1');await assertFails(setDoc(doc(d,'privatePipeline/current'),privateData(2)));const batch=writeBatch(d);batch.set(doc(d,'privatePipeline/current'),privateData(2));batch.set(doc(d,'publicSummary/current'),publicData(2));await assertSucceeds(batch.commit());const leak=writeBatch(d);leak.set(doc(d,'privatePipeline/current'),privateData(3));leak.set(doc(d,'publicSummary/current'),{...publicData(3),recipient:'secret@example.invalid'});await assertFails(leak.commit());await assertFails(deleteDoc(doc(d,'privatePipeline/current')));});
test('migration creates singleton once, never overwrites existing data',async()=>{await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'control/source'),{mode:'migration',approvedSourceHash:'0'.repeat(64)});await deleteDoc(doc(ctx.firestore(),'privatePipeline/current'));});const d=db('atmDvobZO2U0T5VKrsAe69tEkdt1');await assertSucceeds(setDoc(doc(d,'privatePipeline/current'),privateData()));await assertFails(setDoc(doc(d,'privatePipeline/current'),privateData()));});
test('same UID cannot authenticate with wrong email or non-Google provider',async()=>{
 for(const claims of [{email_verified:true,email:'other@example.invalid',firebase:{sign_in_provider:'google.com'}},{email_verified:true,email:'roy.lab.20261001@gmail.com',firebase:{sign_in_provider:'password'}}]){
  await assertFails(getDoc(doc(env.authenticatedContext('atmDvobZO2U0T5VKrsAe69tEkdt1',claims).firestore(),'privatePipeline/current')));
 }
});
test('GO evidence arrays cannot be added, removed or rewritten via ordinary update',async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'control/source'),{mode:'firestore'}));
 for(const change of [c=>c.missing_gates.push({code:'initial_send_go',label:'forged'}),c=>c.confirmed_gates.push({code:'initial_send_go',label:'forged approval'}),c=>c.gate_checks={initial_send_go:true}]){
  const value=privateData(2);change(value.payload.cases[0]);const d=db('atmDvobZO2U0T5VKrsAe69tEkdt1'),b=writeBatch(d);b.set(doc(d,'privatePipeline/current'),value);b.set(doc(d,'publicSummary/current'),publicData(2));await assertFails(b.commit());
 }
});
test('summary/public cannot claim READY8 for eight NOT_READY cases or false preview counts',async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'control/source'),{mode:'firestore'}));
 for(const forgedReady of [true,false]){
  const value=privateData(2),summary=publicData(2);if(forgedReady){value.payload.summary.ready_for_human_go=8;value.payload.summary.not_ready_unsent_count=0;summary.readyCount=8;summary.preparingCount=0;}else{summary.previewCount=8;}
  const d=db('atmDvobZO2U0T5VKrsAe69tEkdt1'),b=writeBatch(d);b.set(doc(d,'privatePipeline/current'),value);b.set(doc(d,'publicSummary/current'),summary);await assertFails(b.commit());
 }
});
test('public reads reject administrator-inserted extra fields and wrong types',async()=>{
 for(const bad of [{...publicData(1),recipient:'fake@example.invalid'},{...publicData(1),caseCount:'8'}]){
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'publicSummary/current'),bad));
  await assertFails(getDoc(doc(db(),'publicSummary/current')));
 }
});
