export type FeatureValueType = "number" | "boolean" | "string" | "json";

export type Phase2FeatureDefinition = {
  id: string;
  featureKey: string;
  name: string;
  description: string;
  entityType: "race_entry";
  valueType: FeatureValueType;
  version: number;
  priority: "P0" | "P1" | "P2";
  calculationLogic: string;
};

export const p0FeatureDefinitions = [
  {
    id: "81000000-0000-4000-8000-000000000001",
    featureKey: "horse.days_since_last_race",
    name: "前走からの日数",
    description:
      "対象レースより前の最新出走から対象レースまでの日数。対象レース自身の結果は使わない。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P0",
    calculationLogic:
      "same horse_id, past race scheduled_start_at < target scheduled_start_at, past result available_at <= as_of_at",
  },
  {
    id: "81000000-0000-4000-8000-000000000002",
    featureKey: "horse.has_past_race",
    name: "過去出走あり",
    description:
      "対象レースより前に利用可能な過去出走結果が1件以上あるか。",
    entityType: "race_entry",
    valueType: "boolean",
    version: 1,
    priority: "P0",
    calculationLogic:
      "true when at least one same-horse past result is available as of as_of_at",
  },
  {
    id: "81000000-0000-4000-8000-000000000003",
    featureKey: "horse.is_after_layoff_8w",
    name: "8週以上の休み明け",
    description:
      "前走から56日以上空いているか。過去出走がない場合はnull。",
    entityType: "race_entry",
    valueType: "boolean",
    version: 1,
    priority: "P0",
    calculationLogic: "days_since_last_race >= 56",
  },
  {
    id: "81000000-0000-4000-8000-000000000004",
    featureKey: "horse.surface_starts",
    name: "同馬場区分出走数",
    description:
      "対象レースと同じ芝/ダート区分での過去出走数。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P0",
    calculationLogic:
      "count past results where normalized surface matches target normalized surface",
  },
  {
    id: "81000000-0000-4000-8000-000000000005",
    featureKey: "horse.surface_top3_rate",
    name: "同馬場区分3着内率",
    description:
      "対象レースと同じ芝/ダート区分での過去3着内率。該当出走がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P0",
    calculationLogic:
      "count finish_position <= 3 over same-surface past results / same-surface starts",
  },
  {
    id: "81000000-0000-4000-8000-000000000006",
    featureKey: "horse.distance_starts",
    name: "同距離出走数",
    description: "対象レースと同じ距離での過去出走数。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P0",
    calculationLogic: "count past results where distance_meters matches target distance",
  },
  {
    id: "81000000-0000-4000-8000-000000000007",
    featureKey: "horse.distance_top3_rate",
    name: "同距離3着内率",
    description:
      "対象レースと同じ距離での過去3着内率。該当出走がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P0",
    calculationLogic:
      "count finish_position <= 3 over same-distance past results / same-distance starts",
  },
] as const satisfies readonly Phase2FeatureDefinition[];

export const p1FeatureDefinitions = [
  {
    id: "81000000-0000-4000-8000-000000000101",
    featureKey: "horse.best_time_same_surface_distance_ms",
    name: "同馬場区分・同距離の持ち時計",
    description:
      "対象レースと同じ芝/ダート区分かつ同じ距離の過去レースにおける最速走破時計（ミリ秒）。完走かつ時計ありの結果のみ使う。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P1",
    calculationLogic:
      "min(finish_time_milliseconds) where same normalized surface, same distance, finish_status = finished, finish_time_milliseconds is not null, past race scheduled_start_at < target scheduled_start_at, result available_at <= as_of_at",
  },
  {
    id: "81000000-0000-4000-8000-000000000102",
    featureKey: "horse.best_time_same_surface_distance_count",
    name: "同馬場区分・同距離の時計対象数",
    description:
      "同馬場区分・同距離の持ち時計計算に使った過去完走結果数。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P1",
    calculationLogic:
      "count timed finished past results where same normalized surface and same distance",
  },
  {
    id: "81000000-0000-4000-8000-000000000103",
    featureKey: "horse.track_condition_starts",
    name: "同馬場状態出走数",
    description:
      "対象レースと同じ馬場状態での過去出走数。対象レースの馬場状態が未設定の場合は0。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P1",
    calculationLogic:
      "count past results where track_condition matches target track_condition",
  },
  {
    id: "81000000-0000-4000-8000-000000000104",
    featureKey: "horse.track_condition_top3_rate",
    name: "同馬場状態3着内率",
    description:
      "対象レースと同じ馬場状態での過去3着内率。該当出走がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P1",
    calculationLogic:
      "count finish_position <= 3 over same-track-condition past results / same-track-condition starts",
  },
  {
    id: "81000000-0000-4000-8000-000000000105",
    featureKey: "horse.course_starts",
    name: "同コース出走数",
    description:
      "対象レースと同じ競馬場・芝/ダート区分・距離での過去出走数。Phase2では簡易コース定義を使う。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P1",
    calculationLogic:
      "count past results where venue, normalized surface, and distance_meters match target race",
  },
  {
    id: "81000000-0000-4000-8000-000000000106",
    featureKey: "horse.course_top3_rate",
    name: "同コース3着内率",
    description:
      "対象レースと同じ簡易コースでの過去3着内率。該当出走がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P1",
    calculationLogic:
      "count finish_position <= 3 over same-course past results / same-course starts",
  },
] as const satisfies readonly Phase2FeatureDefinition[];

export const p2FeatureDefinitions = [
  {
    id: "81000000-0000-4000-8000-000000000201",
    featureKey: "jockey.venue_starts",
    name: "騎手・同競馬場出走数",
    description:
      "対象騎手の、対象レースと同じ競馬場での過去騎乗数。対象レース自身の結果は使わない。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic:
      "count past race entries where same jockey_id, same venue, past race scheduled_start_at < target scheduled_start_at, race_entries.available_at <= as_of_at, race_results.available_at <= as_of_at",
  },
  {
    id: "81000000-0000-4000-8000-000000000202",
    featureKey: "jockey.venue_wins",
    name: "騎手・同競馬場勝利数",
    description: "対象騎手の、対象レースと同じ競馬場での過去1着数。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic:
      "count finish_position = 1 over same-jockey same-venue past results",
  },
  {
    id: "81000000-0000-4000-8000-000000000203",
    featureKey: "jockey.venue_top3",
    name: "騎手・同競馬場3着内数",
    description: "対象騎手の、対象レースと同じ競馬場での過去3着内数。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic:
      "count finish_position <= 3 over same-jockey same-venue past results",
  },
  {
    id: "81000000-0000-4000-8000-000000000204",
    featureKey: "jockey.venue_win_rate",
    name: "騎手・同競馬場勝率",
    description:
      "対象騎手の、対象レースと同じ競馬場での過去勝率。該当騎乗がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic: "same-jockey same-venue wins / starts",
  },
  {
    id: "81000000-0000-4000-8000-000000000205",
    featureKey: "jockey.venue_top3_rate",
    name: "騎手・同競馬場3着内率",
    description:
      "対象騎手の、対象レースと同じ競馬場での過去3着内率。該当騎乗がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic: "same-jockey same-venue top3 / starts",
  },
  {
    id: "81000000-0000-4000-8000-000000000206",
    featureKey: "jockey.distance_starts",
    name: "騎手・同距離出走数",
    description:
      "対象騎手の、対象レースと同じ距離での過去騎乗数。対象レース自身の結果は使わない。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic:
      "count past race entries where same jockey_id, same distance_meters, past race scheduled_start_at < target scheduled_start_at, race_entries.available_at <= as_of_at, race_results.available_at <= as_of_at",
  },
  {
    id: "81000000-0000-4000-8000-000000000207",
    featureKey: "jockey.distance_wins",
    name: "騎手・同距離勝利数",
    description: "対象騎手の、対象レースと同じ距離での過去1着数。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic:
      "count finish_position = 1 over same-jockey same-distance past results",
  },
  {
    id: "81000000-0000-4000-8000-000000000208",
    featureKey: "jockey.distance_top3",
    name: "騎手・同距離3着内数",
    description: "対象騎手の、対象レースと同じ距離での過去3着内数。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic:
      "count finish_position <= 3 over same-jockey same-distance past results",
  },
  {
    id: "81000000-0000-4000-8000-000000000209",
    featureKey: "jockey.distance_win_rate",
    name: "騎手・同距離勝率",
    description:
      "対象騎手の、対象レースと同じ距離での過去勝率。該当騎乗がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic: "same-jockey same-distance wins / starts",
  },
  {
    id: "81000000-0000-4000-8000-000000000210",
    featureKey: "jockey.distance_top3_rate",
    name: "騎手・同距離3着内率",
    description:
      "対象騎手の、対象レースと同じ距離での過去3着内率。該当騎乗がない場合はnull。",
    entityType: "race_entry",
    valueType: "number",
    version: 1,
    priority: "P2",
    calculationLogic: "same-jockey same-distance top3 / starts",
  },
] as const satisfies readonly Phase2FeatureDefinition[];

export const phase2FeatureDefinitions = [
  ...p0FeatureDefinitions,
  ...p1FeatureDefinitions,
  ...p2FeatureDefinitions,
] as const satisfies readonly Phase2FeatureDefinition[];
