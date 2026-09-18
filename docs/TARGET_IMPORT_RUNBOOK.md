# TARGET/JRA-VAN データ取込運用手順書

## 1. 目的と全体方針

この手順書は、TARGET frontier JVから出力した成績TXTを、別開催日・別競馬場について安全にアプリへ取り込むためのものです。個人利用を前提とし、予測結果は的中や利益を保証するものではありません。

処理は必ず次の順序で進めます。

1. TARGETの原本をリポジトリ外の `raw_target` に保存する。
2. 変換CLIで、リポジトリ外の `app_csv` にアプリ用6CSVを生成する。
3. CSVをオフライン検証し、既存データとの衝突を確認する。
4. PreviewでCSV、特徴量、予測、評価をそれぞれdry-runしてから実行する。
5. Previewの画面表示まで問題がない場合に限り、同一bundleをProductionで同じ順序で処理する。

Productionへの直接投入は原則禁止です。各処理は1回ずつ実行し、失敗・件数不一致・接続先不明のいずれかがあれば、再実行せず停止して原因を確認します。

## 2. 推奨フォルダ構成

原本、変換結果、manifest、ログはGitリポジトリ外で管理します。

```text
keiba_real_data/
├─ raw_target/
│  └─ jra_van/
│     └─ YYYY/
│        └─ YYYY-MM-DD/
│           └─ <venue_code>/
│              ├─ results/
│              │  └─ target_results_YYYY_MM_DD_<venue_code>.TXT
│              └─ entries/
│                 ├─ target_entries_YYYY_MM_DD_<venue_code>.CSV
│                 └─ target_entries_analysis_YYYY_MM_DD_<venue_code>.CSV
├─ app_csv/
│  └─ jra_van/YYYY/YYYY-MM-DD/<venue_code>/vNNN/
│     ├─ races.sample.csv
│     ├─ horses.sample.csv
│     ├─ jockeys.sample.csv
│     ├─ trainers.sample.csv
│     ├─ race_entries.sample.csv
│     └─ race_results.sample.csv
├─ manifests/
│  └─ jra_van/YYYY/YYYY-MM-DD/<venue_code>/vNNN/
└─ logs/
   └─ jra_van/YYYY/YYYY-MM-DD/<venue_code>/vNNN/
```

- provider、年、開催日、競馬場、bundle versionの順で分けます。
- `raw_target` の原本は不変とし、修正や上書きをしません。
- 変換し直す場合は既存versionを上書きせず、`v002`、`v003` のように新しいbundleを作ります。
- manifestには原本と6CSVのSHA-256、行数、対象レース、変換日時、converter commitを記録する運用を推奨します。現行CLIはmanifest/logの本格生成には未対応です。

## 3. TARGETから取得するファイル

### 必須

- 成績（整形テキスト）

### 任意

- 出馬表CSV
- 出馬表分析CSV
- 成績上がりTXT
- 単複票数TXT

現行の変換CLIは成績TXTを主入力とします。出馬表系や票数系のファイルは現時点では変換CLIの入力に統合されていません。将来AI/ML化する場合は、発走前に取得できた情報とレース結果を明確に分離し、結果データを発走前特徴量へ混入させないことが必須です。

## 4. 変換CLI

### script名

```text
target:convert:results
```

### 引数

| 引数 | 必須 | 内容 |
|---|---|---|
| `--input` | 必須 | TARGET成績TXT |
| `--output-dir` | 必須 | 新規bundleの出力先 |
| `--provider-code` | 必須 | 通常は `jra_van` |
| `--race-date` | 必須 | `YYYY-MM-DD` |
| `--venue` | 必須 | 競馬場名 |
| `--venue-code` | 必須 | ID用の英小文字コード |
| `--as-of-at` | 必須 | ISO 8601日時 |
| `--overwrite` | 任意 | 既存出力を明示的に上書きする場合のみ |

### 実行例

```powershell
npm.cmd run target:convert:results -- `
  --input "<raw_targetの成績TXT>" `
  --output-dir "<app_csvの新規vNNNディレクトリ>" `
  --provider-code jra_van `
  --race-date YYYY-MM-DD `
  --venue "<競馬場名>" `
  --venue-code <venue_code> `
  --as-of-at YYYY-MM-DDTHH:mm:ss+09:00
```

出力されるCSVは次の6ファイルです。

- `races.sample.csv`
- `horses.sample.csv`
- `jockeys.sample.csv`
- `trainers.sample.csv`
- `race_entries.sample.csv`
- `race_results.sample.csv`

出力先が既に存在すると、`--overwrite` なしでは停止します。通常運用では上書きせず、新しいversionを作成してください。現行CLIの `scheduled_start_at` は仮値であり、正確な発走時刻が必要な用途では別途対応が必要です。

## 5. 変換後のオフライン確認

DB接続前に、少なくとも以下を確認します。

- 6CSVの存在、UTF-8、ヘッダー、行数
- Zod schemaの必須値、enum、日付、日時、数値範囲
- source IDの形式とファイル内重複
- `race_entries` からrace、horse、jockey、trainerへの参照
- `race_results` からrace entryへの参照
- 対象日、競馬場、レース番号、宣言頭数と結果行数
- 未知のfinish status、reject、warningが0件
- bundleがGitリポジトリ外であること

## 6. 既存データとの重複確認

Preview dry-runより前に、対象DBを読み取り専用で確認します。

- race自然キー: `race_date + venue + race_number`
- entry相当キー: raceと`horse_number`
- 同一race内のhorse重複
- resultとrace entryの対応
- horse、jockey、trainerのsource IDと既存masterの関係

既存レースがある場合、そのまま全日bundleを投入しません。安全な基本対応は、既存レースを除いた新versionのbundleを作り、残存entryから参照されないmaster行も除外する方法です。

同名のhorse、jockey、trainerでもsource ID生成方式が異なると別masterとして登録される可能性があります。Previewでは検証目的で許容する場合がありますが、Productionでは事前に許容判断を記録してください。DBの削除・リセットやimporter変更は、この運用手順の範囲外です。

2026-06-14阪神は`legacy imported day`として固定し、batch再適用対象から除外します。既存差分を一般的なconflict判定の緩和で吸収せず、新規開催日だけを対象にしてください。

## 7. 接続先確認ルール

処理前に毎回、秘密情報を表示せず次を確認します。

| 環境 | envファイル | 必須値 |
|---|---|---|
| Preview | `.env.local` | `APP_ENV=preview` |
| Production | `.env.production.local` | `APP_ENV=production` |

共通確認:

- envファイルが存在し、Git管理対象外かつgitignore対象である。
- `DATABASE_URL` がPostgreSQL/Supabase Pooler形式である。
- `sslmode=require` が設定されている。
- `DATABASE_URL` とSupabase URLのProject識別子が一致する。
- PreviewとProductionの識別子が異なる。
- 接続文字列、Password、Supabase Key、Project Ref、完全なホスト名やユーザー名をログ、チャット、commitへ出さない。

Production処理では必ず `.env.production.local` を明示し、Preview用の `.env.local` を使用しません。

## 8. Preview投入手順

以下は順番を変えず、各コマンドを1回だけ実行します。`<bundle-dir>` とrun IDは確認済みの値へ置き換えます。

### 8.1 CSV dry-run

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/import-csv.ts --dry-run --csv-dir "<bundle-dir>"
```

業務6テーブルの前後件数が変わらず、`failed=0`、`skipped=0`、`import_errors`が増えないことを確認します。dry-run監査batchの追加は許容します。

### 8.2 CSV import

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/import-csv.ts --csv-dir "<bundle-dir>"
```

結果とテーブル増分を照合し、import batchが `import / succeeded` であることを確認します。

### 8.3 特徴量dry-run

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/generate-features.ts --dry-run
```

対象entry数と `有効な特徴量定義数 × 対象entry数` を照合し、`feature_snapshots`が増えないことを確認します。

### 8.4 特徴量実生成

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/generate-features.ts
```

`inserted + updated = calculated`、failure 0、batchが `import / succeeded` であることを確認します。

### 8.5 予測dry-run

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/generate-predictions.ts --dry-run
```

対象entry数と計算予測数が一致し、`race_predictions`が増えないことを確認します。

### 8.6 予測実生成

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/generate-predictions.ts
```

生成されたprediction run IDを記録します。`inserted + updated = calculated`、failure 0、runが `import / succeeded` であることを確認します。

### 8.7 評価dry-run

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/evaluate-predictions.ts --dry-run --prediction-run-id=<run-id>
```

対象run数、評価可能予測数、計算評価数を確認し、`prediction_evaluations`が増えないことを確認します。

### 8.8 評価実行

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/db/evaluate-predictions.ts --prediction-run-id=<run-id>
```

`inserted + updated = calculated`、skipped 0を確認します。

### 8.9 Preview画面確認

- `/races`
- `/imports` と今回のbatch詳細
- `/features` と今回のbatch詳細
- `/predictions`
- `/predictions/<run-id>`
- `/predictions/analytics`

HTTP 500/504、エラーfallback、予期しない空状態がないことを確認します。

## 9. Production投入手順

Previewで全工程と画面確認が成功した同一bundleだけを使用します。途中でCSVを編集・再生成した場合は同一bundleではないため、Previewからやり直します。

Productionでは前節の順序をそのまま繰り返し、すべてのコマンドで `.env.production.local` を明示します。

1. 接続先をマスク確認する。
2. CSV dry-runを1回実行する。
3. CSV importを1回実行する。
4. 特徴量dry-runを1回実行する。
5. 特徴量実生成を1回実行する。
6. 予測dry-runを1回実行する。
7. 予測実生成を1回実行し、run IDを記録する。
8. そのrun IDを明示して評価dry-runを1回実行する。
9. 同じrun IDを明示して評価を1回実行する。
10. Production画面を確認する。

Production用コマンドは、Preview例の `--env-file=.env.local` を `--env-file=.env.production.local` に置き換えます。`.env.local`への上書きや、env指定の省略は禁止です。

## 10. 各ステップの完了条件

- コマンド終了コードが成功である。
- target、calculated、CSV行数などが事前期待値と一致する。
- `failed` またはfailureが0である。
- 意図しない`skipped`が0である。
- CSV処理で`import_errors`が増えていない。
- dry-runでは業務データ本体の件数が増えていない。
- 実処理では`inserted + updated`と計算対象件数が一致する。
- batch/runが期待するmodeかつ`succeeded`である。
- 対象開催日のレース番号とentry/result件数が揃っている。
- 画面で500、504、エラーfallbackが発生しない。
- Git作業ツリーに実データ、生成CSV、manifest、log、秘密情報が含まれていない。

いずれかを満たさない場合は、その場で停止します。原因を確認する前に同じ処理を再実行しません。

## 11. やってはいけないこと

- Preview確認なしでProductionへimportする。
- Productionへいきなり複数開催日・大量データを投入する。
- 接続先を安全に識別できない状態でDBコマンドを実行する。
- 失敗時に安易に同じコマンドを再実行する。
- dry-runを実処理の代わりと誤認する。
- 異なるbundle versionをPreviewとProductionで使う。
- 実データ原本、生成CSV、manifest、log、envファイルをcommitする。
- 秘密情報や実データの大量内容をログやチャットへ出す。
- Production DBを手動削除・リセットして衝突を回避する。
- 結果確定後にしか得られない値を、発走前予測用の特徴量へ混ぜる。

## 12. ロードマップ

1. 別の1開催日・1競馬場を同じ手順で処理する。
2. 1か月分を開催日ごとのimmutable bundleとして処理する。
3. 1年分へ拡張し、manifest/checksumと処理履歴を標準化する。
4. 5年分へ拡張し、再実行・中断・重複検知の運用を固める。
5. horse、jockey、trainerのID統一と同名master正規化方針を確定する。
6. 発走前データを分離したうえでAI/MLモデルを時系列検証する。
7. オッズ、期待値、資金管理、見送り条件を整備してから買い目提案を検討する。
8. データ量と運用が安定した後に画面改修を行う。

次の最小作業は、別の1開催日について原本を保存し、読み取り専用の構造確認を行うことです。
