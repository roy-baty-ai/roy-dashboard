export function validateConfig(config) {
  if (!config?.enabled) return false;
  if (config.authProvider !== 'google' || !['apiKey','authDomain','projectId','appId'].every(k => typeof config.firebase?.[k] === 'string' && config.firebase[k].trim())) throw Error('接続先と認証プロバイダーの確認が必要です。');
  return true;
}
export function aggregate(payload, parse) {
  const cases = parse(payload);
  return { caseCount: cases.length, readyCount: cases.filter(c=>c.state==='ready').length, preparingCount: cases.filter(c=>c.state==='preparing').length, sentCount: cases.filter(c=>c.state==='sent').length, previewCount: cases.filter(c=>c.previewUrl).length, confirmedRevenueUsd: payload.summary.operating_revenue_usd_last_recorded, targetCount: 10 };
}
export function editPayload(payload, id, patch) {
  const allowed=['next_action','internal_note','status','readiness','confirmed_gates','missing_gates','last_checked_at'];
  if (!patch || Object.keys(patch).some(k=>!allowed.includes(k))) throw Error('更新項目が不正です。');
  const matches=payload.cases.filter(c=>c.id===id);if(matches.length!==1)throw Error('案件IDが不正です。');
  const old=matches[0];
  for(const key of ['next_action','internal_note'])if(key in patch && (typeof patch[key]!=='string'||patch[key].length>4000))throw Error('文字数が不正です。');
  if('last_checked_at' in patch && (typeof patch.last_checked_at!=='string'||!Number.isFinite(Date.parse(patch.last_checked_at))||!/(Z|[+-]\d{2}:\d{2})$/.test(patch.last_checked_at)))throw Error('タイムゾーン付き確認日時が必要です。');
  if('status' in patch || 'readiness' in patch) {
    if(old.sent || !['NOT_READY','READY_FOR_HUMAN_GO'].includes(patch.status)||patch.readiness!==patch.status)throw Error('送信履歴・GOはこの画面で変更できません。');
  }
  for(const key of ['confirmed_gates','missing_gates'])if(key in patch && (!Array.isArray(patch[key])||patch[key].some(g=>!g||typeof g.code!=='string'||typeof g.label!=='string')))throw Error('確認項目が不正です。');
  if('confirmed_gates' in patch || 'missing_gates' in patch){
    if(!patch.confirmed_gates||!patch.missing_gates)throw Error('確認項目の両方が必要です。');
    const before=[...(old.confirmed_gates||[]),...(old.missing_gates||[])];
    const after=[...patch.confirmed_gates,...patch.missing_gates];
    if(new Set(before.map(g=>g.code)).size!==before.length || after.length!==before.length || new Set(after.map(g=>g.code)).size!==after.length || after.some(g=>!before.some(b=>JSON.stringify(b)===JSON.stringify(g))))throw Error('既存確認項目の追加・削除・本文変更はできません。');
    if(JSON.stringify(old.missing_gates?.filter(g=>g.code==='initial_send_go'))!==JSON.stringify(patch.missing_gates.filter(g=>g.code==='initial_send_go')))throw Error('営業GOの記録は変更できません。');
  }
  const next=structuredClone(payload),row=next.cases.find(c=>c.id===id);Object.assign(row,patch);
  if(row.status==='READY_FOR_HUMAN_GO' && (!row.preview_url||!Number.isFinite(Date.parse(row.last_checked_at))||row.missing_gates.some(g=>g.code!=='initial_send_go')))throw Error('READYに必要な確認が残っています。');
  return next;
}
export function canonicalJSON(value) {
  if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function prepareImport(text,expectedHash,parse) {
  if(!/^[0-9a-f]{64}$/.test(expectedHash))throw Error('承認済みhashが必要です。');
  if(new TextEncoder().encode(text).length>500000)throw Error('移行ファイルが大きすぎます。');
  const payload=JSON.parse(text),rows=payload.cases;
  if(payload.schema_version!==1 || !Array.isArray(rows)||rows.length!==8 || rows.some(c=>typeof c.id!=='string'||!c.id)||new Set(rows.map(c=>c.id)).size!==8)throw Error('8案件・重複なしのIDを確認してください。');
  parse(payload);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJSON(payload)));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==expectedHash)throw Error('承認済みhashと一致しません。');
  const counts=aggregate(payload,parse);
  if(payload.summary.case_count!==8 || payload.summary.ready_for_human_go!==counts.readyCount || payload.summary.sent_cases_in_this_view!==counts.sentCount)throw Error('元データの集計が一致しません。');
  return {payload,sourceHash:hash,counts};
}
export function createStore(sdk, app, auth, parse) {
  const db=sdk.initializeFirestore(app,{localCache:sdk.memoryLocalCache()});
  const ref=path=>sdk.doc(db,path);
  const watch=(path,next,error)=>sdk.onSnapshot(ref(path),{includeMetadataChanges:true},snap=>next(!snap.metadata.fromCache && !snap.metadata.hasPendingWrites && snap.exists()?snap.data():null),error);
  return {
    onAuth: fn=>sdk.onIdTokenChanged(auth,fn),
    watchAccess:(uid,next,error)=>watch(`admins/${uid}`,v=>next(v?.enabled===true),error),
    watchControl:(next,error)=>watch('control/source',next,error),
    watchPrivate:(next,error)=>watch('privatePipeline/current',next,error),
    watchPublic:(next,error)=>watch('publicSummary/current',next,error),
    logout:()=>sdk.signOut(auth),
    async importInitial(prepared) {
      const uid=auth.currentUser?.uid;if(!uid)throw Error('未認証');
      const verified=await prepareImport(JSON.stringify(prepared.payload),prepared.sourceHash,parse);
      return sdk.runTransaction(db,async tx=>{
        const control=await tx.get(ref('control/source')),existing=await tx.get(ref('privatePipeline/current'));
        if(control.data()?.mode!=='migration'||control.data()?.approvedSourceHash!==verified.sourceHash)throw Error('移行モード・承認hashを確認してください。');
        if(existing.exists())throw Error('移行先は空ではありません。上書きしません。');
        tx.set(ref('privatePipeline/current'),{payload:verified.payload,sourceHash:verified.sourceHash,revision:1,updatedAt:sdk.serverTimestamp(),updatedBy:uid});
      });
    },
    async save(id,patch,revision) {
      const uid=auth.currentUser?.uid;if(!uid) throw Error('未認証');
      return sdk.runTransaction(db,async tx=>{
        const control=await tx.get(ref('control/source')); const snapshot=await tx.get(ref('privatePipeline/current'));
        if(control.data()?.mode!=='firestore') throw Error('正本はまだJSONです');
        if(!snapshot.exists()||snapshot.data().revision!==revision) throw Error('更新競合');
        const old=snapshot.data(), payload=editPayload(old.payload,id,patch), nextRevision=revision+1;
        const totals=aggregate(payload,parse); Object.assign(payload.summary,{ready_for_human_go:totals.readyCount,not_ready_unsent_count:totals.preparingCount,ready_case_ids:payload.cases.filter(c=>c.status==='READY_FOR_HUMAN_GO'&&!c.sent).map(c=>c.id)});
        tx.set(ref('privatePipeline/current'),{...old,payload,revision:nextRevision,updatedAt:sdk.serverTimestamp(),updatedBy:uid});
        tx.set(ref('publicSummary/current'),{...aggregate(payload,parse),revision:nextRevision,updatedAt:sdk.serverTimestamp()});
      });
    }
  };
}
