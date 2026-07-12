# PROJECT_STATUS

## 1. 現在地

現在のフェーズは Phase4 です。

Phase1の事実データ管理、Phase2の特徴量生成、Phase3のルールベース予測スコア生成・評価・分析画面まで実装済みです。Phase4では、本番公開、認証、運用、環境分離、収益化準備の設計を進めています。AI/機械学習はまだ実装していません。

## 2. 実装済み

### Phase0: 設計

- 技術構成の決定
- 基本設計ドキュメント
- DB設計方針
- 開発ルール

### Phase1: 事実データ管理

- Next.js + TypeScript 初期構成
- Supabase PostgreSQL 接続
- Drizzle ORM / Zod
- `races`
- `horses`
- `jockeys`
- `trainers`
- `race_entries`
- `race_results`
- レース一覧
- レース詳細
- 出走馬一覧
- CSV取込CLI
- CSV dry-run
- 冪等なUPSERT
- `import_batches`
- `import_errors`
- 取込履歴一覧 `/imports`
- 取込履歴詳細 `/imports/:id`

### Phase2: 特徴量生成

- `feature_definitions`
- `feature_snapshots`
- `feature_generation_batches`
- P0特徴量生成
- P1特徴量生成
- P2特徴量生成
- 特徴量生成CLI
- 特徴量 dry-run
- レース詳細での特徴量表示
- 特徴量生成履歴一覧 `/features`
- 特徴量生成履歴詳細 `/features/:id`

実装済み特徴量:

- P0: 前走間隔、休み明け、芝/ダート別成績、距離別成績
- P1: 持ち時計、馬場状態別成績、コース別成績
- P2: 騎手×競馬場、騎手×距離

未実装の特徴量:

- P3脚質
- ペース予想
- 位置取り予想

### Phase3: ルールベース予測・評価

- `prediction_runs`
- `race_predictions`
- `prediction_evaluations`
- ルールベース予測スコア生成CLI
- 予測 dry-run
- `rule-based-v1`
- `rule-based-v1.1`
- `--model-version` 指定
- 予測履歴一覧 `/predictions`
- 予測履歴詳細 `/predictions/:id`
- レース詳細での最新予測スコア表示
- 予測評価CLI
- 予測分析画面 `/predictions/analytics`
- model_version別比較
- feature_key別平均寄与比較

## 3. 主なURL

| URL | 内容 |
| --- | --- |
| `/` | トップページ |
| `/races` | レース一覧 |
| `/races/:id` | レース詳細、出走馬、特徴量、最新予測スコア |
| `/imports` | CSV取込履歴一覧 |
| `/imports/:id` | CSV取込履歴詳細、エラー一覧 |
| `/features` | 特徴量生成履歴一覧 |
| `/features/:id` | 特徴量生成履歴詳細 |
| `/predictions` | 予測履歴一覧 |
| `/predictions/:id` | 予測詳細、根拠、評価結果 |
| `/predictions/analytics` | 予測評価集計、model_version比較 |

## 4. 主なコマンド

```bash
npm run db:migrate
npm run db:seed
npm run db:import:csv:dry-run
npm run db:import:csv
npm run features:seed
npm run features:generate:dry-run
npm run features:generate
npm run predictions:generate:dry-run
npm run predictions:generate
npm run predictions:generate -- --model-version=rule-based-v1.1
npm run predictions:evaluate:dry-run
npm run predictions:evaluate
npm run check
```

PowerShellでは `npm.cmd` を使用します。

## 5. 未実装

- Phase4のAI/機械学習モデル
- LightGBM / XGBoost / Python学習処理
- 勝率・複勝率の算出や表示
- 買い目提案
- オッズを使った期待値計算
- P3脚質
- ペース予想
- 位置取り予想
- Web画面からのCSVアップロード
- 外部API連携
- スクレイピング

## 6. 注意事項

- 的中保証はしない
- 利益保証はしない
- 予測スコアは勝率・複勝率ではない
- 買い目提案ではない
- 評価結果は過去データに対する検証であり、将来結果を保証しない
- データ取得はJRA-VAN、JRDB、許諾済みCSV、正規APIなど合法的な手段に限定する
- スクレイピングは禁止
- `.env.local` やDB接続文字列を表示・コミットしない

## 7. Phase4候補

Phase4では、いきなりAIモデルを本番機能化せず、次の順で進める。

1. 本番/Preview/開発環境の分離
2. Vercel + Supabase本番公開準備
3. Supabase Auth導入
4. 管理者向け画面の認可
5. 運用監視・バックアップ手順
6. Web CSVアップロード方針
7. 利用規約・プライバシーポリシー草案
8. 収益化前チェック
9. 将来の学習データセット設計
10. 将来のPython実行基盤の選定

Phase4でも、的中保証・利益保証・買い目断定は行わない。
