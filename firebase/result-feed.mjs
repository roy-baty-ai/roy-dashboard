import {validateWorkResult} from './work-results.mjs';
import {verifyIntake,digest} from './intake.mjs';
import {safeFailure,ingestAndVerify} from './intake-diagnostics.mjs';

// The producer atomically replaces a private local file. No endpoint, token,
// persistent file handle or service account is introduced by this consumer.
export function createResultFeed({store,space,read,canWrite,onStatus=()=>{},intervalMs=5000}) {
 let stopped=false,busy=false,timer,epoch=0;
 const verified=new Set();
 const report=v=>{if(!stopped)onStatus(v);};
 async function poll(){
  if(stopped||busy)return;
  busy=true;const generation=epoch;
  try{
   if(!canWrite())throw Object.assign(Error(),{code:'unauthenticated'});
   const content=await read();
   if(stopped||generation!==epoch)return;
   if(typeof content!=='string'||new TextEncoder().encode(content).length>1000000)throw Error('Invalid feed');
   const feed=JSON.parse(content);
   if(feed?.schemaVersion!==1||feed.space!==space||Object.keys(feed).some(k=>!['schemaVersion','space','items'].includes(k))||!Array.isArray(feed.items)||feed.items.length>100)throw Error('Invalid feed');
   // Validate the whole file before its first write. Read errors never imply 0.
   const batch=[];
   for(const item of feed.items){
    if(!item||Object.keys(item).some(k=>!['kind','value'].includes(k)))throw Error('Invalid item');
    const value=item.kind==='work-result'?validateWorkResult(item.value):item.kind==='intake'?await verifyIntake(item.value,{space}):null;
    if(!value)throw Error('Invalid item');
    batch.push({kind:item.kind,value,hash:await digest(item)});
   }
   let completed=0;
   for(const item of batch){
    if(stopped||generation!==epoch)return;
    if(!canWrite())throw Object.assign(Error(),{code:'unauthenticated'});
    if(!verified.has(item.hash)){
     report({state:'saving',completed,total:batch.length});
     if(item.kind==='work-result')await store.saveWorkResult(item.value);
     else {const result=await ingestAndVerify(store,item.value);if(!result.ok)throw Object.assign(Error(),{code:result.code});}
     if(stopped||generation!==epoch)return;
     verified.add(item.hash);
    }
    completed++;
   }
   report({state:'watching',completed,total:batch.length,checkedAt:new Date().toISOString()});
  }catch(error){report({state:'failed',...safeFailure('result-feed',error)});stop(false);}
  finally{busy=false;if(!stopped)timer=setTimeout(poll,Math.max(1000,intervalMs));}
 }
 function stop(notify=true){if(stopped)return;stopped=true;epoch++;clearTimeout(timer);verified.clear();if(notify)onStatus({state:'stopped'});}
 return {start:poll,stop};
}

export function attachResultFeed({store,space,canWrite,chooseFile=()=>window.showOpenFilePicker({multiple:false,types:[{description:'Roy private result feed',accept:{'application/json':['.json']}}]})}){
 const section=document.createElement('section'),title=document.createElement('h4'),note=document.createElement('p'),start=document.createElement('button'),stop=document.createElement('button'),status=document.createElement('p');
 title.textContent='業務結果の継続取込み';
 note.textContent='Royが更新する非公開の結果ファイルを選択します。この画面を開き、認証が有効な間だけ約5秒ごとに確認します（バックグラウンドでは遅れる場合があります）。送信・返信の変更には確定原本が必要です。ブラウザー終了中の同期は行いません。';
 start.textContent='結果ファイルを選んで同期';start.type=stop.type='button';start.id='result-feed-start';stop.textContent='同期を停止';stop.disabled=true;
 status.id='result-feed-status';status.setAttribute('role','status');status.textContent='未接続：業務結果の同期は開始していません。';
 section.append(title,note,start,stop,status);document.getElementById('firebase-panel').append(section);
 let feed=null,generation=0;
 const halt=()=>{generation++;feed?.stop();feed=null;stop.disabled=true;};
 start.onclick=async()=>{
  halt();const token=generation;
  if(!canWrite()){status.textContent='未接続：認証と書込可能なサーバー記録を確認してください。';return;}
  try{
   const [handle]=await chooseFile();if(token!==generation||!canWrite())return;
   feed=createResultFeed({store,space,canWrite,read:async()=>{const file=await handle.getFile();if(file.size>1000000)throw Error();return file.text();},onStatus:value=>{
    const labels={saving:'同期中：サーバー反映と履歴を照合しています。',watching:`監視中：${value.completed}/${value.total}件を照合済み。ファイル確認 ${value.checkedAt}。業務の最新確認とは別です。`,failed:`同期失敗・停止：${value.code}。部分保存の可能性があります。サーバー記録を確認してから再開してください。`,stopped:'同期停止：新しい業務結果は取り込まれません。'};
    status.textContent=labels[value.state];if(['failed','stopped'].includes(value.state))stop.disabled=true;
   }});stop.disabled=false;await feed.start();
  }catch(error){if(token===generation)status.textContent=error?.name==='AbortError'?'ファイル選択を中止しました。':'ファイルを開けません。同期は開始していません。';}
 };
 stop.onclick=halt;
 if(!window.showOpenFilePicker){start.disabled=true;status.textContent='このブラウザーは継続ファイル読取りに未対応です。既存の原本取込みを使用してください。';}
 return {stop:halt};
}
