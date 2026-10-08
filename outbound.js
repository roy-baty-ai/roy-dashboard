'use strict';
(() => {
  const el = id => document.getElementById(id);
  const node = (tag, value, className) => { const n = document.createElement(tag); n.textContent = value; if (className) n.className = className; return n; };
  const labels = { ready: 'READY_FOR_HUMAN_GO', preparing: '準備中・要確認', sent: '送信済み' };
  const date = value => value ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' JST' : '未記録・要確認';
  let cases = [], importVersion = 0;
  const embedded = window.RoyPrivateSnapshot;
  function metric(label, value, detail) { const box = node('div', '', 'sales-metric'); box.append(node('span', label), node('strong', value), node('small', detail)); return box; }
  (window.RoyPrivateSnapshot ? Promise.resolve(window.RoyPrivateSnapshot.summary) : fetch('outbound-summary.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error(); return r.json(); })).then(data => {
    if (window.RoyFirebaseConfig?.enabled && !window.RoyFirebaseConfig.authOnly && !embedded) return;
    if (!['candidateCount', 'readyCount', 'preparingCount', 'sentCount', 'targetCount', 'confirmedRevenueUsd'].every(k => Number.isFinite(data[k]) && data[k] >= 0) || data.candidateCount !== data.readyCount + data.preparingCount + data.sentCount) throw Error();
    el('sales-metrics').replaceChildren(metric('確認済み売上', `$${data.confirmedRevenueUsd}`, '案件数は売上に含めません'), metric('営業案件', `${data.candidateCount}件`, `目標：見本付きの強い${data.targetCount}件`), metric('READY_FOR_HUMAN_GO', `${data.readyCount}件`, '準備完了・人の判断待ち'), metric('準備中', `${data.preparingCount}件`, '未送信・残る確認あり'), metric('送信済み', `${data.sentCount}件`, '初回1通送信済み・受注とは別'));
    el('sales-source').textContent = `${data.note} 最終確認：${date(OutboundModel.validDate(data.verifiedAt) ? data.verifiedAt : null)}。`;
  }).catch(() => { el('sales-metrics').replaceChildren(node('p', '営業概要を読み込めません。件数・売上は不明です。')); el('sales-source').textContent = '再読み込みして確認してください。'; });
  function field(dl, label, content) { dl.append(node('dt', label), node('dd', content || '未記録・要確認')); }
  function linkField(dl, label, url) { const dd = node('dd', '未登録・要確認'); if (url) { const a = node('a', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; dd.replaceChildren(embedded ? node('span', url) : a); } dl.append(node('dt', label), dd); }
  function render() {
    const query = el('outbound-search').value.toLocaleLowerCase().trim();
    const selected = cases.filter(c => (el('outbound-filter').value === 'all' || c.state === el('outbound-filter').value) && [c.businessName, c.category, c.value].some(v => v.toLocaleLowerCase().includes(query)));
    el('outbound-results').textContent = `端末内の正本：${cases.length}件 / 表示：${selected.length}件（READY ${cases.filter(c => c.state === 'ready').length}・準備中 ${cases.filter(c => c.state === 'preparing').length}・送信済み ${cases.filter(c => c.state === 'sent').length}）。公開概要とは別の読込結果です。`;
    const classification = new Map(); const roles = new Map();
    for (const c of cases) { classification.set(c.category || '未分類', (classification.get(c.category || '未分類') || 0) + 1); if (c.role) roles.set(c.role, (roles.get(c.role) || 0) + 1); }
    el('classification-counts').textContent = `分類：${[...classification].map(([k,v]) => `${k} ${v}件`).join(' / ')}。準備優先 ${roles.get('priority') || 0}件・適格予備 ${roles.get('reserve') || 0}件・追加準備 ${roles.get('additional_prepared') || 0}件。Preview URL ${cases.filter(c => c.previewUrl).length}件・未設定 ${cases.filter(c => !c.previewUrl).length}件。営業画像参照 ${cases.filter(c => c.imageRef || c.imageUrl).length}件。`;
    el('case-index').replaceChildren();
    for (const [i, c] of selected.entries()) { const a = node('a', `${c.businessName} · ${c.roleLabel || labels[c.state]}`); a.href = `#case-${i}`; el('case-index').append(a); }
    el('outbound-cases').replaceChildren();
    for (const state of ['ready', 'preparing', 'sent']) {
      const group = node('section', '', `case-group ${state}`); group.append(node('h3', `${labels[state]} · ${selected.filter(c => c.state === state).length}件`));
      const rows = selected.filter(c => c.state === state);
      if (!rows.length) group.append(node('p', '該当する案件はありません。', 'sales-note'));
      for (const c of rows) {
        const card = node('article', '', 'case-card'); card.id = `case-${selected.indexOf(c)}`; const head = node('div', '', 'case-heading');
        head.append(node('h4', c.businessName), node('span', labels[c.state], `badge ${c.state === 'ready' ? 'good' : c.state === 'sent' ? 'blue' : 'notice'}`));
        const dl = node('dl', '', 'case-fields'); field(dl, '分類', c.category); if (c.roleLabel) field(dl, '案件区分', c.roleLabel); if (c.region) field(dl, '地域', c.region); field(dl, '提案価値', c.value); field(dl, '準備状況', c.preparation); field(dl, '正本の状態', c.sourceStatus); linkField(dl, '公開見本URL', c.previewUrl); if (c.previewNote) field(dl, '見本の確認状況', c.previewNote);
        if (c.imageRef) field(dl, '営業画像', `添付参照・未取得／未プレビュー\n${c.imageName}\n${c.imageRef}\n記録上の承認状態：${c.imageApproval || '未記録'}`); else linkField(dl, '営業画像', c.imageUrl); field(dl, '宛先', c.recipient); field(dl, '最終確認', date(c.verifiedAt)); if (c.checkedNote) field(dl, '確認時点の注意', c.checkedNote);
        if (c.offer) field(dl, '提案価格', c.offer); if (c.offerScope) field(dl, '提案範囲', c.offerScope); if (c.nextAction) field(dl, '次の作業', c.nextAction); if (c.canonicalNote) field(dl, '正本への収録', c.canonicalNote);
        if (c.sentAt) field(dl, '初回送信日時', date(c.sentAt)); if (c.sentMessageUrl) linkField(dl, '送信済み記録', c.sentMessageUrl); if (c.replyNote) field(dl, '送信・返信', c.replyNote);
        const checks = node('div', '', 'case-checks'); checks.append(node('h5', '残る確認')); const ul = node('ul', ''); for (const check of c.remaining.length ? c.remaining : [c.state === 'sent' ? '送信済み記録。再送・追送の操作はありません。返信の現在状態は別途確認が必要です。' : '準備上の未完了記録なし。営業送信には別途、人の判断が必要です。']) ul.append(node('li', check)); checks.append(ul);
        const details = node('details', '', 'sales-body'); details.append(node('summary', c.state === 'sent' ? '送信済みの件名・本文（履歴）' : '営業件名・本文（未送信）'), node('p', c.subject || '件名：未記録'), node('p', c.emailState || '', 'sales-note'), node('pre', c.body || '未記録・要確認'));
        if (c.riskNotes?.length) { const notes = node('div', '', 'sales-note'); notes.append(node('strong', '判断時の注意')); for (const note of c.riskNotes) notes.append(node('p', note)); details.append(notes); }
        card.append(head, dl, checks, details); group.append(card);
      }
      el('outbound-cases').append(group);
    }
  }
  function clear() { ++importVersion; cases = []; el('outbound-file').value = ''; el('outbound-search').value = ''; el('outbound-filter').value = 'all'; el('outbound-cases').replaceChildren(); el('outbound-results').textContent = ''; el('classification-counts').textContent = ''; el('case-index').replaceChildren(); el('private-outbound').hidden = true; el('clear-outbound').disabled = true; el('import-status').textContent = '内部データ未読込。事業者名・宛先・営業本文は非公開です。'; }
  el('outbound-file').addEventListener('change', async event => {
    const file = event.target.files[0]; clear(); if (!file) return; const version = importVersion;
    try { if (file.size > 2 * 1024 * 1024) throw Error('2MB以下のJSONを選択してください。'); const contents = await file.text(); if (version !== importVersion) return; cases = OutboundModel.parse(JSON.parse(contents)); el('private-outbound').hidden = false; el('clear-outbound').disabled = false; el('import-status').textContent = `${cases.length}件を端末内で表示中。公開・QA・Gmail確認と日時が揃わない案件は準備中として表示します。`; render(); }
    catch (error) { if (version !== importVersion) return; clear(); el('import-status').textContent = `読み込みできません。${error instanceof SyntaxError ? 'JSONの形式を確認してください。' : error.message}`; }
  });
  el('clear-outbound').addEventListener('click', clear);
  el('outbound-search').addEventListener('input', render);
  el('outbound-filter').addEventListener('change', render);
  function loadEmbedded() {
    cases = OutboundModel.parse(embedded.data); el('private-outbound').hidden = false; el('clear-outbound').disabled = false;
    el('import-status').textContent = `${cases.length}件を同梱した私有HTMLです。外部通信・保存・メール送信はありません。外部URLは参照用テキストで表示します。詳細を消しても元のHTMLには同梱データが残ります。共有・公開しないでください。`;
    el('data-scope').textContent = '私有・実データ同梱'; el('clear-outbound').textContent = '画面上の詳細を閉じる';
    el('private-context').textContent = `資料集約：${date(embedded.data.assembled_at_utc)}。Gmail最終成功：${date(embedded.data.mailbox?.last_successful_check_at)}。${embedded.data.mailbox?.warning || ''} 今回はサイト・Gmailの再確認なし。参照commit未収録の補足案件は各カードに明記しています。`;
    render();
  }
  window.RoyOutboundView = {
    clear,
    show(payload, source) { clear(); cases=OutboundModel.parse(payload); el('private-outbound').hidden=false;el('clear-outbound').disabled=false;el('import-status').textContent=source;render();el('outbound-results').textContent=el('outbound-results').textContent.replace('端末内の正本',source); },
    summary(data) {
      if (!data) {el('revenue').textContent='—';el('summary').textContent='Firestoreの現在値は不明です。';el('sales-source').textContent='接続と権限を確認してください。';el('sales-metrics').replaceChildren(node('p','Firestoreの公開集計を確認できません。現在値は不明です。'));return;}
      el('sales-metrics').replaceChildren(metric('確認済み売上',`$${data.confirmedRevenueUsd}`,'案件数は売上ではありません'),metric('営業案件',`${data.caseCount}件`,`目標：${data.targetCount}件`),metric('READY_FOR_HUMAN_GO',`${data.readyCount}件`,'人の判断待ち'),metric('準備中',`${data.preparingCount}件`,'残る確認あり'),metric('送信済み',`${data.sentCount}件`,'受注とは別'));
      el('revenue').replaceChildren(node('span',`$${data.confirmedRevenueUsd}`));
      el('progress').value=Math.min(100,data.confirmedRevenueUsd);el('percent').textContent=`${Math.min(100,data.confirmedRevenueUsd)}%`;el('remaining').textContent=`目標まで $${Math.max(0,100-data.confirmedRevenueUsd)}`;
      el('summary').textContent=`Web制作 ${data.caseCount}案件・準備中 ${data.preparingCount}件・送信済み ${data.sentCount}件・READY ${data.readyCount}件。`;
      el('updated').textContent='公開集計はFirestoreから取得。個別の業務確認日時とは別です。';
      if(data.updatedAt?.toDate){const at=data.updatedAt.toDate();el('day').textContent=`DAY ${Math.floor((at.getTime()+9*3600000-Date.parse('2026-10-01T00:00:00Z'))/86400000)+1}`;}
      el('humanBadge').textContent='内部画面で確認';el('needsHuman').replaceChildren(node('p','認証・QA・送信GOなどの残工程は、管理者ログイン後の案件記録で確認してください。'));
      el('now').replaceChildren(node('p',el('summary').textContent));el('nowCount').textContent='1';el('waitingCount').textContent=String(data.sentCount);
      el('waiting').replaceChildren(node('p','送信数は受注・入金ではありません。返信状況は内部記録を確認してください。'));
      el('candidates').replaceChildren(node('p','案件数や提案価格は売上に含めません。'));el('blockers').replaceChildren(node('p','残る確認は管理者用の案件記録を参照してください。'));el('blockerBadge').textContent='内部画面で確認';
      el('sales-source').textContent=`Firestoreの公開集計 revision ${data.revision}。公開見本URL ${data.previewCount}件。`;
    }
  };
  if (embedded) loadEmbedded();
  window.addEventListener('pagehide', () => { if (!embedded) clear(); });
})();
