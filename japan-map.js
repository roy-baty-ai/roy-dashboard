'use strict';
(() => {
  const ns='http://www.w3.org/2000/svg',colors={ready:'#5be3c2',preparing:'#efba69',sent:'#73a5fa'};
  const instances=new Map();
  function svgNode(tag,attrs={}){const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
  function rings(){const g=window.RoyJapanGeometry.geometry;return(g.type==='MultiPolygon'?g.coordinates:[g.coordinates]).filter(p=>p[0].some(([x,y])=>x>=122&&x<=149&&y>=24&&y<=46));}
  const paths=rings().map(p=>p.map(r=>r.map(([lon,lat],i)=>`${i?'L':'M'}${RoyGeography.project(lon,lat).map(n=>n.toFixed(2)).join(',')}`).join(' ')+'Z').join(' '));
  function mount(id){
    const host=document.getElementById(id),svg=svgNode('svg',{viewBox:'0 0 720 530',role:'group','aria-label':'Natural Earthの地理データによる日本地図',class:'map-canvas'});
    const title=svgNode('title');title.textContent='日本の営業エリア。沖縄・南西諸島は別枠に表示。';svg.append(title);
    const land=svgNode('g',{class:'geographic-land'});
    paths.forEach(d=>{land.append(svgNode('path',{d,class:'geo-shadow',transform:'translate(0 6)'}),svgNode('path',{d,class:'geo-land'}));});
    svg.append(land,svgNode('rect',{x:20,y:340,width:156,height:158,rx:10,class:'okinawa-frame'}),svgNode('rect',{x:600,y:382,width:96,height:116,rx:10,class:'okinawa-frame'}));
    const label=svgNode('text',{x:32,y:358,class:'geo-label'});label.textContent='沖縄・南西諸島';svg.append(label);
    const remoteLabel=svgNode('text',{x:612,y:398,class:'geo-label'});remoteLabel.textContent='小笠原諸島';svg.append(remoteLabel);
    const pinGroup=svgNode('g',{class:'map-pins'});svg.append(pinGroup);
    const caption=document.createElement('div');caption.className='map-caption';caption.textContent='JAPAN / SALES TERRITORY';
    const empty=document.createElement('div');empty.className='map-empty';empty.textContent='内部データを読み込むと、営業先を表示します。';
    host.append(svg,caption,empty);const instance={host,svg,land,pinGroup,empty,pins:[]};instances.set(id,instance);return instance;
  }
  function draw(instance,cases,onOpen,filter){
    instance.pinGroup.replaceChildren();instance.pins=[];
    const groups=new Map();
    cases.forEach((c,i)=>{const loc=RoyGeography.locate(c);if(!loc||(filter!=='all'&&c.state!==filter))return;const k=loc.longitude+','+loc.latitude;if(!groups.has(k))groups.set(k,{loc,items:[]});groups.get(k).items.push({c,i});});
    for(const {loc,items}of groups.values()){
      const [x,y]=RoyGeography.project(loc.longitude,loc.latitude),mixed=new Set(items.map(({c})=>c.state)).size>1,color=mixed?'#d4e5f6':colors[items[0].c.state];
      const g=svgNode('g',{class:'pin',tabindex:0,role:'button','aria-label':`${loc.label} ${items.length}件 ${loc.basis}`});
      const title=svgNode('title');title.textContent=loc.label+' · '+items.map(({c})=>c.businessName).join(' / ')+' · '+loc.basis;
      g.append(title,svgNode('rect',{x:x-18,y:y-22,width:Math.max(86,loc.label.length*12+48),height:44,fill:'transparent',class:'pin-hit'}),svgNode('circle',{cx:x,cy:y,r:17,fill:color,class:'halo'}),svgNode('circle',{cx:x,cy:y,r:6,fill:color,class:'pin-center'}));
      const label=svgNode('text',{x:x+12,y:y-10});label.textContent=loc.label+(items.length>1?` (${items.length})`:'');g.append(label);
      const open=()=>onOpen(items.map(({i})=>i));g.addEventListener('click',open);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
      instance.pinGroup.append(g);instance.pins.push({g,label,x,y});
    }
    instance.empty.hidden=cases.length>0&&groups.size>0;
    instance.empty.textContent=!cases.length?'内部データを読み込むと、営業先を表示します。':groups.size?'':filter!=='all'?'この状態で地図に表示できる案件はありません。':'所在地未設定の案件は、地図の横の一覧で確認できます。';
    if(instance.three)instance.three.updatePins();
  }
  function update(cases,onOpen,filter='all'){for(const instance of instances.values())draw(instance,cases,onOpen,instance.host.id==='overview-map'?'all':filter);}
  let modeVersion=0;
  async function toggle3D(button){
    const instance=instances.get(button.dataset.map);if(!instance)return;
    if(instance.three){instance.three.dispose();instance.three=null;instance.land.hidden=false;instance.host.classList.remove('is-3d');button.setAttribute('aria-pressed','false');return;}
    if(window.RoyPrivateSnapshot){document.getElementById('map-status').textContent='オフラインHTMLは通信不要の2D地図で表示します。';return;}
    const version=++modeVersion;button.disabled=true;
    try{const {createJapan3D}=await import('./japan-3d.mjs');if(version!==modeVersion)return;instance.three=createJapan3D(instance,rings());instance.host.classList.add('is-3d');button.setAttribute('aria-pressed','true');}
    catch{document.getElementById('map-status').textContent='この端末では3D表示を利用できないため、同じ地理データの2D地図を表示します。';}
    finally{button.disabled=false;}
  }
  mount('overview-map');mount('full-map');
  document.querySelectorAll('.map-3d').forEach(button=>button.addEventListener('click',()=>toggle3D(button)));
  window.addEventListener('pagehide',()=>{++modeVersion;for(const i of instances.values()){i.three?.dispose();i.three=null;}});
  window.RoyJapanMap={update};
})();
