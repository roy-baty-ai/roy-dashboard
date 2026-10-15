import {createOperationsStore} from './operations.mjs';
import {createOperationsView} from './operations-ui.mjs';
import {attachResultFeed} from './result-feed.mjs';
import {freshnessText} from './freshness.mjs';
import {ingestAndVerify,inspectAndVerify,safeFailure} from './intake-diagnostics.mjs';
import { validateConfig, createStore, prepareImport } from './store.mjs';
import { TEST_SOURCE_HASHES } from './test-mode.mjs';
import { createSession } from './session.mjs';
import { createPerCaseStore } from './per-case-store.mjs';
import { verifyIntake,ROY_UID } from './intake.mjs';
import { probeSyntheticDenials } from './live-verification.mjs';
const el=id=>document.getElementById(id), config=window.RoyFirebaseConfig;
const perCase=config?.storageVersion===2;
let operationsView,resultFeed, freshnessTimer, inspectButton, inspectFile, session, stopPublic=()=>{}, stopProbeAuth=()=>{}, probeGeneration=0, sourceControl=null, pendingImport=null, freshness=null, selectedCase=null, importGeneration=0;
const state=message=>{ el('firebase-status').textContent=(config?.testOnly?'架空データ試験：':'')+message; };
try {
  if (!validateConfig(config) || window.RoyPrivateSnapshot) state('Firebase未接続：正本は従来のJSONです。接続先と権限の承認後に有効化します。');
  else {
    if(!perCase&&!config.authOnly&&!config.testOnly)window.RoyOutboundView.summary(null);
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
    const store=perCase?createPerCaseStore(sdk,app,auth,window.OutboundModel.parse,{space:config.testOnly?'synthetic':'real'}):createStore(sdk,app,auth,window.OutboundModel.parse,{testOnly:config.testOnly===true,testSourceHashes:TEST_SOURCE_HASHES});
    if(perCase&&config.operationsVersion===1){Object.assign(store,createOperationsStore(sdk,sdk.getFirestore(app),auth,{space:config.testOnly?'synthetic':'real'}));operationsView=createOperationsView();}
    if(perCase){
      el('firebase-panel').querySelector('h3').textContent=config.testOnly?'架空案件の接続確認':'案件の共有記録';
      el('firebase-panel').querySelector('p').textContent='案件は管理者だけが閲覧できます。保存は営業GOやメール送信ではありません。公開概要は従来の集計です。';
      el('firebase-import').querySelector('h4').textContent='確定した原本の取込み';
      el('firebase-import').querySelector('p').textContent='Royが確定したファイルを照合します。変更前の記録は履歴に残り、競合時は保存を止めます。';
      el('firebase-import-check').textContent='原本と取込み内容を照合';el('firebase-import-save').textContent='照合済みの内容を保存';
    }
    // Visible supported action: browser workers click this; no SDK writes via evaluate.
    if(perCase&&config.testOnly===true){
      const panel=document.createElement('section'),button=document.createElement('button'),note=document.createElement('p'),results=document.createElement('ul');
      panel.id='firebase-synthetic-verification';button.id='firebase-verify-synthetic';button.type='button';button.textContent='架空データのアクセス制御を検証';button.disabled=true;
      note.textContent='架空案件だけで拒否確認を行います。実案件・管理者設定・権限は変更しません。別の既存アカウントでログインすると、非管理者の読取拒否だけを確認します。';
      results.id='firebase-verification-results';results.setAttribute('aria-live','polite');panel.append(note,button,results);el('firebase-panel').append(panel);
      stopProbeAuth=sdk.onIdTokenChanged(auth,user=>{probeGeneration++;results.replaceChildren();button.disabled=!user;});
      button.onclick=async()=>{
        if(config.testOnly!==true||!auth.currentUser)return;
        const generation=++probeGeneration;results.replaceChildren();button.disabled=true;
        const append=r=>{if(generation!==probeGeneration)return;const li=document.createElement('li');li.textContent=`${r.check}: ${r.result}${r.code?' ('+r.code+')':''}`;results.append(li);};
        try{await probeSyntheticDenials(sdk,app,auth,{space:'synthetic',testOnly:config.testOnly,onResult:append});}
        catch(e){append({check:'検証停止・全項目成功は未確認',result:'ERROR',code:e.code||e.message});}
        finally{if(generation===probeGeneration)button.disabled=!auth.currentUser;}
      };
    }
    if(perCase&&config.testOnly===true){
      const section=document.createElement('section'),label=document.createElement('label');label.textContent='読取り専用診断用の架空ファイル';inspectFile=document.createElement('input');inspectFile.type='file';inspectFile.accept='.json,application/json';inspectFile.id='firebase-inspect-file';label.append(inspectFile);inspectButton=document.createElement('button');inspectButton.type='button';inspectButton.id='firebase-import-inspect';inspectButton.textContent='保存せずサーバー記録を確認';inspectButton.disabled=true;const output=document.createElement('p');output.id='firebase-inspect-result';output.setAttribute('role','status');section.append(label,inspectButton,output);el('firebase-panel').append(section);inspectFile.onchange=()=>{pendingImport=null;importGeneration++;el('firebase-import-save').disabled=true;inspectButton.disabled=auth.currentUser?.uid!==ROY_UID||!inspectFile.files[0];el('firebase-inspect-result').textContent='';el('firebase-import-result').textContent='';};
      inspectButton.onclick=async()=>{
        const generation=importGeneration;inspectButton.disabled=true;
        try{const file=inspectFile.files[0]||el('firebase-import-file').files[0];if(!file||file.size>1000000)throw Error('Fixture required');const manifest=await verifyIntake(JSON.parse(await file.text()),{space:'synthetic'});const result=await inspectAndVerify(store,manifest);if(generation!==importGeneration)return;el('firebase-inspect-result').textContent=result.ok?(result.verified?'読取のみ：原本hash・履歴を照合済み。今回の保存で作成されたかは未判定。':'読取のみ：必要な文書が揃っていません。')+JSON.stringify(result.observation):`読取失敗・照合未完了：${result.stage} / ${result.code}`;}
        catch(error){if(generation===importGeneration){const failure=safeFailure('inspection',error);el('firebase-inspect-result').textContent=`読取失敗・存在件数は未確認：${failure.stage} / ${failure.code}`;}}
        finally{if(generation===importGeneration)inspectButton.disabled=false;}
      };
    }
    if(perCase)resultFeed=attachResultFeed({store,space:config.testOnly?'synthetic':'real',canWrite:()=>auth.currentUser?.uid===ROY_UID&&sourceControl?.mode==='firestore'&&freshness!==null});
    freshnessTimer=setInterval(()=>{if(freshness)el('private-sync-state').textContent=freshnessText(freshness,sourceControl);},30000);
    const view={
      clear(){ freshness=null;el('private-sync-state').textContent='';el('private-sync-state').hidden=true;window.RoyOutboundView.clear();el('firebase-test-summary').hidden=true;el('firebase-test-summary').textContent='';el('firebase-editor').hidden=true;el('firebase-case').onchange=null;el('firebase-case').replaceChildren();el('firebase-next').value='';el('firebase-note').value='';el('firebase-gates').replaceChildren();el('firebase-checked').value='';el('firebase-state').value='NOT_READY';selectedCase=null; },
      state,
      operations(value){operationsView?.show(value);},
      control(value) {
        sourceControl=value;if(value?.mode!=='firestore')resultFeed?.stop();if(freshness)el('private-sync-state').textContent=freshnessText(freshness,value);if(el('firebase-inspect-result'))el('firebase-inspect-result').textContent='';pendingImport=null;if(inspectButton)inspectButton.disabled=true;if(inspectFile)inspectFile.value='';importGeneration++;el('firebase-import-save').disabled=true;el('firebase-import-result').textContent='';el('firebase-import-file').value='';
        el('firebase-import').hidden=perCase?!(value?.mode==='firestore'&&value?.allowSourceIngest):value?.mode!=='migration';
        el('firebase-save').disabled=value?.mode!=='firestore';
      },
      show(payload,info){
        freshness=info||null;el('private-sync-state').hidden=false;el('private-sync-state').textContent=freshnessText(freshness,sourceControl);
        window.RoyOutboundView.show(payload,config.testOnly?'架空データ試験（実績ではありません）':'Firestore参照（正本切替は別途確認）',config.testOnly?'synthetic':'private');
        el('firebase-test-summary').hidden=!(config.testOnly||perCase);
        if(perCase){const sent=payload.cases.filter(c=>c.sent).length,ready=payload.cases.filter(c=>!c.sent&&c.status==='READY_FOR_HUMAN_GO').length;el('firebase-test-summary').textContent=`管理者内の集計：${payload.cases.length}件・送信済み${sent}・READY ${ready}・準備中${payload.cases.length-sent-ready}`;}
        el('firebase-editor').hidden=payload.cases.length===0;
        el('firebase-case').replaceChildren(...payload.cases.map(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.business_name;return o;}));
        const fill=()=>{ const c=payload.cases.find(c=>c.id===el('firebase-case').value);el('firebase-next').value=c?.next_action||'';el('firebase-note').value=c?.internal_note||'';selectedCase=c;
          el('firebase-state').disabled=!!c?.sent;el('firebase-state').value=c?.sent?'NOT_READY':c?.status;el('firebase-checked').value=c?.last_checked_at||'';
          el('firebase-gates').replaceChildren();
          for(const gate of [...(c?.confirmed_gates||[]),...(c?.missing_gates||[])]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.code=gate.code;input.checked=c.confirmed_gates.some(g=>g.code===gate.code)||c.gate_checks?.[gate.code]===true;input.disabled=gate.code==='initial_send_go'||c.confirmed_gates.some(g=>g.code===gate.code);label.append(input,document.createTextNode(gate.label));el('firebase-gates').append(label);}
         };
        el('firebase-case').onchange=fill;fill();
      }
    };
    session=createSession(store,view);
    window.addEventListener('offline',()=>session?.suspend());
    window.addEventListener('online',()=>session?.reconnect());
    if(navigator.onLine===false)session.suspend();
    const publicResult=data=>{if(config.testOnly){el('firebase-test-summary').textContent=data?`架空試験結果（実績ではありません）：revision ${data.revision}・READY ${data.readyCount}・準備中 ${data.preparingCount}・送信 ${data.sentCount}・URL ${data.previewCount}`:'架空公開集計は未作成または未取得です。初回の正常更新後に作成します。';}else window.RoyOutboundView.summary(data);};
    if(!perCase)stopPublic=store.watchPublic(publicResult,()=>publicResult(null));
    el('firebase-login').disabled=false;el('firebase-logout').disabled=false;
    el('firebase-login').onclick=async()=>{try {await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}catch {state('ログインできません。認証設定・許可ドメインを確認してください。');}};
    el('firebase-logout').onclick=()=>session.logout().catch(()=>state('画面を消去しました。認証接続を確認してください。'));
    el('firebase-save').onclick=async()=>{el('firebase-save').disabled=true;try{
      if(!selectedCase)throw Error('案件を確認してください。');
      const gates=[...selectedCase.confirmed_gates,...selectedCase.missing_gates],confirmed=new Set([...el('firebase-gates').querySelectorAll('input:checked')].map(i=>i.dataset.code));
      const patch={next_action:el('firebase-next').value,internal_note:el('firebase-note').value,last_checked_at:el('firebase-checked').value,gate_checks:Object.fromEntries(selectedCase.missing_gates.filter(g=>g.code!=='initial_send_go').map(g=>[g.code,confirmed.has(g.code)]))};
      if(!selectedCase.sent){patch.status=el('firebase-state').value;patch.readiness=patch.status;}
      await session.save(el('firebase-case').value,patch);
    }catch(e){state(e.message);}finally{el('firebase-save').disabled=sourceControl?.mode!=='firestore';}};
    el('firebase-import-file').onchange=()=>{pendingImport=null;if(inspectButton)inspectButton.disabled=true;importGeneration++;el('firebase-import-save').disabled=true;el('firebase-import-result').textContent='';};
    el('firebase-import-check').onclick=async()=>{const generation=++importGeneration;pendingImport=null;el('firebase-import-save').disabled=true;try{
      const file=el('firebase-import-file').files[0];if(!file||file.size>(perCase?1000000:500000)||(perCase?sourceControl?.mode!=='firestore':sourceControl?.mode!=='migration'))throw Error('移行モードとファイルを確認してください。');
      const result=perCase?await verifyIntake(JSON.parse(await file.text()),{space:config.testOnly?'synthetic':'real'}):await prepareImport(await file.text(),sourceControl.approvedSourceHash,window.OutboundModel.parse);
      if(generation!==importGeneration)return;pendingImport=result;if(inspectButton)inspectButton.disabled=false;el('firebase-import-result').textContent=perCase?`準備済み：${result.entries.length}案件のファイル照合のみ完了。DB反映・サーバー照合は未実施です。`:`hash一致・8件・READY ${result.counts.readyCount}件・送信済み ${result.counts.sentCount}件。元ファイルは保持します。`;el('firebase-import-save').disabled=false;
    }catch(e){if(generation===importGeneration)el('firebase-import-result').textContent=e.message;}};
    el('firebase-import-save').onclick=async()=>{const generation=importGeneration;el('firebase-import-save').disabled=true;const prepared=pendingImport;pendingImport=null;try{if(!prepared)throw Error('再照合が必要です。');if(perCase){const result=await ingestAndVerify(store,prepared,{onProgress:p=>{if(generation!==importGeneration)return;const labels={importing:'取込中',partial:'一部反映・全体未照合',verifying:'サーバー照合中',verified:'照合完了',failed:'失敗・部分保存の可能性あり'};el('firebase-import-result').textContent=`${labels[p.state]}：処理完了 ${p.completed}/${p.total}件。照合完了までは全体の反映済みと扱いません。`;}});if(generation!==importGeneration)return;if(!result.ok){el('firebase-import-result').textContent=`${el('firebase-import-result').textContent} 保存結果未確認：${result.stage} / ${result.code}。再保存せず、サーバー記録を読取りで確認してください。`;return;}const rows=result.rows;el('firebase-import-result').textContent=`照合完了：${rows.length}案件をサーバーから再取得し、原本と履歴を照合しました（この取込操作の結果）。`;}else{await store.importInitial(prepared);el('firebase-import-result').textContent='初回保存完了。正本切替はまだ行っていません。';}}catch{el('firebase-import-result').textContent=perCase?'取込み全体の成功は未確認です。部分保存の可能性があります。同じファイルの再実行は完了分を重複登録しません。原本とサーバー記録を照合してください。':'保存できません。権限・移行モード・hash・既存データを確認してください。上書き再試行はしません。';}};
    // Do not let local files masquerade as synchronized Firestore records.
    el('outbound-file').disabled=true;
    }
  }
} catch { window.RoyOutboundView.clear(); if(!perCase&&config?.enabled&&!config.authOnly&&!config.testOnly)window.RoyOutboundView.summary(null); state('Firebaseの接続設定または読込に失敗しました。内部データは表示しません。'); }
window.addEventListener('pagehide',()=>{operationsView?.dispose();resultFeed?.stop();clearInterval(freshnessTimer);probeGeneration++;session?.dispose();stopPublic();stopProbeAuth();});
