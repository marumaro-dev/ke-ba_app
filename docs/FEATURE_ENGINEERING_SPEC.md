# Feature Engineering Spec

> この文書はPhase2特徴量生成の設計書です。現在はP0/P1/P2特徴量の生成・保存・画面表示まで実装済みです。現在の全体状態は [PROJECT_STATUS.md](./PROJECT_STATUS.md) を参照してください。

## 1. 目的

Phase2では、Phase1で取り込んだ競馬の事実データから、将来の予測ロジックやモデル学習で利用できる特徴量を自動生成する。

本仕様は設計のみを対象とする。今回は実装、DBスキーマ変更、AI予測、ペース予想、位置取り予想、スクレイピングは行わない。

最重要方針は、予測時点で利用可能だったデータだけを使い、未来情報を混ぜないことである。すべての特徴量計算では `available_at` / `observed_at` / `imported_at` を考慮する。

## 2. Phase2の前提

### 入力に使うPhase1テーブル

Phase2初期では、既存の以下テーブルだけを入力とする。

| テーブル | 用途 |
| --- | --- |
| `races` | 開催日、競馬場、レース番号、距離、芝/ダート、馬場状態、発走時刻 |
| `horses` | 競走馬マスタ |
| `jockeys` | 騎手マスタ |
| `trainers` | 調教師マスタ |
| `race_entries` | 出走馬、枠番、馬番、騎手、調教師、斤量、馬体重 |
| `race_results` | 着順、走破時計、着差、最終オッズ、人気 |

### Phase2ではまだ対象外

- AI予測
- 機械学習モデル学習
- ペース予想
- 位置取り予想
- Web画面からの特徴量生成操作
- スクレイピング
- 外部API連携

## 3. 特徴量生成の基本単位

特徴量は、原則として「あるレースの、ある出走馬に対する、ある基準時刻時点の値」として生成する。

```text
race_entry_id
feature_key
feature_value
as_of_at
available_at
source_observed_at
generated_at
```

ここで重要なのは `as_of_at` である。`as_of_at` は「この特徴量を予測に使う想定時刻」を表す。たとえばレース前日に予測するなら、レース前日の時刻を `as_of_at` にする。

## 4. データリーク防止ルール

### 4.1 絶対ルール

特徴量計算では、対象レース自身の結果データを使ってはいけない。

対象レースの `race_results` は、レース後にしか利用できない未来情報である。学習データ作成時にも、対象レースの結果はラベルとしてのみ扱い、特徴量には含めない。

### 4.2 時刻条件

特徴量に使える入力行は、以下をすべて満たすものに限定する。

```text
input.available_at <= as_of_at
input.observed_at <= feature_generated_at
input.imported_at <= feature_generated_at
```

ただし、モデル学習用に過去時点を再現する場合は、より厳密に以下を推奨する。

```text
input.available_at <= as_of_at
```

`observed_at` と `imported_at` はシステム側の観測・取込時刻であり、過去時点再現では「本来利用可能だったか」を `available_at` で判断する。

### 4.3 対象レースより前のレースだけを使う

馬・騎手などの過去成績を集計する場合は、以下を満たすレースだけを使う。

```text
past_race.scheduled_start_at < target_race.scheduled_start_at
past_result.available_at <= as_of_at
```

`race_date` だけでは同日内の前後関係を誤る可能性があるため、可能な限り `scheduled_start_at` を使う。

### 4.4 訂正データの扱い

`race_results.status = corrected` のような訂正データは、訂正後の `available_at` が `as_of_at` 以前である場合のみ使える。

過去時点でまだ訂正が公開されていなかった場合、訂正後の値を使うとリークになる。

## 5. Phase2で作る特徴量一覧

| 優先 | 特徴量 | 粒度 | 主な入力テーブル | 初期実装 |
| --- | --- | --- | --- | --- |
| P0 | 前走からの間隔 | horse x race_entry | `races`, `race_entries`, `race_results` | 対象 |
| P0 | 休み明け判定 | horse x race_entry | `races`, `race_entries`, `race_results` | 対象 |
| P0 | 芝/ダート別成績 | horse x race_entry | `races`, `race_entries`, `race_results` | 対象 |
| P0 | 距離別成績 | horse x race_entry | `races`, `race_entries`, `race_results` | 対象 |
| P1 | 持ち時計 | horse x race_entry | `races`, `race_entries`, `race_results` | 対象候補 |
| P1 | 馬場状態別成績 | horse x race_entry | `races`, `race_entries`, `race_results` | 後続 |
| P1 | コース別成績 | horse x race_entry | `races`, `race_entries`, `race_results` | 後続 |
| P2 | 騎手×競馬場成績 | jockey x venue x race_entry | `races`, `race_entries`, `race_results` | 後続 |
| P2 | 騎手×距離成績 | jockey x distance x race_entry | `races`, `race_entries`, `race_results` | 後続 |
| P3 | 脚質 | horse x race_entry | Phase1では入力不足 | 設計のみ |

## 6. 特徴量ごとの計算方法

### 6.1 前走からの間隔

#### feature keys

- `horse.days_since_last_race`
- `horse.last_race_date`

#### 定義

対象馬が対象レースより前に出走した最新レースを探し、対象レース開催日との差分日数を計算する。

```text
days_since_last_race = target_race.race_date - last_past_race.race_date
```

#### 入力テーブル

- `races`
- `race_entries`
- `race_results`

#### 条件

- 同一 `horse_id`
- 過去レースの `scheduled_start_at < target_race.scheduled_start_at`
- 過去結果の `available_at <= as_of_at`
- 対象レース自身の結果は使わない

#### 欠損時

過去出走がない場合は `null` とする。初出走判定用に別特徴量 `horse.has_past_race = false` を持つことを推奨する。

### 6.2 休み明け判定

#### feature keys

- `horse.is_after_layoff_8w`
- `horse.is_after_layoff_12w`
- `horse.is_after_layoff_24w`

#### 定義

前走からの間隔が一定日数以上ならtrue。

```text
is_after_layoff_8w = days_since_last_race >= 56
is_after_layoff_12w = days_since_last_race >= 84
is_after_layoff_24w = days_since_last_race >= 168
```

#### 入力テーブル

- `races`
- `race_entries`
- `race_results`

#### 欠損時

前走がない場合は `null` とし、初出走と休み明けを混同しない。

### 6.3 持ち時計

#### feature keys

- `horse.best_time_same_surface_distance_ms`
- `horse.best_time_same_surface_distance_count`
- `horse.best_time_near_distance_ms`

#### 定義

対象レースより前のレースから、同じ芝/ダート・同距離の最速走破時計を計算する。

```text
best_time = min(finish_time_milliseconds)
```

近距離版は、対象距離の±200mなどのレンジで集計する。

#### 入力テーブル

- `races`
- `race_entries`
- `race_results`

#### 条件

- `finish_status = finished`
- `finish_time_milliseconds is not null`
- 過去結果の `available_at <= as_of_at`
- 同じ `surface`
- 同じ `distance_meters`、または近距離条件

#### 注意

走破時計は馬場状態、開催場、展開の影響を強く受けるため、初期実装では単純な事実特徴量として扱う。補正値はPhase2後半以降に回す。

### 6.4 距離別成績

#### feature keys

- `horse.distance_starts`
- `horse.distance_wins`
- `horse.distance_top3`
- `horse.distance_win_rate`
- `horse.distance_top3_rate`

#### 定義

対象馬の過去レースのうち、対象レースと同じ距離の成績を集計する。

```text
starts = count(past_entries)
wins = count(finish_position = 1)
top3 = count(finish_position <= 3)
win_rate = wins / starts
top3_rate = top3 / starts
```

#### 入力テーブル

- `races`
- `race_entries`
- `race_results`

#### 欠損時

該当距離の過去出走がない場合、件数は0、率は `null` とする。0割を避ける。

### 6.5 芝/ダート別成績

#### feature keys

- `horse.surface_starts`
- `horse.surface_wins`
- `horse.surface_top3`
- `horse.surface_win_rate`
- `horse.surface_top3_rate`

#### 定義

対象レースと同じ `surface` の過去成績を集計する。

芝/ダート判定は初期実装では `races.surface` の文字列に対して以下の正規化を行う。

| surface文字列 | normalized_surface |
| --- | --- |
| `芝` を含む | `turf` |
| `ダート` を含む | `dirt` |
| その他 | `other` |

### 6.6 馬場状態別成績

#### feature keys

- `horse.track_condition_starts`
- `horse.track_condition_wins`
- `horse.track_condition_top3`
- `horse.track_condition_top3_rate`

#### 定義

対象レースと同じ `track_condition` の過去成績を集計する。

#### 注意

馬場状態は公開時刻・更新時刻が重要である。Phase1では `races.track_condition` を上書き保存しているため、履歴を厳密に扱うには将来的に馬場状態履歴テーブルが必要になる可能性がある。

初期実装では、対象レースより前の過去レースに対する確定済み馬場状態として扱う。

### 6.7 コース別成績

#### feature keys

- `horse.course_starts`
- `horse.course_wins`
- `horse.course_top3`
- `horse.course_top3_rate`

#### 定義

対象レースと同じ競馬場・芝/ダート・距離の過去成績を集計する。

```text
same_course = venue + normalized_surface + distance_meters
```

#### 入力テーブル

- `races`
- `race_entries`
- `race_results`

#### 注意

本来の「コース」は内回り/外回り、右回り/左回り、直線、障害なども含む。Phase1 DBにはそれらがないため、初期実装では簡易コース定義とする。

### 6.8 騎手×競馬場成績

#### feature keys

- `jockey.venue_starts`
- `jockey.venue_wins`
- `jockey.venue_top3`
- `jockey.venue_win_rate`
- `jockey.venue_top3_rate`

#### 定義

対象レースの騎手について、同じ競馬場での過去成績を集計する。

#### 入力テーブル

- `races`
- `race_entries`
- `race_results`
- `jockeys`

#### 注意

馬ではなく騎手を軸に集計する。対象レースでその騎手が騎乗予定であることは、出走表として `available_at <= as_of_at` の場合のみ使える。

### 6.9 騎手×距離成績

#### feature keys

- `jockey.distance_starts`
- `jockey.distance_wins`
- `jockey.distance_top3`
- `jockey.distance_win_rate`
- `jockey.distance_top3_rate`

#### 定義

対象レースの騎手について、同じ距離での過去成績を集計する。

距離は完全一致から始める。後続で距離帯、短距離/マイル/中距離/長距離のカテゴリ化を検討する。

### 6.10 脚質

#### feature keys

- `horse.running_style`
- `horse.running_style_confidence`

#### 定義案

脚質は、逃げ・先行・差し・追込などのレース中位置取り傾向を表す。

ただしPhase1 DBには通過順、コーナー位置、上がり3F、ラップ、レース映像由来情報がない。そのためPhase2初期では実装しない。

#### 将来必要な入力

- コーナー通過順
- 位置取り
- 上がりタイム
- ラップ
- レース展開情報

これらが合法的に取得できるデータ源から利用可能になった段階で設計を更新する。

## 7. 優先順位

### P0: 最初に実装する

1. 前走からの間隔
2. 休み明け判定
3. 芝/ダート別成績
4. 距離別成績

理由:

- Phase1テーブルだけで作れる
- 計算ロジックが比較的単純
- データリーク対策を実装しやすい
- 予測モデルなしでも画面やCSVで確認しやすい

### P1: P0の後に実装する

5. 持ち時計
6. 馬場状態別成績
7. コース別成績

理由:

- 有用だが、条件の正規化や欠損処理がやや増える
- 持ち時計は馬場・コース差の影響を受けるため、まず単純版から始める

### P2: データが増えてから実装する

8. 騎手×競馬場成績
9. 騎手×距離成績

理由:

- 集計対象が騎手単位になり、データ量が少ないと不安定
- 後続で期間絞り、直近N走、直近1年などの窓設計が必要

### P3: 追加データ取得後に実装する

10. 脚質

理由:

- Phase1 DBだけでは根拠となる入力が不足している
- ペース予想・位置取り予想に近いため、Phase2初期では扱わない

## 8. 出力先テーブル案

今回はDBスキーマ変更しないが、Phase2実装時には以下を追加する案とする。

### 8.1 feature_definitions

特徴量の定義を管理するマスタ。

| カラム | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid | 内部ID |
| `feature_key` | text | 一意な特徴量キー |
| `name` | text | 表示名 |
| `description` | text | 説明 |
| `entity_type` | text | `race_entry`, `horse`, `jockey` など |
| `value_type` | text | `number`, `boolean`, `string`, `json` |
| `version` | integer | 定義バージョン |
| `is_active` | boolean | 有効/無効 |
| `calculation_logic` | text | 計算方針の説明 |
| `created_at` | timestamptz | 作成時刻 |
| `updated_at` | timestamptz | 更新時刻 |

制約案:

- `feature_key + version` を一意にする
- `feature_key` は変更しない

### 8.2 feature_snapshots

特徴量の生成結果を保存する。

| カラム | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid | 内部ID |
| `feature_definition_id` | uuid | `feature_definitions.id` |
| `race_id` | uuid | 対象レース |
| `race_entry_id` | uuid | 対象出走馬。race_entry粒度では必須 |
| `horse_id` | uuid | 対象馬 |
| `jockey_id` | uuid | 対象騎手 |
| `feature_key` | text | 冗長保持。分析しやすくするため |
| `feature_version` | integer | 定義バージョン |
| `as_of_at` | timestamptz | 予測基準時刻 |
| `feature_value_number` | numeric | 数値特徴量 |
| `feature_value_text` | text | 文字列特徴量 |
| `feature_value_boolean` | boolean | 真偽値特徴量 |
| `feature_value_json` | jsonb | 複合特徴量 |
| `source_available_until` | timestamptz | 使用した入力データの最大available_at |
| `source_observed_until` | timestamptz | 使用した入力データの最大observed_at |
| `generated_at` | timestamptz | 生成時刻 |
| `created_at` | timestamptz | 作成時刻 |

制約案:

```text
unique(feature_key, feature_version, race_entry_id, as_of_at)
```

特徴量は再生成される可能性があるため、同じキー・同じ対象・同じ基準時刻・同じバージョンではUPSERTする。

### 8.3 feature_generation_batches

任意だが、運用上は生成履歴を持つことを推奨する。

| カラム | 型 | 説明 |
| --- | --- | --- |
| `id` | uuid | batch ID |
| `status` | text | `running`, `succeeded`, `failed` |
| `as_of_at` | timestamptz | 生成基準時刻 |
| `target_race_date_from` | date | 対象期間開始 |
| `target_race_date_to` | date | 対象期間終了 |
| `feature_version` | integer | 生成対象バージョン |
| `total_count` | integer | 対象件数 |
| `success_count` | integer | 成功件数 |
| `failure_count` | integer | 失敗件数 |
| `started_at` | timestamptz | 開始時刻 |
| `finished_at` | timestamptz | 終了時刻 |

## 9. 最初に実装すべき最小特徴量セット

Phase2の最小実装では、以下に絞る。

| feature_key | 型 | 説明 |
| --- | --- | --- |
| `horse.days_since_last_race` | number | 前走からの日数 |
| `horse.has_past_race` | boolean | 過去出走があるか |
| `horse.is_after_layoff_8w` | boolean/null | 8週以上の休み明け |
| `horse.surface_starts` | number | 同一芝/ダートの過去出走数 |
| `horse.surface_top3_rate` | number/null | 同一芝/ダートの3着内率 |
| `horse.distance_starts` | number | 同距離の過去出走数 |
| `horse.distance_top3_rate` | number/null | 同距離の3着内率 |

このセットなら、Phase1テーブルのみで作成でき、リーク対策の検証もしやすい。

## 10. 実装順序案

1. `docs/FEATURE_ENGINEERING_SPEC.md` を確定する
2. `feature_definitions` / `feature_snapshots` のmigrationを作る
3. 特徴量定義seedを作る
4. `as_of_at` を受け取るCLIを作る
5. 対象 `race_entries` を取得する
6. 過去レースだけを抽出する共通クエリを作る
7. P0特徴量を計算する
8. dry-runで計算結果を表示する
9. `feature_snapshots` にUPSERTする
10. テストで「対象レース結果を使わない」ことを検証する
11. 画面またはCSV出力で特徴量を確認できるようにする

## 11. Phase3予測ロジックへのつなぎ方

Phase3では、`feature_snapshots` を予測ロジックの入力とする。

### 学習データ作成

学習データは以下の結合で作る。

```text
race_entries
  + races
  + feature_snapshots as of target as_of_at
  + race_results as label
```

このとき `race_results` はラベルとしてのみ使う。特徴量計算には使わない。

### 予測時

予測時は以下を入力にする。

```text
target race_entries
  + feature_snapshots where as_of_at <= prediction_time
```

まだ結果が出ていないレースでも、出馬表と過去成績から生成済みの特徴量だけを使う。

### モデル非依存の設計

`feature_snapshots` はモデルに依存しない形式にする。

- ルールベース予測
- ロジスティック回帰
- LightGBM
- Pythonバッチ
- 将来のAI予測

どの方式でも同じ特徴量テーブルを入力にできるようにする。

## 12. 未解決事項

- `as_of_at` をどの時刻にするか
  - 前日夜
  - 当日朝
  - 発走直前
- 馬場状態の更新履歴を持つか
- オッズや人気を特徴量に含めるか
- 直近N走、直近1年などの集計窓
- 距離カテゴリの定義
- 脚質に必要な合法データ源
- 特徴量生成の実行場所
  - Next.js CLI
  - GitHub Actions
  - Cloud Run
  - ECS

これらはPhase2実装前、またはP0実装後に追加設計する。
