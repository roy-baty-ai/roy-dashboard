import {BUSINESSES,METRICS} from './operations.mjs';
const labels={unknown:'未取得',active:'進行中',waiting:'外部待ち',hold:'保留',blocked:'停止要因あり',complete:'完了'};
const node=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
export function createOperationsView(){
 const root=document.createElement('section');root.id='business-progress';root.className='panel card business-progress';document.getElementById('sales-metrics').after(root);
 let record=null;
 const clear=()=>{record=null;root.replaceChildren(node('h2','事業全体の進捗'),node('p','未取得：認証とサーバー記録の確認が必要です。'));};
 const render=()=>{
  if(!record)return;
  root.replaceChildren(node('h2','事業全体の進捗'));
  const sync=record.sync,time=sync?.updatedAt?.toDate?.(),success=sync?.lastSuccessAt?.toDate?.();
  const stale=!time||Date.now()-time.getTime()>90*60000;
  root.append(node('p',!sync?'同期状態：未取得':`${sync.state==='failed'?'同期失敗：'+sync.code:stale?'同期記録が古い（90分超）':'同期処理の成功記録あり'}。最終試行 ${time?.toISOString()||'未取得'} ／ 最終成功 ${success?.toISOString()||'未取得'}。業務確認日時とは別です。`));
  for(const [id,label] of Object.entries(BUSINESSES)){
   const row=record[id],article=node('article','');article.append(node('h3',label));
   if(!row){article.append(node('p','未取得'));root.append(article);continue;}
   const age=row.observedAt&&Date.now()-Date.parse(row.observedAt)>86400000?'・古い業務記録（24時間超）':'';
   article.append(node('p',`${labels[row.state]||'未取得'}${age} ／ 業務確認 ${row.observedAt||'未取得'}`),node('p',row.progress),node('p','次の対応：'+(row.nextAction||'未取得')));
   for(const [key,m] of Object.entries(row.metrics||{})){if(!METRICS[key])continue;article.append(node('p',`${METRICS[key][0]}：${m.value===null?'未取得':m.value+' '+METRICS[key][1]} ／ 確認 ${m.observedAt||'未取得'}`));}
   article.append(node('p','DB反映：'+(row.updatedAt?.toDate?.().toISOString()||'未取得')));root.append(article);
  }
 };
 clear();const timer=setInterval(render,30000);
 return {clear,show(value){if(!value){clear();return;}record=value;render();},dispose(){clearInterval(timer);clear();}};
}
