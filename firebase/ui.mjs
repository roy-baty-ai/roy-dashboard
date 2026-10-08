import { validateConfig, createStore, prepareImport } from './store.mjs';
import { createSession } from './session.mjs';
const el=id=>document.getElementById(id), config=window.RoyFirebaseConfig;
let session, stopPublic=()=>{}, sourceControl=null, pendingImport=null, selectedCase=null, importGeneration=0;
const state=message=>{ el('firebase-status').textContent=message; };
try {
  if (!validateConfig(config) || window.RoyPrivateSnapshot) state('Firebase未接続：正本は従来のJSONです。接続先と権限の承認後に有効化します。');
  else {
    if(!config.authOnly)window.RoyOutboundView.summary(null);
    const sdk=await import('../vendor/firebase-sdk.js');
    const app=sdk.initializeApp(config.firebase),auth=sdk.getAuth(app);
    await sdk.setPersistence(auth,sdk.inMemoryPersistence);
    if(config.authOnly){
      state('認証確認版：データベースは全拒否のままです。Googleログインで本人のUIDを確認できます。');
      el('firebase-login').disabled=false;el('firebase-logout').disabled=false;
      stopPublic=sdk.onIdTokenChanged(auth,user=>{window.RoyOutboundView.clear();state(user?`ログイン成功・管理者登録待ち。UID: ${user.uid} ／ メール: ${user.email || '未取得'} ／ メール確認: ${user.emailVerified?'済':'未確認'}。データベースには接続していません。`:'未ログイン。認証確認のみを行います。データベースは全拒否のままです。');});
      el('firebase-login').onclick=async()=>{try{await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}catch{state('ログインできません。ポップアップ・許可ドメイン・認証設定を確認してください。');}};
      el('firebase-logout').onclick=async()=>{window.RoyOutboundView.clear();await sdk.signOut(auth);};
    }else{
    const store=createStore(sdk,app,auth,window.OutboundModel.parse);
    const view={
      clear(){ window.RoyOutboundView.clear();el('firebase-editor').hidden=true;el('firebase-case').replaceChildren();el('firebase-next').value='';el('firebase-note').value='';el('firebase-gates').replaceChildren();el('firebase-checked').value='';selectedCase=null; },
      state,
      control(value) {
        sourceControl=value;pendingImport=null;importGeneration++;el('firebase-import-save').disabled=true;el('firebase-import-result').textContent='';el('firebase-import-file').value='';
        el('firebase-import').hidden=value?.mode!=='migration';
        el('firebase-save').disabled=value?.mode!=='firestore';
      },
      show(payload){
        window.RoyOutboundView.show(payload,'Firestore参照（正本切替は別途確認）');
        el('firebase-editor').hidden=false;
        el('firebase-case').replaceChildren(...payload.cases.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.business_name;return o;}));
        const fill=()=>{ const c=payload.cases.find(c=>c.id===el('firebase-case').value);el('firebase-next').value=c?.next_action||'';el('firebase-note').value=c?.internal_note||'';selectedCase=c;
          el('firebase-state').disabled=!!c?.sent;el('firebase-state').value=c?.sent?'NOT_READY':c?.status;el('firebase-checked').value=c?.last_checked_at||'';
          el('firebase-gates').replaceChildren();
          for(const gate of [...(c.confirmed_gates||[]),...(c.missing_gates||[])]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.code=gate.code;input.checked=c.confirmed_gates.some(g=>g.code===gate.code);input.disabled=gate.code==='initial_send_go';label.append(input,document.createTextNode(gate.label));el('firebase-gates').append(label);}
         };
        el('firebase-case').onchange=fill;fill();
      }
    };
    session=createSession(store,view);
    stopPublic=store.watchPublic(data=>window.RoyOutboundView.summary(data),()=>window.RoyOutboundView.summary(null));
    el('firebase-login').disabled=false;el('firebase-logout').disabled=false;
    el('firebase-login').onclick=async()=>{try {await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}catch {state('ログインできません。認証設定・許可ドメインを確認してください。');}};
    el('firebase-logout').onclick=()=>session.logout().catch(()=>state('画面を消去しました。認証接続を確認してください。'));
    el('firebase-save').onclick=async()=>{el('firebase-save').disabled=true;try{
      if(!selectedCase)throw Error('案件を確認してください。');
      const gates=[...selectedCase.confirmed_gates,...selectedCase.missing_gates],confirmed=new Set([...el('firebase-gates').querySelectorAll('input:checked')].map(i=>i.dataset.code));
      const patch={next_action:el('firebase-next').value,internal_note:el('firebase-note').value,last_checked_at:el('firebase-checked').value,confirmed_gates:gates.filter(g=>confirmed.has(g.code)),missing_gates:gates.filter(g=>!confirmed.has(g.code))};
      if(!selectedCase.sent){patch.status=el('firebase-state').value;patch.readiness=patch.status;}
      await session.save(el('firebase-case').value,patch);
    }catch(e){state(e.message);}finally{el('firebase-save').disabled=sourceControl?.mode!=='firestore';}};
    el('firebase-import-file').onchange=()=>{pendingImport=null;importGeneration++;el('firebase-import-save').disabled=true;el('firebase-import-result').textContent='';};
    el('firebase-import-check').onclick=async()=>{const generation=++importGeneration;pendingImport=null;el('firebase-import-save').disabled=true;try{
      const file=el('firebase-import-file').files[0];if(!file||file.size>500000||sourceControl?.mode!=='migration')throw Error('移行モードとファイルを確認してください。');
      const result=await prepareImport(await file.text(),sourceControl.approvedSourceHash,window.OutboundModel.parse);
      if(generation!==importGeneration)return;pendingImport=result;el('firebase-import-result').textContent=`hash一致・8件・READY ${result.counts.readyCount}件・送信済み ${result.counts.sentCount}件。元ファイルは保持します。`;el('firebase-import-save').disabled=false;
    }catch(e){if(generation===importGeneration)el('firebase-import-result').textContent=e.message;}};
    el('firebase-import-save').onclick=async()=>{el('firebase-import-save').disabled=true;const prepared=pendingImport;pendingImport=null;try{if(!prepared)throw Error('再照合が必要です。');await store.importInitial(prepared);el('firebase-import-result').textContent='初回保存完了。正本切替はまだ行っていません。';}catch{el('firebase-import-result').textContent='保存できません。権限・移行モード・hash・既存データを確認してください。上書き再試行はしません。';}};
    // Do not let local files masquerade as synchronized Firestore records.
    el('outbound-file').disabled=true;
    }
  }
} catch { window.RoyOutboundView.clear(); if(config?.enabled&&!config.authOnly)window.RoyOutboundView.summary(null); state('Firebaseの接続設定または読込に失敗しました。内部データは表示しません。'); }
window.addEventListener('pagehide',()=>{session?.dispose();stopPublic();});
