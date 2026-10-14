import '../outbound-model.js';
const iso=value=>{try{const d=value?.toDate?.();return d instanceof Date&&Number.isFinite(d.getTime())?d.toISOString():null;}catch{return null;}};
export function recordFreshness(records){
 const checked=records.map(r=>r.payload?.last_checked_at).filter(v=>globalThis.OutboundModel.validDate(v));
 const written=records.map(r=>iso(r.updatedAt)).filter(Boolean);
 const span=values=>values.length?{oldest:values.reduce((a,b)=>Date.parse(a)<Date.parse(b)?a:b),latest:values.reduce((a,b)=>Date.parse(a)>Date.parse(b)?a:b)}:null;
 return {caseCount:records.length,checkedCount:checked.length,checked:span(checked),writtenCount:written.length,written:span(written)};
}
export function freshnessText(info,control){
 const count=info?.caseCount;
 const times=(v,n,total)=>total===0?'対象なし':!Number.isInteger(total)?'未取得':!v?`未取得（${n}/${total}件）`:`${v.oldest} 〜 ${v.latest}（記録あり ${n}/${total}件）`;
 const write=control?.mode==='paused'?'書込停止':control?.mode==='firestore'?(control.allowSourceIngest===true?'取込・編集が許可中':'取込停止・編集が許可中'):'書込設定は未取得';
 return `対象：${Number.isInteger(count)?count+'案件（現在のregistry）':'未取得'}。業務確認日時：${times(info?.checked,info?.checkedCount||0,count)}。DB最終反映日時：${times(info?.written,info?.writtenCount||0,count)}。${write}。サーバー記録を表示中。業務情報の自動収集・最新確認を意味しません。取込内容の照合完了は下の実行結果で確認してください。`;
}
