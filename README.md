# 2027/07/12更新
# Keiba Data

合法的に取得した競馬データを取り込み、レース情報・特徴量・ルールベース予測スコア・評価結果を確認する Next.js アプリです。

現在のフェーズは Phase4 です。Phase1の事実データ管理、Phase2の特徴量生成、Phase3のルールベース予測スコア生成・評価・分析画面まで実装済みで、Phase4では本番公開・認証・運用・環境分離の設計を進めています。

実装済み:

- レース一覧・レース詳細・出走馬一覧
- CSV取込CLI、取込履歴、取込エラー履歴
- P0/P1/P2特徴量生成CLI、特徴量生成履歴、レース詳細での特徴量表示
- ルールベース予測スコア生成CLI
- `rule-based-v1` / `rule-based-v1.1` のスコア設定ファイル管理
- 予測履歴、予測詳細、予測評価、予測分析画面

未実装:

- AI/機械学習モデル
- 勝率・複勝率の算出や表示
- 買い目提案
- Web画面からのCSVアップロード
- 外部API連携
- スクレイピング

## 技術構成

- Next.js / TypeScript
- Supabase PostgreSQL
- Supabase Auth 接続設定
- Drizzle ORM / Drizzle Kit
- Zod
- Vitest
- GitHub Actions

## 現在のフェーズ

| Phase | 状態 | 内容 |
| --- | --- | --- |
| Phase0 | 完了 | 技術構成、基本設計、DB設計方針 |
| Phase1 | 完了 | 事実データ管理、CSV取込、レース一覧・詳細、取込履歴 |
| Phase2 | 完了 | P0/P1/P2特徴量生成、特徴量スナップショット、特徴量生成履歴、画面表示 |
| Phase3 | 完了 | ルールベース予測スコア、予測評価、予測分析、model_version比較 |
| Phase4 | 現在地 | 本番公開、認証、運用、環境分離、収益化準備。AI/機械学習はまだ未実装 |

現在の実装状態は [docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md) も参照してください。

## 必要な環境

- Node.js 20.9 以上
- npm
- Supabase プロジェクト
- Supabase PostgreSQL へ接続できる `DATABASE_URL`

## セットアップ

### 1. 依存関係をインストール

```bash
npm install
```

Windows PowerShell で `npm.ps1` の実行ポリシーに引っかかる場合は、以下のように `npm.cmd` を使ってください。

```powershell
npm.cmd install
```

### 2. 環境変数を作成

`.env.example` を `.env.local` にコピーし、Supabase の値を設定します。

```bash
cp .env.example .env.local
```

Windows PowerShell の場合:

```powershell
Copy-Item .env.example .env.local
```

必要な値:

```dotenv
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`.env.local` は秘密情報を含むため、コミットしないでください。このリポジトリでは `.gitignore` に含めています。

## Supabase の接続文字列

Supabase Dashboard の `Project Settings` → `Database` → `Connection string` から取得します。

環境分離方針は [docs/ENVIRONMENT_STRATEGY.md](./docs/ENVIRONMENT_STRATEGY.md) を参照してください。Production / Preview / Development でSupabase Projectと `DATABASE_URL` を分け、PreviewからProduction DBへ接続しない方針です。

Vercel + Supabaseで初回デプロイする具体的な手順は [docs/DEPLOYMENT_SETUP_GUIDE.md](./docs/DEPLOYMENT_SETUP_GUIDE.md) を参照してください。Supabase無料枠でPreview専用Projectを作れない場合は、Production Projectだけは必ず分離し、PreviewはDevelopment相当のProjectへ接続する方針です。

### ローカル開発

ローカルPCから `npm run db:migrate` / `npm run db:seed` / `npm run dev` を実行する場合は、基本的に `Session Pooler` の接続文字列を推奨します。

例:

```dotenv
DATABASE_URL=postgresql://postgres.your-project-ref:YOUR_PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require
```

補足:

- Supabase の表示内容に従い、ホスト名・リージョン・ポートは自分のプロジェクトの値を使ってください。
- IPv6 環境や直接接続が不安定な場合も Pooler を使うと安定しやすいです。
- `sslmode=require` を付けることを推奨します。

### Vercel デプロイ時

Vercel など serverless 実行環境から接続する場合は、`Transaction Pooler` の接続文字列を推奨します。

例:

```dotenv
DATABASE_URL=postgresql://postgres.your-project-ref:YOUR_PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

注意:

- `DATABASE_URL` はサーバー専用の秘密情報です。`NEXT_PUBLIC_` を付けないでください。
- `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` はブラウザにも公開される前提の値です。
- Vercel では Project Settings の Environment Variables に同じキーを設定してください。
- Preview EnvironmentにはProduction DBの値を設定しないでください。
- Production Branchは原則 `main` とし、`main` 以外はPreview Deploymentとして確認します。
- 無料枠の制約は変更される可能性があるため、デプロイ前にVercel / Supabaseの公式Pricingを確認してください。

## migration と seed の実行前提

`npm run db:migrate` と `npm run db:seed` は、実行時に `.env.local` を読み込みます。

実行前に確認すること:

- `.env.local` が存在する
- `DATABASE_URL` が設定されている
- Supabase プロジェクトが起動している
- Supabase の Database Password が正しい
- 接続文字列が `postgresql://` で始まっている
- `sslmode=require` が付いている

### 3. migration を適用

```bash
npm run db:migrate
```

PowerShell の場合:

```powershell
npm.cmd run db:migrate
```

### 4. サンプルデータを投入

```bash
npm run db:seed
```

PowerShell の場合:

```powershell
npm.cmd run db:seed
```

seed は固定 UUID と競合無視を利用しており、同じサンプルデータを重複作成しない設計です。

## 起こり得るエラーと対処

### `DATABASE_URL is required`

`.env.local` に `DATABASE_URL` が設定されていません。

対処:

- `.env.example` から `.env.local` を作成する
- `DATABASE_URL=postgresql://...` を設定する
- キー名のスペルを確認する

### `Invalid URL` / `Expected string, received undefined`

接続文字列の形式が正しくない可能性があります。

対処:

- `postgresql://` で始まっているか確認する
- パスワード、ホスト名、ポート、DB名が欠けていないか確認する
- `sslmode=require` を付ける

### `password authentication failed`

Supabase の Database Password が違う可能性があります。

対処:

- Supabase Dashboard で Database Password を確認する
- パスワードに記号が含まれる場合、接続文字列内でURLエンコードが必要か確認する

### `ENOTFOUND` / `getaddrinfo` / `Connection terminated`

ホスト名、ネットワーク、Pooler の選択が原因の可能性があります。

対処:

- Supabase の接続文字列をコピーし直す
- ローカル開発では Session Pooler を使う
- Vercel では Transaction Pooler を使う
- Supabase プロジェクトが一時停止していないか確認する

### `relation already exists`

同じ migration が別の方法で適用済み、または手動でテーブルを作成済みの可能性があります。

対処:

- Supabase Dashboard 上で手動スキーマ変更を行わない
- Drizzle の migration 履歴と実DBの状態を確認する
- 開発初期で破棄可能なDBなら、作り直して migration を再実行する

### `duplicate key value violates unique constraint`

seed データの一部が既に存在する可能性があります。

対処:

- 現在の seed は主要データで `onConflictDoNothing` を使っています
- 手動投入データと同じ UUID や一意制約に当たっていないか確認してください

## 開発サーバーを起動

```bash
npm run dev
```

PowerShell の場合:

```powershell
npm.cmd run dev
```

[http://localhost:3000](http://localhost:3000) を開き、トップページからレース一覧へ移動します。

## 主なURL

| URL | 内容 |
| --- | --- |
| `/` | トップページ |
| `/races` | レース一覧 |
| `/races/:id` | レース詳細・出走馬一覧・特徴量・最新予測スコア |
| `/imports` | CSV取込履歴一覧 |
| `/imports/:id` | CSV取込履歴詳細・エラー一覧 |
| `/features` | 特徴量生成履歴一覧 |
| `/features/:id` | 特徴量生成履歴詳細・feature_key別件数 |
| `/predictions` | 予測履歴一覧・評価済み状態 |
| `/predictions/:id` | 予測詳細・根拠・評価結果 |
| `/predictions/analytics` | 予測評価集計・model_version比較・feature_key別寄与 |

## 画面仕様

### レース一覧

`/races` では登録済みレースを検索・確認できます。

できること:

- 開催日で絞り込み
- 競馬場で絞り込み
- 芝/ダートで絞り込み
- 12件ずつページネーション
- 絞り込み条件をURLクエリパラメータに保持

URL例:

```text
/races?raceDate=2026-06-27&venue=東京&surface=turf&page=2
```

クエリパラメータ:

| パラメータ | 内容 | 例 |
| --- | --- | --- |
| `raceDate` | 開催日 | `2026-06-27` |
| `venue` | 競馬場 | `東京` |
| `surface` | コース種別 | `turf` / `dirt` |
| `page` | ページ番号 | `2` |

条件に一致するデータが0件の場合は、条件変更・条件クリアを促す空状態を表示します。

### レース詳細

`/races/:id` ではレース情報と出走馬一覧を確認できます。

表示内容:

- レース名、開催日、競馬場、レース番号
- 発走時刻、芝/ダート、距離
- 天候、馬場、利用可能時刻、観測時刻
- 出走馬の枠番、馬番、馬名、騎手、調教師、斤量、馬体重、状態、結果、タイム、単勝オッズ

出走馬が0件の場合は、データ投入状況を確認するための空状態を表示します。

### 取込履歴一覧

`/imports` では `import_batches` の履歴を確認できます。

表示内容:

- 実行日時
- `provider_code`
- `import_type`
- `mode`
- `status`
- `total_rows`
- `inserted_rows`
- `updated_rows`
- `skipped_rows`
- `failed_rows`
- `source_dir`

できること:

- `mode`: `dry_run` / `import` で絞り込み
- `status`: `running` / `succeeded` / `failed` で絞り込み
- 20件ずつページネーション
- URLクエリパラメータで条件共有

URL例:

```text
/imports?mode=dry_run&status=failed&page=2
```

### 取込履歴詳細

`/imports/:id` では、1回の取込batchの詳細を確認できます。

表示内容:

- batch基本情報
- 件数メトリクス
- `summary_json`
- 紐づく `import_errors` 一覧

エラーが0件の場合は、エラーなしの空状態を表示します。

### 画面確認方法

```bash
npm run dev
```

確認ポイント:

1. `/races` を開き、登録済みレースが表示される
2. 開催日・競馬場・芝/ダートで絞り込める
3. 絞り込み後のURLをコピーして開き直しても同じ条件で表示される
4. ページネーションの「前へ」「次へ」でページ移動できる
5. 条件に一致しない場合、0件表示が分かりやすく表示される
6. レース名をクリックすると `/races/:id` に遷移し、出走馬一覧が見やすく表示される
7. `/imports` を開き、CSV取込履歴が表示される
8. mode / status で絞り込み、URLを開き直しても同じ条件で表示される
9. 取込履歴の実行日時をクリックすると `/imports/:id` に遷移し、summary_json とエラー一覧を確認できる

## DB関連コマンド

```bash
# Drizzle スキーマから migration を生成
npm run db:generate

# migration をDBへ適用
npm run db:migrate

# サンプルデータを投入
npm run db:seed

# samples/csv 配下のCSVを検証する
npm run db:import:csv:dry-run

# samples/csv 配下のCSVをDBへ取り込む
npm run db:import:csv

# P0/P1/P2特徴量定義を投入
npm run features:seed

# P0/P1/P2特徴量をdry-run生成
npm run features:generate:dry-run

# P0/P1/P2特徴量をfeature_snapshotsへ保存
npm run features:generate

# ルールベース予測スコアをdry-run生成
npm run predictions:generate:dry-run

# ルールベース予測スコアをrace_predictionsへ保存
npm run predictions:generate

# 特定modelVersionで予測生成
npm run predictions:generate -- --model-version=rule-based-v1.1

# 予測結果をrace_resultsと突合してdry-run評価
npm run predictions:evaluate:dry-run

# 予測評価をprediction_evaluationsへ保存
npm run predictions:evaluate
```

スキーマ変更は `src/db/schema.ts` を編集して migration を生成します。Supabase Dashboard 上での手動スキーマ変更は原則行わない方針です。

## CSV取込

CSV取込仕様は [docs/CSV_IMPORT_SPEC.md](./docs/CSV_IMPORT_SPEC.md) を参照してください。

対象ファイル:

- `samples/csv/races.sample.csv`
- `samples/csv/horses.sample.csv`
- `samples/csv/jockeys.sample.csv`
- `samples/csv/trainers.sample.csv`
- `samples/csv/race_entries.sample.csv`
- `samples/csv/race_results.sample.csv`

### dry-run

CSVの形式、必須項目、enum、参照整合性を検証し、DBには書き込みません。

```bash
npm run db:import:csv:dry-run
```

PowerShell の場合:

```powershell
npm.cmd run db:import:csv:dry-run
```

### 実行モード

`.env.local` の `DATABASE_URL` を使って Supabase PostgreSQL へ取り込みます。

```bash
npm run db:import:csv
```

PowerShell の場合:

```powershell
npm.cmd run db:import:csv
```

同じCSVを複数回実行しても、内部UUIDまたはDBの一意制約を使ってUPSERTするため重複作成しません。

エラー時は、対象CSV、行番号、外部ID、エラー内容を表示します。`.env.local` の値やDB接続文字列は表示しません。

標準では `samples/csv` を読み込みます。別ディレクトリを検証したい場合は `--csv-dir` を指定できます。

```bash
npm run db:import:csv:dry-run -- --csv-dir=path/to/csv
```

### 取込履歴

CSV取込を実行すると、dry-run / 実取込のどちらでも `import_batches` に履歴を保存します。

主な保存内容:

- 提供元コード
- 取込種別
- dry-run / import の実行モード
- ステータス
- 開始時刻・終了時刻
- 総行数
- inserted / updated / skipped / failed 件数
- 取込元ディレクトリ
- ファイル別サマリーJSON

エラーが発生した場合は `import_errors` に詳細を保存します。

主な保存内容:

- 対象CSV
- 行番号
- エンティティ種別
- 外部ID
- エラーコード
- エラーメッセージ
- 該当行JSON

Supabase SQL Editorなどで確認する例:

```sql
select *
from import_batches
order by started_at desc
limit 10;
```

```sql
select *
from import_errors
order by created_at desc
limit 20;
```

## 特徴量生成

Phase2の特徴量生成仕様は [docs/FEATURE_ENGINEERING_SPEC.md](./docs/FEATURE_ENGINEERING_SPEC.md) を参照してください。

現在の実装では、P0/P1/P2特徴量を生成します。

P0:

- `horse.days_since_last_race`
- `horse.has_past_race`
- `horse.is_after_layoff_8w`
- `horse.surface_starts`
- `horse.surface_top3_rate`
- `horse.distance_starts`
- `horse.distance_top3_rate`

P1:

- `horse.best_time_same_surface_distance_ms`
- `horse.best_time_same_surface_distance_count`
- `horse.track_condition_starts`
- `horse.track_condition_top3_rate`
- `horse.course_starts`
- `horse.course_top3_rate`

P2:

- `jockey.venue_starts`
- `jockey.venue_wins`
- `jockey.venue_top3`
- `jockey.venue_win_rate`
- `jockey.venue_top3_rate`
- `jockey.distance_starts`
- `jockey.distance_wins`
- `jockey.distance_top3`
- `jockey.distance_win_rate`
- `jockey.distance_top3_rate`

### 特徴量定義seed

```bash
npm run features:seed
```

### dry-run

DBから対象出走馬と過去成績を読み、計算件数を表示します。`feature_snapshots` には保存しませんが、`feature_generation_batches` には実行履歴を保存します。

```bash
npm run features:generate:dry-run
```

### 実行モード

計算結果を `feature_snapshots` にUPSERTします。同じ `feature_key + feature_version + race_entry_id + as_of_at` では重複せず更新されます。

```bash
npm run features:generate
```

### as_of_at

`as_of_at` は予測基準時刻です。指定した時刻で利用可能だったデータだけを特徴量に使います。

```bash
npm run features:generate:dry-run -- --as-of-at=2026-07-04T10:00:00+09:00
npm run features:generate -- --as-of-at=2026-07-04T10:00:00+09:00
```

未指定の場合は実行時刻を `as_of_at` とします。運用では、前日夜・当日朝・発走前など、予測タイミングに応じて明示指定することを推奨します。

### データリーク防止

- 対象レース自身の `race_results` は使いません。
- 過去成績は `target_race.scheduled_start_at` より前のレースだけを使います。
- 過去結果は `race_results.available_at <= as_of_at` のものだけを使います。
- 対象出走馬は `races.available_at <= as_of_at` かつ `race_entries.available_at <= as_of_at` のものだけです。

### 確認SQL

```sql
select feature_key, count(*)
from feature_snapshots
group by feature_key
order by feature_key;
```

```sql
select *
from feature_generation_batches
order by started_at desc
limit 10;
```

## データ時点

外部由来の各テーブルでは、次の時刻を区別します。

- `available_at`: 情報が利用可能になった時刻
- `observed_at`: システムが値を観測した時刻
- `imported_at`: 本DBへ取り込んだ時刻

seed の内容は動作確認用に作成した架空のデータであり、実在のレース・競走馬・人物を示すものではありません。

## 注意事項

- スクレイピングは禁止です。
- データ取込は JRA-VAN、JRDB、許諾済みCSVなど合法的な手段だけを使用します。
- 本サービスは的中や利益を保証しません。
- 予測スコアは勝率・複勝率ではありません。
- 買い目提案ではありません。
- AI/機械学習、Web画面からのCSVアップロード、外部API連携は今後の実装対象です。

## 特徴量画面

Phase2 P0/P1/P2特徴量の生成結果は、Web画面からも確認できます。

| URL | 内容 |
| --- | --- |
| `/races/:id` | 出走馬ごとの最新P0/P1/P2特徴量を表示 |
| `/features` | 特徴量生成履歴一覧 |
| `/features/:id` | 特徴量生成履歴詳細 |

### レース詳細での特徴量表示

`/races/:id` の出走馬一覧に、`feature_snapshots` に保存されたP0特徴量を表示します。
同じ出走馬・同じ特徴量キーに対して `as_of_at` が複数ある場合は、最新の `as_of_at` の値を表示します。

表示対象はP0/P1/P2特徴量です。P3脚質、ペース予想、位置取り予想はまだ実装していません。

特徴量が未生成の場合は「未生成」と表示されます。先に以下を実行してください。

```bash
npm run features:generate
```

PowerShell の場合:

```powershell
npm.cmd run features:generate
```

### 特徴量生成履歴一覧

`/features` では `feature_generation_batches` の履歴を確認できます。

表示内容:

- 実行日時
- `as_of_at`
- `status`
- `total_count`
- `success_count`
- `failure_count`
- `started_at`
- `finished_at`

`status=running|succeeded|failed` で絞り込みでき、条件はURLクエリパラメータに保持されます。

URL例:

```text
/features?status=succeeded&page=2
```

### 特徴量生成履歴詳細

`/features/:id` では、1回の特徴量生成batchの詳細を確認できます。

表示内容:

- batch基本情報
- 生成された特徴量件数
- 対象レース数
- 対象出走馬数
- `summary_json`

dry-run や対象0件の場合は、`feature_snapshots` に保存された特徴量が0件になることがあります。
## Phase2 P1特徴量

Phase2の特徴量生成CLIは、P0に加えて以下のP1特徴量も生成します。Phase4のAI/機械学習、勝率・複勝率、買い目提案はまだ実装していません。

### 生成対象

| priority | feature_key | 内容 |
| --- | --- | --- |
| P1 | `horse.best_time_same_surface_distance_ms` | 同じ芝/ダート区分・同距離の過去レースにおける最速走破時計（ミリ秒） |
| P1 | `horse.best_time_same_surface_distance_count` | 持ち時計計算に使った完走・時計ありの過去結果数 |
| P1 | `horse.track_condition_starts` | 同じ馬場状態での過去出走数 |
| P1 | `horse.track_condition_top3_rate` | 同じ馬場状態での過去3着内率 |
| P1 | `horse.course_starts` | 同じ競馬場・芝/ダート区分・距離での過去出走数 |
| P1 | `horse.course_top3_rate` | 同じ競馬場・芝/ダート区分・距離での過去3着内率 |

### データリーク防止

P1特徴量もP0と同じルールで計算します。

- 対象レース自身の `race_results` は使いません。
- `target_race.scheduled_start_at` より前のレースだけを使います。
- 過去結果は `race_results.available_at <= as_of_at` のものだけを使います。
- 同じ `feature_key + feature_version + race_entry_id + as_of_at` はUPSERTされるため、同じ条件で複数回実行しても重複しません。

### 実行方法

```bash
npm run features:seed
npm run features:generate:dry-run
npm run features:generate
```

PowerShell の場合:

```powershell
npm.cmd run features:seed
npm.cmd run features:generate:dry-run
npm.cmd run features:generate
```

任意の基準時刻で生成する場合:

```bash
npm run features:generate -- --as-of-at=2026-07-04T10:00:00+09:00
```

### 確認SQL

```sql
select feature_key, count(*)
from feature_snapshots
where feature_key in (
  'horse.best_time_same_surface_distance_ms',
  'horse.best_time_same_surface_distance_count',
  'horse.track_condition_starts',
  'horse.track_condition_top3_rate',
  'horse.course_starts',
  'horse.course_top3_rate'
)
group by feature_key
order by feature_key;
```

### 画面確認

- `/races/:id` の出走馬一覧でP0/P1を含むPhase2特徴量を確認できます。
- `/features` で特徴量生成履歴を確認できます。
- `/features/:id` で生成件数、対象レース数、対象出走馬数、`summary_json` を確認できます。
## Phase2特徴量確認画面の見方

Phase2 P0/P1/P2特徴量は、生成後にWeb画面から確認できます。

### `/races/:id`

レース詳細では、出走馬ごとにカード形式で特徴量を表示します。

- P0 基本特徴量
  - 前走間隔・休み明け
  - 芝/ダート別成績
  - 距離別成績
- P1 応用特徴量
  - 持ち時計
  - 馬場状態別成績
  - コース別成績

各P0/P1グループは折りたたみ表示です。特徴量が未生成、または一部の `feature_key` が保存されていない場合は「未生成」と表示されます。

### `/features/:id`

特徴量生成履歴詳細では、batch全体の件数に加えて、`feature_key` ごとの保存件数を確認できます。

確認できる内容:

- 生成された特徴量総数
- 対象レース数
- 対象出走馬数
- `feature_key` 別の件数
- `summary_json`

dry-runの場合は `feature_generation_batches` には履歴が残りますが、`feature_snapshots` には保存しないため、特徴量キー別件数は0件になります。
## Phase2 P2特徴量

Phase2 P2では、対象レースで騎乗予定の騎手について、過去の騎乗成績を特徴量として生成します。Phase3のAI予測、勝率予測、複勝率予測、買い目提案、P3脚質はまだ実装していません。

### 生成対象

| priority | feature_key | 内容 |
| --- | --- | --- |
| P2 | `jockey.venue_starts` | 対象騎手の同競馬場での過去騎乗数 |
| P2 | `jockey.venue_wins` | 対象騎手の同競馬場での過去勝利数 |
| P2 | `jockey.venue_top3` | 対象騎手の同競馬場での過去3着内数 |
| P2 | `jockey.venue_win_rate` | 対象騎手の同競馬場での過去勝率 |
| P2 | `jockey.venue_top3_rate` | 対象騎手の同競馬場での過去3着内率 |
| P2 | `jockey.distance_starts` | 対象騎手の同距離での過去騎乗数 |
| P2 | `jockey.distance_wins` | 対象騎手の同距離での過去勝利数 |
| P2 | `jockey.distance_top3` | 対象騎手の同距離での過去3着内数 |
| P2 | `jockey.distance_win_rate` | 対象騎手の同距離での過去勝率 |
| P2 | `jockey.distance_top3_rate` | 対象騎手の同距離での過去3着内率 |

### データリーク防止

P2特徴量もP0/P1と同じく、予測時点で利用可能な情報だけを使います。

- 対象レース自身の `race_results` は使いません。
- `target_race.scheduled_start_at` より前のレースだけを使います。
- 過去結果は `race_results.available_at <= as_of_at` のものだけを使います。
- 対象レースで騎乗予定の `jockey_id` は、対象 `race_entries.available_at <= as_of_at` の場合だけ使います。
- 同じ `feature_key + feature_version + race_entry_id + as_of_at` はUPSERTされるため、同じ条件で複数回実行しても重複しません。

### 実行方法

既存コマンドのまま、P0/P1/P2をまとめて生成します。

```bash
npm run features:seed
npm run features:generate:dry-run
npm run features:generate
```

PowerShell の場合:

```powershell
npm.cmd run features:seed
npm.cmd run features:generate:dry-run
npm.cmd run features:generate
```

### 確認SQL

```sql
select feature_key, count(*)
from feature_snapshots
where feature_key like 'jockey.%'
group by feature_key
order by feature_key;
```

### 画面確認

- `/races/:id` でP0/P1/P2に分類された特徴量を確認できます。
- `/features/:id` でP2を含む `feature_key` 別件数を確認できます。
## Phase3 ルールベース予測スコア

Phase3の最小実装では、`feature_snapshots` に保存されたP0/P1/P2特徴量を使い、出走馬ごとの予測スコアを生成します。

このスコアは勝率・複勝率ではありません。取得済み特徴量に基づく0〜100程度の相対評価です。的中や利益を保証するものではありません。

### スコア設定ファイル

ルールベーススコアの重みは、以下のJSONで管理します。

```text
config/scoring/rule-based-v1.json
```

この設定ファイルには、`modelVersion`、ベーススコア、各特徴量の加点・減点、3着内率や勝率系特徴量の基準値を定義しています。

デフォルトの `modelVersion` は `rule-based-v1` です。予測生成CLIは指定された `modelVersion` を読み込み、`prediction_runs.model_version` と `race_predictions.model_version` に保存します。

設定ファイルはZodでバリデーションされます。将来的に `rule-based-v1.1` や `rule-based-v2` を追加する場合は、既存runの意味を変えないよう、新しい `modelVersion` として別ファイルで管理してください。

現在利用できる設定:

| modelVersion | 設定ファイル | 方針 |
| --- | --- | --- |
| `rule-based-v1` | `config/scoring/rule-based-v1.json` | 初期ルールベーススコア |
| `rule-based-v1.1` | `config/scoring/rule-based-v1.1.json` | v1を壊さず、特徴量ごとの寄与を少し穏やかにした比較用設定 |

注意:

- 設定値を変更した場合は、既存の `rule-based-v1` の意味が変わるため、原則として新しい `modelVersion` を作成してください。
- スコアは勝率・複勝率ではありません。
- 重みの変更は的中や利益を保証するものではありません。

### 実行コマンド

dry-runでは `prediction_runs` に履歴を保存しますが、`race_predictions` には保存しません。

```bash
npm run predictions:generate:dry-run
```

実行モードでは `race_predictions` にUPSERTします。同じ `prediction_type + model_version + race_entry_id + as_of_at` では重複せず更新されます。

```bash
npm run predictions:generate
```

PowerShell の場合:

```powershell
npm.cmd run predictions:generate:dry-run
npm.cmd run predictions:generate
```

### as_of_at

任意の予測基準時刻を指定できます。

```bash
npm run predictions:generate -- --as-of-at=2026-07-04T10:00:00+09:00
```

指定しない場合は、CLI実行時点の現在時刻を `prediction_as_of_at` として使います。

### modelVersion指定

`--model-version` で利用するスコア設定を指定できます。指定しない場合は `rule-based-v1` を使います。

```bash
npm run predictions:generate:dry-run -- --model-version=rule-based-v1.1
npm run predictions:generate -- --model-version=rule-based-v1.1
```

同じ `prediction_as_of_at` で `rule-based-v1` と `rule-based-v1.1` を生成すると、`/predictions/analytics` で `model_version` 別に評価傾向を比較できます。

```bash
npm run predictions:generate -- --as-of-at=2026-07-04T10:00:00+09:00 --model-version=rule-based-v1
npm run predictions:generate -- --as-of-at=2026-07-04T10:00:00+09:00 --model-version=rule-based-v1.1
npm run predictions:evaluate
```

予測生成では以下の条件を守ります。

- `feature_snapshots.as_of_at <= prediction_as_of_at` の特徴量だけを使う
- 対象レースの `race_results` は使わない
- オッズは初期スコアには使わない
- P3脚質、ペース予想、位置取り予想は使わない

### 画面確認

| URL | 内容 |
| --- | --- |
| `/races/:id` | 各出走馬の最新予測スコアを表示 |
| `/predictions` | 予測履歴一覧 |
| `/predictions/:id` | 予測履歴詳細とスコア根拠 |

### 確認SQL

```sql
select *
from prediction_runs
order by started_at desc
limit 10;
```

```sql
select race_id, race_entry_id, prediction_score, rank_in_race, as_of_at
from race_predictions
order by as_of_at desc, race_id, rank_in_race
limit 50;
```

### 注意書き

```text
この予測スコアは、取得済みデータと特徴量に基づく参考情報です。
勝率・複勝率ではありません。
的中や利益を保証するものではありません。
馬券購入は自己判断で行ってください。
```
## 予測スコア表示仕様

Phase3の予測スコアは、画面上では「勝率」「複勝率」ではなく、取得済み特徴量に基づく相対評価として表示します。

### `/races/:id`

各出走馬カードに以下を表示します。

- レース内順位
- 予測スコア
- 主な加点理由
- 主な減点理由
- `as_of_at`
- 注意書き

予測スコアが未生成の場合は「予測スコアは未生成です」と表示します。

### `/predictions/:id`

予測履歴詳細では、予測結果をレース別にグルーピングして表示します。

表示内容:

- レース情報
- 馬別の予測順位
- 馬別の予測スコア
- 主な加点理由
- 主な減点理由

### 注意書き

画面には以下の方針で注意書きを表示します。

```text
予測スコアは、取得済み特徴量に基づく相対評価です。
勝率・複勝率ではなく、的中や利益を保証しません。
買い目提案でもありません。
```

禁止事項:

- 勝率予測として表示しない
- 複勝率予測として表示しない
- 買い目提案をしない
- 的中保証・利益保証の表現を使わない
- オッズを使った期待値表示はまだ行わない
## 予測結果の評価機能

Phase3では、保存済みの `race_predictions` とレース後の `race_results` を突合し、予測スコアが実際の着順とどの程度合っていたかを検証できます。

この評価は過去結果に対する検証機能です。的中保証・利益保証・買い目提案ではありません。

### 実行コマンド

dry-runでは評価件数を確認しますが、`prediction_evaluations` には保存しません。

```bash
npm run predictions:evaluate:dry-run
```

実行モードでは `prediction_evaluations` にUPSERTします。

```bash
npm run predictions:evaluate
```

PowerShell の場合:

```powershell
npm.cmd run predictions:evaluate:dry-run
npm.cmd run predictions:evaluate
```

特定の予測runだけを評価する場合:

```bash
npm run predictions:evaluate -- --prediction-run-id=<prediction_run_id>
```

### 評価内容

評価では以下を保存します。

- 予測1位馬の実着順
- 予測1位馬が3着以内だったか
- 予測上位3頭に実際の1着馬が含まれていたか
- 各馬の予測順位と実着順の差

### 画面確認

- `/predictions` で評価済み・未評価の状態を確認できます。
- `/predictions/:id` でレース別・馬別の評価結果を確認できます。

### 確認SQL

```sql
select *
from prediction_evaluations
order by evaluated_at desc
limit 50;
```

## 予測分析画面

Phase3では、予測評価結果を集計する分析画面を確認できます。

| URL | 内容 |
| --- | --- |
| `/predictions/analytics` | 予測評価の集計・model_version別比較・feature_key別寄与 |

### 表示する指標

- 評価済みレース数
- 予測1位馬の3着内率
- 予測上位3頭に実際の1着馬が含まれた率
- 平均順位差
- `model_version` 別の比較
- `score_components_json` に基づく `feature_key` 別の平均寄与

### model_version比較の見方

`rule-based-v1` と `rule-based-v1.1` など複数の `model_version` がある場合、分析画面では以下を比較できます。

- `model_version` ごとの評価済みレース数
- `model_version` ごとの評価済み予測数
- 予測1位馬の3着内率
- 予測上位3頭に実際の1着馬が含まれた率
- 平均順位差
- `rule-based-v1.1 - rule-based-v1` の差分

平均順位差は小さいほど、予測順位と実着順のズレが小さいことを示します。差分表示では、3着内率や上位3頭内に実1着が含まれた率はプラス方向、平均順位差はマイナス方向が改善の目安です。

評価済みレース数が少ない `model_version` には「参考値」と表示します。少数の結果だけで良し悪しを決めず、データが増えてから判断してください。

`feature_key` 別の平均寄与では、各特徴量がスコアにどれくらい加点・減点しているかを `model_version` ごとに比較できます。`rule-based-v1.1` のように重みを弱めた設定では、平均寄与の絶対値が小さくなることがあります。

### フィルター

- `model_version`
- `prediction_as_of_at` の日付
- 評価状態
  - すべて
  - 評価済み
  - 未評価

URLクエリパラメータで条件を保持します。

例:

```text
/predictions/analytics?modelVersion=rule-based-v1&evaluationStatus=evaluated
```

### 注意書き

分析画面の指標は、過去結果に対する検証です。勝率・複勝率ではなく、的中や利益を保証しません。

評価済みレース数が少ない場合は、傾向判断に注意してください。スコア重みの改善では、単一の指標だけで判断せず、予測1位馬の3着内率、上位3頭内に実1着が含まれた率、平均順位差、feature_key別寄与を合わせて確認します。

### 注意

予測生成時には `race_results` を使いません。`race_results` は評価時にのみ、過去予測の検証ラベルとして使います。

## 品質確認

変更後は以下を実行します。

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

まとめて実行する場合:

```bash
npm run check
```

PowerShell の場合:

```powershell
npm.cmd run check
```

## 関連ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md) | 現在の実装状態、未実装、次の候補 |
| [docs/PROJECT_OVERVIEW.md](./docs/PROJECT_OVERVIEW.md) | プロジェクト概要と基本方針 |
| [docs/PHASE_PLAN.md](./docs/PHASE_PLAN.md) | フェーズ計画 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | アーキテクチャ方針 |
| [docs/DATABASE_DESIGN.md](./docs/DATABASE_DESIGN.md) | DB設計方針 |
| [docs/CSV_IMPORT_SPEC.md](./docs/CSV_IMPORT_SPEC.md) | CSV取込仕様 |
| [docs/FEATURE_ENGINEERING_SPEC.md](./docs/FEATURE_ENGINEERING_SPEC.md) | 特徴量生成仕様 |
| [docs/PREDICTION_LOGIC_SPEC.md](./docs/PREDICTION_LOGIC_SPEC.md) | Phase3予測ロジック仕様 |
| [docs/SCORING_IMPROVEMENT_SPEC.md](./docs/SCORING_IMPROVEMENT_SPEC.md) | スコア改善・model_version比較方針 |
| [docs/PHASE4_RELEASE_PLAN.md](./docs/PHASE4_RELEASE_PLAN.md) | Phase4の本番公開・認証・運用・収益化準備方針 |
| [docs/ENVIRONMENT_STRATEGY.md](./docs/ENVIRONMENT_STRATEGY.md) | Phase4 P0の本番/Preview/開発環境分離方針 |
| [docs/DEPLOYMENT_SETUP_GUIDE.md](./docs/DEPLOYMENT_SETUP_GUIDE.md) | Vercel + SupabaseのPreview/Production構築手順 |
| [docs/CODEX_RULES.md](./docs/CODEX_RULES.md) | 開発時のルール |
