import {canonicalJSON, editPayload} from './store.mjs';
export const ROY_UID='atmDvobZO2U0T5VKrsAe69tEkdt1';
export const SOURCE_REPO='roy-baty-ai/roy-lab';
export const GATE_CODES=['anonymous_reload','gmail_current_history','send_reconciliation','public_preview','visual_qa','sales_screenshot','current_source_contact','bounded_contact_policy_review','initial_send_go'];
export const EDITABLE=['next_action','internal_note','status','readiness','gate_checks','last_checked_at'];
const fail=m=>{throw Error(m);};
const hex=(s,n)=>typeof s==='string'&&new RegExp(`^[0-9a-f]{${n}}$`).test(s);
export const stableId=s=>typeof s==='string'&&/^roy-web-[0-9]{4}$/.test(s);
export async function digest(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJSON(value)));return Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');}
export function validatePayload(p,id){
 if(!p||p.id!==id||!stableId(id)||typeof p.business_name!=='string'||!p.business_name.trim()||p.business_name.length>200)fail('Case identity required');
 if(!Array.isArray(p.confirmed_gates)||!Array.isArray(p.missing_gates)||p.confirmed_gates.length>32||p.missing_gates.length>16)fail('Bounded evidence required');
 for(const [kind,gates] of [['confirmed',p.confirmed_gates],['missing',p.missing_gates]]){
  if(new Set(gates.map(g=>g?.code)).size!==gates.length)fail('Duplicate gate code');
  for(const g of gates)if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).some(k=>!['code','label','evidence'].includes(k))||typeof g.code!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(g.code)||(kind==='missing'&&!GATE_CODES.includes(g.code))||typeof g.label!=='string'||!g.label||g.label.length>500||('evidence'in g&&(typeof g.evidence!=='string'||g.evidence.length>4000)))fail('Invalid gate evidence');
 }
 if(p.confirmed_gates.some(g=>p.missing_gates.some(m=>m.code===g.code)))fail('Gate cannot be confirmed and missing');
 if(!Array.isArray(p.restrictions)||p.restrictions.length>32||p.restrictions.some(v=>typeof v!=='string'||!v||v.length>2000))fail('Restrictions required');
 if(typeof p.confirmed_revenue_usd!=='number'||!Number.isFinite(p.confirmed_revenue_usd)||p.confirmed_revenue_usd<0||p.confirmed_revenue_usd>1000000000)fail('Confirmed revenue must be numeric');
 if(typeof p.sent!=='boolean'||!['NOT_READY','READY_FOR_HUMAN_GO','SENT_WAITING'].includes(p.status)||p.readiness!==p.status||p.sent!==(p.status==='SENT_WAITING'))fail('Inconsistent state');
 if(p.sent&&(!p.sent_evidence||!p.email?.sent_at))fail('Sent proof required');
 if(!p.sent&&p.sent_evidence!==null)fail('Unsent case cannot claim sent proof');
 if(p.preview_url!==null&&!globalThis.OutboundModel.safeUrl(p.preview_url))fail('Invalid preview');
 if(p.status==='READY_FOR_HUMAN_GO'&&(!globalThis.OutboundModel.safeUrl(p.preview_url)||!globalThis.OutboundModel.validDate(p.last_checked_at)))fail('Valid READY URL/time required');
 if(new TextEncoder().encode(canonicalJSON(p)).length>90000)fail('Case too large');
 for(const key of ['next_action','internal_note'])if(typeof p[key]!=='string'||p[key].length>4000)fail('Invalid editorial text');
 if(typeof p.gate_checks!=='object'||p.gate_checks===null||Array.isArray(p.gate_checks))fail('Invalid checks');
 return p;
}
export async function verifyIntake(input,{space}={}){
 const m=structuredClone(input),{manifestHash,...body}=m;
 if(!['real','synthetic'].includes(space)||m.space!==space||m.schemaVersion!==1||m.sourceRepo!==SOURCE_REPO||!hex(m.sourceCommit,40))fail('Wrong source or namespace');
 if(m.finalization?.state!=='finalized'||m.finalization.actor!=='Roy'||typeof m.finalization.evidence!=='string'||m.finalization.evidence.length<8||m.finalization.evidence.length>2000)fail('Explicit Roy finalization receipt required');
 if(!Array.isArray(m.entries)||m.entries.length<1||m.entries.length>10||new Set(m.entries.map(e=>e.caseId)).size!==m.entries.length)fail('1–10 unique stable case IDs required');
 for(const e of m.entries){
  if(!stableId(e.caseId)||!Number.isSafeInteger(e.expectedRevision)||e.expectedRevision<0||!Number.isSafeInteger(e.sourceVersion)||e.sourceVersion<1||!hex(e.sourceHash,64))fail('Invalid version');
  if(!['business/outbound.json','knowledge/ROY_CURRENT_STATE.md'].includes(e.sourcePath)||typeof e.sourceKey!=='string'||!e.sourceKey||e.sourceKey.length>300)fail('Exact source path/key required');
  validatePayload(e.payload,e.caseId);
  if(e.payload.status==='READY_FOR_HUMAN_GO'||Object.keys(e.payload.gate_checks).length)fail('Source ingestion resets READY and manual checks');
  if(await digest(e.payload)!==e.sourceHash)fail('Case content hash mismatch');
 }
 if(!hex(manifestHash,64)||await digest(body)!==manifestHash)fail('Manifest hash mismatch');
 return m;
}
export function intakeReceipt(m){return {schemaVersion:1,space:m.space,sourceRepo:m.sourceRepo,sourceCommit:m.sourceCommit,finalization:m.finalization,entries:Object.fromEntries(m.entries.map(e=>[e.caseId,{expectedRevision:e.expectedRevision,sourceVersion:e.sourceVersion,sourceHash:e.sourceHash,sourcePath:e.sourcePath,sourceKey:e.sourceKey}]))};}
export function sourceRecord(old,e,m){
 if(old&&old.source.version===e.sourceVersion&&old.source.hash===e.sourceHash&&old.source.intakeId===m.manifestHash)return {unchanged:true,record:old};
 if((old?.revision||0)!==e.expectedRevision||e.sourceVersion!==(old?.source.version||0)+1)fail('Revision/source version conflict');
 if(old?.payload.sent&&(!e.payload.sent||canonicalJSON(e.payload.sent_evidence)!==canonicalJSON(old.payload.sent_evidence)||canonicalJSON(e.payload.email)!==canonicalJSON(old.payload.email)||canonicalJSON(e.payload.offer)!==canonicalJSON(old.payload.offer)))fail('Sent evidence is immutable');
 if(old&&!old.payload.restrictions.every(v=>e.payload.restrictions.includes(v)))fail('Restrictions cannot be removed');
 if(old&&!old.payload.confirmed_gates.every(v=>e.payload.confirmed_gates.some(n=>canonicalJSON(n)===canonicalJSON(v))))fail('Keep dated evidence; supersede explicitly');
 const payload=structuredClone(e.payload);if(old)payload.internal_note=old.payload.internal_note;
 return {unchanged:false,record:{schemaVersion:2,revision:(old?.revision||0)+1,source:{repo:m.sourceRepo,commit:m.sourceCommit,path:e.sourcePath,key:e.sourceKey,version:e.sourceVersion,hash:e.sourceHash,intakeId:m.manifestHash},sourceData:structuredClone(e.payload),payload,changeKind:'source',operationId:m.manifestHash}};
}
export function manualRecord(old,patch,revision,operationId){
 if(!hex(operationId,64))fail('Operation ID required');
 if(old.operationId===operationId){if(old.changeKind!=='manual')fail('Operation collision');return {unchanged:true,record:old};}
 if(old.revision!==revision)fail('Revision conflict');
 const payload=editPayload({cases:[old.payload]},old.payload.id,patch).cases[0];validatePayload(payload,payload.id);
 return {unchanged:false,record:{...old,payload,revision:old.revision+1,changeKind:'manual',operationId}};
}
