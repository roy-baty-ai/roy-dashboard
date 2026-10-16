// Only known error codes become UI text. Never display SDK messages or tokens.
export function loginFailureText(error){
 const messages={
  'auth/popup-blocked':'ログイン用のポップアップが開けませんでした。この画面の「管理者ログイン」ボタンから操作してください。',
  'auth/popup-closed-by-user':'ログイン画面が閉じられたため、ログインは完了していません。',
  'auth/cancelled-popup-request':'別のログイン操作が開始されたため、この操作は中止されました。',
  'auth/network-request-failed':'通信に失敗したため、ログインは完了していません。接続を確認してください。',
  'auth/unauthorized-domain':'このページのドメインが認証先で許可されていません。管理者による設定確認が必要です。',
  'auth/operation-not-allowed':'このログイン方法は認証先で有効になっていません。管理者による設定確認が必要です。',
  'auth/user-disabled':'このアカウントは認証先で無効になっています。管理者による確認が必要です。'
 };
 return Object.hasOwn(messages,error?.code)?messages[error.code]:'ログインできませんでした。原因は未確認です。再ログインだけでデータ取込みの問題は解消しません。';
}
