// Fail closed on auth changes, access revocation, offline cache or delayed callbacks.
export function createSession(api, view) {
  let stream = 0, epoch = 0, stopControl = () => {}, stopAccess = () => {}, stopData = () => {}, current = null, record = null;
  function wipe(message) { record = null; view.clear(); view.state(message); }
  function reset(message) { epoch++; stream++; stopAccess(); stopData(); stopControl(); view.control?.(null); stopAccess = stopData = () => {}; current = null; wipe(message); }
  const stopAuth = api.onAuth(user => {
    reset(user ? '管理者権限を確認中…' : '未認証：内部案件は表示しません。');
    if (!user) return;
    current = user; const token = epoch;
    stopAccess = api.watchAccess(user.uid, access => {
      if (token !== epoch) return;
      const generation = ++stream; stopControl(); view.control?.(null); stopData(); stopData = () => {}; wipe('管理者権限を確認中…');
      if (!access) { wipe('未許可ユーザー：内部案件は表示できません。'); return; }
      stopControl = api.watchControl?.(value => { if(token===epoch && generation===stream)view.control?.(value); },()=>{if(token===epoch && generation===stream)view.control?.(null);}) || (()=>{});
      stopData = api.watchPrivate(value => {
        if (token !== epoch || generation !== stream) return;
        if (!value) { wipe('未移行またはオフライン：現在の内部案件を確認できません。'); return; }
        try { view.show(value.payload); record = value; view.state(`認証済み・Firestore revision ${value.revision}（正本切替前は読取専用）`); } catch { wipe('内部データの形式を確認できません。表示を消去しました。'); }
      }, () => { if (token === epoch && generation === stream) { stream++; wipe('権限または接続を確認できません。内部表示を消去しました。'); } });
    }, () => { if (token === epoch) { stream++; stopData(); stopControl(); view.control?.(null); wipe('管理者権限を確認できません。内部表示を消去しました。'); } });
  });
  return {
    async save(id, patch) {
      if (!current || !record) throw Error('認証と最新データの確認が必要です。');
      const version = epoch, revision = record.revision;
      try { await api.save(id, patch, revision); if (version === epoch) view.state('保存しました。最新のサーバー記録を確認します。'); }
      catch { if (version === epoch) { stream++; stopData(); wipe('保存できませんでした。認証・書込権限・更新競合を確認し、再接続してください。'); } throw Error('保存失敗：変更は確定していません。'); }
    },
    async logout() { reset('内部表示を消去しました。'); await api.logout(); },
    dispose() { reset('接続を終了しました。'); stopAuth(); }
  };
}
