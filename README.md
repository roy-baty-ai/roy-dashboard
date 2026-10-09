# Roy dashboard

日本語の静的営業ダッシュボード。`app.js` が `status.json` を、営業概要の `outbound.js` が `outbound-summary.json` を同一オリジンから読みます。配信時のビルドは不要です。地図データとThree.js 0.170.0を同梱し、地図表示のための外部通信は行いません。

## アクセスと公開ゲート

- GitHub リポジトリ `roy-baty-ai/roy-dashboard` は **public**。画面も PUBLIC STATUS と明記されています。リポジトリの全ファイルを公開情報として扱ってください。
- 既存配信は GitHub Pages。main の更新により pages build and deployment が実行されます。既存URLは https://roy-baty-ai.github.io/roy-dashboard/ です。配信設定・認証・ホストを変更しないでください。
- 今回許可された公開更新はこの roy-dashboard の概要と端末内読込UIのみです。営業見本のProduction公開、営業送信、認証変更、有料プラン、新しい公開方式は対象外です。
- 内部詳細をサーバーへ置くには共有範囲の承認と既存配信経路の確認が必要です。HTMLで隠すだけではアクセス制御になりません。

## データ境界

`business/outbound.json` を案件の正本とします。このチェックアウトには含まれていません。**宛先、営業本文、内部メモ、画像をこの公開リポジトリへコピーしないでください。**

公開用営業概要は依頼で渡された集計値（案件8、READY 1、準備中6、送信済み1、確認済み売上$0、目標10）だけを手動反映しています。公開概要の一律の最終確認日時は不明のため null。内部画面は個別の last_checked_at を表示します。見本完成件数・受注数を案件数から推定しません。`status.json` の現在状況も公開可能な集計へ更新します。既存の活動記録は各記録時点の履歴です。更新日時は業務の再確認日時ではありません。

内部詳細は同じ画面で利用者がローカルJSONを選択し、ブラウザのメモリ内だけで表示します。ネットワーク送信・localStorage・編集・送信操作・GO承認はありません。外部画像は自動取得せずリンク表示です。クリア・画面離脱で詳細を消します。URLを開く操作は利用者の明示操作のみです。

## 実データの項目対応

対応する `schema_version: 1` の私有統合スナップショットに対応しました。`business/outbound.json` の参照commitと補足資料を統合した読取用データであり、正本自体の変更・自動同期はしていません。`cases[].business_name / classification / value_hypothesis / confirmed_gates / missing_gates / preview_url / sales_image / email / contact / last_checked_at / queue / canonical` を使用します。

- `sent: true` かつ `status: SENT_WAITING` は送信済み。未送信の NOT_READY は準備中。明示された READY と確認記録が揃ったときだけ準備完了として表示します。
- 画像のLibrary IDはURLに変換せず、ファイル名・ID・記録上の承認状態を「添付参照・未取得／未プレビュー」と表示します。
- Previewのnullは「未登録・要確認」。過去のURL確認を今回の再確認として扱いません。
- 参照commitに未収録の補足案件、案件ごとの最終確認、未送信の件名・本文、送信済み本文の履歴、Gmail確認時点の制限を区別します。
- 案件8件と未送信7件を区別し、全事業の送信レコード／メッセージ数をこの画面の案件数へ加算しません。

### 初期の簡易形式


現時点の対応形式はトップレベル配列、または `{ "cases": [...] }`。各案件の項目は次の通りです。既存正本をこの形式へ書き換えず、必要なら `outbound-model.js` に正本の実スキーマ向け読込アダプターを追加してください。不明な形式はエラーとして表示します。

| 項目 | 意味 |
| --- | --- |
| businessName | 事業者名（必須） |
| category / proposalValue | 分類 / 提案価値 |
| preparation | 準備状況の説明 |
| status | READY_FOR_HUMAN_GO / SENT / その他は準備中 |
| previewUrl / salesImageUrl | HTTPSの公開見本 / 営業画像URL |
| salesBody / recipient | 営業本文 / 宛先（文字列） |
| remainingChecks | 残る確認の文字列配列 |
| readiness | published / qa / gmail が各 true のとき確認済み |
| lastVerifiedAt | タイムゾーン付きISO日時。不明なら空欄 |

READY は明示状態だけでなく、公開・QA・Gmailの確認、見本URL、最終確認日時、空の remainingChecks がすべて揃った場合のみ表示します。SENT は準備とは別に表示し、未記録の確認事項を残します。読込結果の件数は公開概要と分けて表示します。

## ローカル確認

```
python3 -m http.server 8765 --bind 127.0.0.1
node --test tests/outbound.test.cjs
```

ブラウザで `http://127.0.0.1:8765` を開きます。外部公開用コマンドではありません。

検証用ブラウザスクリプトは `tests/browser.cjs`。Playwright と Chromium がある環境で `PLAYWRIGHT_PATH=/path/to/playwright node tests/browser.cjs` を実行します。ダミー案件のみを使い、1440px / 393px、検索・絞込・クリア・エラー、未送信データの外部リクエストなし、営業GO操作なしを確認します。

## 私有・オフラインHTML

`python3 scripts/build-private.py --input /absolute/private/snapshot.json --output /absolute/private/dashboard.html`

既存HTML/CSS/JSをそのまま束ね、私有データを同梱します。入力・出力は公開リポジトリ外を必須とします。外部通信と画像取得をCSPで拒否し、外部URLはテキスト表示のみです。正本選択なしで開けます。詳細を閉じてもファイル自体には私有データが残るため、公開・無断共有は禁止です。新しいホスティングは不要です。

以前の検証記録：単体6件、公開モード1440px/393px、実データ同梱モード1440px/393px。実データ8件の本文と残るゲートを照合し、READY0/準備中7/送信済み1、分類とキュー件数、Preview3/未設定5、画像参照3、通信ゼロ、横溢れなしを検証しました。

実データ検証コマンド：
`PRIVATE_JSON=/private/snapshot.json PRIVATE_HTML=/private/dashboard.html PLAYWRIGHT_PATH=/path/to/playwright node tests/private-browser.cjs`

## Firebase接続のローカル準備

現在の本番設定は架空データ限定の接続試験（testOnly）です。従来の公開集計を維持し、架空データの結果を実績へ加算しません。既存の認証・保存制限を維持しています。構成、承認項目、正本切替手順と検証制約は [firebase/README.md](firebase/README.md) を参照してください。

## ダッシュボードの画面構成

承認されたHTMLモックに合わせ、Overview・営業案件・営業マップ・活動ログをサイドバーで切り替えます。接続・データ読込は設定画面にまとめています。ハッシュURL（例 `#map`）で直接開けます。画面切替で再読込やデータ送信はしません。

- 公開画面は従来のJSON集計だけを表示。内部JSONを読み込むまで個別の営業先のピンや行を表示しません。公開概要と読込案件の集計は別です。
- 案件は検索・準備状態で絞り込み、行やピンから詳細パネルを開けます。元の営業本文・宛先・確認記録は閲覧のみです。
- 日本の輪郭はNatural Earthの1:50m地理データを使用。沖縄・南西諸島は別枠。出典とライセンスは `assets/MAP-SOURCES.md`。
- 内部案件の `region` に明示された都道府県名（日本語／英語）を使って代表位置に配置。所在地を推測したり、営業データを外部ジオコーディングへ送信したりしません。
- `location: {latitude: number, longitude: number}` は記録座標として表示します。代表位置とは区別します。同位置はまとめて選択できます。不明な地域は所在地未設定の一覧に表示します。
- 3Dボタンは同梱したThree.jsによる立体表示。WebGL非対応時と私有オフラインHTMLでは2D地図を利用できます。常時アニメーションや外部地図APIはありません。
- 消去・ログアウト・画面離脱時に一覧・地図・詳細を消去。端末内ストレージへの保存はありません。私有HTMLそのものに同梱データが残る点は従来通りです。

検証コマンド：`npm test`、`PLAYWRIGHT_PATH=/path/to/playwright node tests/dashboard-browser.cjs`。ブラウザ検証は架空データのみで、1440px／393px、検索・状態絞込・同地域の案件・沖縄・所在地未設定・詳細消去・外部送信なし・端末保存なし・CSP・3D表示を確認します。実データの業務再確認を意味しません。
