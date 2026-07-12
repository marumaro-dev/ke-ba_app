# ENVIRONMENT_STRATEGY

## 1. 目的

Phase4 P0では、Vercel + Supabase構成で安全に公開するために、Local / Development、Vercel Preview、Vercel Production の環境分離方針を具体化する。

最大の目的は、Previewやローカル作業からProduction DBへ誤接続しないことである。

この文書は設計・手順整理のみを対象とする。今回はコード実装、DBスキーマ変更、AI/機械学習、勝率・複勝率、買い目提案は行わない。

## 2. 基本方針

- Production / Preview / Development はDBを分離する
- PreviewからProduction DBへ接続しない
- LocalからProduction DBへ原則接続しない
- Productionの環境変数はVercel Productionにだけ設定する
- Previewの環境変数はVercel Previewにだけ設定する
- `.env.local` はDevelopment用だけにする
- 本番データを開発・Previewへ複製しない
- 本番DBへ書き込むCLIは、明示的な運用手順がある場合だけ実行する
- 秘密情報、DB接続文字列、`.env.local` の値を表示・共有・コミットしない

## 3. 環境一覧

| 環境 | 実行場所 | DB | 用途 | 公開範囲 |
| --- | --- | --- | --- | --- |
| Local / Development | 開発者PC | Supabase Development Project | 実装、検証、サンプルデータ投入 | 非公開 |
| Vercel Preview | Vercel Preview Deployments | Supabase Preview Project | PR確認、画面確認、軽い結合確認 | 限定公開 |
| Vercel Production | Vercel Production Deployment | Supabase Production Project | 本番公開 | 一般公開またはログインユーザー |

### 3.1 Local / Development

目的:

- 実装確認
- サンプルデータでの画面確認
- migration作成と初期検証
- CSV取込、特徴量生成、予測生成、評価の開発確認

使うDB:

- `keiba-dev` など、Development専用のSupabase Project

禁止:

- Production DBへの接続
- 本番データのダウンロード
- 本番用APIキーの利用

### 3.2 Vercel Preview

目的:

- Pull Request相当の画面確認
- 本番に近いビルド環境での確認
- Productionへ出す前の最終UI確認

使うDB:

- `keiba-preview` など、Preview専用のSupabase Project

禁止:

- Production DBへの接続
- Production用 `DATABASE_URL` の設定
- Production用 Service Role Key の設定
- Productionデータの複製

### 3.3 Vercel Production

目的:

- 公開サービス
- 本番データの参照
- 本番向けCSV取込後の画面表示
- 本番向け特徴量生成、予測生成、評価

使うDB:

- `keiba-prod` など、Production専用のSupabase Project

注意:

- 本番CLI実行は手順化してから行う
- DB migration前にバックアップ状態を確認する
- CSV取込は利用許諾と内容確認済みのデータだけに限定する

## 4. Supabase Project分離方針

推奨するProject構成:

| Supabase Project | 接続元 | データ |
| --- | --- | --- |
| `keiba-dev` | Local / Development | 合成データ、サンプルCSV、開発用データ |
| `keiba-preview` | Vercel Preview | Preview確認用の最小データ |
| `keiba-prod` | Vercel Production | 契約・許諾確認済みの本番データ |

最低限の構成:

- Development Project
- Production Project

Preview Projectを作れない場合でも、PreviewからProduction DBへ接続してはならない。Previewを無効化するか、Development相当のDBへ接続する。

## 5. Vercel Environment Variables設定方針

Vercelでは、Environmentごとに異なる値を設定する。

| 変数 | Development | Preview | Production |
| --- | --- | --- | --- |
| `DATABASE_URL` | Development DB | Preview DB | Production DB |
| `NEXT_PUBLIC_SUPABASE_URL` | Development Project URL | Preview Project URL | Production Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Development key | Preview key | Production key |
| `APP_ENV` | `development` | `preview` | `production` |
| `SUPABASE_SERVICE_ROLE_KEY` | 原則未設定 | 原則未設定 | 必要時のみ |

重要:

- `DATABASE_URL` はサーバー専用であり、`NEXT_PUBLIC_` を付けない
- `NEXT_PUBLIC_*` はブラウザに公開される前提で扱う
- Service Role Keyは必要になるまで設定しない
- Service Role Keyを設定する場合はProduction/Preview/Developmentで必ず別々の値にする
- PreviewにProductionの値をコピーしない

## 6. DATABASE_URLの使い分け

### 6.1 Local / Development

用途:

- `npm run db:migrate`
- `npm run db:seed`
- `npm run db:import:csv`
- `npm run features:*`
- `npm run predictions:*`
- `npm run dev`

接続先:

- Development Supabase Project
- ローカル開発ではSession Poolerを優先

### 6.2 Vercel Preview

用途:

- Preview画面表示
- Previewビルド確認
- 必要に応じたPreview用DB確認

接続先:

- Preview Supabase Project
- Vercel上ではTransaction Poolerを優先

### 6.3 Vercel Production

用途:

- 本番Webアプリ
- 本番データ参照
- 本番向けの管理処理

接続先:

- Production Supabase Project
- Vercel上ではTransaction Poolerを優先

### 6.4 本番CLI実行時

本番DBに対してCLIを実行する場合は、`.env.production.local` のようなファイルを安易に作って常用しない。実行方法を別途手順化し、以下を確認する。

- 実行者
- 実行日時
- 対象DB
- 実行コマンド
- dry-run結果
- バックアップ状態
- ロールバック方法

## 7. Migration適用手順

### 7.1 原則

- migrationはDevelopment → Preview → Productionの順に適用する
- Productionへ直接初回適用しない
- 破壊的変更はPhase4 P0では行わない
- Supabase Dashboardで手動スキーマ変更しない

### 7.2 Development

```bash
npm run db:migrate
npm run check
```

確認:

- 主要画面が表示される
- CLI dry-runが成功する
- migration履歴が意図通り

### 7.3 Preview

Preview DBへ適用する前に:

- PreviewがProduction DBを見ていないことを確認する
- Vercel Previewの `DATABASE_URL` がPreview Projectのものか確認する
- Productionの接続文字列をコピーしていないことを確認する

適用後:

- `/races`
- `/imports`
- `/features`
- `/predictions`
- `/predictions/analytics`

を確認する。

### 7.4 Production

Production適用前チェック:

1. `npm run check` が成功
2. Developmentでmigration済み
3. Previewでmigration済み
4. Production DBのバックアップ状態を確認
5. 実行するmigrationの内容を確認
6. メンテナンス時間帯が必要か判断

Production適用後チェック:

- トップページが表示される
- `/races` が表示される
- 管理画面が意図せず公開されていない
- エラーログに秘密情報が出ていない

## 8. Seed実行方針

| 環境 | `npm run db:seed` | 方針 |
| --- | --- | --- |
| Local / Development | 許可 | サンプルデータ投入に使用 |
| Vercel Preview | 原則許可 | Preview確認用の合成データのみ |
| Vercel Production | 原則禁止 | 開発用サンプルを本番へ入れない |

Productionで初期データが必要な場合:

- 開発用seedとは別にProduction用seedを設計する
- 実在データは利用許諾確認済みのものだけ使う
- 架空サンプルデータを本番公開画面に混ぜない

## 9. CSV取込を許可する環境

| 環境 | dry-run | import | 方針 |
| --- | --- | --- | --- |
| Local / Development | 許可 | 許可 | サンプルCSV・開発用CSV |
| Vercel Preview | 許可 | 条件付き許可 | Preview用の合成/許諾済みCSVのみ |
| Vercel Production | 許可 | 管理手順がある場合のみ許可 | 許諾済み本番CSVだけ |

Production CSV取込の条件:

- データ提供元と利用許諾が確認済み
- ファイル内容が本番投入対象である
- `available_at` / `observed_at` が妥当
- dry-runが成功
- 取込後に `import_batches` を確認する
- エラー時の戻し方または再取込方針がある

Phase4 P0では、Web画面からのCSVアップロードはまだ実装しない。方針は [PHASE4_RELEASE_PLAN.md](./PHASE4_RELEASE_PLAN.md) に従い、管理者限定・dry-run優先で後続実装とする。

## 10. 特徴量生成・予測生成・評価CLIの実行環境

### 10.1 特徴量生成

| 環境 | dry-run | generate | 方針 |
| --- | --- | --- | --- |
| Local / Development | 許可 | 許可 | 開発確認 |
| Vercel Preview | 許可 | 条件付き許可 | Preview DBのみ |
| Vercel Production | 許可 | 管理手順がある場合のみ許可 | 本番データ更新時に実行 |

Production実行前:

```bash
npm run features:generate:dry-run
```

を先に実行する。

### 10.2 予測生成

| 環境 | dry-run | generate | 方針 |
| --- | --- | --- | --- |
| Local / Development | 許可 | 許可 | 開発確認 |
| Vercel Preview | 許可 | 条件付き許可 | Preview DBのみ |
| Vercel Production | 許可 | 管理手順がある場合のみ許可 | 本番予測スコア更新 |

Production実行例:

```bash
npm run predictions:generate:dry-run -- --model-version=rule-based-v1
npm run predictions:generate -- --model-version=rule-based-v1
```

注意:

- 予測スコアは勝率・複勝率ではない
- 買い目提案ではない
- `race_results` は予測生成に使わない

### 10.3 予測評価

| 環境 | dry-run | evaluate | 方針 |
| --- | --- | --- | --- |
| Local / Development | 許可 | 許可 | 開発確認 |
| Vercel Preview | 許可 | 条件付き許可 | Preview DBのみ |
| Vercel Production | 許可 | 管理手順がある場合のみ許可 | 結果確定後に評価 |

Production実行前:

```bash
npm run predictions:evaluate:dry-run
```

を先に実行する。

## 11. 誤接続防止策

### 11.1 運用ルール

- Production接続文字列を `.env.local` に設定しない
- Production接続文字列をPreview Environment Variablesへ設定しない
- Production DBでCLIを実行する場合は、事前に対象DBを声出し確認するレベルで確認する
- 本番用CSVとサンプルCSVを同じディレクトリで管理しない
- 本番投入前に必ずdry-runを実行する
- Production作業ログを残す

### 11.2 命名ルール

Supabase Project名に環境名を含める。

例:

- `keiba-dev`
- `keiba-preview`
- `keiba-prod`

Vercel Project / Environment Variablesの説明にも環境名を含める。

### 11.3 接続先確認ルール

CLI実行前に確認すること:

- `.env.local` がDevelopment用である
- `DATABASE_URL` のProject Refが意図した環境である
- Vercel Previewの環境変数にProduction Project Refが含まれていない
- Vercel Productionの環境変数にPreview/Development Project Refが含まれていない

### 11.4 将来的なコード上の防止策

Phase4 P0の後続実装候補:

- `APP_ENV` を必須化する
- `DATABASE_URL` のProject Refと `APP_ENV` の組み合わせを起動時に検証する
- Production DBに対する破壊的/書込系CLIでは `--confirm-production` を必須にする
- Productionでは `db:seed` を拒否する
- CLI実行時に接続先環境名を表示する。ただし接続文字列そのものは表示しない

今回は設計のみのため、これらは実装しない。

## 12. Vercel設定チェックリスト

### Preview

- [ ] `DATABASE_URL` がPreview DB
- [ ] `NEXT_PUBLIC_SUPABASE_URL` がPreview Project
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` がPreview Project
- [ ] `APP_ENV=preview`
- [ ] ProductionのService Role Keyを設定していない
- [ ] Preview URLからProductionデータが見えない

### Production

- [ ] `DATABASE_URL` がProduction DB
- [ ] `NEXT_PUBLIC_SUPABASE_URL` がProduction Project
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` がProduction Project
- [ ] `APP_ENV=production`
- [ ] Production用の値だけを設定
- [ ] Preview/DevelopmentのProject Refが混ざっていない

## 13. Phase4 P0の完了条件

Phase4 P0は、以下を満たしたら完了とする。

- Local / Development、Vercel Preview、Vercel Productionの役割が明確
- Supabase Project分離方針が明確
- Vercel Environment Variablesの環境別設定方針が明確
- `DATABASE_URL` の使い分けが明確
- migration適用順が明確
- seed実行可否が環境ごとに明確
- CSV取込を許可する環境が明確
- 特徴量生成、予測生成、評価CLIの実行環境が明確
- Production DBへの誤接続防止ルールが明確
- `npm run check` が成功している

## 14. 次に実装する場合の候補

実装に進む場合の優先順位:

1. `.env.example` に `APP_ENV` を追加
2. 環境変数バリデーションを追加
3. CLI起動時に接続先環境を安全に表示
4. Productionで `db:seed` を拒否する安全装置
5. 書込系CLIにProduction確認フラグを追加
6. Vercel Preview / Productionの設定チェック手順をREADMEへ反映

