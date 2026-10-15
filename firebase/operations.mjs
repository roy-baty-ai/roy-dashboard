import '../outbound-model.js';
import {digest} from './intake.mjs';
export const WRITER_UID='roy-results-writer-v1';
export const BUSINESSES={web:'Web制作・営業',youtube:'動画',note:'note',assets:'素材販売',ventures:'新規事業',operations:'運用'};
export const METRICS={listing_urls:['掲載URL','URL（企業数ではない）'],reviewed_records:['個別確認','件（保留を含む）'],sent_messages:['送信','通'],reply_messages:['返信','通'],scheduled_items:['予約','件'],published_items:['公開確認','件'],revenue_usd:['確認済み売上','USD']};
export const STATES=['unknown','active','waiting','hold','blocked','complete'];
const fail=()=>{throw Object.assign(Error('invalid-operation'),{code:'invalid-argument'});};
const text=(v,n)=>typeof v==='string'&&v.length<=n;
export function validateOperation(input){
 const p=structuredClone(input),keys=['schemaVersion','businessId','expectedRevision','sourceCommit','state','progress','nextAction','observedAt','evidence','metrics'];
 if(!p||Object.keys(p).length!==keys.length||Object.keys(p).some(k=>!keys.includes(k))||p.schemaVersion!==1||!Object.hasOwn(BUSINESSES,p.businessId)||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0||p.expectedRevision>=1000000||!(/^[a-f0-9]{40}$/).test(p.sourceCommit)||!STATES.includes(p.state)||!text(p.progress,2000)||!text(p.nextAction,2000)||!text(p.evidence,1000))fail();
 if(p.observedAt===null?(p.state!=='unknown'||p.evidence!==''):(!globalThis.OutboundModel.validDate(p.observedAt)||!p.evidence.trim()))fail();
 if(!p.metrics||typeof p.metrics!=='object'||Array.isArray(p.metrics)||Object.keys(p.metrics).some(k=>!Object.hasOwn(METRICS,k)))fail();
 for(const [key,m] of Object.entries(p.metrics)){
  if(!m||Object.keys(m).length!==3||Object.keys(m).some(k=>!['value','observedAt','evidence'].includes(k))||!text(m.evidence,1000))fail();
  if(m.value===null){if(m.observedAt!==null||m.evidence!=='')fail();}
  else if(typeof m.value!=='number'||!Number.isFinite(m.value)||m.value<0||m.value>1e9||(key!=='revenue_usd'&&!Number.isSafeInteger(m.value))||!globalThis.OutboundModel.validDate(m.observedAt)||!m.evidence.trim()||p.observedAt===null||Date.parse(m.observedAt)>Date.parse(p.observedAt))fail();
 }
 return p;
}
export function createOperationsStore(sdk,db,auth,{space='synthetic'}={}){
 if(!['synthetic','real'].includes(space))throw Error('Invalid space');
 const base=`privateRoy/${space}`,ref=p=>sdk.doc(db,`${base}/${p}`),actor=()=>{if(!auth.currentUser)throw Object.assign(Error(),{code:'unauthenticated'});return auth.currentUser.uid;};
 return {
  watchOperations(next,error){
   let stopped=false;const records={},unsub=[];
   for(const key of [...Object.keys(BUSINESSES),'sync'])unsub.push(sdk.onSnapshot(ref(key==='sync'?'sync/current':`businesses/${key}`),{includeMetadataChanges:true},snap=>{
    if(stopped)return;if(snap.metadata.fromCache||snap.metadata.hasPendingWrites){delete records[key];next(null);return;}
    records[key]=snap.exists()?snap.data():null;
    if(Object.keys(records).length===Object.keys(BUSINESSES).length+1)next({...records});
   },e=>{if(!stopped){stopped=true;unsub.forEach(fn=>fn());next(null);error(e);}}));
   return()=>{stopped=true;unsub.forEach(fn=>fn());};
  },
  async saveOperation(input){
   const p=validateOperation(input),eventId=await digest(p),uid=actor();
   const revision=await sdk.runTransaction(db,async tx=>{
    const control=await tx.get(ref('control/state')),old=await tx.get(ref(`businesses/${p.businessId}`));
    if(control.data()?.mode!=='active')throw Object.assign(Error(),{code:'failed-precondition'});
    if(old.exists()&&old.data().eventId===eventId)return old.data().revision;
    if(old.exists()&&p.expectedRevision<old.data().revision){const past=await tx.get(ref(`businesses/${p.businessId}/history/${p.expectedRevision+1}`));if(past.exists()&&past.data().record.eventId===eventId)return p.expectedRevision+1;}
    if((old.data()?.revision||0)!==p.expectedRevision||old.data()?.observedAt&&(!p.observedAt||Date.parse(p.observedAt)<Date.parse(old.data().observedAt)))throw Object.assign(Error(),{code:'aborted'});
    const {expectedRevision,...body}=p,record={...body,eventId,revision:expectedRevision+1,updatedBy:uid,updatedAt:sdk.serverTimestamp()};
    tx.set(ref(`businesses/${p.businessId}`),record);tx.set(ref(`businesses/${p.businessId}/history/${record.revision}`),{record});return record.revision;
   });
   await sdk.runTransaction(db,async tx=>{
    const [now,history]=await Promise.all([tx.get(ref(`businesses/${p.businessId}`)),tx.get(ref(`businesses/${p.businessId}/history/${revision}`))]);
    if(!now.exists()||!history.exists()||now.data().revision<revision||history.data().record.eventId!==eventId)throw Error('Operation readback mismatch');
    const {revision:r,eventId:id,updatedAt,updatedBy,...body}=history.data().record;
    if(await digest({...body,expectedRevision:p.expectedRevision})!==eventId||r!==revision||updatedBy!==uid)throw Error('Operation readback mismatch');
   });return {revision,eventId};
  },
  async saveSync(state,code='none'){
   const allowed=['none','validation','conflict','permission-denied','unavailable','source-unavailable'];
   if(!['ok','failed'].includes(state)||!allowed.includes(code)||(state==='ok')!==(code==='none'))throw Error('Invalid sync');
   const uid=actor();return sdk.runTransaction(db,async tx=>{
    const old=await tx.get(ref('sync/current'));const record={schemaVersion:1,revision:(old.data()?.revision||0)+1,state,code,lastSuccessAt:state==='ok'?sdk.serverTimestamp():(old.data()?.lastSuccessAt||null),updatedAt:sdk.serverTimestamp(),updatedBy:uid};tx.set(ref('sync/current'),record);
   });
  }
 };
}
