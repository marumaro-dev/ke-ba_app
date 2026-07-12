# Prediction Logic Spec

> この文書はPhase3予測ロジックの設計書です。現在はルールベース予測スコア生成、評価、分析画面、`rule-based-v1` / `rule-based-v1.1` 比較まで実装済みです。現在の全体状態は [PROJECT_STATUS.md](./PROJECT_STATUS.md) を参照してください。

## 1. Phase3の目的

Phase3では、Phase2で生成・保存した `feature_snapshots` を使い、各レースの出走馬ごとに予測スコアを算出する。

最初の目的は、AIや機械学習で高精度な予測を作ることではなく、以下を満たす安全で説明可能な予想支援機能を作ることである。

- どの特徴量がスコアに影響したか説明できる
- 対象レース自身の結果を使わない
- `available_at` / `as_of_at` を考慮し、未来情報を混ぜない
- 的中保証・利益保証をしない
- 将来的にLightGBM、XGBoost、Python学習処理などへ置き換えやすい

Phase3初期実装では、勝率予測・複勝率予測・買い目提案は行わない。まずは「予測スコア」と「スコア根拠」を表示する。

## 2. 最初に実装する予測方式

最初に実装する方式は、ルールベースの加点・減点スコアリングとする。

```text
prediction_score = base_score + feature_score_sum
```

### 方針

- スコアは0〜100程度の相対指標とする
- レース内での比較に使う
- スコアは勝率・複勝率ではない
- 予測理由を `score_components` として保存できる設計にする
- 最初は手動で決めた重みを使う
- 将来的には重みやモデルをDBまたはモデルファイルで管理できるようにする

### 初期スコア例

```text
base_score = 50
```

特徴量ごとに加点・減点し、最後に0〜100へ丸める。

```text
prediction_score = clamp(base_score + total_adjustment, 0, 100)
```

このスコアは「勝つ確率」ではなく、「現時点で取得済みの特徴量に基づく相対的な評価値」として扱う。

## 3. 入力に使うテーブル

Phase3初期実装で入力に使う主なテーブルは以下。

| テーブル | 用途 |
| --- | --- |
| `races` | 対象レース、発走時刻、競馬場、距離、芝/ダート、馬場状態 |
| `race_entries` | 対象出走馬、馬、騎手、調教師、枠番、馬番、斤量 |
| `horses` | 馬名など表示用 |
| `jockeys` | 騎手名など表示用 |
| `trainers` | 調教師名など表示用 |
| `feature_snapshots` | Phase2で生成済みのP0/P1/P2特徴量 |
| `feature_definitions` | 特徴量の定義・表示名・バージョン確認 |
| `race_results` | Phase3初期の予測生成では原則使わない。評価時のみラベルとして使う |

オッズを使う場合は、Phase1の現状では `race_results.final_odds` が結果側に保存されているため注意が必要である。予測時点のオッズとして扱うには、将来的にオッズ履歴またはオッズスナップショットの設計が必要になる。

## 4. 入力に使う特徴量

Phase3初期では、Phase2 P0/P1/P2の特徴量を使う。

### P0 基本特徴量

| feature_key | 用途 |
| --- | --- |
| `horse.days_since_last_race` | 前走間隔の評価 |
| `horse.has_past_race` | 過去出走有無 |
| `horse.is_after_layoff_8w` | 休み明け判定 |
| `horse.surface_starts` | 芝/ダート経験数 |
| `horse.surface_top3_rate` | 芝/ダート適性の簡易評価 |
| `horse.distance_starts` | 距離経験数 |
| `horse.distance_top3_rate` | 距離適性の簡易評価 |

### P1 馬の応用特徴量

| feature_key | 用途 |
| --- | --- |
| `horse.best_time_same_surface_distance_ms` | 同馬場区分・同距離の持ち時計 |
| `horse.best_time_same_surface_distance_count` | 持ち時計の信頼度 |
| `horse.track_condition_starts` | 馬場状態経験数 |
| `horse.track_condition_top3_rate` | 馬場状態適性の簡易評価 |
| `horse.course_starts` | コース経験数 |
| `horse.course_top3_rate` | コース適性の簡易評価 |

### P2 騎手特徴量

| feature_key | 用途 |
| --- | --- |
| `jockey.venue_starts` | 騎手の同競馬場経験数 |
| `jockey.venue_wins` | 騎手の同競馬場勝利数 |
| `jockey.venue_top3` | 騎手の同競馬場3着内数 |
| `jockey.venue_win_rate` | 騎手の同競馬場勝率 |
| `jockey.venue_top3_rate` | 騎手の同競馬場3着内率 |
| `jockey.distance_starts` | 騎手の同距離経験数 |
| `jockey.distance_wins` | 騎手の同距離勝利数 |
| `jockey.distance_top3` | 騎手の同距離3着内数 |
| `jockey.distance_win_rate` | 騎手の同距離勝率 |
| `jockey.distance_top3_rate` | 騎手の同距離3着内率 |

P3脚質、ペース予想、位置取り予想はPhase3初期では使わない。

## 5. スコア計算方法

### 5.1 基本構造

初期実装では、以下のような単純な重み付きルールを使う。

```text
score = 50
score += horse_surface_score
score += horse_distance_score
score += horse_course_score
score += horse_track_condition_score
score += horse_interval_score
score += jockey_venue_score
score += jockey_distance_score
score += data_confidence_score
score = clamp(score, 0, 100)
```

### 5.2 P0特徴量の評価例

| 特徴量 | ルール例 |
| --- | --- |
| `horse.has_past_race = false` | 経験不足として小さく減点。ただし新馬戦等では過度に減点しない |
| `horse.days_since_last_race` | 極端に短い/長い間隔は軽く減点 |
| `horse.is_after_layoff_8w = true` | 休み明けとして軽く減点 |
| `horse.surface_top3_rate` | 高いほど加点 |
| `horse.distance_top3_rate` | 高いほど加点 |
| `horse.surface_starts` / `horse.distance_starts` | 件数が少ない場合は信頼度を下げる |

### 5.3 P1特徴量の評価例

| 特徴量 | ルール例 |
| --- | --- |
| `horse.best_time_same_surface_distance_ms` | レース内で相対比較し、速いほど加点 |
| `horse.best_time_same_surface_distance_count` | 件数が多いほど持ち時計の信頼度を上げる |
| `horse.track_condition_top3_rate` | 高いほど加点 |
| `horse.course_top3_rate` | 高いほど加点 |
| `horse.track_condition_starts` / `horse.course_starts` | 件数が少ない場合は加点を抑える |

持ち時計は馬場、開催場、展開、斤量などの影響を受けるため、初期実装では強く重み付けしすぎない。

### 5.4 P2特徴量の評価例

| 特徴量 | ルール例 |
| --- | --- |
| `jockey.venue_win_rate` | 高いほど加点 |
| `jockey.venue_top3_rate` | 高いほど加点 |
| `jockey.distance_win_rate` | 高いほど加点 |
| `jockey.distance_top3_rate` | 高いほど加点 |
| `jockey.venue_starts` / `jockey.distance_starts` | 件数が少ない場合は信頼度を下げる |

騎手特徴量はデータ件数に左右されやすいため、最低件数未満では加点を抑える。

```text
if starts < 3:
  rate_score *= 0.3
elif starts < 10:
  rate_score *= 0.6
else:
  rate_score *= 1.0
```

### 5.5 レース内正規化

持ち時計など、絶対値だけでは比較しづらい特徴量はレース内で正規化する。

例:

```text
best_time_rank_score =
  fastest horse in race: +6
  second group: +3
  missing value: 0
```

初期実装では、複雑な統計正規化よりも、説明しやすい段階ルールを優先する。

### 5.6 欠損値の扱い

特徴量が未生成、または `null` の場合は原則として加点しない。

```text
missing feature => 0 adjustment
```

ただし、過去出走なしなど意味のある欠損は別途軽い減点を検討する。

## 6. 勝率・複勝率という表現の方針

Phase3初期では「勝率」「複勝率」という表現は使わない。

理由:

- ルールベーススコアは確率較正されていない
- 学習済みモデルや十分な評価なしに確率表現を使うと誤解を招く
- 的中保証・利益保証につながる表現を避ける必要がある

画面表示では以下の表現を使う。

- 予測スコア
- 相対評価
- 注目度
- スコア根拠

避ける表現:

- 勝率
- 複勝率
- 的中確率
- 買うべき
- 儲かる
- 回収率保証

将来的にモデル評価と確率較正を行った場合のみ、別フェーズで「推定勝率」「推定複勝率」の導入を検討する。

## 7. オッズを使う場合の注意点

Phase3初期では、原則としてオッズを予測スコアに使わない。

理由:

- オッズは時刻によって大きく変動する
- 締切直前オッズを過去の予測時点で使うとデータリークになる
- 現状の `race_results.final_odds` は結果側データであり、予測時点のオッズとは限らない

将来的に期待値計算を行う場合は、以下のような専用設計が必要である。

| 項目 | 方針 |
| --- | --- |
| オッズ取得元 | 合法的なAPI、許諾済みCSVなど |
| 保存先 | `odds_snapshots` のような時系列テーブル |
| 必須時刻 | `available_at`, `observed_at`, `imported_at` |
| 使用条件 | `odds_snapshot.available_at <= prediction_as_of_at` |
| 表示表現 | 期待値は参考指標に留める |

期待値計算を行う場合でも、買い目提案や利益保証は行わない。

## 8. データリーク防止ルール

Phase3では、以下を必須ルールとする。

### 8.1 予測生成時

- 対象レース自身の `race_results` は使わない
- `feature_snapshots.as_of_at <= prediction_as_of_at` の特徴量だけを使う
- 同じ特徴量が複数ある場合は、`as_of_at` が最新のものを使う
- 対象 `race_entries.available_at <= prediction_as_of_at` の出走馬だけを対象にする
- 対象 `races.available_at <= prediction_as_of_at` のレースだけを対象にする
- オッズを使う場合は、`odds.available_at <= prediction_as_of_at` のものだけを使う

### 8.2 評価時

評価では `race_results` をラベルとして使ってよい。

ただし、評価対象の予測生成時点では利用できなかった情報を、予測スコアの再計算に混ぜてはいけない。

```text
prediction_run.as_of_at < race result available_at
```

このような状態で作った予測と、レース後に確定した結果を後から突き合わせる。

## 9. DB設計案

今回はDBスキーマ変更は行わない。Phase3実装時に追加する候補として、以下を設計案とする。

### 9.1 prediction_runs

予測実行単位を保存する。

| カラム | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid | 予測実行ID |
| `prediction_type` | text | `rule_based` など |
| `model_version` | text | ルールやモデルのバージョン |
| `status` | text | `running`, `succeeded`, `failed` |
| `as_of_at` | timestamptz | 予測基準時刻 |
| `target_race_id` | uuid nullable | 特定レース対象の場合 |
| `started_at` | timestamptz | 開始時刻 |
| `finished_at` | timestamptz nullable | 終了時刻 |
| `total_count` | integer | 対象出走馬数 |
| `success_count` | integer | 成功件数 |
| `failure_count` | integer | 失敗件数 |
| `summary_json` | jsonb | 実行サマリー |
| `created_at` | timestamptz | 作成時刻 |

### 9.2 race_predictions

出走馬ごとの予測結果を保存する。

| カラム | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid | 予測ID |
| `prediction_run_id` | uuid | `prediction_runs.id` |
| `race_id` | uuid | 対象レース |
| `race_entry_id` | uuid | 対象出走馬 |
| `horse_id` | uuid | 対象馬 |
| `jockey_id` | uuid nullable | 対象騎手 |
| `as_of_at` | timestamptz | 予測基準時刻 |
| `prediction_score` | numeric | 0〜100の予測スコア |
| `rank_in_race` | integer nullable | レース内順位 |
| `score_components_json` | jsonb | 加点・減点の内訳 |
| `feature_snapshot_keys_json` | jsonb | 使用した特徴量キー・as_of_at |
| `created_at` | timestamptz | 作成時刻 |
| `updated_at` | timestamptz | 更新時刻 |

推奨ユニーク制約:

```text
unique(prediction_run_id, race_entry_id)
```

または、再実行時の冪等性を重視する場合:

```text
unique(prediction_type, model_version, race_entry_id, as_of_at)
```

### 9.3 prediction_evaluations

予測後に、実際の結果と突き合わせた評価を保存する。

| カラム | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid | 評価ID |
| `prediction_run_id` | uuid | 予測実行ID |
| `race_prediction_id` | uuid | 予測ID |
| `race_id` | uuid | 対象レース |
| `race_entry_id` | uuid | 対象出走馬 |
| `finish_position` | integer nullable | 実着順 |
| `finish_status` | text nullable | 完走、取消、失格など |
| `is_win` | boolean nullable | 1着か |
| `is_top3` | boolean nullable | 3着内か |
| `evaluated_at` | timestamptz | 評価時刻 |
| `result_available_at` | timestamptz | 使用した結果の利用可能時刻 |
| `created_at` | timestamptz | 作成時刻 |

初期段階では評価結果を画面に出す場合でも、的中率や回収率を強調しすぎない。

## 10. 画面表示案

### 10.1 レース詳細画面 `/races/:id`

既存の特徴量表示に加え、予測スコア表示を追加する案。

表示内容:

- 出走馬名
- 騎手名
- 予測スコア
- レース内スコア順位
- スコア根拠
  - 馬の適性
  - 騎手成績
  - 前走間隔
  - 持ち時計
- 注意書き

表示文言例:

```text
予測スコア: 72.4
このスコアは特徴量に基づく相対評価であり、的中や利益を保証するものではありません。
```

### 10.2 予測履歴一覧 `/predictions`

`prediction_runs` を一覧表示する。

- 実行日時
- as_of_at
- prediction_type
- model_version
- status
- total_count
- success_count
- failure_count

### 10.3 予測履歴詳細 `/predictions/:id`

`race_predictions` の結果と、実行サマリーを表示する。

- run情報
- 対象レース数
- 対象出走馬数
- スコア分布
- race_predictions一覧
- score_components_json

### 10.4 評価画面

初期実装では後回しでもよい。評価を追加する場合は、予測結果と実レース結果の突き合わせを表示する。

ただし、ユーザーに過度な期待を与えないよう、以下を避ける。

- 的中率を過剰に強調
- 回収率保証のように見える表現
- 買い目の断定

## 11. 将来的な機械学習モデルへの拡張方針

Phase3初期のルールベース設計は、将来的なML置き換えを前提に以下を分離する。

| 責務 | 初期実装 | 将来 |
| --- | --- | --- |
| 特徴量取得 | TypeScript + SQL | 共通 |
| スコア計算 | ルールベース | Pythonモデル、LightGBM、XGBoostなど |
| 実行履歴 | `prediction_runs` | 共通 |
| 予測結果保存 | `race_predictions` | 共通 |
| 評価保存 | `prediction_evaluations` | 共通 |
| 説明情報 | `score_components_json` | SHAP、feature importanceなど |

### 11.1 モデル入力形式

将来的なMLでは、以下のような行形式を作る。

```text
race_entry_id
race_id
as_of_at
feature_key_1
feature_key_2
...
label_is_win
label_is_top3
```

学習データ作成時のみ、`race_results` をラベルとして使う。特徴量側には対象レース結果を混ぜない。

### 11.2 Pythonバッチ化

将来的に以下の実行基盤を検討する。

- GitHub Actions
- Cloud Run
- ECS

ただし、最初のPhase3ではTypeScript CLIでルールベースを実装するのがよい。

## 12. 禁止表現・注意書き

### 12.1 禁止表現

以下の表現は禁止する。

- 的中保証
- 利益保証
- 必ず当たる
- 絶対に儲かる
- 買うべき
- 回収率保証
- 勝率◯% と断定する表現
- 複勝率◯% と断定する表現

### 12.2 推奨する注意書き

画面やREADMEに以下の注意書きを入れる。

```text
この予測スコアは、取得済みデータと特徴量に基づく参考情報です。
的中や利益を保証するものではありません。
馬券購入は自己判断で行ってください。
```

### 12.3 スコア表示の推奨表現

使ってよい表現:

- 予測スコア
- 相対評価
- 参考スコア
- 注目度
- スコア根拠

避ける表現:

- 勝率
- 複勝率
- 的中確率
- 期待利益
- 推奨買い目

## 13. 最小実装ステップ

Phase3最小実装は以下の順番で進める。

1. `prediction_runs` / `race_predictions` のDB設計を確定
2. migrationを追加
3. 予測対象 `race_entries` を取得するクエリを作る
4. `feature_snapshots` から最新 `as_of_at <= prediction_as_of_at` の特徴量を取得する
5. ルールベーススコアリング関数を実装
6. dry-run CLIを追加
7. 実行CLIで `race_predictions` へUPSERT
8. `/predictions` 一覧画面を追加
9. `/predictions/:id` 詳細画面を追加
10. `/races/:id` に予測スコアを表示
11. READMEに実行方法と注意書きを追記
12. npm run check を通す

## 14. Phase3初期実装でやらないこと

- AI/機械学習モデルの実装
- LightGBM / XGBoost / Python学習処理
- P3脚質
- ペース予想
- 位置取り予想
- 買い目提案
- 勝率・複勝率の断定表示
- オッズを使った期待値計算
- スクレイピング
