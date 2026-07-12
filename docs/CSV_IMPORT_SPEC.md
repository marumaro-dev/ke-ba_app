# CSV取込仕様書

> この文書はCSV取込の設計・実装仕様です。現在の全体フェーズと実装状態は [PROJECT_STATUS.md](./PROJECT_STATUS.md) を参照してください。

## 1. 目的

Phase 1の競馬データ管理アプリに、合法的に取得した競馬データをCSVから取り込むための仕様を定義する。

対象データ源は、JRA-VAN、JRDB、許諾済みCSV、その他契約・利用規約上問題のないデータ提供元に限定する。スクレイピングを前提にしない。AI予測、特徴量生成、ペース予想、位置取り予想は本仕様の対象外とする。

この仕様は次フェーズの実装に向けた設計であり、今回は取込処理・DBスキーマ変更・migration追加は行わない。

## 2. 基本方針

- CSVはUTF-8、カンマ区切り、1行目ヘッダーありとする。
- 日付は `YYYY-MM-DD` とする。
- 日時はISO 8601形式とし、タイムゾーンを必ず含める。
  - 例: `2026-06-27T15:40:00+09:00`
- 空文字は未設定として扱う。
- DBにはPhase 1既存テーブルのみを使用する。
- 外部IDはCSV上では必須とし、将来的なJRA-VAN/JRDB/API連携に備える。
- Phase 1 DBには外部ID保存カラムがないため、外部IDは取込処理内のID解決に使う。
- 内部IDはUUIDとし、CSVの `id` があればそれを使う。
- CSVの `id` が空の場合、取込実装では `provider_code + entity_type + source_*_id` から決定的UUIDを生成する方針とする。
- `available_at` / `observed_at` / `imported_at` を必ず区別する。
- 的中保証・利益保証につながる項目は扱わない。

## 3. 取込対象CSV一覧

| CSV | 対応DBテーブル | 概要 |
| --- | --- | --- |
| `races.csv` | `races` | レース基本情報 |
| `horses.csv` | `horses` | 競走馬マスタ |
| `jockeys.csv` | `jockeys` | 騎手マスタ |
| `trainers.csv` | `trainers` | 調教師マスタ |
| `race_entries.csv` | `race_entries` | 出走馬情報 |
| `race_results.csv` | `race_results` | レース結果 |

サンプルCSVは `samples/csv/` に配置する。

## 4. 共通カラム

すべてのCSVで、以下の考え方を共通とする。

| カラム | 必須 | 説明 |
| --- | --- | --- |
| `id` | 任意 | 内部UUID。空の場合は取込処理で決定的UUIDを生成する。 |
| `provider_code` | 必須 | データ提供元コード。例: `licensed_csv_demo`、`jra_van`、`jrdb` |
| `source_*_id` | 必須 | 提供元側の外部ID。エンティティ種別ごとに名前を変える。 |
| `available_at` | 必須 | その情報が利用可能になった時刻。データリーク対策の基準。 |
| `observed_at` | 必須 | システムまたは提供元ファイルで値を観測した時刻。 |
| `imported_at` | 任意 | DBへ取り込んだ時刻。空の場合は取込実行時刻を使う。 |

`source_*_id` はPhase 1 DBへ直接保存しない。ただし、次フェーズ以降で `ingestion.external_entity_ids` のような対応表を追加する場合の入力として維持する。

## 5. CSVカラム定義

### 5.1 races.csv

対応テーブル: `races`

| CSVカラム | 必須 | 型/形式 | DBカラム | 説明 |
| --- | --- | --- | --- | --- |
| `id` | 任意 | UUID | `id` | 内部レースID |
| `provider_code` | 必須 | string | - | 提供元コード |
| `source_race_id` | 必須 | string | - | 提供元レースID |
| `race_date` | 必須 | date | `race_date` | 開催日 |
| `venue` | 必須 | string | `venue` | 競馬場 |
| `race_number` | 必須 | integer | `race_number` | レース番号。1〜99 |
| `name` | 必須 | string | `name` | レース名 |
| `scheduled_start_at` | 必須 | datetime | `scheduled_start_at` | 発走予定時刻 |
| `surface` | 必須 | string | `surface` | `芝`、`ダート` など |
| `distance_meters` | 必須 | integer | `distance_meters` | 距離。1以上 |
| `weather` | 任意 | string | `weather` | 天候 |
| `track_condition` | 任意 | string | `track_condition` | 馬場状態 |
| `status` | 必須 | enum | `status` | `scheduled` / `confirmed` / `cancelled` |
| `available_at` | 必須 | datetime | `available_at` | 利用可能時刻 |
| `observed_at` | 必須 | datetime | `observed_at` | 観測時刻 |
| `imported_at` | 任意 | datetime | `imported_at` | 取込時刻 |

DB上の一意性は `race_date + venue + race_number` で担保する。

### 5.2 horses.csv

対応テーブル: `horses`

| CSVカラム | 必須 | 型/形式 | DBカラム | 説明 |
| --- | --- | --- | --- | --- |
| `id` | 任意 | UUID | `id` | 内部競走馬ID |
| `provider_code` | 必須 | string | - | 提供元コード |
| `source_horse_id` | 必須 | string | - | 提供元競走馬ID |
| `name` | 必須 | string | `name` | 競走馬名 |
| `birth_date` | 任意 | date | `birth_date` | 生年月日 |
| `sex` | 任意 | enum | `sex` | `male` / `female` / `gelding` |
| `color` | 任意 | string | `color` | 毛色 |
| `available_at` | 必須 | datetime | `available_at` | 利用可能時刻 |
| `observed_at` | 必須 | datetime | `observed_at` | 観測時刻 |
| `imported_at` | 任意 | datetime | `imported_at` | 取込時刻 |

馬名は変更・同名・表記揺れがあり得るため、馬名だけで同一判定しない。

### 5.3 jockeys.csv

対応テーブル: `jockeys`

| CSVカラム | 必須 | 型/形式 | DBカラム | 説明 |
| --- | --- | --- | --- | --- |
| `id` | 任意 | UUID | `id` | 内部騎手ID |
| `provider_code` | 必須 | string | - | 提供元コード |
| `source_jockey_id` | 必須 | string | - | 提供元騎手ID |
| `name` | 必須 | string | `name` | 騎手名 |
| `available_at` | 必須 | datetime | `available_at` | 利用可能時刻 |
| `observed_at` | 必須 | datetime | `observed_at` | 観測時刻 |
| `imported_at` | 任意 | datetime | `imported_at` | 取込時刻 |

人名は同姓同名・表記揺れがあり得るため、名前だけで同一判定しない。

### 5.4 trainers.csv

対応テーブル: `trainers`

| CSVカラム | 必須 | 型/形式 | DBカラム | 説明 |
| --- | --- | --- | --- | --- |
| `id` | 任意 | UUID | `id` | 内部調教師ID |
| `provider_code` | 必須 | string | - | 提供元コード |
| `source_trainer_id` | 必須 | string | - | 提供元調教師ID |
| `name` | 必須 | string | `name` | 調教師名 |
| `affiliation` | 任意 | string | `affiliation` | 所属。例: `美浦`、`栗東` |
| `available_at` | 必須 | datetime | `available_at` | 利用可能時刻 |
| `observed_at` | 必須 | datetime | `observed_at` | 観測時刻 |
| `imported_at` | 任意 | datetime | `imported_at` | 取込時刻 |

### 5.5 race_entries.csv

対応テーブル: `race_entries`

| CSVカラム | 必須 | 型/形式 | DBカラム | 説明 |
| --- | --- | --- | --- | --- |
| `id` | 任意 | UUID | `id` | 内部出走ID |
| `provider_code` | 必須 | string | - | 提供元コード |
| `source_entry_id` | 必須 | string | - | 提供元出走ID |
| `source_race_id` | 必須 | string | `race_id` | `races` 解決用 |
| `source_horse_id` | 必須 | string | `horse_id` | `horses` 解決用 |
| `source_jockey_id` | 必須 | string | `jockey_id` | `jockeys` 解決用 |
| `source_trainer_id` | 必須 | string | `trainer_id` | `trainers` 解決用 |
| `frame_number` | 必須 | integer | `frame_number` | 枠番。1〜8 |
| `horse_number` | 必須 | integer | `horse_number` | 馬番。1〜99 |
| `assigned_weight` | 必須 | decimal | `assigned_weight` | 斤量。0より大きい値 |
| `body_weight` | 任意 | integer | `body_weight` | 馬体重。空または1以上 |
| `body_weight_diff` | 任意 | integer | `body_weight_diff` | 増減 |
| `status` | 必須 | enum | `status` | `entered` / `running` / `scratched` / `excluded` |
| `available_at` | 必須 | datetime | `available_at` | 利用可能時刻 |
| `observed_at` | 必須 | datetime | `observed_at` | 観測時刻 |
| `imported_at` | 任意 | datetime | `imported_at` | 取込時刻 |

`source_race_id`、`source_horse_id`、`source_jockey_id`、`source_trainer_id` は、同一 `provider_code` 内で参照を解決する。

DB上の一意性は以下で担保する。

- `race_id + horse_id`
- `race_id + horse_number`

### 5.6 race_results.csv

対応テーブル: `race_results`

| CSVカラム | 必須 | 型/形式 | DBカラム | 説明 |
| --- | --- | --- | --- | --- |
| `id` | 任意 | UUID | `id` | 内部結果ID |
| `provider_code` | 必須 | string | - | 提供元コード |
| `source_result_id` | 必須 | string | - | 提供元結果ID |
| `source_entry_id` | 必須 | string | `race_entry_id` | `race_entries` 解決用 |
| `finish_position` | 任意 | integer | `finish_position` | 着順。空または1以上 |
| `finish_status` | 必須 | enum | `finish_status` | `finished` / `did_not_finish` / `disqualified` / `scratched` |
| `finish_time_milliseconds` | 任意 | integer | `finish_time_milliseconds` | 走破時計。ミリ秒 |
| `margin` | 任意 | string | `margin` | 着差 |
| `final_odds` | 任意 | decimal | `final_odds` | 最終単勝オッズ。0より大きい値 |
| `popularity` | 任意 | integer | `popularity` | 人気。空または1以上 |
| `status` | 必須 | enum | `status` | `preliminary` / `confirmed` / `corrected` |
| `available_at` | 必須 | datetime | `available_at` | 利用可能時刻 |
| `observed_at` | 必須 | datetime | `observed_at` | 観測時刻 |
| `imported_at` | 任意 | datetime | `imported_at` | 取込時刻 |

DB上の一意性は `race_entry_id` で担保する。

## 6. DBテーブルとの対応表

| DBテーブル | 主な入力CSV | 参照関係 |
| --- | --- | --- |
| `races` | `races.csv` | `race_entries.race_id` から参照される |
| `horses` | `horses.csv` | `race_entries.horse_id` から参照される |
| `jockeys` | `jockeys.csv` | `race_entries.jockey_id` から参照される |
| `trainers` | `trainers.csv` | `race_entries.trainer_id` から参照される |
| `race_entries` | `race_entries.csv` | `races`、`horses`、`jockeys`、`trainers` を参照する |
| `race_results` | `race_results.csv` | `race_entries` を参照する |

## 7. バリデーションルール

### 7.1 ファイル形式

- ヘッダー行が存在すること。
- 必須カラムがすべて存在すること。
- 未定義カラムは原則エラーではなく警告とする。
- 文字コードはUTF-8とする。
- 改行コードはLF/CRLFどちらも許容する。

### 7.2 型・値

- UUIDはUUID形式であること。
- 日付は `YYYY-MM-DD` であること。
- 日時はタイムゾーン付きISO 8601であること。
- enum値はDB enumと一致すること。
- `race_number` は1〜99。
- `distance_meters` は1以上。
- `frame_number` は1〜8。
- `horse_number` は1〜99。
- `assigned_weight` は0より大きい数値。
- `body_weight` は空または1以上。
- `finish_position` は空または1以上。
- `finish_time_milliseconds` は空または1以上。
- `final_odds` は空または0より大きい数値。
- `popularity` は空または1以上。

### 7.3 参照整合性

- `race_entries.csv` の `source_race_id` は `races.csv` または既存DBのレースに解決できること。
- `race_entries.csv` の `source_horse_id` は `horses.csv` または既存DBの競走馬に解決できること。
- `race_entries.csv` の `source_jockey_id` は `jockeys.csv` または既存DBの騎手に解決できること。
- `race_entries.csv` の `source_trainer_id` は `trainers.csv` または既存DBの調教師に解決できること。
- `race_results.csv` の `source_entry_id` は `race_entries.csv` または既存DBの出走情報に解決できること。

### 7.4 データリーク対策

- `available_at` が空の行は取り込まない。
- 将来的な学習・分析では、基準時刻より後の `available_at` を持つ情報を使ってはいけない。
- `observed_at` は `imported_at` より未来でも即エラーにはしないが、警告対象とする。
- 提供元が利用可能時刻を明示しない場合、推定値を無断で事実扱いしない。推定ルールを別途記録する。

## 8. 重複取込時のUPSERT方針

### 8.1 基本

- 同じCSVを複数回取り込んでも重複レコードを作らない。
- `id` がある場合は `id` を最優先キーにする。
- `id` が空の場合は `provider_code + entity_type + source_*_id` から決定的UUIDを生成して `id` として使う。
- DB制約に対応する自然キーがあるテーブルでは、自然キー衝突時も更新候補とする。

### 8.2 テーブル別方針

| テーブル | UPSERTキー | 更新対象 |
| --- | --- | --- |
| `races` | `id` または `race_date + venue + race_number` | レース名、発走時刻、条件、天候、馬場、status、時刻系 |
| `horses` | `id` | 馬名、生年月日、性別、毛色、時刻系 |
| `jockeys` | `id` | 名前、時刻系 |
| `trainers` | `id` | 名前、所属、時刻系 |
| `race_entries` | `id` または `race_id + horse_id` | 枠番、馬番、騎手、調教師、斤量、馬体重、status、時刻系 |
| `race_results` | `id` または `race_entry_id` | 着順、状態、タイム、着差、オッズ、人気、status、時刻系 |

### 8.3 更新時刻の扱い

- DBの `updated_at` は更新時に取込処理側で現在時刻へ更新する。
- `imported_at` はその行を今回取り込んだ時刻に更新する。
- `available_at` と `observed_at` はCSV値を保存する。
- 既存値より古い `observed_at` のデータで上書きする場合は、原則警告またはスキップとする。

## 9. 外部IDと内部IDの扱い

### Phase 1

Phase 1のDBスキーマには外部ID保存テーブルがない。そのため、取込実装では以下のどちらかで内部IDを決める。

1. CSVの `id` を使う。
2. CSVの `id` が空の場合、`provider_code + entity_type + source_*_id` から決定的UUIDを生成する。

決定的UUIDを生成することで、同じ外部IDから常に同じ内部IDを得られ、DBスキーマを変えずに冪等取込ができる。

### 将来

将来的には、以下のような外部ID対応表を追加することを検討する。

- `provider_code`
- `entity_type`
- `external_id`
- `internal_id`
- `valid_from`
- `valid_to`
- `created_at`

これにより、JRA-VAN、JRDB、許諾済みCSV、APIなど複数提供元のIDを同一内部エンティティへ対応付けやすくなる。

## 10. available_at / observed_at / imported_at

| カラム | 意味 | 例 |
| --- | --- | --- |
| `available_at` | 情報が利用可能になった時刻 | 出馬表が公開された時刻、結果が公開された時刻 |
| `observed_at` | システムまたはファイルが値を観測した時刻 | CSVファイル作成時刻、APIレスポンス取得時刻 |
| `imported_at` | 本DBへ取り込んだ時刻 | importジョブ実行時刻 |

重要ルール:

- `imported_at` を `available_at` の代わりに使わない。
- 結果データの `available_at` は、発走前データより後になるのが通常。
- 将来のAI・機械学習では、対象時点で利用可能だったデータだけを使う。

## 11. エラー発生時の扱い

### エラー分類

| 種別 | 例 | 扱い |
| --- | --- | --- |
| ファイルエラー | CSVが読めない、ヘッダーなし | ファイル全体を失敗 |
| スキーマエラー | 必須カラム不足 | ファイル全体を失敗 |
| 行エラー | 型不正、enum不正 | 該当行を失敗 |
| 参照エラー | `source_horse_id` が解決できない | 該当行を失敗 |
| DB制約エラー | 一意制約、CHECK制約違反 | 該当行またはバッチを失敗 |
| 契約・権利エラー | 利用許諾が確認できない | 取込を中止 |

### 処理方針

- 1ファイル内の一部行エラーは、可能なら正常行だけ取り込む。
- ただし、マスタ不足により大量の参照エラーが出る場合は、後続CSVの取込を停止する。
- エラーにはファイル名、行番号、外部ID、エラーコード、説明を含める。
- 契約上保存できない原文データや秘密情報はログに残さない。
- Phase 1のCSV取込実装では、取込履歴を `import_batches`、取込エラーを `import_errors` に保存する。
- dry-runでも業務6テーブルには書き込まないが、監査用に `import_batches` へ履歴を保存する。
- エラー時は `import_errors` にファイル名、行番号、エンティティ種別、外部ID、エラーコード、エラーメッセージ、該当行JSONを保存する。
- 契約上保存できない原文データや秘密情報を含むCSVを扱う場合は、`raw_row_json` の保存可否を提供元規約に従って見直す。

## 12. 取込順序

参照整合性のため、以下の順序で取り込む。

1. `horses.csv`
2. `jockeys.csv`
3. `trainers.csv`
4. `races.csv`
5. `race_entries.csv`
6. `race_results.csv`

`race_entries.csv` はマスタとレースを参照するため、先に取り込まない。`race_results.csv` は出走情報を参照するため最後に取り込む。

## 13. 将来的なJRA-VAN/JRDB/API連携への拡張方針

### Provider Adapter

将来的には、CSV・JRA-VAN・JRDB・APIを直接DBへ結合せず、Provider Adapterを経由して共通モデルへ変換する。

```text
JRA-VAN / JRDB / 許諾済みCSV / API
  -> Provider Adapter
  -> 共通バリデーション
  -> ID解決
  -> Phase 1 DB tables
```

### 拡張時の原則

- 提供元ごとの項目名・コード体系はAdapter内に閉じ込める。
- アプリ本体は共通モデルだけを扱う。
- 外部IDと内部IDの対応を明示的に管理する。
- 利用規約上保存できない生データは保存しない。
- API連携に置き換えても、`available_at` / `observed_at` / `imported_at` の意味を維持する。
- 予測・特徴量生成は、取込データの品質と時点管理が安定してから別フェーズで実装する。

## 14. サンプルCSV

以下のファイルを参照する。

- `samples/csv/races.sample.csv`
- `samples/csv/horses.sample.csv`
- `samples/csv/jockeys.sample.csv`
- `samples/csv/trainers.sample.csv`
- `samples/csv/race_entries.sample.csv`
- `samples/csv/race_results.sample.csv`

サンプルはすべて架空データであり、実在のレース・競走馬・騎手・調教師を示すものではない。
