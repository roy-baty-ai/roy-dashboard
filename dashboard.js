'use strict';
(() => {
  const get=id=>document.getElementById(id),text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
  const views={overview:['Overview.','YOUR BUSINESS, AT A GLANCE','営業の現在地と、次の一手を。'],cases:['営業案件.','SALES PIPELINE','比較して、選んで、次の作業へ。'],map:['営業マップ.','EXPLORE YOUR TERRITORY','日本のどこに、次の可能性があるか。'],logs:['活動ログ.','PROGRESS, RECORDED','小さな前進を、ひとつずつ。'],settings:['接続・データ設定.','WORKSPACE SETTINGS','端末内の読込と、接続状態を確認。']};
  const labels={ready:'人の判断待ち',preparing:'準備中',sent:'送信済み'};
  let records=[],lastFocus,active='overview';
  const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'short',day:'numeric'});
  function switchView(name,focus=false){
    const anchor=name;name=({human:'overview',outbound:'cases',activity:'logs'})[name]||name;if(!views[name])name='overview';active=name;
    document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==`view-${name}`);
    document.querySelectorAll('[data-view]').forEach(b=>{const selected=b.dataset.view===name;b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    get('page-title').textContent=views[name][0];get('page-eyebrow').textContent=views[name][1];get('page-description').textContent=views[name][2];get('breadcrumb').textContent=views[name][0].slice(0,-1);
    if(focus)get('page-title').focus({preventScroll:true});if(anchor==='human')requestAnimationFrame(()=>get('human').scrollIntoView({block:'center',behavior:'instant'}));
  }
  function go(name){if(location.hash!==`#${name}`)location.hash=name;else switchView(name,true);}
  function close(restore=true){get('drawer').hidden=true;get('backdrop').hidden=true;get('drawer-content').replaceChildren();document.body.classList.remove('drawer-open');if(restore)lastFocus?.focus();}
  function open(content){lastFocus=document.activeElement;get('drawer-content').replaceChildren(content);get('drawer').hidden=false;get('backdrop').hidden=false;document.body.classList.add('drawer-open');get('close-drawer').focus();}
  function pinOpen(indices){
    if(indices.length===1){window.RoyOutboundView.open(indices[0]);return;}
    const list=text('div','');list.append(text('h2','この地域の案件'));
    indices.forEach(i=>{const c=records[i];const b=text('button',`${c.businessName} · ${labels[c.state]}`,'group-case');b.type='button';b.onclick=()=>window.RoyOutboundView.open(i);list.append(b);});open(list);
  }
  function row(c,index){
    const tr=document.createElement('tr'),name=document.createElement('td'),button=text('button',c.businessName,'case-link');button.type='button';button.dataset.case=index;
    name.append(button,text('small',[c.region||'所在地未設定',c.category||'未分類'].join(' / ')));tr.append(name);
    const state=document.createElement('td');state.append(text('span',labels[c.state],`status ${c.state}`));tr.append(state);
    tr.append(text('td',c.nextAction||c.remaining[0]||(c.state==='sent'?'返信状況の確認':'初回送信の判断')));
    const checked=text('td',c.verifiedAt?date.format(new Date(c.verifiedAt)):'未記録・要確認');checked.className='checked-date';tr.append(checked);
    const action=document.createElement('td'),detail=text('button','↗','subtle');detail.type='button';detail.dataset.case=index;detail.setAttribute('aria-label',`${c.businessName}の詳細`);action.append(detail);tr.append(action);return tr;
  }
  function maps(){
    const filter=get('map-filter').value,selected=records.filter(c=>filter==='all'||c.state===filter),located=records.filter(c=>RoyGeography.locate(c));
    window.RoyJapanMap.update(records,pinOpen,filter);
    get('map-stats').replaceChildren(text('p',`読込案件 ${records.length}件`),text('p',`所在地あり ${located.length}件 / 未設定 ${records.length-located.length}件`));
    const unmapped=selected.filter(c=>!RoyGeography.locate(c));get('unmapped-cases').replaceChildren();
    if(unmapped.length){get('unmapped-cases').append(text('h3','所在地未設定'));unmapped.forEach(c=>{const b=text('button',c.businessName,'group-case');b.type='button';b.dataset.case=records.indexOf(c);get('unmapped-cases').append(b);});}
  }
  function cases(all,selected){
    records=all;get('case-empty').hidden=true;const focus=all.find(c=>c.state==='ready')||all[0];if(focus){delete get('focus-case').dataset.switch;get('focus-case').dataset.case=all.indexOf(focus);get('focus-case').textContent='案件を確認する →';}
    get('all-rows').replaceChildren(...selected.map(c=>row(c,all.indexOf(c))));
    if(!selected.length){const tr=document.createElement('tr'),td=text('td','該当する案件はありません。','empty');td.colSpan=5;tr.append(td);get('all-rows').append(tr);}
    const priority=[...all].sort((a,b)=>['ready','preparing','sent'].indexOf(a.state)-['ready','preparing','sent'].indexOf(b.state)).slice(0,3);
    get('priority-rows').replaceChildren(...priority.map(c=>row(c,all.indexOf(c))));get('priority-empty').hidden=priority.length>0;maps();
  }
  function source(value){get('priority-source').textContent=value;get('map-record-source').textContent=value;if(!window.RoyPrivateSnapshot)get('data-scope').textContent=value.includes('架空')?'公開概要 / 架空データ試験':'公開可能な概要';}
  function clear(){source('内部データ未読込');close(false);delete get('focus-case').dataset.case;get('focus-case').dataset.switch='settings';get('focus-case').textContent='内部案件を確認する →';records=[];get('all-rows').replaceChildren();get('priority-rows').replaceChildren();get('priority-empty').hidden=false;get('case-empty').hidden=false;get('map-filter').value='all';maps();}
  function status(data){
    get('recent-compact').replaceChildren();
    for(const activity of data.recent.slice(0,3)){
      const details=document.createElement('details');details.className='timeline-item';
      const summary=text('summary',activity.event.length>66?activity.event.slice(0,66)+'…':activity.event);
      const time=text('time',new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(activity.at)));time.dateTime=activity.at;
      details.append(summary,text('p',activity.event),time);get('recent-compact').append(details);
    }
  }
  document.addEventListener('click',e=>{const nav=e.target.closest('[data-view],[data-switch]');if(nav){close(false);go(nav.dataset.view||nav.dataset.switch);}const c=e.target.closest('[data-case]');if(c)window.RoyOutboundView?.open(Number(c.dataset.case));});
  window.addEventListener('hashchange',()=>switchView(location.hash.slice(1),true));
  get('close-drawer').addEventListener('click',()=>close());get('backdrop').addEventListener('click',()=>close());
  document.addEventListener('keydown',e=>{if(get('drawer').hidden)return;if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...get('drawer').querySelectorAll('button,a[href],summary,input,select,textarea,[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  get('map-filter').addEventListener('change',maps);
  switchView(location.hash.slice(1));
  window.RoyDashboard={cases,clear,status,source,open,switchView:go};
  maps();
})();
