import type { Metadata } from "next";
import Link from "next/link";

import {
  formatEvaluationStatus,
  formatPredictionCount,
  formatPredictionCountLabel,
  formatPredictionDateTime,
  predictionModeLabels,
  predictionRunStatusLabels,
} from "@/features/predictions/formatters";
import { listPredictionRuns } from "@/features/predictions/queries";
import {
  buildPredictionRunListHref,
  parsePredictionRunListSearchParams,
} from "@/features/predictions/schemas";

type PredictionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "予測履歴",
};

export const dynamic = "force-dynamic";

const statusFilterLabels = {
  all: "すべて",
  running: "実行中",
  succeeded: "成功",
  failed: "失敗",
} as const;

export default async function PredictionsPage({
  searchParams,
}: PredictionsPageProps) {
  const filters = parsePredictionRunListSearchParams(await searchParams);
  const runList = await listPredictionRuns(filters);
  const hasActiveFilter = filters.status !== "all";

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Predictions</p>
          <h1>予測履歴</h1>
        </div>
        <p className="page-heading__note">
          ルールベースの予測スコア生成履歴です。勝率・複勝率・買い目提案ではありません。
        </p>
      </div>

      <form className="filter-panel filter-panel--features" action="/predictions">
        <label>
          <span>status</span>
          <select name="status" defaultValue={filters.status}>
            {Object.entries(statusFilterLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="filter-panel__actions">
          <button className="button" type="submit">
            絞り込む
          </button>
          {hasActiveFilter && (
            <Link className="button button--secondary" href="/predictions">
              条件をクリア
            </Link>
          )}
        </div>
      </form>

      <div className="list-summary">
        <p>{formatPredictionCountLabel(runList.totalCount, runList.pageSize)}</p>
        {runList.totalCount > 0 && (
          <p>
            {runList.page} / {runList.totalPages} ページ
          </p>
        )}
      </div>

      {runList.items.length === 0 ? (
        <div className="empty-state">
          <h2>予測履歴がありません</h2>
          <p>
            <code>npm run predictions:generate:dry-run</code> または{" "}
            <code>npm run predictions:generate</code> を実行すると履歴が表示されます。
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">実行日時</th>
                  <th scope="col">as_of_at</th>
                  <th scope="col">type</th>
                  <th scope="col">version</th>
                  <th scope="col">mode</th>
                  <th scope="col">status</th>
                  <th scope="col">評価</th>
                  <th scope="col">total</th>
                  <th scope="col">success</th>
                  <th scope="col">failed</th>
                  <th scope="col">finished_at</th>
                </tr>
              </thead>
              <tbody>
                {runList.items.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link href={`/predictions/${run.id}`}>
                        {formatPredictionDateTime(run.startedAt)}
                      </Link>
                    </td>
                    <td>{formatPredictionDateTime(run.asOfAt)}</td>
                    <td>{run.predictionType}</td>
                    <td>{run.modelVersion}</td>
                    <td>{predictionModeLabels[run.mode]}</td>
                    <td>
                      <span className={`status status--feature-${run.status}`}>
                        {predictionRunStatusLabels[run.status]}
                      </span>
                    </td>
                    <td>
                      {formatEvaluationStatus(
                        run.totalCount,
                        run.evaluationCount,
                      )}
                    </td>
                    <td>{formatPredictionCount(run.totalCount)}</td>
                    <td>{formatPredictionCount(run.successCount)}</td>
                    <td>{formatPredictionCount(run.failureCount)}</td>
                    <td>{formatPredictionDateTime(run.finishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label="予測履歴のページネーション">
            <Link
              aria-disabled={runList.page <= 1}
              className="button button--secondary"
              href={
                runList.page <= 1
                  ? buildPredictionRunListHref(filters, { page: 1 })
                  : buildPredictionRunListHref(filters, { page: runList.page - 1 })
              }
            >
              前へ
            </Link>
            <span>
              {runList.page} / {runList.totalPages}
            </span>
            <Link
              aria-disabled={runList.page >= runList.totalPages}
              className="button button--secondary"
              href={
                runList.page >= runList.totalPages
                  ? buildPredictionRunListHref(filters, {
                      page: runList.totalPages,
                    })
                  : buildPredictionRunListHref(filters, { page: runList.page + 1 })
              }
            >
              次へ
            </Link>
          </nav>
        </>
      )}
    </section>
  );
}
