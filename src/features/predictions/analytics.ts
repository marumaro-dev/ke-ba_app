type EvaluationStatus = "all" | "evaluated" | "unevaluated";

export type PredictionAnalyticsFilters = {
  modelVersion: string;
  asOfDate: string;
  evaluationStatus: EvaluationStatus;
};

export type PredictionAnalyticsRow = {
  predictionRunId: string;
  modelVersion: string;
  raceId: string;
  racePredictionId: string;
  rankInRace: number | null;
  rankDiff: number | null;
  isPredictedTop1: boolean | null;
  topPredictionIsTop3: boolean | null;
  actualWinnerInPredictedTop3: boolean | null;
  scoreComponentsJson: unknown;
};

export type PredictionAnalyticsSummary = {
  totalPredictions: number;
  evaluatedPredictions: number;
  evaluatedRaceCount: number;
  top1EvaluatedRaceCount: number;
  top1Top3Rate: number | null;
  winnerInPredictedTop3Rate: number | null;
  averageRankDiff: number | null;
  modelVersionSummaries: ModelVersionAnalyticsSummary[];
  modelVersionComparison: ModelVersionComparison | null;
  featureContributionSummaries: FeatureContributionSummary[];
  featureContributionComparisons: FeatureContributionComparison[];
  hasSmallSampleWarning: boolean;
};

export type ModelVersionAnalyticsSummary = {
  modelVersion: string;
  predictionCount: number;
  evaluatedPredictionCount: number;
  evaluatedRaceCount: number;
  top1Top3Rate: number | null;
  winnerInPredictedTop3Rate: number | null;
  averageRankDiff: number | null;
  isSmallSample: boolean;
};

export type ModelVersionComparison = {
  baseModelVersion: string;
  candidateModelVersion: string;
  evaluatedRaceCountDiff: number;
  evaluatedPredictionCountDiff: number;
  top1Top3RateDiff: number | null;
  winnerInPredictedTop3RateDiff: number | null;
  averageRankDiffDiff: number | null;
  isSmallSample: boolean;
};

export type FeatureContributionSummary = {
  featureKey: string;
  label: string;
  count: number;
  positiveCount: number;
  negativeCount: number;
  averageAdjustment: number;
};

export type FeatureContributionComparison = {
  featureKey: string;
  label: string;
  byModelVersion: FeatureContributionByModelVersion[];
  averageAdjustmentDiff: number | null;
};

export type FeatureContributionByModelVersion = {
  modelVersion: string;
  count: number;
  positiveCount: number;
  negativeCount: number;
  averageAdjustment: number;
};

export function calculatePredictionAnalytics(
  rows: PredictionAnalyticsRow[],
): PredictionAnalyticsSummary {
  const modelVersionSummaries = Array.from(groupBy(rows, row => row.modelVersion))
    .map(([modelVersion, modelRows]) =>
      calculateModelVersionSummary(modelVersion, modelRows),
    )
    .sort((a, b) => a.modelVersion.localeCompare(b.modelVersion));

  const overall = calculateModelVersionSummary("all", rows);

  return {
    totalPredictions: rows.length,
    evaluatedPredictions: rows.filter(row => row.rankDiff !== null).length,
    evaluatedRaceCount: overall.evaluatedRaceCount,
    top1EvaluatedRaceCount: countTop1EvaluationRows(rows),
    top1Top3Rate: overall.top1Top3Rate,
    winnerInPredictedTop3Rate: overall.winnerInPredictedTop3Rate,
    averageRankDiff: overall.averageRankDiff,
    modelVersionSummaries,
    modelVersionComparison: calculateModelVersionComparison(
      modelVersionSummaries,
    ),
    featureContributionSummaries: calculateFeatureContributionSummaries(rows),
    featureContributionComparisons:
      calculateFeatureContributionComparisons(rows),
    hasSmallSampleWarning: overall.evaluatedRaceCount > 0 && overall.evaluatedRaceCount < 30,
  };
}

function calculateModelVersionSummary(
  modelVersion: string,
  rows: PredictionAnalyticsRow[],
): ModelVersionAnalyticsSummary {
  const top1Rows = rows.filter(
    row => row.isPredictedTop1 === true && row.topPredictionIsTop3 !== null,
  );
  const winnerInTop3Rows = rows.filter(
    row => row.isPredictedTop1 === true && row.actualWinnerInPredictedTop3 !== null,
  );
  const rankDiffRows = rows.filter(
    (row): row is PredictionAnalyticsRow & { rankDiff: number } =>
      row.rankDiff !== null,
  );

  return {
    modelVersion,
    predictionCount: rows.length,
    evaluatedPredictionCount: rankDiffRows.length,
    evaluatedRaceCount: countEvaluatedRaces(rows),
    top1Top3Rate: calculateRate(
      top1Rows.filter(row => row.topPredictionIsTop3 === true).length,
      top1Rows.length,
    ),
    winnerInPredictedTop3Rate: calculateRate(
      winnerInTop3Rows.filter(row => row.actualWinnerInPredictedTop3 === true).length,
      winnerInTop3Rows.length,
    ),
    averageRankDiff:
      rankDiffRows.length === 0
        ? null
        : roundMetric(
            rankDiffRows.reduce((sum, row) => sum + row.rankDiff, 0) /
              rankDiffRows.length,
          ),
    isSmallSample:
      countEvaluatedRaces(rows) > 0 && countEvaluatedRaces(rows) < 30,
  };
}

function calculateModelVersionComparison(
  summaries: ModelVersionAnalyticsSummary[],
): ModelVersionComparison | null {
  if (summaries.length < 2) {
    return null;
  }

  const base =
    summaries.find((summary) => summary.modelVersion === "rule-based-v1") ??
    summaries[0];
  const candidate =
    summaries.find((summary) => summary.modelVersion === "rule-based-v1.1") ??
    summaries.find((summary) => summary.modelVersion !== base.modelVersion);

  if (!candidate) {
    return null;
  }

  return {
    baseModelVersion: base.modelVersion,
    candidateModelVersion: candidate.modelVersion,
    evaluatedRaceCountDiff:
      candidate.evaluatedRaceCount - base.evaluatedRaceCount,
    evaluatedPredictionCountDiff:
      candidate.evaluatedPredictionCount - base.evaluatedPredictionCount,
    top1Top3RateDiff: subtractNullable(
      candidate.top1Top3Rate,
      base.top1Top3Rate,
    ),
    winnerInPredictedTop3RateDiff: subtractNullable(
      candidate.winnerInPredictedTop3Rate,
      base.winnerInPredictedTop3Rate,
    ),
    averageRankDiffDiff: subtractNullable(
      candidate.averageRankDiff,
      base.averageRankDiff,
    ),
    isSmallSample: base.isSmallSample || candidate.isSmallSample,
  };
}

function calculateFeatureContributionSummaries(
  rows: PredictionAnalyticsRow[],
): FeatureContributionSummary[] {
  const byFeatureKey = new Map<
    string,
    {
      label: string;
      count: number;
      positiveCount: number;
      negativeCount: number;
      adjustmentSum: number;
    }
  >();

  for (const row of rows) {
    for (const component of parseScoreComponents(row.scoreComponentsJson)) {
      const current =
        byFeatureKey.get(component.key) ??
        {
          label: component.label,
          count: 0,
          positiveCount: 0,
          negativeCount: 0,
          adjustmentSum: 0,
        };

      current.count += 1;
      current.adjustmentSum += component.adjustment;

      if (component.adjustment > 0) {
        current.positiveCount += 1;
      } else if (component.adjustment < 0) {
        current.negativeCount += 1;
      }

      byFeatureKey.set(component.key, current);
    }
  }

  return Array.from(byFeatureKey.entries())
    .map(([featureKey, value]) => ({
      featureKey,
      label: value.label,
      count: value.count,
      positiveCount: value.positiveCount,
      negativeCount: value.negativeCount,
      averageAdjustment: roundMetric(value.adjustmentSum / value.count),
    }))
    .sort(
      (a, b) =>
        Math.abs(b.averageAdjustment) - Math.abs(a.averageAdjustment) ||
        a.featureKey.localeCompare(b.featureKey),
    );
}

function calculateFeatureContributionComparisons(
  rows: PredictionAnalyticsRow[],
): FeatureContributionComparison[] {
  const modelVersions = Array.from(new Set(rows.map((row) => row.modelVersion)))
    .sort((a, b) => a.localeCompare(b));
  const baseModelVersion = modelVersions.includes("rule-based-v1")
    ? "rule-based-v1"
    : modelVersions[0];
  const candidateModelVersion = modelVersions.includes("rule-based-v1.1")
    ? "rule-based-v1.1"
    : modelVersions.find((modelVersion) => modelVersion !== baseModelVersion);

  const summariesByModel = new Map(
    Array.from(groupBy(rows, (row) => row.modelVersion)).map(
      ([modelVersion, modelRows]) => [
        modelVersion,
        calculateFeatureContributionSummaries(modelRows),
      ] as const,
    ),
  );
  const featureKeys = new Set<string>();
  const labels = new Map<string, string>();

  for (const summaries of summariesByModel.values()) {
    for (const summary of summaries) {
      featureKeys.add(summary.featureKey);
      labels.set(summary.featureKey, summary.label);
    }
  }

  return Array.from(featureKeys)
    .map((featureKey) => {
      const byModelVersion = modelVersions.flatMap(
        (modelVersion): FeatureContributionByModelVersion[] => {
          const summary = summariesByModel
            .get(modelVersion)
            ?.find((item) => item.featureKey === featureKey);

          return summary
            ? [
                {
                  modelVersion,
                  count: summary.count,
                  positiveCount: summary.positiveCount,
                  negativeCount: summary.negativeCount,
                  averageAdjustment: summary.averageAdjustment,
                },
              ]
            : [];
        },
      );
      const base = byModelVersion.find(
        (item) => item.modelVersion === baseModelVersion,
      );
      const candidate = byModelVersion.find(
        (item) => item.modelVersion === candidateModelVersion,
      );

      return {
        featureKey,
        label: labels.get(featureKey) ?? "特徴量",
        byModelVersion,
        averageAdjustmentDiff:
          base && candidate
            ? roundMetric(candidate.averageAdjustment - base.averageAdjustment)
            : null,
      };
    })
    .sort((a, b) => {
      const diffA = Math.abs(a.averageAdjustmentDiff ?? 0);
      const diffB = Math.abs(b.averageAdjustmentDiff ?? 0);

      return diffB - diffA || a.featureKey.localeCompare(b.featureKey);
    });
}

function countTop1EvaluationRows(rows: PredictionAnalyticsRow[]) {
  return rows.filter(
    row => row.isPredictedTop1 === true && row.topPredictionIsTop3 !== null,
  ).length;
}

function countEvaluatedRaces(rows: PredictionAnalyticsRow[]) {
  return new Set(
    rows
      .filter(row => row.rankDiff !== null)
      .map(row => `${row.predictionRunId}:${row.raceId}`),
  ).size;
}

function calculateRate(numerator: number, denominator: number) {
  return denominator === 0 ? null : roundMetric(numerator / denominator);
}

function subtractNullable(value: number | null, base: number | null) {
  return value === null || base === null ? null : roundMetric(value - base);
}

function roundMetric(value: number) {
  return Math.round(value * 10000) / 10000;
}

function parseScoreComponents(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.components)) {
    return [];
  }

  return value.components.flatMap(component => {
    if (!isRecord(component)) {
      return [];
    }

    const adjustment = Number(component.adjustment);

    if (!Number.isFinite(adjustment) || adjustment === 0) {
      return [];
    }

    return [
      {
        key: typeof component.key === "string" ? component.key : "unknown",
        label: typeof component.label === "string" ? component.label : "特徴量",
        adjustment,
      },
    ];
  });
}

function groupBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const value of values) {
    const key = getKey(value);
    const items = grouped.get(key) ?? [];
    items.push(value);
    grouped.set(key, items);
  }

  return grouped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
