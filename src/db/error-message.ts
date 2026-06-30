export function buildDatabaseErrorMessage(error: unknown, action: string) {
  const details = getErrorDetails(error);
  const hints = [
    "DATABASE_URL が .env.local または実行環境に設定されているか確認してください。",
    "Supabase の接続文字列は postgresql:// で始まり、?sslmode=require を含めるのがおすすめです。",
    "ローカル開発では Session Pooler、Vercel など serverless では Transaction Pooler の利用を推奨します。",
    "Supabase の Database Password、Project Ref、ホスト名、ポート番号が正しいか確認してください。",
    "接続元のネットワークや Supabase プロジェクトの一時停止状態も確認してください。",
  ];

  return [
    `Database ${action} failed.`,
    details ? `Cause: ${details}` : undefined,
    "Hints:",
    ...hints.map((hint) => `- ${hint}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return undefined;
}
