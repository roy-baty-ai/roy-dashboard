# 現在の公開対象：認証確認のみ

`config.js` は確認済み roy-dashboard-20261008 の公開Web設定、enabled=true / authOnly=trueです。管理者UIDは未登録。認証確認モードではFirestoreの初期化・読書き・初回移行・案件編集を行いません。Googleログイン後に本人のUIDとメール確認状態を表示します。全拒否RulesはConsole側で維持し、このリポジトリの候補Rulesは適用しません。

以下の接続・移行手順は次段階の準備資料です。公開承認は認証確認版に限定されています。公式SDK bundleは今回の配信assetに含めます。

# Firebase接続準備（未接続・未公開）

この変更はローカル準備のみです。プロジェクト、管理者UID、Webアプリ設定は未確定で、`config.js` は enabled=false / firebase=null / authProvider=null。設定値の推測や秘密情報の埋込はありません。既存公開版はそのままです。

## 最小構成と費用

既存GitHub Pages + Firebase Auth（承認済みGoogleプロバイダー）+ Cloud Firestore Standardの1データベースを想定。Cloud Functions、Storage、電話認証、課金プランへの変更は使いません。SDKはmodular版13.0.0をnpmで固定し、esbuildで同一オリジン配信用にbundleします。AuthはinMemoryPersistence、FirestoreはmemoryLocalCacheで、端末への永続キャッシュを使いません。

Firestore無料枠は1GiB、読取50,000/日・書込20,000/日・削除20,000/日・転送10GiB/月。8案件を1文書で購読する小規模運用ならこの範囲内を想定できますが、公開閲覧の増加や再接続は読取を消費します。Sparkの維持を確認し、無料枠超過時はエラー表示で停止、課金へ自動移行させません。既存プロジェクトがBlazeならそのまま安全と仮定せず親へ戻します。

## データ境界

| パス | 用途 / 読み書き |
| --- | --- |
| admins/{UID} | enabled:trueの明示的管理者。自分の文書のみget可。クライアントの作成・変更・一覧は禁止 |
| control/source | mode=json / migration / firestore。管理者getのみ。クライアントによる切替は禁止 |
| privatePipeline/current | 私有統合スナップショット。管理者かつemail_verifiedのみget。匿名・未許可・一覧・削除は拒否 |
| publicSummary/current | 数値のみの公開集計。匿名get可、一覧不可。更新は管理者の同一transactionだけ |
| その他 | すべて拒否 |

私有文書：`{payload,revision,sourceHash,updatedAt,updatedBy}`。payloadは既存統合JSONのschema_version=1形式、casesは上限50。現在の約51KBは1MiB文書上限以下です。画像バイトは保存せずLibrary参照のまま。数が増える場合は承認の上で個別文書へ設計変更します。

公開集計は caseCount / preparingCount / sentCount / readyCount / previewCount / confirmedRevenueUsd / targetCount / revision / updatedAt のallowlistのみ。宛先・本文・メモなど文字列の追加をRulesが拒否します。

管理者認証はUID allowlistが本体で、UIの非表示を権限保護には使いません。新しくGoogleログインしただけの利用者も案件アクセスは拒否します。Authアカウント自体の新規生成と案件へのアクセス許可は別です。認証切れ・allowlist剥奪・permission-denied・キャッシュのみの応答では内部画面と編集欄を消します。古い購読コールバックも無視します。

## 更新と切替

接続後はonSnapshotで一元化された最新記録を読みます。現時点の画面編集は「次の作業」「内部メモ」のみ。案件の送信・GO・ステータス変更・契約・課金は実行しません。保存はrevision一致を条件にprivate文書と公開集計を1 transactionで更新します。競合・拒否・オフライン時に成功扱いせず、古い値を上書きしません。

正本は現在 `roy-lab/business/outbound.json` のままです。切替までFirestoreはステージングで、二重更新しません。

1. 対象project/database/region、Spark、Webアプリ、管理者UID、Google Auth/authorized domains、Rules適用と移行対象を親が明示して承認を得る。
2. 正本の最新commitを凍結して照合。統合JSONの補足案件を正本へ取り込むか、承認済みID対応表を作る。現在のローカル識別子を正本の既存IDと取り違えない。
3. `scripts/plan-firestore-import.py --input /private/snapshot.json --output /private/plan.json --expected-sha256 <承認済みcanonical hash>` でローカルdry-run。重複ID・hash不一致なら停止。
4. RulesのEmulatorテスト合格後、承認された管理経路でRules/allowlist/control.mode=migrationを設定する。サービスアカウントJSONをリポジトリやチャットへ置かない。
5. 別途承認後、管理者クライアントtransactionでprivatePipeline/currentが存在しない場合にのみrevision=1で作成。既存ならhash一致を検証してno-op、不一致は停止。appendやランダムIDを使わず、再実行で二重移行しない。現在は初回投入コードを実行するUIは設けていません。
6. 私有データのhash・件数・匿名拒否を検証し、正本切替を承認。旧JSON更新を停止して読取用backupとし、control.mode=firestoreへ管理経路で切替。最初の管理者transactionが公開集計を作成し、以後同時更新する。
7. 切替後のRoyは承認済み認証セッションでUIまたは同じtransaction APIを使って記録更新。無人処理用の権限や長期トークンは未設計・未付与。無人更新が必要なら別途最小権限と承認を決める。旧JSONへの書込を再開しない。戻す場合も最新Firestoreを照合・退避してから切り替える。

## 親へ必要な確認事項

- 既存project ID、Web app ID/設定、Firestore database IDとregion、現在プラン。現在コードは(default) databaseを前提にしています。別IDならSDK接続・ルールテストを調整します。
- 既存の他アプリ用Rules/コレクションとの衝突確認。このRulesを共用プロジェクトへ丸ごと置換しないこと。共用なら専用namespaceへ調整・再テストしてから承認を得ます。
- 管理者の確認済みAuth UID（メール表示名で代用しない）、Google認証を使ってよいか。
- 既存GitHub Pagesホストのauthorized domains設定。カスタムauthDomainならCSPのframe-srcを承認済みドメインに合わせる。
- allowlist作成・Rules適用・初回データ投入・正本切替・公開pushの各承認。
- Web configはFirebase Console/許可された設定経路で受け取り、APIキーをチャットへ貼る方式は使わない。Web configは公開識別情報であり、データ保護はRulesが担う。サービスアカウント秘密は不要。

## 検証とビルド

```
npm ci --ignore-scripts
npm run build:firebase
npm test
FIREBASE_EMULATORS_PATH=/tmp/roy-firebase-emulators npm run test:rules
```

Emulatorはdemo-roy-local（実プロジェクトではない）、127.0.0.1:8085のみ。Rulesの7シナリオは匿名・未許可・未検証メール・権限剥奪・昇格拒否・正本JSON時の書込拒否・原子的更新・秘密フィールド混入・初回create-onlyを対象にします。

`vendor/firebase-sdk.js`は生成物でgitignore対象。承認後の配信ではSDK bundleを配信assetに含める工程が必要です。現在は本番ビルドやpushをしていません。

## 公式資料（2026-10-08確認）

- https://firebase.google.com/docs/web/setup （modular SDK）
- https://firebase.google.com/docs/auth/web/google-signin （Google認証）
- https://firebase.google.com/docs/auth/web/auth-state-persistence （メモリ内認証）
- https://firebase.google.com/docs/firestore/manage-data/enable-offline （メモリキャッシュ）
- https://firebase.google.com/docs/firestore/security/rules-conditions （ルール）
- https://firebase.google.com/docs/firestore/manage-data/transactions （原子的更新）
- https://firebase.google.com/docs/rules/unit-tests （Emulator）
- https://firebase.google.com/docs/firestore/pricing （無料枠）

## 今回の実行結果

SDK bundleビルド成功。既存6件＋Firebase状態管理9件の計15件合格。未設定時の1440px/393px表示、既存JSON読込、外部リクエストなしを確認。実データの移行計画は私有フォルダーへdry-runのみ生成しました。

**RulesのEmulator検証は未完了です。** 公式 `cloud-firestore-emulator-v1.22.0.jar` の取得がこの環境で2回失敗しました。7シナリオのテストコードはありますが、Rulesの実コンパイル・実行合格とは報告しません。これを解消し、実認証・CSP・許可ドメイン・Firestoreの統合検証を完了するまでRules適用・実データ投入・公開は進めません。

## 最小機能の追加（最新）

管理者の初回移行UIを追加。control/sourceに mode=migration と approvedSourceHash（親が最新版を照合した64桁hash）が必要です。ファイルは8件・ID重複なし・集計一致・hash一致を確認し、privatePipeline/currentが空の場合だけrevision1で作成します。原本JSON・他事業の案件は変更しません。hashをRulesで再計算することはできず、Rulesは承認されたhashフィールドとの一致、8件とID重複なしを検証し、クライアントが内容digestを計算します。

編集項目は次の作業・内部メモ・準備状態（NOT_READY/READY_FOR_HUMAN_GO）・既存確認項目の完了チェック・タイムゾーン付き最終確認日時です。初回送信GOはチェック不可。本文・宛先・価格・URL・画像参照・ID・送信済み状態を保持し、Rulesでもこの8件の保護フィールド変更を拒否します。既存ゲートの説明/証拠を自動書換しません。確認チェックは新しい外部QAの自動実施を意味しません。

現在18単体テスト合格。Rulesはコンパイル未検証のままです。Emulatorの再取得・別環境での迂回実行は行いません。承認済みプロジェクトで架空データによる公式シミュレータ検証と、通常認証SDKの原子的保存テストを実施してから実案件投入へ進めます。
