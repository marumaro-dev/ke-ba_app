# DEPLOYMENT_SETUP_GUIDE

## 1. 目的

Vercel + SupabaseでPreview / Production環境を構築するための具体的な手順を整理する。

この手順書の目的は、初回デプロイ前に必要な設定を明確にし、PreviewからProduction DBへ誤接続しないようにすることである。

今回は手順書作成のみで、コード実装、DBスキーマ変更、AI/機械学習、勝率・複勝率、買い目提案は行わない。

詳細な環境分離方針は [ENVIRONMENT_STRATEGY.md](./ENVIRONMENT_STRATEGY.md) を正とする。

## 2. 前提と無料枠の考え方

2026-06-30時点では、Vercel / Supabaseの無料枠は個人開発の初期検証に使いやすい一方、Project数、DB容量、転送量、ビルド、Function実行量などに制限がある。制限は変更される可能性があるため、実際に設定する前に公式Pricingを必ず確認する。

推奨は3環境分離だが、Supabase無料枠で作成できるProject数が足りない場合は、Production DBをPreviewから使わないことを最優先にする。

| 構成 | Supabase Project | 推奨度 | 方針 |
| --- | --- | --- | --- |
| 理想構成 | `keiba-dev` / `keiba-preview` / `keiba-prod` | 高 | Development / Preview / Productionを完全分離する |
| 無料枠節約構成 | `keiba-dev-preview` / `keiba-prod` | 中 | LocalとPreviewは同じ非本番DBを使う。Productionは必ず分離する |
| 最小構成 | `keiba-dev` / `keiba-prod` | 中 | Preview Deploymentは作ってもProduction DBへ接続しない。Previewはdev DBまたはDBなし確認に限定する |
| 非推奨構成 | `keiba-prod`のみ | 低 | PreviewやLocalからProduction DBへ接続するため不可 |

無料枠でPreview専用Projectを作れない場合の代替案:

- PreviewをDevelopment相当のSupabase Projectへ接続する
- Previewに投入するデータは架空サンプルまたは許諾済みの最小データに限定する
- Production ProjectはProduction Deployment専用にする
- PreviewからProductionの `DATABASE_URL` / Supabase URL / Publishable Keyを参照しない
- 本番公開後、収益化や継続運用に進むタイミングでSupabase Proや別DBへの移行を検討する

## 3. 環境一覧

| 環境 | 実行場所 | Supabase Project例 | 用途 |
| --- | --- | --- | --- |
| Local / Development | ローカルPC | `keiba-dev` または `keiba-dev-preview` | 開発・検証 |
| Vercel Preview | Vercel Preview Deployments | `keiba-preview` または `keiba-dev-preview` | PR/ブランチ確認 |
| Vercel Production | Vercel Production Deployment | `keiba-prod` | 本番公開 |

最低限、Development/Preview相当とProductionは必ず分ける。Preview用Projectを作れない場合でも、PreviewからProduction DBへ接続してはならない。

## 4. Supabase側の事前作業

### 4.1 Project作成方針

理想構成では以下のProjectを作成する。

| Project名例 | 用途 | データ |
| --- | --- | --- |
| `keiba-dev` | ローカル開発 | 架空サンプル、開発用CSV |
| `keiba-preview` | Vercel Preview | Preview確認用の最小データ |
| `keiba-prod` | Vercel Production | 許諾確認済みの本番データ |

無料枠のProject数制限などで3つ作れない場合は、以下を採用する。

| Project名例 | 接続元 | データ |
| --- | --- | --- |
| `keiba-dev-preview` | Local / Vercel Preview | 架空サンプル、Preview確認用データ |
| `keiba-prod` | Vercel Production | 許諾確認済みの本番データ |

命名ルール:

- Project名に `dev` / `preview` / `prod` のいずれかを含める
- Production Projectを作成したら、Project Refを安全なメモに控える
- Project Ref、接続文字列、キーをREADME、Issue、スクリーンショットへ不用意に出さない
- Production ProjectのDatabase passwordはDevelopment/Previewと別にする

### 4.2 Projectごとの確認項目

各Projectで以下を確認する。

- Project URL
- Publishable / anon key
- Database password
- Database connection string
- Region
- Auth設定
- Backup / plan
- 無料枠の上限、休止条件、容量

注意:

- ProductionのProject URLやキーをPreviewへコピーしない
- Service Role Keyは必要になるまで設定しない
- Service Role Keyを設定する場合でも、`NEXT_PUBLIC_` 付きの環境変数には絶対に入れない

### 4.3 接続文字列取得方法

Supabase Dashboardで対象Projectを開き、`Connect` またはDatabase接続情報から接続文字列を取得する。

取得する接続文字列:

| 種類 | 主な用途 |
| --- | --- |
| Direct connection | migration、pg_dump、バックアップ、長寿命バックエンド |
| Session Pooler | ローカル開発、IPv4-onlyネットワークからの接続 |
| Transaction Pooler | Vercelなどserverless/edgeの短命接続 |

本プロジェクトの使い分け:

| 場面 | 推奨 |
| --- | --- |
| ローカル `npm run dev` | Session Pooler |
| ローカルから `npm run db:migrate` | Direct connectionまたはSession Pooler |
| Vercel Preview | Transaction Pooler |
| Vercel Production | Transaction Pooler |
| バックアップ / pg_dump | Direct connection |

Transaction Poolerはprepared statementsと相性問題が出ることがあるため、現在の実装方針どおりPostgres接続では `prepare: false` を維持する。

## 5. Vercel側の事前作業

### 5.1 GitHub連携

1. Vercel Dashboardへログイン
2. `New Project`
3. GitHub repositoryを選択
4. Framework PresetがNext.jsであることを確認
5. Root Directoryがリポジトリルートであることを確認
6. Build Commandは原則デフォルト、または `npm run build`
7. 初回デプロイ前にEnvironment Variablesを設定する

Vercelでは、Git連携によりbranch pushごとにPreview Deployments、Production BranchへのmergeでProduction Deploymentが作られる。

### 5.2 Production Branch設定

推奨:

- Production Branchは `main`
- `main` 以外のbranchはPreview扱い
- `main` へmergeする前にPreviewで確認する

Vercel Project SettingsでProduction Branchが意図したbranchになっていることを確認する。

### 5.3 Environment Variables設定

VercelではEnvironment VariableをProduction / Preview / Developmentに分けて設定できる。

設定する変数:

| 変数 | Production | Preview | Development |
| --- | --- | --- | --- |
| `DATABASE_URL` | Production Supabase ProjectのTransaction Pooler | Previewまたはdev-preview ProjectのTransaction Pooler | Development ProjectのSession Pooler等 |
| `NEXT_PUBLIC_SUPABASE_URL` | Production Project URL | Previewまたはdev-preview Project URL | Development Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production publishable key | Previewまたはdev-preview publishable key | Development publishable key |
| `APP_ENV` | `production` | `preview` | `development` |

設定禁止:

- PreviewにProductionの `DATABASE_URL` を設定する
- PreviewにProductionの `NEXT_PUBLIC_SUPABASE_URL` を設定する
- PreviewにProductionのPublishable Keyを設定する
- `DATABASE_URL` に `NEXT_PUBLIC_` を付ける
- Service Role Keyをクライアント公開変数にする
- `.env.local` の値をVercel Productionへそのままコピーする

### 5.4 Preview / Productionの値の分け方

Production:

- Production Supabase Projectの値だけを設定する
- Production BranchからだけProduction Deployされるようにする
- Production URLで本番DBを参照する

Preview:

- Previewまたはdev-preview Supabase Projectの値だけを設定する
- 全Preview Branch共通で非本番DBを使う
- Production Project Refを含む値がないことを確認する

Development:

- ローカル `.env.local` を基本とする
- `vercel env pull` を使う場合、Production値をpullしないよう注意する
- `.env.local` にProduction DBを入れない

## 6. 初回デプロイ手順

### 6.1 デプロイ前チェック

1. `npm run check` が成功していることを確認
2. Supabase Projectを作成する
   - 理想: `keiba-dev` / `keiba-preview` / `keiba-prod`
   - 無料枠節約: `keiba-dev-preview` / `keiba-prod`
3. 各Projectの接続情報を取得する
4. Vercel Projectを作成する
5. Vercel Production Variablesを設定する
6. Vercel Preview Variablesを設定する
7. Production Branchを確認する
8. PreviewにProduction Project Refが含まれていないことを確認する

### 6.2 Preview初回デプロイ

1. `main` 以外のbranchをpush
2. Vercel Preview Deploymentを作成
3. Preview URLを開く
4. Preview DBにmigrationを適用する
5. Preview用seedまたは最小CSVを投入する
6. 主要URLを確認する
7. Preview URLでProductionデータが見えていないことを確認する

Preview DBに対するmigration:

```bash
npm run db:migrate
npm run check
```

Previewでseedを実行する場合:

```bash
npm run db:seed
```

Previewのseedは架空サンプルまたはPreview確認用の最小データに限定する。

### 6.3 Production初回デプロイ

1. Previewで確認済みのbranchを `main` にmerge
2. Vercel Production Deploymentを作成
3. Production DBへmigrationを適用する
4. Production用データ投入方針に従って初期データを準備する
5. 主要URLを確認する
6. 予測スコアや分析画面の注意書きが表示されることを確認する

Production DBに対するmigration:

```bash
npm run db:migrate
```

Productionでは、開発用 `npm run db:seed` は原則実行しない。

## 7. デプロイ後の確認URL

| URL | 確認内容 |
| --- | --- |
| `/` | トップページが表示される |
| `/races` | レース一覧が表示される |
| `/races/:id` | レース詳細、出走馬、特徴量、予測スコアが表示される |
| `/imports` | 取込履歴が表示される。公開範囲に注意 |
| `/imports/:id` | 取込詳細・エラーが表示される。公開範囲に注意 |
| `/features` | 特徴量生成履歴が表示される。公開範囲に注意 |
| `/features/:id` | 特徴量生成詳細が表示される |
| `/predictions` | 予測履歴が表示される。注意書きがある |
| `/predictions/:id` | 予測詳細、根拠、評価結果が表示される |
| `/predictions/analytics` | model_version比較と分析が表示される |

Phase4で認証を導入するまでは、管理系画面を一般公開するかどうかを慎重に判断する。

## 8. 本番DBへのmigration適用手順

### 8.1 原則

- Development → Preview → Production の順で適用する
- Productionへ直接適用しない
- Supabase Dashboardで手動スキーマ変更しない
- 本番適用前にバックアップ状態を確認する
- migration実行時は接続先Projectを声出し確認するレベルで確認する

### 8.2 Production適用前チェック

1. `npm run check` 成功
2. Developmentでmigration適用済み
3. Previewでmigration適用済み
4. migration内容を確認
5. Supabase Productionのバックアップ状態を確認
6. Production接続先を確認
7. 作業ログを残す

### 8.3 Production適用後チェック

- `/races` を確認
- `/imports` を確認
- `/features` を確認
- `/predictions` を確認
- `/predictions/analytics` を確認
- エラーログに秘密情報が出ていないか確認

## 9. Seed実行可否の判断

| 環境 | `npm run db:seed` | 判断 |
| --- | --- | --- |
| Development | 実行可 | 架空サンプル・開発確認用 |
| Preview | 条件付き実行可 | Preview確認用の架空サンプルのみ |
| Production | 原則実行しない | 開発用サンプル混入を避ける |

Productionで初期データが必要な場合:

- 本番用seedを別途設計する
- 架空サンプルを混ぜない
- 許諾済みCSV取込を優先する
- 実行前にdry-runできる形を優先する

## 10. CSV・特徴量・予測CLIの環境別運用

| コマンド | Development | Preview | Production |
| --- | --- | --- | --- |
| `db:import:csv:dry-run` | 可 | 可 | 可 |
| `db:import:csv` | 可 | 条件付き可 | 管理手順がある場合のみ |
| `features:seed` | 可 | 可 | 初回または定義更新時のみ |
| `features:generate:dry-run` | 可 | 可 | 可 |
| `features:generate` | 可 | 条件付き可 | 管理手順がある場合のみ |
| `predictions:generate:dry-run` | 可 | 可 | 可 |
| `predictions:generate` | 可 | 条件付き可 | 管理手順がある場合のみ |
| `predictions:evaluate:dry-run` | 可 | 可 | 可 |
| `predictions:evaluate` | 可 | 条件付き可 | 管理手順がある場合のみ |

Productionで書込系CLIを実行するときは、必ず先にdry-runを実行する。

## 11. 誤接続防止チェックリスト

### 11.1 Supabase

- [ ] `keiba-dev` / `keiba-preview` / `keiba-prod`、または `keiba-dev-preview` / `keiba-prod` が分かれている
- [ ] Project名に環境名が入っている
- [ ] Production passwordをPreview/Developmentで使っていない
- [ ] Production Service Role KeyをPreviewに設定していない
- [ ] Production Project RefをPreview設定にコピーしていない

### 11.2 Vercel Preview

- [ ] `DATABASE_URL` がPreviewまたはdev-preview Project
- [ ] `NEXT_PUBLIC_SUPABASE_URL` がPreviewまたはdev-preview Project
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` がPreviewまたはdev-preview Project
- [ ] `APP_ENV=preview`
- [ ] Production Project Refが含まれていない
- [ ] Preview URLでProductionデータが見えない

### 11.3 Vercel Production

- [ ] `DATABASE_URL` がProduction Project
- [ ] `NEXT_PUBLIC_SUPABASE_URL` がProduction Project
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` がProduction Project
- [ ] `APP_ENV=production`
- [ ] Preview / Development Project Refが含まれていない

### 11.4 ローカル

- [ ] `.env.local` がDevelopment DB
- [ ] Production DBの接続文字列を保存していない
- [ ] `.env.local` をコミットしていない
- [ ] CLI実行前に接続先Project名を確認した

## 12. トラブルシュート

### 12.1 PreviewでProductionデータが見える

原因候補:

- Previewの `DATABASE_URL` がProduction DB
- Previewの `NEXT_PUBLIC_SUPABASE_URL` がProduction Project
- PreviewがProduction用の環境変数を継承している

対処:

1. Vercel Preview Environment Variablesを確認
2. Production Project Refが含まれていないか確認
3. Preview Deploymentを再作成
4. Preview DBへ接続していることを画面データで確認
5. 影響がある場合はProductionキーのローテーションを検討する

### 12.2 Productionでデータが空

原因候補:

- migration未適用
- Production DBへデータ未投入
- Productionの `DATABASE_URL` がPreview/Development

対処:

1. Productionの環境変数を確認
2. Production DBでmigration履歴を確認
3. 本番データ投入手順を確認

### 12.3 `DATABASE_URL is required`

原因:

- 環境変数が未設定
- Vercelの対象Environmentに設定していない

対処:

- Vercel Project SettingsでProduction/Previewそれぞれに設定する
- ローカルでは `.env.local` を確認する

### 12.4 `password authentication failed`

原因候補:

- Database passwordが違う
- 接続文字列のパスワードが古い
- URLエンコードが必要な文字を含む
- Production / Previewを取り違えている

対処:

- Supabase Dashboardで接続文字列を取得し直す
- パスワードを再確認する
- 対象Projectが意図した環境か確認する

### 12.5 `ENOTFOUND` / `getaddrinfo`

原因候補:

- ホスト名が間違っている
- ネットワークから到達できない
- Direct connectionがIPv6前提で、利用環境がIPv4-only

対処:

- Supabase Dashboardの `Connect` から接続文字列を取得し直す
- IPv4-only環境ではSession Poolerを検討する
- VercelではTransaction Poolerを使う

### 12.6 prepared statement関連エラー

原因:

- Transaction Poolerでprepared statementsを使っている

対処:

- 接続ライブラリでprepared statementsを無効化する
- このプロジェクトのPostgres接続箇所では `prepare: false` の利用方針を維持する

### 12.7 無料枠のProject数が足りない

対処:

1. `keiba-dev-preview` と `keiba-prod` の2 Project構成にする
2. Previewは `keiba-dev-preview` に接続する
3. Productionは `keiba-prod` にだけ接続する
4. Preview用データは架空・最小データに限定する
5. 必要になったらSupabase Pro、別Organization、セルフホスト、AWS RDSなどを検討する

## 13. 初回公開前の最終チェック

- [ ] `npm run check` 成功
- [ ] Supabase Development / Preview / Production、またはDevelopment-Preview / Productionが分離済み
- [ ] Vercel Preview / Productionの環境変数が分離済み
- [ ] Production Branchが意図通り
- [ ] Preview URLでProductionデータが見えない
- [ ] Production DBへmigration適用済み
- [ ] Productionで開発用seedを実行していない
- [ ] 主要URLを確認済み
- [ ] 予測スコアの注意書きが表示される
- [ ] 的中保証・利益保証・買い目提案の表現がない
- [ ] `.env.local` や接続文字列を表示・コミットしていない

## 14. 参考公式ドキュメント

- Vercel Pricing: https://vercel.com/pricing
- Vercel Environment Variables: https://vercel.com/docs/environment-variables
- Vercel Git Deployments / Production Branch: https://vercel.com/docs/git
- Supabase Pricing: https://supabase.com/pricing
- Supabase database connection: https://supabase.com/docs/guides/database/connecting-to-postgres
