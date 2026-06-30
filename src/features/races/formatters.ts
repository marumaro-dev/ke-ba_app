const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "long",
  timeZone: "Asia/Tokyo",
});

export function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00+09:00`));
}

export function formatFinishTime(milliseconds: number | null) {
  if (milliseconds === null) {
    return "—";
  }

  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, "0");

  return `${minutes}:${seconds}`;
}

export function formatBodyWeight(
  bodyWeight: number | null,
  bodyWeightDiff: number | null,
) {
  if (bodyWeight === null) {
    return "未発表";
  }

  if (bodyWeightDiff === null) {
    return `${bodyWeight}kg`;
  }

  const sign = bodyWeightDiff > 0 ? "+" : "";
  return `${bodyWeight}kg (${sign}${bodyWeightDiff})`;
}

export function formatFinishPosition(
  position: number | null,
  finishStatus: string | null,
) {
  if (finishStatus === "did_not_finish") {
    return "中止";
  }
  if (finishStatus === "disqualified") {
    return "失格";
  }
  if (finishStatus === "scratched") {
    return "取消";
  }

  return position === null ? "—" : `${position}着`;
}

export function formatRaceCountLabel(totalCount: number, pageSize: number) {
  if (totalCount === 0) {
    return "0件";
  }

  return `${totalCount.toLocaleString()}件 / ${pageSize}件ずつ表示`;
}
