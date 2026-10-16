// Expose only metadata from the existing server-backed, authenticated stream.
// No separate Firebase app, credentials, network request or write operation.
export function registryObservation(records,receivedAt=new Date().toISOString()) {
 return {receivedAt,cases:records.map(record=>({
  caseId:record.payload.id,revision:record.revision,
  sourceVersion:record.source?.version??null,sourceCommit:record.source?.commit??null,
  sourcePath:record.source?.path??null,sourceKey:record.source?.key??null
 }))};
}
export function createRegistryInspectionView(parent){
 const details=document.createElement('details'),summary=document.createElement('summary'),note=document.createElement('p'),output=document.createElement('pre');
 details.id='registry-inspection';details.hidden=true;
 summary.textContent='DB取込み前の照合情報（読取り専用）';
 note.textContent='既存のサーバー購読から受信した案件ID・版番号・原本参照です。受信日時は業務確認日時ではありません。宛先と原本の一致を確認してから対応付けます。';
 output.id='registry-inspection-output';output.style.whiteSpace='pre-wrap';output.style.overflowWrap='anywhere';
 details.append(summary,note,output);parent.append(details);
 let observation=null,control=null;
 const render=()=>{details.hidden=!observation;if(!observation){output.textContent='';details.open=false;return;}
  output.textContent=JSON.stringify({control:control?{mode:control.mode==='firestore'?'active':control.mode,allowSourceIngest:typeof control.allowSourceIngest==='boolean'?control.allowSourceIngest:null}:null,...observation},null,2);
 };
 return {show(value){observation=value??null;render();},control(value){control=value;render();},clear(){observation=null;control=null;render();}};
}
