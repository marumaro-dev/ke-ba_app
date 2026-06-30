import { z } from "zod";

import ruleBasedV1ConfigJson from "../../../config/scoring/rule-based-v1.json";
import ruleBasedV11ConfigJson from "../../../config/scoring/rule-based-v1.1.json";

const scoreRangeSchema = z
  .object({
    base: z.number(),
    min: z.number(),
    max: z.number(),
  })
  .refine((value) => value.min < value.max, {
    message: "scoreRange.min must be less than scoreRange.max",
  })
  .refine(
    (value) => value.base >= value.min && value.base <= value.max,
    {
      message: "scoreRange.base must be between min and max",
    },
  );

const booleanFeatureConfigSchema = z.object({
  type: z.literal("boolean"),
  positiveValue: z.boolean(),
  positiveAdjustment: z.number(),
  negativeAdjustment: z.number(),
});

const intervalDaysFeatureConfigSchema = z
  .object({
    type: z.literal("interval_days"),
    shortThresholdDays: z.number().int().positive(),
    goodMaxDays: z.number().int().positive(),
    layoffThresholdDays: z.number().int().positive(),
    shortAdjustment: z.number(),
    goodAdjustment: z.number(),
    standardAdjustment: z.number(),
    layoffAdjustment: z.number(),
  })
  .refine(
    (value) =>
      value.shortThresholdDays <= value.goodMaxDays &&
      value.goodMaxDays < value.layoffThresholdDays,
    {
      message:
        "interval thresholds must satisfy shortThresholdDays <= goodMaxDays < layoffThresholdDays",
    },
  );

const rateFeatureConfigSchema = z.object({
  type: z.literal("rate"),
  baseline: z.number().min(0).max(1),
  maxAdjustment: z.number().nonnegative(),
});

const bestTimeFeatureConfigSchema = z
  .object({
    type: z.literal("best_time"),
    featureKey: z.string().min(1),
    countFeatureKey: z.string().min(1),
    baseAdjustment: z.number().nonnegative(),
    minConfidence: z.number().min(0).max(1),
    fullConfidenceCount: z.number().positive(),
    defaultConfidence: z.number().min(0).max(1),
  })
  .refine((value) => value.minConfidence <= value.defaultConfidence, {
    message: "minConfidence must be less than or equal to defaultConfidence",
  });

const scoringFeatureConfigSchema = z.discriminatedUnion("type", [
  booleanFeatureConfigSchema,
  intervalDaysFeatureConfigSchema,
  rateFeatureConfigSchema,
  bestTimeFeatureConfigSchema,
]);

export const ruleBasedScoringConfigSchema = z.object({
  modelVersion: z.string().min(1),
  scoreRange: scoreRangeSchema,
  features: z.record(z.string().min(1), scoringFeatureConfigSchema),
});

export type RuleBasedScoringConfig = z.infer<
  typeof ruleBasedScoringConfigSchema
>;

export type BooleanFeatureConfig = z.infer<
  typeof booleanFeatureConfigSchema
>;
export type IntervalDaysFeatureConfig = z.infer<
  typeof intervalDaysFeatureConfigSchema
>;
export type RateFeatureConfig = z.infer<typeof rateFeatureConfigSchema>;
export type BestTimeFeatureConfig = z.infer<
  typeof bestTimeFeatureConfigSchema
>;

export const defaultRuleBasedScoringConfig =
  ruleBasedScoringConfigSchema.parse(ruleBasedV1ConfigJson);

const availableRuleBasedScoringConfigs = [
  defaultRuleBasedScoringConfig,
  ruleBasedScoringConfigSchema.parse(ruleBasedV11ConfigJson),
] as const;

export const availableRuleBasedModelVersions =
  availableRuleBasedScoringConfigs.map((config) => config.modelVersion);

export function getRuleBasedScoringConfig(modelVersion: string | undefined) {
  const version = modelVersion ?? defaultRuleBasedScoringConfig.modelVersion;
  const config = availableRuleBasedScoringConfigs.find(
    (candidate) => candidate.modelVersion === version,
  );

  if (!config) {
    throw new Error(
      `Unknown model version: ${version}. Available versions: ${availableRuleBasedModelVersions.join(", ")}`,
    );
  }

  return config;
}
