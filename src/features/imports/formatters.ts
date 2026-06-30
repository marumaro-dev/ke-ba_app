const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Tokyo",
});

export const importModeLabels = {
  dry_run: "dry-run",
  import: "import",
} as const;

export const importStatusLabels = {
  running: "実行中",
  succeeded: "成功",
  failed: "失敗",
} as const;

export function formatImportDateTime(value: Date | null) {
  return value ? dateTimeFormatter.format(value) : "—";
}

export function formatImportCount(value: number) {
  return value.toLocaleString("ja-JP");
}

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function formatImportCountLabel(totalCount: number, pageSize: number) {
  if (totalCount === 0) {
    return "0件";
  }

  return `${totalCount.toLocaleString("ja-JP")}件 / ${pageSize}件ずつ表示`;
}
