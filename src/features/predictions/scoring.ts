import {
  defaultRuleBasedScoringConfig,
  type BestTimeFeatureConfig,
  type BooleanFeatureConfig,
  type IntervalDaysFeatureConfig,
  type RateFeatureConfig,
  type RuleBasedScoringConfig,
} from "./scoring-config";

export type PredictionFeatureValue = number | boolean | null;

export type PredictionScoreComponent = {
  key: string;
  label: string;
  value: PredictionFeatureValue;
  adjustment: number;
  reason: string;
};

export type PredictionScoreResult = {
  score: number;
  components: PredictionScoreComponent[];
};

export function calculateRuleBasedPredictionScore(
  features: Map<string, PredictionFeatureValue>,
  config: RuleBasedScoringConfig = defaultRuleBasedScoringConfig,
): PredictionScoreResult {
  const components: PredictionScoreComponent[] = [];

  addBooleanComponent(
    components,
    features,
    "horse.has_past_race",
    "過去出走",
    getBooleanFeatureConfig(config, "horse.has_past_race"),
  );
  addBooleanComponent(
    components,
    features,
    "horse.is_after_layoff_8w",
    "8週休み明け",
    getBooleanFeatureConfig(config, "horse.is_after_layoff_8w"),
  );
  addIntervalComponent(
    components,
    features,
    getIntervalDaysFeatureConfig(config, "horse.days_since_last_race"),
  );
  addRateComponent(
    components,
    features,
    "horse.surface_top3_rate",
    "同馬場区分3着内率",
    getRateFeatureConfig(config, "horse.surface_top3_rate"),
  );
  addRateComponent(
    components,
    features,
    "horse.distance_top3_rate",
    "同距離3着内率",
    getRateFeatureConfig(config, "horse.distance_top3_rate"),
  );
  addRateComponent(
    components,
    features,
    "horse.track_condition_top3_rate",
    "同馬場状態3着内率",
    getRateFeatureConfig(config, "horse.track_condition_top3_rate"),
  );
  addRateComponent(
    components,
    features,
    "horse.course_top3_rate",
    "同コース3着内率",
    getRateFeatureConfig(config, "horse.course_top3_rate"),
  );
  addBestTimeComponent(
    components,
    features,
    getBestTimeFeatureConfig(
      config,
      "horse.best_time_same_surface_distance",
    ),
  );
  addRateComponent(
    components,
    features,
    "jockey.venue_win_rate",
    "騎手・同競馬場勝率",
    getRateFeatureConfig(config, "jockey.venue_win_rate"),
  );
  addRateComponent(
    components,
    features,
    "jockey.venue_top3_rate",
    "騎手・同競馬場3着内率",
    getRateFeatureConfig(config, "jockey.venue_top3_rate"),
  );
  addRateComponent(
    components,
    features,
    "jockey.distance_win_rate",
    "騎手・同距離勝率",
    getRateFeatureConfig(config, "jockey.distance_win_rate"),
  );
  addRateComponent(
    components,
    features,
    "jockey.distance_top3_rate",
    "騎手・同距離3着内率",
    getRateFeatureConfig(config, "jockey.distance_top3_rate"),
  );

  const totalAdjustment = components.reduce(
    (sum, component) => sum + component.adjustment,
    0,
  );
  const score = clamp(
    roundScore(config.scoreRange.base + totalAdjustment),
    config.scoreRange.min,
    config.scoreRange.max,
  );

  return {
    score,
    components,
  };
}

function addBooleanComponent(
  components: PredictionScoreComponent[],
  features: Map<string, PredictionFeatureValue>,
  key: string,
  label: string,
  config: BooleanFeatureConfig,
) {
  const value = features.get(key);

  if (typeof value !== "boolean") {
    return;
  }

  const adjustment =
    value === config.positiveValue
      ? config.positiveAdjustment
      : config.negativeAdjustment;

  components.push({
    key,
    label,
    value,
    adjustment,
    reason:
      adjustment >= 0
        ? `${label}がスコアを押し上げました`
        : `${label}がスコアを抑えました`,
  });
}

function addIntervalComponent(
  components: PredictionScoreComponent[],
  features: Map<string, PredictionFeatureValue>,
  config: IntervalDaysFeatureConfig,
) {
  const value = features.get("horse.days_since_last_race");

  if (typeof value !== "number") {
    return;
  }

  let adjustment = config.standardAdjustment;
  let reason = "前走間隔が標準的です";

  if (value < config.shortThresholdDays) {
    adjustment = config.shortAdjustment;
    reason = "前走間隔が短めです";
  } else if (value >= config.layoffThresholdDays) {
    adjustment = config.layoffAdjustment;
    reason = "前走から間隔が空いています";
  } else if (value <= config.goodMaxDays) {
    adjustment = config.goodAdjustment;
    reason = "前走間隔が扱いやすい範囲です";
  }

  components.push({
    key: "horse.days_since_last_race",
    label: "前走間隔",
    value,
    adjustment,
    reason,
  });
}

function addRateComponent(
  components: PredictionScoreComponent[],
  features: Map<string, PredictionFeatureValue>,
  key: string,
  label: string,
  config: RateFeatureConfig,
) {
  const value = features.get(key);

  if (typeof value !== "number") {
    return;
  }

  const centered = value - config.baseline;
  const adjustment = roundScore(centered * config.maxAdjustment);

  if (adjustment === 0) {
    return;
  }

  components.push({
    key,
    label,
    value,
    adjustment,
    reason:
      adjustment > 0
        ? `${label}が平均的な基準より高めです`
        : `${label}が平均的な基準より低めです`,
  });
}

function addBestTimeComponent(
  components: PredictionScoreComponent[],
  features: Map<string, PredictionFeatureValue>,
  config: BestTimeFeatureConfig,
) {
  const bestTime = features.get(config.featureKey);
  const count = features.get(config.countFeatureKey);

  if (typeof bestTime !== "number") {
    return;
  }

  const confidence =
    typeof count === "number"
      ? Math.min(
          1,
          Math.max(config.minConfidence, count / config.fullConfidenceCount),
        )
      : config.defaultConfidence;
  const adjustment = roundScore(config.baseAdjustment * confidence);

  components.push({
    key: config.featureKey,
    label: "同馬場同距離の持ち時計",
    value: bestTime,
    adjustment,
    reason: "同条件の持ち時計があるため、軽く加点しました",
  });
}

function getBooleanFeatureConfig(
  config: RuleBasedScoringConfig,
  key: string,
) {
  return getFeatureConfig(config, key, "boolean") as BooleanFeatureConfig;
}

function getIntervalDaysFeatureConfig(
  config: RuleBasedScoringConfig,
  key: string,
) {
  return getFeatureConfig(
    config,
    key,
    "interval_days",
  ) as IntervalDaysFeatureConfig;
}

function getRateFeatureConfig(config: RuleBasedScoringConfig, key: string) {
  return getFeatureConfig(config, key, "rate") as RateFeatureConfig;
}

function getBestTimeFeatureConfig(
  config: RuleBasedScoringConfig,
  key: string,
) {
  return getFeatureConfig(config, key, "best_time") as BestTimeFeatureConfig;
}

function getFeatureConfig(
  config: RuleBasedScoringConfig,
  key: string,
  type: RuleBasedScoringConfig["features"][string]["type"],
) {
  const featureConfig = config.features[key];

  if (!featureConfig || featureConfig.type !== type) {
    throw new Error(`Scoring config for ${key} must be type ${type}.`);
  }

  return featureConfig;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}
