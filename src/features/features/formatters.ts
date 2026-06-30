const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Tokyo",
});

export const featureGenerationStatusLabels = {
  running: "実行中",
  succeeded: "成功",
  failed: "失敗",
} as const;

export const featureGenerationModeLabels = {
  dry_run: "dry-run",
  import: "import",
} as const;

export const phase2FeatureLabels = {
  "horse.days_since_last_race": "前走間隔",
  "horse.has_past_race": "過去出走",
  "horse.is_after_layoff_8w": "8週休み明け",
  "horse.surface_starts": "同馬場区分出走数",
  "horse.surface_top3_rate": "同馬場区分3着内率",
  "horse.distance_starts": "同距離出走数",
  "horse.distance_top3_rate": "同距離3着内率",
  "horse.best_time_same_surface_distance_ms": "同馬場同距離ベスト",
  "horse.best_time_same_surface_distance_count": "時計対象数",
  "horse.track_condition_starts": "同馬場状態出走数",
  "horse.track_condition_top3_rate": "同馬場状態3着内率",
  "horse.course_starts": "同コース出走数",
  "horse.course_top3_rate": "同コース3着内率",
  "jockey.venue_starts": "騎手・同競馬場騎乗数",
  "jockey.venue_wins": "騎手・同競馬場勝利数",
  "jockey.venue_top3": "騎手・同競馬場3着内数",
  "jockey.venue_win_rate": "騎手・同競馬場勝率",
  "jockey.venue_top3_rate": "騎手・同競馬場3着内率",
  "jockey.distance_starts": "騎手・同距離騎乗数",
  "jockey.distance_wins": "騎手・同距離勝利数",
  "jockey.distance_top3": "騎手・同距離3着内数",
  "jockey.distance_win_rate": "騎手・同距離勝率",
  "jockey.distance_top3_rate": "騎手・同距離3着内率",
} as const;

export const p0FeatureLabels = phase2FeatureLabels;

export const phase2FeatureGroupLabels = {
  p0: "P0 基本特徴量",
  p1: "P1 馬の応用特徴量",
  p2: "P2 騎手特徴量",
} as const;

export function formatFeatureDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "—";
}

export function formatFeatureCount(value: number) {
  return value.toLocaleString("ja-JP");
}

export function formatFeatureCountLabel(totalCount: number, pageSize: number) {
  if (totalCount === 0) {
    return "0件";
  }

  return `${totalCount.toLocaleString("ja-JP")}件 / ${pageSize}件ずつ表示`;
}

export function formatFeatureValue(
  value: number | boolean | string | null | undefined,
) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "はい" : "いいえ";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("ja-JP")
      : value.toLocaleString("ja-JP", {
          maximumFractionDigits: 3,
        });
  }

  return value;
}

export function formatPhase2FeatureValue(
  featureKey: string,
  value: number | boolean | null,
) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (featureKey === "horse.days_since_last_race" && typeof value === "number") {
    return `${value.toLocaleString("ja-JP")}日`;
  }

  if (
    featureKey === "horse.best_time_same_surface_distance_ms" &&
    typeof value === "number"
  ) {
    return formatMillisecondsAsRaceTime(value);
  }

  if (
    (featureKey.endsWith("_top3_rate") || featureKey.endsWith("_win_rate")) &&
    typeof value === "number"
  ) {
    return value.toLocaleString("ja-JP", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
      style: "percent",
    });
  }

  return formatFeatureValue(value);
}

export const formatP0FeatureValue = formatPhase2FeatureValue;

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null";
}

function formatMillisecondsAsRaceTime(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = (milliseconds % 60_000) / 1_000;

  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }

  return seconds.toFixed(1);
}
