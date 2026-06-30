const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Tokyo",
});

export type PredictionReason = {
  key: string;
  label: string;
  adjustment: number;
  reason: string;
};

export type PredictionReasonSummary = {
  positiveReasons: PredictionReason[];
  negativeReasons: PredictionReason[];
  disclaimer: string;
};

export const predictionRunStatusLabels = {
  running: "実行中",
  succeeded: "成功",
  failed: "失敗",
} as const;

export const predictionModeLabels = {
  dry_run: "dry-run",
  import: "import",
} as const;

export function formatPredictionDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "—";
}

export function formatPredictionCount(value: number) {
  return value.toLocaleString("ja-JP");
}

export function formatPredictionCountLabel(totalCount: number, pageSize: number) {
  if (totalCount === 0) {
    return "0件";
  }

  return `${totalCount.toLocaleString("ja-JP")}件 / ${pageSize}件ずつ表示`;
}

export function formatPredictionScore(value: number | string | null) {
  if (value === null) {
    return "—";
  }

  return Number(value).toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

export function formatEvaluationStatus(
  predictionCount: number,
  evaluationCount: number,
) {
  if (evaluationCount === 0) {
    return "未評価";
  }

  if (evaluationCount < predictionCount) {
    return `一部評価済み ${evaluationCount}/${predictionCount}`;
  }

  return "評価済み";
}

export function formatFinishPosition(value: number | null) {
  return value === null ? "—" : `${value}着`;
}

export function formatRankDiff(value: number | null) {
  return value === null ? "—" : value.toLocaleString("ja-JP");
}

export function formatBooleanResult(value: boolean | null) {
  if (value === null) {
    return "—";
  }

  return value ? "はい" : "いいえ";
}

export function formatPredictionRate(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

export function formatPredictionMetric(value: number | null) {
  if (value === null) {
    return "—";
  }

  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

export function formatPredictionAdjustment(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}`;
}

export function summarizePredictionReasons(
  value: unknown,
  limit = 3,
): PredictionReasonSummary {
  const components = parseComponents(value);
  const positiveReasons = components
    .filter((component) => component.adjustment > 0)
    .sort((a, b) => b.adjustment - a.adjustment)
    .slice(0, limit);
  const negativeReasons = components
    .filter((component) => component.adjustment < 0)
    .sort((a, b) => a.adjustment - b.adjustment)
    .slice(0, limit);

  return {
    positiveReasons,
    negativeReasons,
    disclaimer:
      "この予測スコアは、取得済み特徴量に基づく相対評価です。勝率・複勝率ではなく、的中や利益を保証しません。",
  };
}

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null";
}

function parseComponents(value: unknown): PredictionReason[] {
  if (!isRecord(value) || !Array.isArray(value.components)) {
    return [];
  }

  return value.components.flatMap((component): PredictionReason[] => {
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
        reason:
          typeof component.reason === "string"
            ? component.reason
            : "スコアに影響しました",
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
