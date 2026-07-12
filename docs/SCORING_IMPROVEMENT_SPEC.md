# SCORING_IMPROVEMENT_SPEC

> この文書はPhase3のスコア改善設計書です。現在はスコア設定ファイル化、`rule-based-v1.1`、分析画面でのmodel_version比較まで実装済みです。現在の全体状態は [PROJECT_STATUS.md](./PROJECT_STATUS.md) を参照してください。

## 1. 目的

Phase3で実装済みのルールベース予測スコアを、評価結果にもとづいて継続的に改善できるようにする。

このドキュメントでは、現行のスコア計算方式、評価指標、改善対象の重み、設定ファイル化、バージョン管理、分析画面案、次に実装すべきステップを整理する。

重要な方針:

- 今回は設計のみで、DBスキーマ変更や実装は行わない
- 予測スコアは勝率・複勝率ではなく、0〜100程度の相対評価として扱う
- 的中保証・利益保証につながる表現は使わない
- 評価は過去結果に対する検証であり、将来の的中を保証しない
- 将来的にAI/機械学習へ移行しやすいよう、スコア計算と評価を分離する

## 2. 現在の予測スコア計算方式

現行のPhase3では、`feature_snapshots` に保存されたP0/P1/P2特徴量を使い、TypeScriptのルールベース関数で `race_predictions.prediction_score` を算出している。

基本式:

```text
base_score = 50
prediction_score = clamp(base_score + total_adjustment, 0, 100)
```

`total_adjustment` は、使用可能な特徴量ごとの加点・減点を合計した値である。特徴量が存在しない場合、その特徴量は原則としてスコアに影響させない。

保存先:

| テーブル | 役割 |
| --- | --- |
| `prediction_runs` | 予測実行履歴 |
| `race_predictions` | 出走馬ごとの予測スコア、順位、根拠JSON |
| `race_predictions.score_components_json` | 加点・減点の内訳 |
| `race_predictions.feature_snapshot_keys_json` | 使用した特徴量キーとスナップショット情報 |

現行のデータリーク防止:

- `feature_snapshots.as_of_at <= prediction_as_of_at` の特徴量だけを使う
- 予測スコア生成時に `race_results` は使わない
- 対象レース自身の結果は使わない
- オッズは初期スコアでは使わない

## 3. 現在の特徴量別スコア要素

現行実装では、以下の特徴量がスコア調整に使われている。

| priority | feature_key | 現行ロジック | 現行の重み・係数 |
| --- | --- | --- | --- |
| P0 | `horse.has_past_race` | 過去出走ありなら加点、なしなら減点 | true: `+1.5`, false: `-2` |
| P0 | `horse.is_after_layoff_8w` | 8週休み明けでなければ加点、休み明けなら減点 | false: `+1`, true: `-2` |
| P0 | `horse.days_since_last_race` | 前走間隔を日数帯で評価 | `<10`: `-2`, `10〜35`: `+2`, `36〜55`: `+1`, `>=56`: `-2` |
| P0 | `horse.surface_top3_rate` | 0.33を基準に3着内率を評価 | `(value - 0.33) * 8` |
| P0 | `horse.distance_top3_rate` | 0.33を基準に3着内率を評価 | `(value - 0.33) * 8` |
| P1 | `horse.best_time_same_surface_distance_ms` | 同馬場同距離の持ち時計があれば軽く加点 | `2 * confidence` |
| P1 | `horse.best_time_same_surface_distance_count` | 持ち時計加点の信頼度に使用 | `confidence = clamp(count / 4, 0.25, 1)` |
| P1 | `horse.track_condition_top3_rate` | 0.33を基準に3着内率を評価 | `(value - 0.33) * 5` |
| P1 | `horse.course_top3_rate` | 0.33を基準に3着内率を評価 | `(value - 0.33) * 6` |
| P2 | `jockey.venue_win_rate` | 0.33を基準に勝率を評価 | `(value - 0.33) * 4` |
| P2 | `jockey.venue_top3_rate` | 0.33を基準に3着内率を評価 | `(value - 0.33) * 5` |
| P2 | `jockey.distance_win_rate` | 0.33を基準に勝率を評価 | `(value - 0.33) * 4` |
| P2 | `jockey.distance_top3_rate` | 0.33を基準に3着内率を評価 | `(value - 0.33) * 5` |

### 3.1 現行方式のよい点

- 実装が単純で、根拠を説明しやすい
- `score_components_json` により、加点・減点の内訳を画面表示できる
- 特徴量が増えても、個別の調整値として追加しやすい
- AI/機械学習へ移る前のベースラインとして使える

### 3.2 現行方式の課題

- 重みがコードに埋め込まれており、比較実験しづらい
- 0.33という基準値が全特徴量で共通になっている
- 出走頭数やクラス、競馬場、距離帯による補正がない
- 持ち時計は「速さの相対順位」ではなく、存在有無に近い加点になっている
- 勝率系特徴量に対しても0.33基準を使っており、実データに対して強すぎる可能性がある
- 評価結果から「どの特徴量が効いたか」を集計する仕組みがまだない

## 4. 現在の評価指標

Phase3の評価機能では、`race_predictions` と `race_results` を突合し、`prediction_evaluations` に評価結果を保存している。

現在確認できる評価項目:

| 評価項目 | 意味 |
| --- | --- |
| 予測1位馬の実着順 | スコア最上位の馬が実際に何着だったか |
| 予測1位馬が3着以内だったか | 上位評価馬が馬券圏内に入ったかの参考 |
| 予測上位3頭に実際の1着馬が含まれていたか | 実勝ち馬を上位候補に含められたか |
| 予測順位と実着順の差 | 各馬について、予測順位と実着順がどれだけ離れたか |
| 評価済み件数 | 予測結果のうち、結果と突合できた件数 |

これらは、将来の改善で以下の集計指標に発展させる。

## 5. 予測精度確認用の集計指標

まずはオッズや回収率を使わず、順位・着順の整合性を見る。

| 指標 | 内容 | 用途 |
| --- | --- | --- |
| Top1 Top3率 | 予測1位馬が3着以内に入った割合 | 最上位評価の妥当性確認 |
| Winner in Top3率 | 実際の1着馬が予測上位3頭に含まれた割合 | 上位候補抽出力の確認 |
| 平均順位差 | `abs(predicted_rank - finish_position)` の平均 | 全体の順位整合性確認 |
| 中央順位差 | 順位差の中央値 | 外れ値の影響を抑えた確認 |
| 予測順位別の平均着順 | 予測1位、2位、3位...ごとの平均実着順 | スコア順位が意味を持つか確認 |
| スコア帯別の3着内率 | 例: 70以上、60〜69、50〜59ごとの実績 | スコアの単調性確認 |
| 特徴量別の平均寄与 | `score_components_json` のfeature_key別平均adjustment | どの特徴量がスコアを動かしているか確認 |
| 特徴量別の正負寄与件数 | feature_keyごとの加点回数・減点回数 | 偏りや過剰反応の確認 |
| 上位的中時の寄与ランキング | Top1 Top3成功時に寄与が大きかった特徴量 | 効いていそうな要素の確認 |
| 上位失敗時の寄与ランキング | Top1 Top3失敗時に寄与が大きかった特徴量 | 過大評価している要素の確認 |

注意:

- これらの指標は予測品質改善のための検証指標であり、的中保証や利益保証ではない
- データ件数が少ない段階では、指標のブレが大きい
- 競馬場、距離、馬場、クラスなどで分けて見る前に、まず全体傾向を確認する

## 6. 改善対象にする重み一覧

最初に改善対象にする重みは、現行のコード内定数を設定値として外出しできるものに限定する。

### 6.1 ベーススコア

| key | 現行値 | 改善観点 |
| --- | ---: | --- |
| `base_score` | `50` | 中央値として妥当か。全体のスコア分布が上または下に寄りすぎていないか |
| `min_score` | `0` | 当面変更不要 |
| `max_score` | `100` | 当面変更不要 |

### 6.2 P0: 馬の基本特徴量

| key | 現行値 | 改善観点 |
| --- | ---: | --- |
| `horse.has_past_race.true_adjustment` | `+1.5` | 初出走・未経験馬への扱いが強すぎないか |
| `horse.has_past_race.false_adjustment` | `-2` | 新馬・未勝利戦などで過度に不利にならないか |
| `horse.is_after_layoff_8w.false_adjustment` | `+1` | 休み明けでないことを加点しすぎていないか |
| `horse.is_after_layoff_8w.true_adjustment` | `-2` | 休み明けの減点が一律でよいか |
| `horse.days_since_last_race.short_threshold_days` | `10` | 短すぎる間隔の閾値 |
| `horse.days_since_last_race.layoff_threshold_days` | `56` | 休み明け閾値 |
| `horse.days_since_last_race.short_adjustment` | `-2` | 連闘・中1週相当の減点 |
| `horse.days_since_last_race.good_adjustment` | `+2` | 10〜35日の加点 |
| `horse.days_since_last_race.standard_adjustment` | `+1` | 36〜55日の加点 |
| `horse.days_since_last_race.layoff_adjustment` | `-2` | 56日以上の減点 |
| `horse.surface_top3_rate.baseline` | `0.33` | 実データ上の平均3着内率と合っているか |
| `horse.surface_top3_rate.max_adjustment` | `8` | 芝/ダート適性を強く見すぎていないか |
| `horse.distance_top3_rate.baseline` | `0.33` | 実データ上の平均3着内率と合っているか |
| `horse.distance_top3_rate.max_adjustment` | `8` | 距離適性を強く見すぎていないか |

### 6.3 P1: 馬の応用特徴量

| key | 現行値 | 改善観点 |
| --- | ---: | --- |
| `horse.best_time_same_surface_distance.base_adjustment` | `2` | 持ち時計の存在だけで加点する設計を見直す |
| `horse.best_time_same_surface_distance.min_confidence` | `0.25` | サンプル数が少ない場合の下限 |
| `horse.best_time_same_surface_distance.full_confidence_count` | `4` | 何走で信頼度1.0とみなすか |
| `horse.track_condition_top3_rate.baseline` | `0.33` | 馬場状態別の平均と合っているか |
| `horse.track_condition_top3_rate.max_adjustment` | `5` | 馬場状態適性の影響度 |
| `horse.course_top3_rate.baseline` | `0.33` | コース別の平均と合っているか |
| `horse.course_top3_rate.max_adjustment` | `6` | コース適性の影響度 |

### 6.4 P2: 騎手特徴量

| key | 現行値 | 改善観点 |
| --- | ---: | --- |
| `jockey.venue_win_rate.baseline` | `0.33` | 勝率の基準としては高すぎる可能性がある |
| `jockey.venue_win_rate.max_adjustment` | `4` | 勝率系特徴量の効きすぎ確認 |
| `jockey.venue_top3_rate.baseline` | `0.33` | 3着内率の基準として妥当か |
| `jockey.venue_top3_rate.max_adjustment` | `5` | 競馬場相性の影響度 |
| `jockey.distance_win_rate.baseline` | `0.33` | 勝率の基準としては高すぎる可能性がある |
| `jockey.distance_win_rate.max_adjustment` | `4` | 距離別勝率の影響度 |
| `jockey.distance_top3_rate.baseline` | `0.33` | 3着内率の基準として妥当か |
| `jockey.distance_top3_rate.max_adjustment` | `5` | 距離別3着内率の影響度 |

## 7. 優先的に見直すべき重み

最初の改善では、以下の順で見直す。

### 優先度A

| 対象 | 理由 |
| --- | --- |
| 騎手勝率系のbaseline | 勝率に0.33基準を使うと、ほぼ常に減点になりやすい |
| `horse.surface_top3_rate.max_adjustment` | 現行ではP0の中でも影響が大きい |
| `horse.distance_top3_rate.max_adjustment` | 現行ではP0の中でも影響が大きい |
| `horse.best_time_same_surface_distance` | 現行は速さそのものではなく、持ち時計の存在に近い加点 |

### 優先度B

| 対象 | 理由 |
| --- | --- |
| `horse.days_since_last_race` の閾値 | 距離・クラス・馬齢で適正間隔が変わる可能性がある |
| `horse.course_top3_rate.max_adjustment` | コース適性が過剰評価されていないか確認したい |
| `horse.track_condition_top3_rate.max_adjustment` | サンプル数不足によるブレが大きい可能性がある |

### 優先度C

| 対象 | 理由 |
| --- | --- |
| `base_score` | スコア分布の見た目調整が主目的で、順位改善への影響は小さい |
| `min_score` / `max_score` | 当面は0〜100固定でよい |

## 8. スコア重みを設定ファイル化する案

現行のコード内定数を、設定ファイルとして管理できるようにする。

推奨ファイル:

```text
config/scoring/rule-based-v1.json
```

設定例:

```json
{
  "modelVersion": "rule-based-v1",
  "scoreRange": {
    "base": 50,
    "min": 0,
    "max": 100
  },
  "features": {
    "horse.has_past_race": {
      "type": "boolean",
      "positiveValue": true,
      "positiveAdjustment": 1.5,
      "negativeAdjustment": -2
    },
    "horse.days_since_last_race": {
      "type": "interval_days",
      "shortThresholdDays": 10,
      "layoffThresholdDays": 56,
      "shortAdjustment": -2,
      "goodMaxDays": 35,
      "goodAdjustment": 2,
      "standardAdjustment": 1,
      "layoffAdjustment": -2
    },
    "horse.surface_top3_rate": {
      "type": "rate",
      "baseline": 0.33,
      "maxAdjustment": 8
    },
    "jockey.venue_win_rate": {
      "type": "rate",
      "baseline": 0.10,
      "maxAdjustment": 4
    }
  }
}
```

### 8.1 設定ファイル化のメリット

- 重みを変更してもスコア計算ロジック本体を触らずに済む
- `model_version` と設定ファイルを対応づけられる
- 複数バージョンの予測を比較しやすい
- 将来の機械学習モデルでも、モデルメタデータ管理に発展させやすい

### 8.2 設定ファイル化時の注意

- 設定ファイルはZodでバリデーションする
- `modelVersion` は `prediction_runs.model_version` / `race_predictions.model_version` と一致させる
- 設定値の変更は既存runの意味を変えないよう、新しい `modelVersion` として扱う
- dry-runで、どの設定ファイルを使ったか表示する

## 9. スコア重みのバージョン管理案

### 9.1 まずはファイル + model_versionで管理する

Phase3の次ステップでは、DBテーブルを増やさず、ファイルで管理するのが安全である。

```text
config/scoring/
  rule-based-v1.json
  rule-based-v1.1.json
  rule-based-v2.json
```

`prediction_runs.model_version` には、設定ファイルの `modelVersion` を保存する。

例:

| model_version | 内容 |
| --- | --- |
| `rule-based-v1` | 現行ロジックと同等 |
| `rule-based-v1.1` | v1を壊さず、特徴量ごとの寄与を少し穏やかにした比較用設定 |
| `rule-based-v1.2` | P0/P1/P2のmaxAdjustmentを調整 |
| `rule-based-v2` | 持ち時計をレース内順位ベースへ変更 |

### 9.2 将来的なDB管理案

将来的に管理画面から重みを変更する場合は、以下のテーブルを検討する。

```text
scoring_configs
- id
- scoring_type
- model_version
- config_json
- description
- is_active
- created_at

scoring_config_evaluations
- id
- scoring_config_id
- prediction_run_id
- evaluation_summary_json
- created_at
```

ただし、Phase3直後はDBスキーマを増やさず、設定ファイル管理から始める。

## 10. 画面で見たい分析項目

既存の `/predictions` と `/predictions/:id` を拡張する形で、以下を表示できるとよい。

### 10.1 `/predictions`

| 表示項目 | 内容 |
| --- | --- |
| model_version | どの重み設定で生成したか |
| 評価済み件数 | prediction_evaluations件数 |
| Top1 Top3率 | 予測1位馬が3着以内だった割合 |
| Winner in Top3率 | 実勝ち馬が予測上位3頭に入った割合 |
| 平均順位差 | 全評価済み馬の平均順位差 |
| スコア帯別の件数 | 70以上、60台、50台など |

### 10.2 `/predictions/:id`

| 表示項目 | 内容 |
| --- | --- |
| レース別評価サマリー | レース単位でTop1結果、Winner in Top3を確認 |
| 特徴量キー別の平均寄与 | feature_keyごとの平均adjustment |
| 成功レースの寄与傾向 | Top1 Top3成功レースで加点が大きかった要素 |
| 失敗レースの寄与傾向 | Top1 Top3失敗レースで加点が大きかった要素 |
| スコア順位と実着順の比較 | 既存表示を維持しつつ、順位差の色分けを強化 |
| 設定ファイル情報 | model_version、設定概要、主要重み |

### 10.3 分析画面 `/predictions/analytics`

将来的には、予測runを横断して比較する分析画面を追加する。

| 表示項目 | 内容 |
| --- | --- |
| model_version別比較 | v1 / v1.1 / v2の評価指標比較 |
| 競馬場別比較 | 競馬場ごとの評価傾向 |
| 距離帯別比較 | 短距離・中距離・長距離での評価傾向 |
| 芝/ダート別比較 | surfaceごとの評価傾向 |
| 特徴量寄与ランキング | 加点・減点が多いfeature_key |
| 過大評価ランキング | 高スコアだが着順が悪かったケース |
| 過小評価ランキング | 低スコアだが好走したケース |

## 11. 改善実験の進め方

### 11.1 実験単位

1回の改善では、変更する重みを少数に絞る。

悪い例:

- P0/P1/P2すべての重みを同時に大きく変える
- baseline、maxAdjustment、持ち時計ロジックを一度に変える

よい例:

- `jockey.*_win_rate.baseline` だけを見直す
- P0の `surface_top3_rate` と `distance_top3_rate` の `maxAdjustment` だけを比較する
- 持ち時計だけ `v2` としてロジック変更する

### 11.2 比較方法

同じ `prediction_as_of_at`、同じ対象レース、同じ特徴量スナップショットを使って、異なる `model_version` のrunを作る。

```text
rule-based-v1
rule-based-v1.1
rule-based-v1.2
```

比較する指標:

- Top1 Top3率
- Winner in Top3率
- 平均順位差
- スコア帯別の実績
- 特徴量キー別の寄与差

### 11.3 採用判断

採用判断は1つの指標だけで行わない。

例:

- Top1 Top3率が少し上がっても、平均順位差が悪化していないか確認する
- Winner in Top3率が上がっても、全体のスコアが極端に偏っていないか確認する
- データ件数が少ない場合は、変更を急がずサンプル追加を優先する

## 12. 将来的なAI/機械学習への接続

ルールベース改善で得られる以下の情報は、機械学習移行時にも使える。

| 現在の要素 | ML移行時の対応 |
| --- | --- |
| `feature_snapshots` | 学習データの特徴量 |
| `race_results` | 学習ラベル |
| `prediction_runs` | 推論実行履歴 |
| `race_predictions` | 推論結果 |
| `prediction_evaluations` | 評価結果 |
| `score_components_json` | 将来的なSHAP、feature importance、説明情報 |
| `model_version` | ルールベース/MLモデル共通のバージョン識別子 |

ML移行前に整えておくとよいこと:

- 特徴量行列を安定してエクスポートできるようにする
- `as_of_at` を固定して再現可能な学習データを作る
- 学習期間、検証期間、テスト期間を時系列で分割する
- 予測時点で利用できない情報を学習特徴量に混ぜない
- ルールベースのrunとMLのrunを同じ評価指標で比較できるようにする

## 13. 禁止表現・注意書き

### 13.1 禁止表現

以下の表現は使わない。

- 的中保証
- 利益保証
- 必ず当たる
- 絶対に儲かる
- 買うべき
- 回収率保証
- 勝率◯%と断定する表現
- 複勝率◯%と断定する表現

### 13.2 推奨する注意書き

画面やREADMEでは、以下のような表現を使う。

```text
この予測スコアは、取得済みデータと特徴量に基づく参考情報です。
的中や利益を保証するものではありません。
評価結果は過去データに対する検証であり、将来の結果を保証するものではありません。
```

## 14. 次に実装すべき改善ステップ

### Step 1: 現行重みを設定ファイル化する

目的:

- 現行の `rule-based-v1` と同じ結果を、設定ファイルから再現できるようにする

実装状況:

- 完了
- `config/scoring/rule-based-v1.json` に現行重みを移動
- Zodで設定ファイルをバリデーション
- `prediction_runs.model_version` / `race_predictions.model_version` には設定ファイルの `modelVersion` を保存

実装候補:

- `config/scoring/rule-based-v1.json` を追加
- Zodで設定ファイルを検証
- `calculateRuleBasedPredictionScore(features, config)` のように設定を注入
- `prediction_runs.model_version` に設定ファイルの `modelVersion` を保存
- 既存テストで、設定ファイル化前後のスコアが変わらないことを確認

### Step 2: 評価集計ユーティリティを追加する

目的:

- `prediction_evaluations` と `race_predictions.score_components_json` から、run単位の評価サマリーを作る

実装候補:

- Top1 Top3率
- Winner in Top3率
- 平均順位差
- feature_key別の平均adjustment
- feature_key別の正負寄与件数

保存方針:

- 最初はDB追加せず、画面表示時に集計する
- 重くなったら将来的に集計テーブルを検討する

### Step 3: `/predictions/:id` に分析セクションを追加する

目的:

- 1つのprediction_runについて、どの特徴量がスコアに効いていたか確認する

表示候補:

- 評価指標サマリー
- feature_key別寄与ランキング
- Top1 Top3成功/失敗別の寄与比較
- スコア帯別の結果件数

### Step 4: `rule-based-v1.1` を追加して比較する

目的:

- 設定ファイル化した重みに対して、小さな改善実験を行う

実装状況:

- 完了
- `config/scoring/rule-based-v1.1.json` を追加
- 予測生成CLIで `--model-version=rule-based-v1.1` を指定可能
- `/predictions/analytics` で `model_version` 別に比較可能

最初の改善候補:

- `jockey.venue_win_rate.baseline`
- `jockey.distance_win_rate.baseline`
- `horse.surface_top3_rate.maxAdjustment`
- `horse.distance_top3_rate.maxAdjustment`

注意:

- いきなり重みを大きく変更しない
- 同じ `prediction_as_of_at` で複数バージョンを生成し、評価結果を比較する

### Step 5: 持ち時計ロジックを改善する

目的:

- `horse.best_time_same_surface_distance_ms` を、存在有無の加点ではなく、レース内相対評価に近づける

案:

- 対象レース内の出走馬で同条件持ち時計を比較
- 最速グループに加点、遅いグループは加点しない
- サンプル数が少ない場合は寄与を弱める

この変更はロジック変更を含むため、`rule-based-v2` として扱う。

## 15. この設計で今回やらないこと

- DBスキーマ変更
- AI/機械学習モデルの実装
- 勝率・複勝率の算出
- 買い目提案
- オッズを使った期待値計算
- 的中率や回収率を過度に強調する画面表示
- 既存CLIや画面の変更
