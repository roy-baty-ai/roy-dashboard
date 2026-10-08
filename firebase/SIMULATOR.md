# 架空データだけで行う7シナリオ

初期状態は全拒否。以下は候補RulesをConsoleのRules Playgroundで検証する手順であり、実案件投入の許可ではありません。架空UIDは `fake-outsider`。成功ケースは確認済みRoy UIDとメール・Google providerをシミュレーションします。Console管理操作で設定する架空allowlistは検証後削除してください。実UIDへ読み替えてログインすることはしません。

事前の架空データ：admins/atmDvobZO2U0T5VKrsAe69tEkdt1={enabled:true}、control/source={mode:'json',approvedSourceHash:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}。私有fixtureはschema_version1、fake-0〜fake-7の8件、sent=false、status/readiness=NOT_READY、空のconfirmed_gates/missing_gates、last_checked_at='2026-10-08T00:00:00Z'、summary={ready_for_human_go:0,sent_cases_in_this_view:0,operating_revenue_usd_last_recorded:0}。外側はrevision1、sourceHashは64個のa、updatedBy='atmDvobZO2U0T5VKrsAe69tEkdt1'。公開fixtureはcaseCount8/preparingCount8/readyCount0/sentCount0/previewCount0/confirmedRevenueUsd0/targetCount10/revision1。fixtureの時刻はConsoleのtimestamp型で設定します。

| # | 操作とパス | シミュレーション認証 | 期待 |
|---|---|---|---|
|1| get publicSummary/current / get privatePipeline/current | 未認証 | 公開のみALLOW・私有DENY。listもDENY |
|2| get privatePipeline/current | uid=fake-outsider、email_verified=true | DENY |
|3| get privatePipeline/current | uid=atmDvobZO2U0T5VKrsAe69tEkdt1、email_verified=true | ALLOW。falseに変えるとDENY |
|4| get privatePipeline/current | atmDvobZO2U0T5VKrsAe69tEkdt1、verified=true。ただしadmins/atmDvobZO2U0T5VKrsAe69tEkdt1.enabled=falseへ変更 | DENY。確認後trueに戻す |
|5| create admins/fake-outsider、update control/source、update privatePipeline/current | atmDvobZO2U0T5VKrsAe69tEkdt1、verified=true、mode=json | 全DENY（自己昇格・正本切替・JSON正本中の更新不可） |
|6| create privatePipeline/current | atmDvobZO2U0T5VKrsAe69tEkdt1、verified=true、mode=migration、承認hash一致、空の移行先、8件、revision1 | 条件付きALLOW。7件・重複ID・hash不一致・既存先への再実行はDENY |
|7| update privatePipeline/current＋publicSummary/current | atmDvobZO2U0T5VKrsAe69tEkdt1、verified=true、mode=firestore | revision+1の同時保存のみALLOW。単独保存・古いrevision・メール本文変更・公開recipient追加はDENY |

重要：6/7の成功条件には `updatedAt == request.time` があり、7にはgetAfterによる同一transactionの照合があります。Rules PlaygroundがserverTimestamp変換や複数文書のtransactionを再現できない場合、成功ケースを検証済みとは扱わないでください。その場合は、承認済みの候補Rulesの下で**架空データだけ**を通常のRoyログインセッション＋同じWeb SDKから保存して検証します。キー・トークンを抽出しません。実UIDのallowlistは実メール確認後の承認済みUIDだけです。

成功ケースが未検証なら実案件は投入しません。シミュレータの偽認証だけで実SDKのOAuth/CSPやtransaction全体が検証済みになるわけではありません。候補Rules適用前は全拒否維持、失敗時は全拒否へ戻します。fixture削除やmodeの変更はConsole管理経路で実施し、実案件／他の過去送信記録へ触れません。

## 独立レビュー後の追加検証

認証条件は固定Roy UID・固定Royメール・email_verified=true・firebase.sign_in_provider=google.com・allowlist enabled=trueの全一致です。同じUIDでも異なるメール／password providerをDENYにします。ゲート証跡配列は変更不可、通常更新はgate_checksの許可boolean項目だけです。initial_send_goキーは許可しません。

8件ともNOT_READYのままsummary/publicのREADY件数を8に偽装、URLがnullのままpreviewCount8に偽装、既存GOゲートの追加／削除／改変をそれぞれDENYと確認してください。ConsoleからpublicSummary/currentへrecipient文字列を追加した場合は、匿名get自体もDENYとなることを確認し、試験後その項目を削除してください。公開getのshape検査で余分なキーや不正型も拒否します。
