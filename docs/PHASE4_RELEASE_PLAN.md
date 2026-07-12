# PHASE4_RELEASE_PLAN

## 1. 文書の目的

Phase4では、Phase3までに実装した事実データ管理、特徴量生成、ルールベース予測スコア、評価、分析画面を、安全に本番公開できる状態へ近づける。

この文書では、本番公開、認証、認可、運用、Web画面からのCSVアップロード、収益化前の注意事項、利用規約・プライバシーポリシー、将来的なAWS移行候補を整理する。

今回は設計のみとし、DBスキーマ変更、コード実装、AI/機械学習、勝率・複勝率、買い目提案は行わない。

## 2. Phase4の目的

Phase4の主目的は、AI予測モデルを作ることではなく、公開・運用に必要な安全基盤を整えることである。

目的:

- Vercel + Supabase構成で本番公開できる状態にする
- 認証・認可の境界を明確にする
- 管理者向け機能と一般ユーザー向け機能を分離する
- Web画面からのCSVアップロード方針を決める
- 運用監視、バックアップ、障害対応を整理する
- 収益化前に必要な注意書き・禁止表現・規約項目を整理する
- 将来的にAWSへ移行できる余地を残す

Phase4でやらないこと:

- AI/機械学習モデルの実装
- 勝率・複勝率の算出や表示
- 買い目提案
- 自動投票、馬券購入連携
- 的中保証・利益保証・回収率保証
- スクレイピング

## 3. Phase4の前提

現在の実装状態は [PROJECT_STATUS.md](./PROJECT_STATUS.md) を正とする。

Phase3までに実装済み:

- レース一覧・詳細
- CSV取込CLI
- 取込履歴・取込エラー履歴
- P0/P1/P2特徴量生成
- 特徴量生成履歴
- ルールベース予測スコア生成
- `rule-based-v1` / `rule-based-v1.1`
- 予測評価
- 予測分析画面

Phase4では、これらを「個人開発で安全に公開・運用できる形」に寄せる。

## 4. 本番公開までの作業一覧

### 4.1 リリース前チェック

| 項目 | 内容 |
| --- | --- |
| ドメイン | 本番用ドメインを決め、Vercelへ設定する |
| Supabase本番PJ | 開発用と本番用を分離する |
| 環境変数 | Vercel Production / Preview / Developmentで分離する |
| DB migration | 本番DBへ適用する手順を決める |
| Seed | 本番で実行するseedと、開発用seedを分離する |
| CSV取込 | 本番投入するCSVの出所・許諾・内容を確認する |
| Auth | 認証導入範囲、公開範囲、管理者範囲を決める |
| RLS/認可 | Supabase RLSとアプリケーション認可の責務を整理する |
| 表示文言 | 予測スコアの注意書き、禁止表現がないか確認する |
| 利用規約 | サービス内容、免責、禁止事項、データ利用条件を整理する |
| プライバシーポリシー | 取得する個人情報、利用目的、保存期間を整理する |
| ログ | 秘密情報、個人情報、契約上保存不可な原文データを出さない |
| 監視 | Vercel / Supabaseのエラー、DB容量、費用を監視する |
| バックアップ | Supabaseのバックアップ・復旧手順を確認する |

### 4.2 本番公開前の品質確認

最低限、以下を通す。

```bash
npm run check
```

本番DBに対して実行する前に確認するコマンド:

```bash
npm run db:migrate
npm run features:seed
npm run predictions:generate:dry-run
npm run predictions:evaluate:dry-run
```

注意:

- 本番DBへの `db:seed` 実行は、開発用サンプルデータを入れないよう事前に分離する
- 本番CSVは出所と利用許諾が確認できるものだけを使う
- `.env.local` や本番 `DATABASE_URL` は表示・共有・コミットしない

## 5. Vercelデプロイ手順案

### 5.1 初回デプロイ

1. GitHubリポジトリをVercelへ連携する
2. Framework PresetをNext.jsにする
3. Build Commandを既定の `next build` とする
4. Production Branchを決める
5. Environment Variablesを設定する
6. Preview環境とProduction環境でDBを分ける
7. 初回デプロイ後、主要URLを確認する

### 5.2 Vercel環境変数

Productionに設定する候補:

| 変数 | 用途 | 公開可否 |
| --- | --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL接続 | 非公開 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | ブラウザ公開前提 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable / anon key | ブラウザ公開前提 |
| `SUPABASE_SERVICE_ROLE_KEY` | 管理処理用。必要になるまで追加しない | 非公開 |
| `APP_ENV` | `production` / `preview` など | 非公開でも可 |

重要:

- `DATABASE_URL` に `NEXT_PUBLIC_` を付けない
- Service Role Keyをクライアントへ渡さない
- Preview環境でProduction DBへ接続しない
- 本番データを開発環境へ複製しない

### 5.3 デプロイ後の確認URL

| URL | 確認内容 |
| --- | --- |
| `/` | トップページ |
| `/races` | レース一覧 |
| `/races/:id` | レース詳細、特徴量、予測スコア |
| `/imports` | CSV取込履歴 |
| `/features` | 特徴量生成履歴 |
| `/predictions` | 予測履歴 |
| `/predictions/analytics` | 予測分析 |

## 6. Supabase本番運用の注意点

### 6.1 プロジェクト分離

最低限、以下を分ける。

| 環境 | Supabase Project | 用途 |
| --- | --- | --- |
| Local / Development | 開発用 | 個人開発・検証 |
| Preview | 可能ならPreview用 | PR/検証 |
| Production | 本番用 | 公開サービス |

Preview環境からProduction DBへ接続しない。

### 6.2 DB接続

ローカル開発:

- Session Poolerを優先
- `sslmode=require` を付ける

Vercel本番:

- Transaction Poolerを優先
- コネクション数を増やしすぎない
- 長時間トランザクションを避ける

### 6.3 migration運用

方針:

- スキーマ変更はDrizzle migrationで管理する
- Supabase Dashboardで手動スキーマ変更しない
- 本番適用前にPreview/開発DBで検証する
- 破壊的変更は段階的に行う

本番migration手順案:

1. `npm run check`
2. 開発DBで `npm run db:migrate`
3. Preview DBで確認
4. 本番DBのバックアップ状態を確認
5. 本番DBでmigration
6. 主要画面とCLI dry-runを確認

### 6.4 バックアップ・復旧

確認事項:

- Supabaseプランごとのバックアップ仕様
- Point-in-time recoveryが必要か
- 復旧手順を実際にリハーサルできるか
- CSV原本を再取込できる状態で保管しているか
- 取込履歴、特徴量、予測、評価を再生成できるか

## 7. 環境変数管理方針

### 7.1 原則

- `.env.local` はコミットしない
- `.env.example` にはダミー値だけを書く
- 本番値はVercel / Supabase / GitHub Secretsで管理する
- 秘密情報をREADME、Issue、ログ、スクリーンショットに出さない
- `NEXT_PUBLIC_` 付き変数はブラウザに公開される前提で扱う

### 7.2 環境別の管理

| 環境 | 管理場所 | 注意 |
| --- | --- | --- |
| Local | `.env.local` | 個人PCのみ |
| Vercel Preview | Vercel Environment Variables | Preview用DBを使う |
| Vercel Production | Vercel Environment Variables | Production DBを使う |
| GitHub Actions | GitHub Secrets | 必要最小限にする |

### 7.3 ローテーション

ローテーション対象:

- DB password
- Supabase anon / publishable key
- Supabase service role key
- 将来のデータ提供元APIキー
- 決済サービスキー

漏洩時は、キーを無効化して再発行し、ログ・CI・Vercel・ローカル環境を更新する。

## 8. Supabase Auth導入方針

### 8.1 認証を導入する目的

Phase4では、公開範囲と管理範囲を分けるためにSupabase Authを本格導入する。

認証が必要な候補:

- 管理者向けCSVアップロード
- 取込履歴詳細
- 特徴量生成履歴
- 予測履歴詳細
- 予測分析
- 将来のユーザー設定
- 将来のお気に入り・メモ
- 将来の有料プラン管理

公開してよい候補:

- トップページ
- 注意書き
- 一部のレース一覧・詳細

### 8.2 Auth導入ステップ

1. Supabase Authの設定を確認する
2. メール認証、パスワードリセット方針を決める
3. ログイン画面を追加する
4. サーバー側でセッション取得する
5. 管理者判定の方式を決める
6. 管理画面・管理CLI・アップロード画面を保護する
7. 未認証・権限不足のテストを追加する

### 8.3 管理者判定

候補:

| 方式 | 内容 | 備考 |
| --- | --- | --- |
| `app_users.role` | アプリ側にroleを持つ | RDS移行しやすい |
| Supabase user metadata | Auth側metadataで管理 | 便利だが認証基盤依存が強くなる |
| allowlist | 管理者メールを環境変数で管理 | 初期は簡単だが運用性は低い |

推奨:

- 初期は `app_users` 相当のアプリ側ユーザーテーブルを設計する
- Supabase AuthのIDを業務テーブル主キーへ直接使わない
- 管理者権限はサーバー側で必ず確認する

## 9. RLS/認可方針

### 9.1 基本方針

認証と認可は分けて考える。

- 認証: 誰かを確認する
- 認可: その人が何をできるか確認する

Phase4では、少なくともサーバー側認可を実装する。RLSを使う場合も、UIの表示制御だけに依存しない。

### 9.2 テーブル種別ごとの方針

| 種別 | 例 | 方針 |
| --- | --- | --- |
| 公開可能な事実データ | `races`, `horses`, `race_entries` | 読取のみ公開候補 |
| 管理データ | `import_batches`, `import_errors` | 管理者のみ |
| 分析データ | `feature_snapshots`, `prediction_runs` | 最初は管理者またはログインユーザー限定 |
| ユーザー固有データ | 将来のメモ・お気に入り | 所有者のみ |
| 秘密情報 | APIキー、契約情報 | DBへ安易に保存しない |

### 9.3 RLS導入時の注意

- RLS policyをテストする
- Service Role KeyでRLSを迂回する処理を限定する
- DB直アクセスとNext.js経由アクセスの責務を混ぜない
- RLSで守る範囲とアプリ側認可で守る範囲を文書化する
- RDS移行時にRLSなしでも成立する認可設計を意識する

## 10. Web画面からのCSVアップロード方針

### 10.1 目的

現在のCSV取込はCLIのみである。Phase4では、管理者がWeb画面からCSVをアップロードし、dry-run、検証、実取込を行えるようにする方針を検討する。

### 10.2 推奨フロー

```text
管理者ログイン
  -> CSVファイル選択
  -> ファイルサイズ・拡張子・MIME検証
  -> 一時保存
  -> dry-run検証
  -> エラー表示
  -> 問題なければ取込実行
  -> import_batches / import_errorsで結果確認
```

### 10.3 セキュリティ要件

- 管理者だけがアップロードできる
- ファイルサイズ上限を設定する
- 拡張子だけでなく内容を検証する
- CSVヘッダーを検証する
- 行単位のエラーを保存する
- 原文CSVの保存可否はデータ提供元の契約に従う
- アップロードファイルを公開URLに置かない
- ウイルススキャンや危険ファイル対策を検討する

### 10.4 実装方式候補

| 候補 | 内容 | 向いている状況 |
| --- | --- | --- |
| Next.js Route Handler | アップロードと取込をNext.jsで処理 | 小規模・低頻度 |
| Supabase Storage + Job | Storageへ置き、別ジョブで取込 | ファイル管理を分離したい |
| Cloud Run Jobs / ECS | コンテナバッチで取込 | 大容量・長時間処理 |
| GitHub Actions手動実行 | 低頻度の管理者処理 | 初期運用・個人開発 |

初期推奨:

- まずはWebアップロードを実装する前に、CLI取込を本番運用で安定させる
- Webアップロードは管理者限定でdry-run優先
- 大容量化する場合はNext.jsからジョブ実行へ分離する

## 11. 収益化前に必要な注意書き・禁止表現

### 11.1 禁止表現

以下は使わない。

- 的中保証
- 利益保証
- 回収率保証
- 必ず当たる
- 絶対に儲かる
- 買うべき
- 勝率◯%と断定
- 複勝率◯%と断定
- この馬券で利益が出る
- AIが当てる
- プロ級に勝てる

### 11.2 推奨する注意書き

画面、登録導線、予測スコア表示、分析画面、課金ページには以下の趣旨を表示する。

```text
本サービスの予測スコアは、取得済みデータと特徴量に基づく参考情報です。
勝率・複勝率ではなく、的中や利益を保証するものではありません。
買い目提案や馬券購入の推奨ではありません。
馬券購入は利用者自身の判断と責任で行ってください。
```

### 11.3 収益化前の確認事項

- データ提供元の商用利用可否
- 加工データ、特徴量、予測スコアの表示可否
- 有料プランで表示してよい項目
- 出典表示義務
- 保存期間
- 契約終了時の削除義務
- 未成年者への表示・利用制限
- ギャンブル依存症対策の案内
- 景品表示法上の優良誤認・有利誤認につながる表現がないか
- 特定商取引法や決済サービス利用時の表示義務

法令・契約条件は変更される可能性があるため、公開・収益化前に最新情報を確認し、必要に応じて専門家へ相談する。

## 12. 利用規約・プライバシーポリシーで検討すべき項目

### 12.1 利用規約

検討項目:

- サービスの目的
- 提供する情報の性質
- 予測スコアの位置づけ
- 的中・利益を保証しないこと
- 買い目提案ではないこと
- 馬券購入は利用者の自己責任であること
- 禁止行為
- スクレイピング、無断転載、再配布の禁止
- アカウント管理
- 有料プランがある場合の料金、解約、返金
- サービス停止・変更
- 免責
- 準拠法・管轄
- データ提供元の権利
- 未成年利用に関する方針

### 12.2 プライバシーポリシー

検討項目:

- 取得する情報
  - メールアドレス
  - ログイン情報
  - 利用ログ
  - 決済情報そのものは決済事業者側に持たせる方針
- 利用目的
- 第三者提供
- 外部委託
- Cookie / アクセス解析
- 保存期間
- 削除・開示・訂正請求
- セキュリティ管理措置
- 問い合わせ窓口
- 改定方法

### 12.3 参照すべき公式情報

公開・収益化前に、少なくとも以下を確認する。

- 個人情報保護委員会: https://www.ppc.go.jp/
- 消費者庁 景品表示法: https://www.caa.go.jp/policies/policy/representation/fair_labeling/
- JRA公式サイト: https://www.jra.go.jp/

この文書は法的助言ではない。公開前に最新の公式情報とデータ提供元契約を確認する。

## 13. AWS移行時の候補構成

Phase4ではVercel + Supabaseを前提に公開準備を進める。ただし、将来的なAWS移行余地を残す。

### 13.1 移行候補

| 現在 | AWS移行候補 |
| --- | --- |
| Vercel Next.js | AWS Amplify Hosting / ECS / App Runner |
| Supabase PostgreSQL | Amazon RDS for PostgreSQL / Aurora PostgreSQL |
| Supabase Auth | 当面維持、または Cognito / Auth.js + 独自ユーザー管理 |
| Supabase Storage | S3 |
| GitHub Actions / CLI batch | ECS Scheduled Tasks / EventBridge Scheduler / Cloud Run Jobs相当 |
| Vercel env vars | AWS Secrets Manager / SSM Parameter Store |
| Vercel logs | CloudWatch Logs |

### 13.2 AWS移行時の推奨構成案

#### 案A: Next.js + AWS Amplify + RDS PostgreSQL

向いている状況:

- Vercelからの移行を軽くしたい
- Next.jsホスティングをマネージドにしたい
- RDSを使いたい

懸念:

- Next.js機能の互換性確認が必要
- Supabase Authを継続するか、認証も移行するか判断が必要

#### 案B: Next.js on ECS + RDS PostgreSQL

向いている状況:

- API、Web、バッチをAWS内に寄せたい
- VPC、監査、ネットワーク制御が必要
- PythonバッチやML推論もECSで管理したい

懸念:

- 個人開発には運用負荷が高い
- ALB、ECR、ECS、CloudWatch、Secrets Managerなど管理対象が増える

#### 案C: WebはVercel継続 + バッチ/MLのみAWS

向いている状況:

- Web公開はVercelのまま軽く運用したい
- 重い処理だけAWSへ逃がしたい
- Phase4以降のPython/MLだけAWS化したい

懸念:

- ネットワーク越しのDB接続と秘密情報管理が複雑になる
- Supabase DBとAWS処理の接続方式を慎重に設計する必要がある

### 13.3 移行性を保つためのルール

- PostgreSQL標準機能を優先する
- Supabase固有機能を中核ロジックへ埋め込まない
- Auth IDを業務テーブル主キーにしない
- Service Role Key依存の処理を限定する
- ファイル保存・CSV取込・バッチ実行はアダプター境界を作る
- 環境変数名と設定値の責務を明確にする

## 14. Phase4で実装する優先順位

### P0: 本番公開の安全基盤

1. 本番/開発/Preview環境の分離
2. Vercel Production環境変数の整理
3. Supabase本番DBの接続方式確認
4. 本番migration手順の確立
5. READMEと画面上の注意書き確認
6. `npm run check` をCIで安定実行

### P1: 認証・管理者保護

1. Supabase Auth導入
2. ログイン/ログアウト
3. サーバー側セッション取得
4. 管理者ロール設計
5. `/imports`、`/features`、`/predictions`、`/predictions/analytics` の公開範囲整理
6. 未認証・権限不足テスト

### P2: 運用・監視

1. エラーログ方針
2. Vercel / Supabase監視
3. DB容量・費用アラート
4. バックアップ・復旧手順
5. 取込失敗時の運用手順
6. prediction / feature生成の運用スケジュール

### P3: Web CSVアップロード

1. 管理者限定アップロード画面設計
2. dry-run優先のアップロードフロー
3. ファイルサイズ・形式検証
4. `import_batches` / `import_errors` との接続
5. 大容量時のジョブ分離検討

### P4: 収益化準備

1. データ提供元の商用利用条件確認
2. 利用規約案
3. プライバシーポリシー案
4. 課金プラン案
5. 禁止表現チェック
6. 決済サービス選定

## 15. Phase4完了条件

Phase4完了の目安:

- Vercel + Supabaseで本番公開できる
- 本番/Preview/開発環境が分離されている
- 本番DBへのmigration手順が文書化されている
- 認証・認可の方針が実装されている
- 管理者向け画面が保護されている
- 注意書きが主要画面に表示されている
- 利用規約・プライバシーポリシーの草案がある
- 監視・バックアップ・障害対応の基本手順がある
- 既存のCSV取込、特徴量生成、予測生成、評価CLIが壊れていない

## 16. 次に進む前の確認

Phase4実装に入る前に決めること:

1. どの画面を公開し、どの画面をログイン必須にするか
2. 管理者ロールをどこで管理するか
3. Web CSVアップロードをPhase4に含めるか、後続に回すか
4. 収益化をPhase4内で始めるか、準備だけにするか
5. Vercel + Supabaseで本番公開するか、先にAWS寄せを検討するか

